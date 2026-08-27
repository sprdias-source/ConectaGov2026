// Edge Function: gerar-anexo-declaracao-word
//
// Gera o .docx de uma declaração já preenchida (bidding_declaracao_anexos) —
// mesmo conteúdo e mesma formatação do gerar-anexo-declaracao (PDF):
// 1. Cabeçalho do cliente — centralizado, primeira linha em destaque.
// 2. Bloco "PROCESSO LICITATÓRIO Nº .../[MODALIDADE] Nº ..." — negrito,
//    alinhado à esquerda, vindo dos dados da própria licitação.
// 3. Título do anexo (bidding_declaracao_anexos.titulo) — centralizado,
//    negrito.
// 4. Corpo do texto — parágrafos justificados com recuo de primeira linha
//    (padrão ABNT/jurídico); a data e o bloco de assinatura (os dois
//    últimos blocos) não levam recuo/justificado, e cada linha interna
//    deles (assinatura / nome / cargo) vira uma quebra de linha de verdade
//    dentro do mesmo parágrafo, em vez de virar texto corrido.
//
// Diferente de gerar-proposta (que usa um modelo .docx com {{placeholders}}
// no Storage), aqui não existe planilha/tabela pra montar — é só texto
// corrido — então o documento é construído direto via biblioteca `docx`, que
// já suporta alinhamento justificado e recuo de primeira linha nativamente
// (sem precisar montar OOXML à mão feito o pdf-lib exige pro PDF).
//
// Recebe { anexoId } e devolve { success, fileBase64, mimeType, fileName }
// — o frontend decodifica o base64 e baixa o arquivo; esta function não
// grava nada sozinha, só gera o documento.
//
// VARIÁVEIS DE AMBIENTE NECESSÁRIAS (Supabase → Edge Functions → Secrets):
// - SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm injetadas
//   automaticamente pelo Supabase em toda Edge Function.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'npm:docx@9.0.2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

// Recuo de primeira linha padrão (~1cm) em twips (1cm ≈ 567 twips) — mesma
// medida usada no PDF (RECUO_PRIMEIRA_LINHA lá é em pontos, aqui em twips).
const RECUO_PRIMEIRA_LINHA_TWIPS = 560

// Um parágrafo com quebras de linha internas (\n) — ex: assinatura / nome /
// cargo, cada um na sua linha — vira UM parágrafo do Word com várias
// TextRun separadas por `break: 1`, em vez de virar texto corrido.
function construirRunsComQuebras(texto: string, tamanho: number): TextRun[] {
  const linhas = texto.split('\n').map((l) => l.trim()).filter(Boolean)
  return linhas.map((linha, idx) => new TextRun({ text: linha, size: tamanho, break: idx > 0 ? 1 : undefined }))
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  try {
    const { anexoId } = await req.json()
    if (!anexoId) return json({ error: 'anexoId é obrigatório' }, 400)

    const authHeader = req.headers.get('Authorization')
    const jwt = authHeader?.replace('Bearer ', '')
    if (!jwt) return json({ error: 'Não autenticado' }, 401)
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt)
    if (userError || !user) return json({ error: 'Não autenticado' }, 401)

    // Compara com o DONO da conta (owner_efetivo), não com quem está
    // logado — todo anexo sempre tem user_id = dono, então um membro de
    // equipe sempre bateria 403 se comparássemos direto com user.id.
    const { data: ownerId, error: ownerError } = await supabase.rpc('owner_efetivo', { usuario_id: user.id })
    if (ownerError || !ownerId) return json({ error: 'Não foi possível identificar a conta do usuário' }, 500)

    const { data: anexo, error: anexoError } = await supabase
      .from('bidding_declaracao_anexos')
      .select('id, user_id, bidding_id, titulo, texto')
      .eq('id', anexoId)
      .single()
    if (anexoError || !anexo) return json({ error: 'Anexo de declaração não encontrado' }, 404)
    if (anexo.user_id !== ownerId) return json({ error: 'Sem permissão para este anexo' }, 403)
    if (!anexo.texto?.trim()) return json({ error: 'Este anexo ainda não tem texto preenchido' }, 400)

    const { data: bidding } = await supabase
      .from('biddings')
      .select('processo, modalidade, numero_edital')
      .eq('id', anexo.bidding_id)
      .single()

    const blocos = anexo.texto.split(/\n{2,}/).map((p: string) => p.trim()).filter(Boolean)
    const [blocoCabecalho, ...resto] = blocos

    // Data e assinatura são identificados pelo CONTEÚDO (padrão de data /
    // a palavra "assinatura"), não por posição ("os 2 últimos blocos") — a
    // IA nem sempre separa esses blocos com linha em branco igual o prompt
    // pede; assumir cegamente a posição gruda a declaração inteira dentro
    // do bloco de assinatura e perde o recuo/justificado dela.
    const ultimoIdx = resto.length - 1
    const ultimoEhAssinatura = ultimoIdx >= 0 && /assinatura/i.test(resto[ultimoIdx]) && resto[ultimoIdx].length < 300
    const idxAssinaturaResto = ultimoEhAssinatura ? ultimoIdx : -1
    const idxDataResto = ultimoEhAssinatura && ultimoIdx - 1 >= 0 && /\d{1,2}\s+de\s+[a-zçãõéê]+\s+de\s+\d{4}/i.test(resto[ultimoIdx - 1]) ? ultimoIdx - 1 : -1
    const blocosCorpo = resto.filter((_: string, i: number) => i !== idxDataResto && i !== idxAssinaturaResto)
    let indiceData = -1
    let indiceAssinatura = -1
    if (idxDataResto >= 0) { indiceData = blocosCorpo.length; blocosCorpo.push(resto[idxDataResto]) }
    if (idxAssinaturaResto >= 0) { indiceAssinatura = blocosCorpo.length; blocosCorpo.push(resto[idxAssinaturaResto]) }

    const paragrafosDoc: Paragraph[] = []

    // 1) Cabeçalho do cliente — centralizado, primeira linha em destaque.
    const linhasCabecalho = blocoCabecalho.split('\n').map((l) => l.trim()).filter(Boolean)
    linhasCabecalho.forEach((linha, li) => {
      const negrito = li === 0
      paragrafosDoc.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: li === linhasCabecalho.length - 1 ? 200 : 40 },
        children: [new TextRun({ text: linha, bold: negrito, size: negrito ? 26 : 20 })],
      }))
    })

    // 2) Processo/Pregão — negrito, alinhado à esquerda, vindo da própria
    // licitação (não do texto gerado pela IA).
    if (bidding?.processo || bidding?.numero_edital) {
      if (bidding.processo) {
        paragrafosDoc.push(new Paragraph({
          spacing: { before: 200, after: 0 },
          children: [new TextRun({ text: `PROCESSO LICITATÓRIO Nº ${bidding.processo}`, bold: true, size: 21 })],
        }))
      }
      if (bidding.numero_edital) {
        paragrafosDoc.push(new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun({ text: `${(bidding.modalidade ?? '').toUpperCase()} Nº ${bidding.numero_edital}`, bold: true, size: 21 })],
        }))
      }
    }

    // 3) Título do anexo — centralizado, negrito.
    if (anexo.titulo?.trim()) {
      paragrafosDoc.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 280 },
        children: [new TextRun({ text: anexo.titulo.trim().toUpperCase(), bold: true, size: 23 })],
      }))
    }

    // 4) Corpo — os blocos do meio (a declaração em si) levam recuo de
    // primeira linha + justificado; data e assinatura (identificados acima
    // por conteúdo) não levam recuo, e o bloco de assinatura respeita as
    // quebras de linha simples que separam assinatura/nome/cargo.
    blocosCorpo.forEach((bloco: string, idx: number) => {
      const ehDataOuAssinatura = idx === indiceData || idx === indiceAssinatura
      paragrafosDoc.push(new Paragraph({
        alignment: ehDataOuAssinatura ? AlignmentType.LEFT : AlignmentType.JUSTIFIED,
        indent: ehDataOuAssinatura ? undefined : { firstLine: RECUO_PRIMEIRA_LINHA_TWIPS },
        spacing: { after: idx === indiceData ? 280 : 160, line: 360, lineRule: 'auto' },
        children: construirRunsComQuebras(bloco, 22),
      }))
    })

    const doc = new Document({
      sections: [{
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        children: paragrafosDoc,
      }],
    })

    const bytes = await Packer.toBuffer(doc)
    const fileBase64 = toBase64(new Uint8Array(bytes))
    const nomeArquivo = `${(anexo.titulo || 'Declaracao').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')}.docx`

    return json({
      success: true,
      fileBase64,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileName: nomeArquivo,
    })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err)
    console.error('Erro ao gerar Word do anexo de declaração:', mensagem)
    return json({ success: false, error: mensagem }, 500)
  }
})
