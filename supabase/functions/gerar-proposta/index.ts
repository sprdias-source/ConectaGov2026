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

// Substitui todos os {{placeholder}} de um texto XML pelos valores do mapa.
// Só mexe nos que existem no mapa — qualquer placeholder desconhecido fica
// como está (visível), o que ajuda a notar rapidamente se algo não foi
// preenchido.
function substituirPlaceholders(xml: string, valores: Record<string, string>): string {
  return xml.replace(/\{\{(\w+)\}\}/g, (match, chave) => {
    return chave in valores ? valores[chave] : match
  })
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

    // --- Processa document.xml (texto fixo + tabela de itens) ---
    const documentFile = zip.file('word/document.xml')
    if (!documentFile) throw new Error('Modelo inválido: word/document.xml não encontrado no .docx')
    let documentXml = await documentFile.async('string')

    // Localiza a linha-modelo da tabela de itens (a que contém
    // {{item_numero}}) pra poder repeti-la uma vez por item real.
    const linhaRegex = /<w:tr\b[^>]*>(?:(?!<\/w:tr>)[\s\S])*?\{\{item_numero\}\}[\s\S]*?<\/w:tr>/
    const linhaMatch = documentXml.match(linhaRegex)
    if (!linhaMatch) {
      throw new Error('Modelo inválido: não encontrei a linha de item (com {{item_numero}}) na tabela')
    }
    const linhaModelo = linhaMatch[0]

    const linhasPreenchidas = itensParaProposta.map((item) => {
      const quantidade = Number(item.quantidade)
      const valorUnit = item.valor_unitario_ofertado ?? item.valor_unitario_licitado
      const valorTotal = quantidade * Number(valorUnit)
      const valoresItem: Record<string, string> = {
        item_numero: escapeXml(item.numero_item),
        item_descricao: escapeXml(item.descricao),
        item_marca: escapeXml(item.marca ?? ''),
        item_referencia: escapeXml(item.referencia ?? ''),
        item_quantidade: escapeXml(quantidade.toLocaleString('pt-BR')),
        item_unidade: escapeXml(item.unidade ?? ''),
        item_valor_unitario: escapeXml(formatarMoeda(valorUnit)),
        item_valor_total: escapeXml(formatarMoeda(valorTotal)),
      }
      return substituirPlaceholders(linhaModelo, valoresItem)
    })

    if (linhasPreenchidas.length === 0) {
      // Sem itens cadastrados: mantém uma linha vazia em vez de sumir com a
      // tabela inteira, pra não confundir quem abrir o documento.
      linhasPreenchidas.push(substituirPlaceholders(linhaModelo, {
        item_numero: '', item_descricao: '(nenhum item cadastrado)', item_marca: '',
        item_quantidade: '', item_unidade: '', item_valor_unitario: '', item_valor_total: '',
      }))
    }

    documentXml = documentXml.replace(linhaModelo, linhasPreenchidas.join(''))

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
