import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import JSZip from 'https://esm.sh/jszip@3.10.1'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Caminho do modelo padrão dentro do bucket 'documents'. Quando a
// licitação tem um modelo próprio (campo `modelo_customizado_path`,
// usado quando a prefeitura exige formulário específico), esse caminho
// é usado no lugar — ver mais abaixo, depois de buscar a licitação.
const TEMPLATE_PATH_PADRAO = 'templates/modelo_proposta_padrao.docx'

// Escapa caracteres especiais de XML — essencial porque os dados vêm do
// banco (nome de cliente, descrição de item, etc.) e podem conter & < > " '
// que quebrariam o XML do .docx se inseridos sem escapar.
function escapeXml(valor: unknown): string {
  const texto = valor === null || valor === undefined ? '' : String(valor)
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatarMoeda(valor: number | null | undefined): string {
  return (valor ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatarData(dataIso: string | null | undefined): string {
  if (!dataIso) return ''
  const d = new Date(dataIso + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase()
}

// Ordenação natural (mesmo comparador usado no frontend, src/lib/numberParsing.ts)
// — evita que "10" venha antes de "2" numa ordenação puramente lexicográfica.
function compararNumeroItem(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

// Substitui todos os {{placeholder}} de um texto XML pelos valores do mapa.
// Só mexe nos que existem no mapa — qualquer placeholder desconhecido fica
// como está (visível), o que ajuda a notar rapidamente se algo não foi
// preenchido.
function substituirPlaceholders(xml: string, valores: Record<string, string>): string {
  return xml.replace(/\{\{(\w+)\}\}/g, (match, chave) => {
    return chave in valores ? valores[chave] : match
  })
}

// Constrói um parágrafo Word (centralizado) pra uma linha do cabeçalho do
// cliente — usado pra substituir {{cabecalho_cliente}} por N parágrafos, um
// por linha do texto salvo em clients.cabecalho_declaracao.
function construirParagrafoCabecalho(texto: string, opts: { negrito: boolean; tamanho: number; borda: boolean }): string {
  const pBdr = opts.borda ? '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="1A1A1A"/></w:pBdr>' : ''
  const rPrNegrito = opts.negrito ? '<w:b/><w:bCs/>' : ''
  return `<w:p><w:pPr><w:jc w:val="center"/>${pBdr}</w:pPr><w:r><w:rPr>${rPrNegrito}<w:sz w:val="${opts.tamanho}"/><w:szCs w:val="${opts.tamanho}"/></w:rPr><w:t xml:space="preserve">${escapeXml(texto)}</w:t></w:r></w:p>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { clientId, biddingId, tipo } = await req.json()
    if (!clientId || !biddingId) {
      return new Response(JSON.stringify({ error: 'clientId e biddingId são obrigatórios' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    // tipo: 'normal' (padrão) gera "PROPOSTA DE PREÇOS"; 'readequada' gera
    // "PROPOSTA READEQUADA" — mesmo modelo .docx, só muda esse título.
    const tituloDocumento = tipo === 'readequada' ? 'PROPOSTA READEQUADA' : 'PROPOSTA DE PREÇOS'

    const authHeader = req.headers.get('Authorization')!
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) throw new Error('Não autenticado')

    // Cliente com service role só pra baixar o modelo do Storage — o
    // arquivo de template é compartilhado (não pertence a nenhum usuário
    // específico), então não faz sentido ele estar sujeito às políticas de
    // RLS pensadas pra dados privados de cada usuário.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // --- Busca os dados reais ---
    const { data: client, error: clientError } = await supabase
      .from('clients').select('*').eq('id', clientId).single()
    if (clientError || !client) throw new Error('Cliente não encontrado')

    const { data: bidding, error: biddingError } = await supabase
      .from('biddings').select('*').eq('id', biddingId).single()
    if (biddingError || !bidding) throw new Error('Licitação não encontrada')

    const { data: items, error: itemsError } = await supabase
      .from('bidding_items').select('*').eq('bidding_id', biddingId).order('numero_item')
    if (itemsError) throw new Error('Erro ao buscar itens da licitação')

    // Na proposta readequada, usa só os itens marcados como "ganhou" (o
    // cliente normalmente não ganha todos os itens do edital). Se nenhum
    // item foi marcado ainda (licitações antigas, antes desse campo
    // existir), cai de volta pra usar todos — mesma regra de fallback da
    // tela de Proposta no rateio (AbaProposta / LicitacaoPage.tsx).
    const itensParaProposta = tipo === 'readequada' && (items ?? []).some((i) => i.ganhou)
      ? (items ?? []).filter((i) => i.ganhou)
      : (items ?? [])

    // Coluna "Lote" (com subtotal por lote) quando a licitação é desse tipo,
    // ou "Item" (sem subtotal) quando é por item — mesma regra usada nas
    // outras telas de itens (BiddingItemsEditor, AbaProposta).
    const porLote = bidding.tipo_disputa === 'Lote'

    // Ordena por lote (quando houver) e depois por número do item, com
    // ordenação natural — garante que os itens do mesmo lote fiquem juntos
    // pra poder fechar o subtotal corretamente.
    const itensOrdenados = [...itensParaProposta].sort((a, b) =>
      compararNumeroItem(a.lote || a.numero_item, b.lote || b.numero_item) || compararNumeroItem(a.numero_item, b.numero_item)
    )

    // Usa o modelo próprio da licitação (se tiver sido enviado) ou o
    // modelo padrão do sistema.
    const templatePath = bidding.modelo_customizado_path || TEMPLATE_PATH_PADRAO

    // --- Baixa o modelo do Storage (via service role, ver comentário acima) ---
    const { data: templateBlob, error: templateError } = await supabaseAdmin.storage
      .from('documents').download(templatePath)
    if (templateError || !templateBlob) {
      console.error('gerar-proposta: erro ao baixar modelo:', templateError)
      throw new Error(`Modelo de proposta não encontrado em '${templatePath}': ${templateError?.message ?? 'motivo desconhecido'}`)
    }

    const zip = await JSZip.loadAsync(await templateBlob.arrayBuffer())

    // --- Monta o mapa de valores fixos (não repetem) ---
    const hoje = new Date()
    const valoresFixos: Record<string, string> = {
      titulo_documento: escapeXml(tituloDocumento),
      coluna_identificador: escapeXml(porLote ? 'Lote' : 'Item'),
      modalidade: escapeXml(bidding.modalidade),
      numero_edital: escapeXml(bidding.numero_edital ?? ''),
      orgao: escapeXml(bidding.orgao),
      dias_validade: escapeXml(bidding.dias_validade_proposta ?? '60 (sessenta)'),

      cliente_nome: escapeXml(client.name),
      cliente_cnpj: escapeXml(client.cnpj ?? ''),
      cliente_ie: escapeXml(client.inscricao_estadual ?? ''),
      cliente_endereco: escapeXml(client.address ?? ''),
      cliente_bairro: escapeXml(client.bairro ?? ''),
      cliente_cidade: escapeXml(client.cidade ?? ''),
      cliente_telefone: escapeXml(client.phone ?? ''),
      cliente_email: escapeXml(client.email ?? ''),
      cliente_banco: escapeXml(client.banco_nome ?? ''),
      cliente_agencia: escapeXml(client.banco_agencia ?? ''),
      cliente_conta: escapeXml(client.banco_conta ?? ''),

      responsavel_nome: escapeXml(client.responsavel_nome ?? ''),
      responsavel_cpf: escapeXml(client.responsavel_cpf ?? ''),
      responsavel_cargo: escapeXml(client.responsavel_cargo ?? ''),

      cidade_emissao: escapeXml(client.cidade ?? ''),
      data_emissao: escapeXml(formatarData(hoje.toISOString().split('T')[0])),
    }

    // --- Processa document.xml (cabeçalho + texto fixo + tabela de itens) ---
    const documentFile = zip.file('word/document.xml')
    if (!documentFile) throw new Error('Modelo inválido: word/document.xml não encontrado no .docx')
    let documentXml = await documentFile.async('string')

    // --- Cabeçalho do cliente: substitui o parágrafo {{cabecalho_cliente}}
    // inteiro por um parágrafo pra cada linha do texto salvo em
    // clients.cabecalho_declaracao (Cadastros → Cliente → Cabeçalho das
    // Declarações), sempre centralizado — mesmos parâmetros das
    // declarações. Sem cabeçalho salvo, cai num mínimo (nome + CNPJ) pra
    // nunca gerar o documento sem identificação nenhuma no topo.
    const cabecalhoParagrafoRegex = /<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?\{\{cabecalho_cliente\}\}[\s\S]*?<\/w:p>/
    const cabecalhoParagrafoMatch = documentXml.match(cabecalhoParagrafoRegex)
    if (!cabecalhoParagrafoMatch) {
      throw new Error('Modelo inválido: não encontrei o parágrafo do cabeçalho do cliente (com {{cabecalho_cliente}})')
    }
    const linhasCabecalhoCliente = (client.cabecalho_declaracao?.trim() || `${client.name}\nCNPJ: ${client.cnpj ?? ''}`)
      .split('\n').map((linha: string) => linha.trim()).filter(Boolean)
    const paragrafosCabecalho = linhasCabecalhoCliente.map((linha: string, idx: number) =>
      construirParagrafoCabecalho(linha, {
        negrito: idx === 0,
        tamanho: idx === 0 ? 28 : 20,
        borda: idx === linhasCabecalhoCliente.length - 1,
      })
    ).join('')
    documentXml = documentXml.replace(cabecalhoParagrafoMatch[0], paragrafosCabecalho)

    // Localiza a linha-modelo da tabela de itens (a que contém
    // {{item_identificador}}) pra poder repeti-la uma vez por item real, e a
    // linha-modelo do subtotal por lote logo em seguida (com
    // {{lote_subtotal_valor}}) — as duas ficam adjacentes no modelo.
    const linhaItemRegex = /<w:tr\b[^>]*>(?:(?!<\/w:tr>)[\s\S])*?\{\{item_identificador\}\}[\s\S]*?<\/w:tr>/
    const linhaItemMatch = documentXml.match(linhaItemRegex)
    if (!linhaItemMatch) {
      throw new Error('Modelo inválido: não encontrei a linha de item (com {{item_identificador}}) na tabela')
    }
    const linhaItemModelo = linhaItemMatch[0]

    const linhaSubtotalRegex = /<w:tr\b[^>]*>(?:(?!<\/w:tr>)[\s\S])*?\{\{lote_subtotal_valor\}\}[\s\S]*?<\/w:tr>/
    const linhaSubtotalMatch = documentXml.match(linhaSubtotalRegex)
    if (!linhaSubtotalMatch) {
      throw new Error('Modelo inválido: não encontrei a linha de subtotal de lote (com {{lote_subtotal_valor}}) na tabela')
    }
    const linhaSubtotalModelo = linhaSubtotalMatch[0]

    const blocoModeloTabela = linhaItemModelo + linhaSubtotalModelo
    if (!documentXml.includes(blocoModeloTabela)) {
      throw new Error('Modelo inválido: a linha de item e a linha de subtotal de lote precisam estar uma logo após a outra na tabela')
    }

    const linhasGeradas: string[] = []
    let loteAtual: string | null = null
    let totalLoteAtual = 0
    const fecharSubtotalLote = () => {
      if (loteAtual === null) return
      linhasGeradas.push(substituirPlaceholders(linhaSubtotalModelo, {
        lote_subtotal_numero: escapeXml(loteAtual),
        lote_subtotal_valor: escapeXml(formatarMoeda(totalLoteAtual)),
      }))
      totalLoteAtual = 0
    }

    for (const item of itensOrdenados) {
      const identificador = porLote ? (item.lote || '—') : item.numero_item
      if (porLote && identificador !== loteAtual) {
        fecharSubtotalLote()
        loteAtual = identificador
      }
      const quantidade = Number(item.quantidade)
      const valorUnit = item.valor_unitario_ofertado ?? item.valor_unitario_licitado
      const valorTotal = quantidade * Number(valorUnit)
      totalLoteAtual += valorTotal
      linhasGeradas.push(substituirPlaceholders(linhaItemModelo, {
        item_identificador: escapeXml(identificador),
        item_descricao: escapeXml(item.descricao),
        item_marca: escapeXml(item.marca ?? ''),
        item_referencia: escapeXml(item.referencia ?? ''),
        item_quantidade: escapeXml(quantidade.toLocaleString('pt-BR')),
        item_unidade: escapeXml(item.unidade ?? ''),
        item_valor_unitario: escapeXml(formatarMoeda(valorUnit)),
        item_valor_total: escapeXml(formatarMoeda(valorTotal)),
      }))
    }
    if (porLote) fecharSubtotalLote()

    if (linhasGeradas.length === 0) {
      // Sem itens cadastrados: mantém uma linha vazia em vez de sumir com a
      // tabela inteira, pra não confundir quem abrir o documento.
      linhasGeradas.push(substituirPlaceholders(linhaItemModelo, {
        item_identificador: '', item_descricao: '(nenhum item cadastrado)', item_marca: '',
        item_referencia: '', item_quantidade: '', item_unidade: '', item_valor_unitario: '', item_valor_total: '',
      }))
    }

    documentXml = documentXml.replace(blocoModeloTabela, linhasGeradas.join(''))

    // Substitui o restante dos placeholders fixos (fora da tabela de itens)
    documentXml = substituirPlaceholders(documentXml, valoresFixos)
    zip.file('word/document.xml', documentXml)

    // --- Processa o rodapé (dados do cliente) ---
    const footerFile = zip.file('word/footer1.xml')
    if (footerFile) {
      let footerXml = await footerFile.async('string')
      footerXml = substituirPlaceholders(footerXml, valoresFixos)
      zip.file('word/footer1.xml', footerXml)
    }

    // --- Gera o .docx final ---
    const resultado = await zip.generateAsync({ type: 'base64' })

    const prefixoArquivo = tipo === 'readequada' ? 'Proposta_Readequada' : 'Proposta'
    const nomeArquivo = `${prefixoArquivo}_${client.name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')}_${bidding.numero_edital ?? biddingId.slice(0, 8)}.docx`

    return new Response(JSON.stringify({
      success: true,
      fileName: nomeArquivo,
      fileBase64: resultado,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('gerar-proposta error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
