// Edge Function: gerar-proposta-pdf
//
// Gera o .pdf da Proposta Readequada direto dos dados da licitação (cliente,
// itens, valores) — sem depender de converter o .docx gerado por
// gerar-proposta. Essa foi a opção escolhida (em vez de converter o Word
// de verdade num serviço externo): sai grátis e sempre funciona, mas se o
// usuário editar o Word manualmente antes de gerar o PDF, essa edição não
// aparece aqui — o PDF é sempre gerado do zero a partir do banco.
//
// Mesmo conteúdo/layout do modelo real da Proposta Readequada (cabeçalho do
// cliente centralizado, tabela de dados da empresa, tabela de itens com
// Lote/Item + Marca/Modelo + subtotal por lote + total geral, fechamento
// padrão com validade e assinatura) — só que desenhado diretamente em PDF
// via pdf-lib, com quebra de linha e de página manuais (pdf-lib não tem
// layout de texto/tabela pronto).
//
// Recebe { clientId, biddingId } e devolve { success, fileBase64, mimeType,
// fileName } — o frontend decodifica o base64; esta function não grava nada
// sozinha, só gera o arquivo (o upload pro Storage, se o usuário quiser
// guardar essa versão, é feito pelo frontend via useAttachedFiles).
//
// VARIÁVEIS DE AMBIENTE NECESSÁRIAS (Supabase → Edge Functions → Secrets):
// - SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm injetadas
//   automaticamente pelo Supabase em toda Edge Function.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'npm:pdf-lib@1.17.1'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const PAGINA_LARGURA = 595.28
const PAGINA_ALTURA = 841.89
const MARGEM = 42
const LARGURA_UTIL = PAGINA_LARGURA - MARGEM * 2
const PAD_CELULA = 4

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function formatarMoeda(v: number | null | undefined): string {
  return (v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function compararNumeroItem(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

function formatarValidadeProposta(valor: string | null | undefined): string {
  const texto = (valor ?? '60 (sessenta)').trim()
  return /\bdias?\b/i.test(texto) ? texto : `${texto} dias`
}

function escapeRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// clients.address já vem completo ("Rua, nº - Bairro, Cidade - UF"), e essa
// proposta mostra Bairro/Cidade em campos separados também — sem isso o
// bairro e a cidade aparecem duplicados no bloco de endereço.
function extrairLogradouro(endereco: string, bairro: string | null | undefined): string {
  const texto = endereco.trim()
  if (!bairro?.trim()) return texto
  const regex = new RegExp(`\\s*-\\s*${escapeRegex(bairro.trim())}\\b.*$`, 'i')
  return texto.replace(regex, '').trim() || texto
}

function dataPorExtenso(d: Date): string {
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`
}

type Celula = { texto: string; negrito?: boolean; align?: 'left' | 'center' | 'right'; shading?: [number, number, number]; colSpan?: number }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  try {
    const { clientId, biddingId } = await req.json()
    if (!clientId || !biddingId) return json({ error: 'clientId e biddingId são obrigatórios' }, 400)

    const authHeader = req.headers.get('Authorization')
    const jwt = authHeader?.replace('Bearer ', '')
    if (!jwt) return json({ error: 'Não autenticado' }, 401)
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt)
    if (userError || !user) return json({ error: 'Não autenticado' }, 401)

    // Compara com o DONO da conta (owner_efetivo), não com quem está
    // logado — toda licitação sempre tem user_id = dono, então um membro
    // de equipe sempre bateria 403 se comparássemos direto com user.id.
    const { data: ownerId, error: ownerError } = await supabase.rpc('owner_efetivo', { usuario_id: user.id })
    if (ownerError || !ownerId) return json({ error: 'Não foi possível identificar a conta do usuário' }, 500)

    const { data: bidding, error: biddingError } = await supabase
      .from('biddings')
      .select('id, user_id, client_id, orgao, modalidade, numero_edital, tipo_disputa, dias_validade_proposta, proposta_texto_abertura, proposta_texto_fechamento')
      .eq('id', biddingId)
      .single()
    if (biddingError || !bidding) return json({ error: 'Licitação não encontrada' }, 404)
    if (bidding.user_id !== ownerId) return json({ error: 'Sem permissão para esta licitação' }, 403)
    if (bidding.client_id !== clientId) return json({ error: 'Cliente não corresponde a esta licitação' }, 400)

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('name, cnpj, inscricao_estadual, address, bairro, cidade, phone, email, banco_nome, banco_agencia, banco_conta, responsavel_nome, responsavel_cpf, responsavel_cargo, cabecalho_declaracao')
      .eq('id', clientId)
      .single()
    if (clientError || !client) return json({ error: 'Cliente não encontrado' }, 404)

    const { data: itensRows, error: itensError } = await supabase
      .from('bidding_items')
      .select('numero_item, lote, descricao, marca, referencia, unidade, quantidade, valor_unitario_licitado, valor_unitario_ofertado, ganhou')
      .eq('bidding_id', biddingId)
    if (itensError) throw itensError

    const todosItens = itensRows ?? []
    const itensParaProposta = todosItens.some((i) => i.ganhou) ? todosItens.filter((i) => i.ganhou) : todosItens
    if (itensParaProposta.length === 0) return json({ error: 'Nenhum item cadastrado nesta licitação — cadastre os itens antes de gerar a proposta.' }, 400)

    const porLote = bidding.tipo_disputa === 'Lote'
    const itensOrdenados = [...itensParaProposta].sort((a, b) =>
      compararNumeroItem(a.lote || a.numero_item, b.lote || b.numero_item) || compararNumeroItem(a.numero_item, b.numero_item)
    )

    const doc = await PDFDocument.create()
    const fonte = await doc.embedFont(StandardFonts.Helvetica)
    const fonteNegrito = await doc.embedFont(StandardFonts.HelveticaBold)

    let pagina: PDFPage = doc.addPage([PAGINA_LARGURA, PAGINA_ALTURA])
    let y = PAGINA_ALTURA - MARGEM

    const novaPagina = () => {
      pagina = doc.addPage([PAGINA_LARGURA, PAGINA_ALTURA])
      y = PAGINA_ALTURA - MARGEM
    }
    const garantirEspaco = (altura: number) => {
      if (y - altura < MARGEM) novaPagina()
    }

    function quebrarLinha(texto: string, fonteUsada: PDFFont, tamanho: number, larguraMax: number): string[] {
      const palavras = String(texto).split(/\s+/).filter(Boolean)
      const linhas: string[] = []
      let atual = ''
      for (const palavra of palavras) {
        const teste = atual ? `${atual} ${palavra}` : palavra
        if (fonteUsada.widthOfTextAtSize(teste, tamanho) > larguraMax && atual) {
          linhas.push(atual)
          atual = palavra
        } else {
          atual = teste
        }
      }
      if (atual) linhas.push(atual)
      return linhas.length ? linhas : ['']
    }

    function desenharLinhaTexto(texto: string, tamanho: number, fonteUsada: PDFFont, centralizado: boolean) {
      garantirEspaco(tamanho * 1.4)
      const largura = fonteUsada.widthOfTextAtSize(texto, tamanho)
      const x = centralizado ? MARGEM + (LARGURA_UTIL - largura) / 2 : MARGEM
      pagina.drawText(texto, { x, y, size: tamanho, font: fonteUsada })
      y -= tamanho * 1.4
    }
    // Justificado (padrão ABNT) — pdf-lib não tem alinhamento justificado
    // pronto, então distribui manualmente o espaço sobrando entre as
    // palavras da linha até encostar na margem direita. A ÚLTIMA linha de
    // cada parágrafo nunca é esticada (regra tipográfica padrão).
    function desenharLinhaJustificada(texto: string, tamanho: number, fonteUsada: PDFFont, ultimaLinhaDoParagrafo: boolean) {
      garantirEspaco(tamanho * 1.4)
      const palavras = texto.split(/\s+/).filter(Boolean)
      if (ultimaLinhaDoParagrafo || palavras.length <= 1) {
        pagina.drawText(texto, { x: MARGEM, y, size: tamanho, font: fonteUsada })
      } else {
        const larguraPalavras = palavras.reduce((s, p) => s + fonteUsada.widthOfTextAtSize(p, tamanho), 0)
        const espacoEntrePalavras = (LARGURA_UTIL - larguraPalavras) / (palavras.length - 1)
        let x = MARGEM
        for (const palavra of palavras) {
          pagina.drawText(palavra, { x, y, size: tamanho, font: fonteUsada })
          x += fonteUsada.widthOfTextAtSize(palavra, tamanho) + espacoEntrePalavras
        }
      }
      y -= tamanho * 1.4
    }
    function desenharParagrafo(texto: string, opts: { tamanho?: number; negrito?: boolean; centralizado?: boolean; espacoDepois?: number } = {}) {
      const tamanho = opts.tamanho ?? 10.5
      const fonteUsada = opts.negrito ? fonteNegrito : fonte
      const linhas = quebrarLinha(texto, fonteUsada, tamanho, LARGURA_UTIL)
      if (opts.centralizado) {
        linhas.forEach((l) => desenharLinhaTexto(l, tamanho, fonteUsada, true))
      } else {
        linhas.forEach((l, idx) => desenharLinhaJustificada(l, tamanho, fonteUsada, idx === linhas.length - 1))
      }
      y -= opts.espacoDepois ?? 6
    }
    function desenharCabecalhoCliente(linhas: string[]) {
      linhas.forEach((linha, idx) => {
        const negrito = idx === 0
        desenharParagrafo(linha, { tamanho: negrito ? 13 : 9.5, negrito, centralizado: true, espacoDepois: 2 })
      })
      garantirEspaco(8)
      pagina.drawLine({ start: { x: MARGEM, y: y + 4 }, end: { x: PAGINA_LARGURA - MARGEM, y: y + 4 }, thickness: 0.75, color: rgb(0.1, 0.1, 0.1) })
      y -= 8
    }

    function alturaLinha(linha: Celula[], colunas: number[], tamanho: number): number {
      let maxLinhas = 1
      let colIdx = 0
      for (const cel of linha) {
        const span = cel.colSpan ?? 1
        const largura = colunas.slice(colIdx, colIdx + span).reduce((a, b) => a + b, 0) - PAD_CELULA * 2
        const fonteUsada = cel.negrito ? fonteNegrito : fonte
        maxLinhas = Math.max(maxLinhas, quebrarLinha(cel.texto, fonteUsada, tamanho, largura).length)
        colIdx += span
      }
      return maxLinhas * (tamanho * 1.35) + PAD_CELULA * 2
    }
    function desenharLinhaTabela(linha: Celula[], colunas: number[], tamanho: number, alturaFixa: number) {
      let colIdx = 0
      let xCel = MARGEM
      for (const cel of linha) {
        const span = cel.colSpan ?? 1
        const largura = colunas.slice(colIdx, colIdx + span).reduce((a, b) => a + b, 0)
        if (cel.shading) {
          pagina.drawRectangle({ x: xCel, y: y - alturaFixa, width: largura, height: alturaFixa, color: rgb(...cel.shading) })
        }
        pagina.drawRectangle({ x: xCel, y: y - alturaFixa, width: largura, height: alturaFixa, borderColor: rgb(0.1, 0.1, 0.1), borderWidth: 0.6 })
        const fonteUsada = cel.negrito ? fonteNegrito : fonte
        let yTexto = y - PAD_CELULA - tamanho * 0.85
        for (const lt of quebrarLinha(cel.texto, fonteUsada, tamanho, largura - PAD_CELULA * 2)) {
          const larguraTexto = fonteUsada.widthOfTextAtSize(lt, tamanho)
          let xTexto = xCel + PAD_CELULA
          if (cel.align === 'right') xTexto = xCel + largura - PAD_CELULA - larguraTexto
          else if (cel.align === 'center') xTexto = xCel + (largura - larguraTexto) / 2
          pagina.drawText(lt, { x: xTexto, y: yTexto, size: tamanho, font: fonteUsada })
          yTexto -= tamanho * 1.35
        }
        xCel += largura
        colIdx += span
      }
      y -= alturaFixa
    }
    function desenharTabela(colunas: number[], linhasCorpo: Celula[][], opts: { tamanho?: number; linhaCabecalho?: Celula[] } = {}) {
      const tamanho = opts.tamanho ?? 8.5
      const linhaCabecalho = opts.linhaCabecalho
      if (linhaCabecalho) {
        const altura = alturaLinha(linhaCabecalho, colunas, tamanho)
        garantirEspaco(altura)
        desenharLinhaTabela(linhaCabecalho, colunas, tamanho, altura)
      }
      for (const linha of linhasCorpo) {
        const altura = alturaLinha(linha, colunas, tamanho)
        if (y - altura < MARGEM) {
          novaPagina()
          if (linhaCabecalho) {
            const alturaCab = alturaLinha(linhaCabecalho, colunas, tamanho)
            desenharLinhaTabela(linhaCabecalho, colunas, tamanho, alturaCab)
          }
        }
        desenharLinhaTabela(linha, colunas, tamanho, altura)
      }
    }

    // ================= CONTEÚDO =================
    const linhasCabecalho = (client.cabecalho_declaracao?.trim() || `${client.name}\nCNPJ: ${client.cnpj ?? ''}`)
      .split('\n').map((l) => l.trim()).filter(Boolean)
    desenharCabecalhoCliente(linhasCabecalho)
    y -= 6

    desenharParagrafo('PROPOSTA READEQUADA', { tamanho: 13, negrito: true, centralizado: true, espacoDepois: 4 })
    desenharParagrafo(`${bidding.modalidade} Nº ${bidding.numero_edital ?? '—'}`, { tamanho: 11, negrito: true, centralizado: true, espacoDepois: 12 })

    const meioLargura = Math.round(LARGURA_UTIL / 2)
    desenharTabela([meioLargura, LARGURA_UTIL - meioLargura], [
      [{ texto: `Razão Social: ${client.name}`, negrito: true }, { texto: `CNPJ: ${client.cnpj ?? ''}` }],
      [{ texto: `I.E: ${client.inscricao_estadual ?? '—'}` }, { texto: `Endereço: ${extrairLogradouro(client.address ?? '', client.bairro)}` }],
      [{ texto: `Bairro: ${client.bairro ?? ''}` }, { texto: `Cidade: ${client.cidade ?? ''}` }],
      [{ texto: `Telefone: ${client.phone ?? ''}` }, { texto: `E-mail: ${client.email ?? ''}` }],
      [{ texto: `Conta Bancária: ${client.banco_nome ?? ''}` }, { texto: `Ag: ${client.banco_agencia ?? ''}  Conta Corrente: ${client.banco_conta ?? ''}` }],
    ], { tamanho: 9 })
    y -= 10

    const textoAberturaPadrao = `Ao órgão licitante ${bidding.orgao ?? '—'}, apresentamos nossa proposta comercial referente ao ${bidding.modalidade} nº ${bidding.numero_edital ?? '—'}, conforme planilha abaixo:`
    const textoAbertura = bidding.proposta_texto_abertura?.trim() || textoAberturaPadrao
    desenharParagrafo(textoAbertura, { tamanho: 10, espacoDepois: 10 })

    const W_ID = Math.round(LARGURA_UTIL * 0.07)
    const W_ESP = Math.round(LARGURA_UTIL * 0.29)
    const W_MODELO = Math.round(LARGURA_UTIL * 0.15)
    const W_MARCA = Math.round(LARGURA_UTIL * 0.15)
    const W_QTD = Math.round(LARGURA_UTIL * 0.11)
    const W_VUNIT = Math.round(LARGURA_UTIL * 0.11)
    const W_VTOTAL = LARGURA_UTIL - W_ID - W_ESP - W_MODELO - W_MARCA - W_QTD - W_VUNIT
    const colunasItens = [W_ID, W_ESP, W_MODELO, W_MARCA, W_QTD, W_VUNIT, W_VTOTAL]
    const sombraCabecalho: [number, number, number] = [0.94, 0.94, 0.94]
    const sombraSubtotal: [number, number, number] = [0.97, 0.97, 0.97]
    const sombraTotal: [number, number, number] = [0.92, 0.92, 0.92]

    const linhaCabecalhoItens: Celula[] = [
      { texto: porLote ? 'Lote' : 'Item', negrito: true, align: 'center', shading: sombraCabecalho },
      { texto: 'Especificação', negrito: true, align: 'center', shading: sombraCabecalho },
      { texto: 'Modelo', negrito: true, align: 'center', shading: sombraCabecalho },
      { texto: 'Marca/Fabricante', negrito: true, align: 'center', shading: sombraCabecalho },
      { texto: 'Quant.', negrito: true, align: 'right', shading: sombraCabecalho },
      { texto: 'Valor Unit. R$', negrito: true, align: 'right', shading: sombraCabecalho },
      { texto: 'V. Total R$', negrito: true, align: 'right', shading: sombraCabecalho },
    ]

    const linhasItens: Celula[][] = []
    let totalGeral = 0
    let loteAtual: string | null = null
    let totalLoteAtual = 0
    const fecharSubtotal = () => {
      if (loteAtual === null) return
      linhasItens.push([
        { texto: `Subtotal — Lote ${loteAtual}`, negrito: true, align: 'right', colSpan: 6, shading: sombraSubtotal },
        { texto: formatarMoeda(totalLoteAtual), negrito: true, align: 'right', shading: sombraSubtotal },
      ])
      totalLoteAtual = 0
    }
    for (const item of itensOrdenados) {
      const identificador = porLote ? (item.lote || '—') : item.numero_item
      if (porLote && identificador !== loteAtual) {
        fecharSubtotal()
        loteAtual = identificador
      }
      const quantidade = Number(item.quantidade) || 0
      const valorUnit = Number(item.valor_unitario_ofertado ?? item.valor_unitario_licitado) || 0
      const valorTotalItem = quantidade * valorUnit
      totalGeral += valorTotalItem
      totalLoteAtual += valorTotalItem
      linhasItens.push([
        { texto: identificador, align: 'center' },
        { texto: item.descricao ?? '' },
        { texto: item.referencia ?? '—' },
        { texto: item.marca ?? '—' },
        { texto: `${quantidade} ${item.unidade ?? ''}`.trim(), align: 'right' },
        { texto: formatarMoeda(valorUnit), align: 'right' },
        { texto: formatarMoeda(valorTotalItem), align: 'right' },
      ])
    }
    if (porLote) fecharSubtotal()
    linhasItens.push([
      { texto: 'Valor total da Proposta', negrito: true, align: 'right', colSpan: 6, shading: sombraTotal },
      { texto: formatarMoeda(totalGeral), negrito: true, align: 'right', shading: sombraTotal },
    ])

    desenharTabela(colunasItens, linhasItens, { tamanho: 8.5, linhaCabecalho: linhaCabecalhoItens })
    y -= 12

    const textoFechamentoPadrao = [
      'Nos preços indicados acima estão incluídos, além dos produtos, todos os custos, benefícios, encargos, tributos e demais contribuições pertinentes.',
      'Declaramos conhecer a legislação de referência desta licitação e que os produtos serão fornecidos de acordo com as condições estabelecidas neste Edital, o que conhecemos e aceitamos em todos os termos, inclusive quanto ao pagamento e outros.',
      `Esta proposta é válida por ${formatarValidadeProposta(bidding.dias_validade_proposta)}, a contar da data de sua apresentação.`,
      'Cumpre informar, ainda, que foram examinados os documentos da licitação, estando a empresa inteirada dos mesmos para elaboração da presente proposta.',
    ].join('\n\n')
    const textoFechamento = bidding.proposta_texto_fechamento?.trim() || textoFechamentoPadrao
    const paragrafosFechamento = textoFechamento.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    paragrafosFechamento.forEach((paragrafo, idx) => {
      desenharParagrafo(paragrafo, { tamanho: 10, espacoDepois: idx === paragrafosFechamento.length - 1 ? 20 : 8 })
    })

    const hoje = new Date()
    desenharParagrafo(`${client.cidade || '[cidade]'}, ${dataPorExtenso(hoje)}.`, { tamanho: 10, negrito: true, espacoDepois: 30 })

    desenharParagrafo('Assinatura do representante legal: _______________________________________', { tamanho: 10, espacoDepois: 4 })
    desenharParagrafo(`Nome do representante legal: ${client.responsavel_nome ?? ''}`, { tamanho: 10, espacoDepois: 2 })
    desenharParagrafo(`CPF: ${client.responsavel_cpf ?? ''}`, { tamanho: 10, espacoDepois: 2 })
    desenharParagrafo(`Cargo/função do representante legal: ${client.responsavel_cargo ?? ''}`, { tamanho: 10, espacoDepois: 0 })

    const bytes = await doc.save()
    const fileBase64 = toBase64(bytes)
    const nomeBase = (bidding.numero_edital ?? biddingId).replace(/[^\w-]+/g, '_')

    return json({
      success: true,
      fileBase64,
      mimeType: 'application/pdf',
      fileName: `Proposta_Readequada_${nomeBase}.pdf`,
    })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err)
    console.error('Erro ao gerar PDF da proposta readequada:', mensagem)
    return json({ success: false, error: mensagem }, 500)
  }
})
