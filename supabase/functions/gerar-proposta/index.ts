// Edge Function: gerar-proposta
//
// Gera o arquivo .docx da Proposta Readequada (aba Documentos Finais) já
// preenchido com os dados reais do cliente e os itens marcados "Ganhou"
// desta licitação. Segue o mesmo modelo real fornecido pelo usuário
// (cabeçalho centralizado, tabela de dados da empresa, tabela de itens
// com Lote/Item, Marca, Modelo, Quantidade+Unidade, Valor Unitário/Total,
// fechamento com validade e assinatura) e reaproveita o mesmo cabeçalho
// salvo do cliente que já alimenta os Anexos de Declaração
// (clients.cabecalho_declaracao) — "mesmos parâmetros das declarações".
//
// Diferente do modelo original (que tinha sempre 1 item por lote e nunca
// precisou somar nada), aqui a tabela agrupa por lote e insere uma linha
// de subtotal por lote quando a licitação é do tipo "Lote" — numa
// licitação por "Item" a mesma coluna vira "Item" e não tem subtotal, só
// o total geral no fim.
//
// Recebe { clientId, biddingId, tipo } — hoje só tipo:'readequada' é
// suportado (o único botão "Gerar" que chama esta function, em
// Documentos Finais → Proposta Readequada). Devolve
// { fileBase64, mimeType, fileName } — o frontend decodifica o base64,
// monta um File e sobe pro Storage via useAttachedFiles; esta function
// não grava nada sozinha, só gera o arquivo.
//
// VARIÁVEIS DE AMBIENTE NECESSÁRIAS (Supabase → Edge Functions → Secrets):
// - SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm injetadas
//   automaticamente pelo Supabase em toda Edge Function.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ShadingType,
} from 'npm:docx@9.0.2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// Página A4 (twips — 1440 por polegada). Margens aproximam as do modelo
// real enviado (esquerda/direita/topo ~2,1cm, rodapé ~3,2cm, pro texto não
// disputar espaço com um rodapé/numeração que o cliente queira adicionar
// depois no Word).
const PAGINA_LARGURA = 11906
const PAGINA_ALTURA = 16838
const MARGEM_LATERAL = 1200
const MARGEM_TOPO = 1200
const MARGEM_RODAPE = 1800
const LARGURA_UTIL = PAGINA_LARGURA - MARGEM_LATERAL * 2

const BORDA = { style: BorderStyle.SINGLE, size: 4, color: '1A1A1A' }
const BORDAS_TABELA = { top: BORDA, bottom: BORDA, left: BORDA, right: BORDA, insideHorizontal: BORDA, insideVertical: BORDA }

function formatBRL(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function dataPorExtenso(d: Date): string {
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`
}

// Mesmo comparador natural usado no frontend (numberParsing.ts) — evita
// que "10" venha antes de "2" numa ordenação puramente lexicográfica.
function compararNumeroItem(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function paragrafo(texto: string, opts: { bold?: boolean; size?: number; align?: typeof AlignmentType[keyof typeof AlignmentType]; indent?: boolean; spacingAfter?: number; borderBottom?: boolean } = {}) {
  return new Paragraph({
    alignment: opts.align ?? AlignmentType.LEFT,
    spacing: { after: opts.spacingAfter ?? 80 },
    indent: opts.indent ? { firstLine: 700 } : undefined,
    border: opts.borderBottom ? { bottom: { style: BorderStyle.SINGLE, size: 12, color: '1A1A1A', space: 4 } } : undefined,
    children: [new TextRun({ text: texto, bold: opts.bold ?? false, size: opts.size ?? 18, font: 'Arial' })],
  })
}

function celula(texto: string, opts: { width: number; bold?: boolean; align?: typeof AlignmentType[keyof typeof AlignmentType]; shading?: string; colSpan?: number } = { width: 0 }) {
  return new TableCell({
    width: { size: opts.width, type: WidthType.DXA },
    columnSpan: opts.colSpan,
    shading: opts.shading ? { type: ShadingType.CLEAR, fill: opts.shading } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [new Paragraph({
      alignment: opts.align ?? AlignmentType.LEFT,
      children: [new TextRun({ text: texto, bold: opts.bold ?? false, size: 18, font: 'Arial' })],
    })],
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  try {
    const { clientId, biddingId, tipo } = await req.json()
    if (!clientId || !biddingId) return json({ error: 'clientId e biddingId são obrigatórios' }, 400)
    if (tipo !== 'readequada') return json({ error: `tipo "${tipo}" não suportado — só "readequada" por enquanto` }, 400)

    const authHeader = req.headers.get('Authorization')
    const jwt = authHeader?.replace('Bearer ', '')
    if (!jwt) return json({ error: 'Não autenticado' }, 401)
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt)
    if (userError || !user) return json({ error: 'Não autenticado' }, 401)

    const { data: bidding, error: biddingError } = await supabase
      .from('biddings')
      .select('id, user_id, client_id, orgao, modalidade, numero_edital, tipo_disputa, dias_validade_proposta')
      .eq('id', biddingId)
      .single()
    if (biddingError || !bidding) return json({ error: 'Licitação não encontrada' }, 404)
    if (bidding.user_id !== user.id) return json({ error: 'Sem permissão para esta licitação' }, 403)
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

    // Mesma regra já usada na aba Proposta Readequada: se nenhum item foi
    // marcado "Ganhou" ainda, considera todos (licitações antigas ganhas
    // por inteiro nunca precisaram marcar item por item).
    const todosItens = itensRows ?? []
    const itensGanhos = (todosItens.some((i) => i.ganhou) ? todosItens.filter((i) => i.ganhou) : todosItens)
      .sort((a, b) => compararNumeroItem(a.lote || a.numero_item, b.lote || b.numero_item) || compararNumeroItem(a.numero_item, b.numero_item))
    if (itensGanhos.length === 0) return json({ error: 'Nenhum item cadastrado nesta licitação — cadastre os itens antes de gerar a proposta.' }, 400)

    const porLote = bidding.tipo_disputa === 'Lote'
    const colunaId = porLote ? 'Lote' : 'Item'

    // Larguras das colunas da tabela de itens (DXA), somando exatamente
    // LARGURA_UTIL — docx exige width na tabela E em cada célula (ver
    // gotchas da lib), então as duas listas têm que bater.
    const W_ID = Math.round(LARGURA_UTIL * 0.07)
    const W_ESP = Math.round(LARGURA_UTIL * 0.30)
    const W_MARCA = Math.round(LARGURA_UTIL * 0.16)
    const W_MODELO = Math.round(LARGURA_UTIL * 0.16)
    const W_QTD = Math.round(LARGURA_UTIL * 0.11)
    const W_VUNIT = Math.round(LARGURA_UTIL * 0.10)
    const W_VTOTAL = LARGURA_UTIL - W_ID - W_ESP - W_MARCA - W_MODELO - W_QTD - W_VUNIT

    const linhasItens: TableRow[] = [
      new TableRow({
        tableHeader: true,
        children: [
          celula(colunaId, { width: W_ID, bold: true, shading: 'F2F2F2' }),
          celula('Especificação', { width: W_ESP, bold: true, shading: 'F2F2F2' }),
          celula('Marca', { width: W_MARCA, bold: true, shading: 'F2F2F2' }),
          celula('Modelo', { width: W_MODELO, bold: true, shading: 'F2F2F2' }),
          celula('Quant.', { width: W_QTD, bold: true, align: AlignmentType.RIGHT, shading: 'F2F2F2' }),
          celula('Valor Unit. R$', { width: W_VUNIT, bold: true, align: AlignmentType.RIGHT, shading: 'F2F2F2' }),
          celula('V. Total R$', { width: W_VTOTAL, bold: true, align: AlignmentType.RIGHT, shading: 'F2F2F2' }),
        ],
      }),
    ]

    let totalGeral = 0
    let loteAtual: string | null = null
    let subtotalLote = 0
    const fecharSubtotalLote = () => {
      if (loteAtual === null) return
      linhasItens.push(new TableRow({
        children: [
          celula(`Subtotal — Lote ${loteAtual}`, { width: W_ID + W_ESP + W_MARCA + W_MODELO + W_QTD + W_VUNIT, bold: true, colSpan: 6, shading: 'F7F7F7' }),
          celula(formatBRL(subtotalLote), { width: W_VTOTAL, bold: true, align: AlignmentType.RIGHT, shading: 'F7F7F7' }),
        ],
      }))
      subtotalLote = 0
    }

    for (const item of itensGanhos) {
      const identificador = porLote ? (item.lote || '—') : item.numero_item
      if (porLote && identificador !== loteAtual) {
        fecharSubtotalLote()
        loteAtual = identificador
      }
      const quantidade = Number(item.quantidade) || 0
      const valorUnitario = Number(item.valor_unitario_ofertado ?? item.valor_unitario_licitado) || 0
      const valorTotalItem = quantidade * valorUnitario
      totalGeral += valorTotalItem
      subtotalLote += valorTotalItem

      linhasItens.push(new TableRow({
        children: [
          celula(identificador, { width: W_ID, align: AlignmentType.CENTER }),
          celula(item.descricao ?? '', { width: W_ESP }),
          celula(item.marca ?? '—', { width: W_MARCA }),
          celula(item.referencia ?? '—', { width: W_MODELO }),
          celula(`${item.quantidade} ${item.unidade ?? ''}`.trim(), { width: W_QTD, align: AlignmentType.RIGHT }),
          celula(formatBRL(valorUnitario), { width: W_VUNIT, align: AlignmentType.RIGHT }),
          celula(formatBRL(valorTotalItem), { width: W_VTOTAL, align: AlignmentType.RIGHT }),
        ],
      }))
    }
    if (porLote) fecharSubtotalLote()

    linhasItens.push(new TableRow({
      children: [
        celula('Valor Total da Proposta', { width: W_ID + W_ESP + W_MARCA + W_MODELO + W_QTD + W_VUNIT, bold: true, colSpan: 6, shading: 'ECECEC' }),
        celula(formatBRL(totalGeral), { width: W_VTOTAL, bold: true, align: AlignmentType.RIGHT, shading: 'ECECEC' }),
      ],
    }))

    const tabelaItens = new Table({
      width: { size: LARGURA_UTIL, type: WidthType.DXA },
      columnWidths: [W_ID, W_ESP, W_MARCA, W_MODELO, W_QTD, W_VUNIT, W_VTOTAL],
      borders: BORDAS_TABELA,
      rows: linhasItens,
    })

    // Cabeçalho do cliente — o mesmo texto salvo em Cadastros → Declarações
    // (clients.cabecalho_declaracao), sempre centralizado, com a primeira
    // linha em destaque. Sem cabeçalho salvo, cai num mínimo (nome + CNPJ)
    // pra nunca gerar um documento sem identificação nenhuma no topo.
    const linhasCabecalho = (client.cabecalho_declaracao?.trim() || `${client.name}\nCNPJ: ${client.cnpj ?? ''}`).split('\n').filter(Boolean)
    const paragrafosCabecalho = linhasCabecalho.map((linha, idx) =>
      paragrafo(linha, {
        align: AlignmentType.CENTER,
        bold: idx === 0,
        size: idx === 0 ? 28 : 18,
        spacingAfter: 40,
        borderBottom: idx === linhasCabecalho.length - 1,
      })
    )

    const linhaBancaria = client.banco_nome
      ? [paragrafo(`Conta Bancária: ${client.banco_nome}   Ag: ${client.banco_agencia ?? ''}   Conta Corrente: ${client.banco_conta ?? ''}`)]
      : []

    const hoje = new Date()
    const cidadeEmissao = client.cidade || '[cidade]'

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            size: { width: PAGINA_LARGURA, height: PAGINA_ALTURA },
            margin: { top: MARGEM_TOPO, bottom: MARGEM_RODAPE, left: MARGEM_LATERAL, right: MARGEM_LATERAL },
          },
        },
        children: [
          ...paragrafosCabecalho,
          new Paragraph({ spacing: { after: 40 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Proposta de Preços', bold: true, size: 24, font: 'Arial' })] }),
          new Paragraph({ spacing: { after: 200 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${bidding.modalidade} Nº ${bidding.numero_edital ?? '—'}`, bold: true, size: 24, font: 'Arial' })] }),

          new Table({
            width: { size: LARGURA_UTIL, type: WidthType.DXA },
            columnWidths: [Math.round(LARGURA_UTIL / 2), LARGURA_UTIL - Math.round(LARGURA_UTIL / 2)],
            borders: BORDAS_TABELA,
            rows: [
              new TableRow({ children: [celula(`Razão Social: ${client.name}`, { width: Math.round(LARGURA_UTIL / 2), bold: true }), celula(`CNPJ: ${client.cnpj ?? ''}`, { width: LARGURA_UTIL - Math.round(LARGURA_UTIL / 2) })] }),
              new TableRow({ children: [celula(`I.E: ${client.inscricao_estadual ?? '—'}`, { width: Math.round(LARGURA_UTIL / 2) }), celula(`Endereço: ${client.address ?? ''}`, { width: LARGURA_UTIL - Math.round(LARGURA_UTIL / 2) })] }),
              new TableRow({ children: [celula(`Bairro: ${client.bairro ?? ''}`, { width: Math.round(LARGURA_UTIL / 2) }), celula(`Cidade: ${client.cidade ?? ''}`, { width: LARGURA_UTIL - Math.round(LARGURA_UTIL / 2) })] }),
              new TableRow({ children: [celula(`Telefone: ${client.phone ?? ''}`, { width: Math.round(LARGURA_UTIL / 2) }), celula(`E-mail: ${client.email ?? ''}`, { width: LARGURA_UTIL - Math.round(LARGURA_UTIL / 2) })] }),
            ],
          }),
          new Paragraph({ spacing: { after: 120 }, children: [] }),

          ...linhaBancaria,
          paragrafo(`Responsável pela empresa: ${client.responsavel_nome ?? ''}`, { bold: true }),
          paragrafo(`CPF: ${client.responsavel_cpf ?? ''}     Cargo do responsável: ${client.responsavel_cargo ?? ''}`, { spacingAfter: 200 }),

          paragrafo(`Ao(À) ${bidding.orgao ?? '[órgão]'}, apresentamos nossa proposta comercial referente ao ${bidding.modalidade} nº ${bidding.numero_edital ?? '—'}, conforme planilha abaixo:`, { align: AlignmentType.JUSTIFIED, spacingAfter: 160 }),

          tabelaItens,
          new Paragraph({ spacing: { after: 120 }, children: [] }),

          paragrafo('Ao apresentarmos a presente proposta, manifestamos no sentido de concordar com os termos do Edital e seus anexos, nos comprometendo a cumprir fielmente suas cláusulas.', { align: AlignmentType.JUSTIFIED }),
          paragrafo(`A presente proposta possui validade de ${bidding.dias_validade_proposta ?? '60 (sessenta)'} dias a partir da data da Sessão Pública do Pregão.`, { align: AlignmentType.JUSTIFIED, spacingAfter: 500 }),

          paragrafo(`${cidadeEmissao}, ${dataPorExtenso(hoje)}.`, { bold: true, align: AlignmentType.RIGHT, spacingAfter: 700 }),
          paragrafo('', { borderBottom: true }),
        ],
      }],
    })

    const buffer = await Packer.toBuffer(doc)
    const fileBase64 = toBase64(new Uint8Array(buffer))
    const nomeBase = (bidding.numero_edital ?? biddingId).replace(/[^\w-]+/g, '_')

    return json({
      success: true,
      fileBase64,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileName: `Proposta_Readequada_${nomeBase}.docx`,
    })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err)
    console.error('Erro ao gerar proposta readequada:', mensagem)
    return json({ success: false, error: mensagem }, 500)
  }
})
