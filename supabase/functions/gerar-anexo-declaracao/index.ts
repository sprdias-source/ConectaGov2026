// Edge Function: gerar-anexo-declaracao
//
// Gera o .pdf de uma declaração já preenchida (bidding_declaracao_anexos)
// pronta pra mandar o cliente assinar — troca o antigo botão "Copiar"
// (que só copiava o texto pra área de transferência) por um documento de
// verdade, formatado, que o usuário baixa e envia.
//
// Estrutura do documento (igual ao modelo real do Anexo do edital):
// 1. Cabeçalho do cliente — centralizado, primeira linha em destaque (mesma
//    convenção de clients.cabecalho_declaracao).
// 2. Bloco "PROCESSO LICITATÓRIO Nº .../[MODALIDADE] Nº ..." — negrito,
//    alinhado à esquerda, vindo dos dados da própria licitação (não do
//    texto da IA).
// 3. Título do anexo (bidding_declaracao_anexos.titulo) — centralizado,
//    negrito.
// 4. Corpo do texto (anexo.texto, já preenchido pela IA em
//    Analisar-anexos-declaracao) — parágrafos justificados com recuo de
//    primeira linha (padrão ABNT/jurídico); os dois últimos blocos (data e
//    bloco de assinatura) não levam recuo/justificado, e respeitam quebras
//    de linha simples dentro do próprio bloco (ex: assinatura, nome e cargo
//    cada um na sua linha) — antes essas quebras eram ignoradas e tudo
//    virava um parágrafo corrido.
//
// Recebe { anexoId } e devolve { success, fileBase64, mimeType, fileName }
// — o frontend decodifica o base64 e baixa o arquivo; esta function não
// grava nada sozinha, só gera o PDF.
//
// VARIÁVEIS DE AMBIENTE NECESSÁRIAS (Supabase → Edge Functions → Secrets):
// - SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm injetadas
//   automaticamente pelo Supabase em toda Edge Function.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, type PDFFont } from 'npm:pdf-lib@1.17.1'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// A4 em pontos (1pt = 1/72 polegada) — margem de ~2cm.
const PAGINA_LARGURA = 595.28
const PAGINA_ALTURA = 841.89
const MARGEM = 56
const LARGURA_UTIL = PAGINA_LARGURA - MARGEM * 2
const RECUO_PRIMEIRA_LINHA = 28 // ~1cm, recuo de parágrafo padrão

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

// Quebra um texto em linhas que cabem em larguraMax na fonte/tamanho dados
// — pdf-lib não quebra linha sozinho, então isso é feito à mão, palavra por
// palavra. Não mexe em quebras de linha explícitas (\n) — isso é
// responsabilidade de quem chama, ver desenharBloco.
function quebrarLinha(texto: string, fonte: PDFFont, tamanho: number, larguraMax: number): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean)
  const linhas: string[] = []
  let atual = ''
  for (const palavra of palavras) {
    const teste = atual ? `${atual} ${palavra}` : palavra
    if (fonte.widthOfTextAtSize(teste, tamanho) > larguraMax && atual) {
      linhas.push(atual)
      atual = palavra
    } else {
      atual = teste
    }
  }
  if (atual) linhas.push(atual)
  return linhas.length ? linhas : ['']
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

    const { data: anexo, error: anexoError } = await supabase
      .from('bidding_declaracao_anexos')
      .select('id, user_id, bidding_id, titulo, texto')
      .eq('id', anexoId)
      .single()
    if (anexoError || !anexo) return json({ error: 'Anexo de declaração não encontrado' }, 404)
    if (anexo.user_id !== user.id) return json({ error: 'Sem permissão para este anexo' }, 403)
    if (!anexo.texto?.trim()) return json({ error: 'Este anexo ainda não tem texto preenchido' }, 400)

    const { data: bidding } = await supabase
      .from('biddings')
      .select('processo, modalidade, numero_edital')
      .eq('id', anexo.bidding_id)
      .single()

    const doc = await PDFDocument.create()
    const fonte = await doc.embedFont(StandardFonts.Helvetica)
    const fonteNegrito = await doc.embedFont(StandardFonts.HelveticaBold)

    let pagina = doc.addPage([PAGINA_LARGURA, PAGINA_ALTURA])
    let y = PAGINA_ALTURA - MARGEM

    const novaPagina = () => {
      pagina = doc.addPage([PAGINA_LARGURA, PAGINA_ALTURA])
      y = PAGINA_ALTURA - MARGEM
    }
    const garantirEspaco = (altura: number) => {
      if (y - altura < MARGEM) novaPagina()
    }
    const desenharLinha = (texto: string, tamanho: number, fonteUsada: PDFFont, centralizado: boolean) => {
      garantirEspaco(tamanho * 1.4)
      const largura = fonteUsada.widthOfTextAtSize(texto, tamanho)
      const x = centralizado ? MARGEM + (LARGURA_UTIL - largura) / 2 : MARGEM
      pagina.drawText(texto, { x, y, size: tamanho, font: fonteUsada })
      y -= tamanho * 1.4
    }

    // Justificado (padrão ABNT) — pdf-lib não tem alinhamento justificado
    // pronto, então distribui manualmente o espaço sobrando entre as
    // palavras da linha até encostar na margem direita. A última linha de
    // cada bloco/quebra manual nunca é esticada (regra tipográfica padrão).
    // `recuar` desloca essa linha específica pelo recuo de primeira linha.
    const desenharLinhaJustificada = (texto: string, tamanho: number, fonteUsada: PDFFont, justificar: boolean, recuar: boolean) => {
      garantirEspaco(tamanho * 1.4)
      const xInicial = MARGEM + (recuar ? RECUO_PRIMEIRA_LINHA : 0)
      const palavras = texto.split(/\s+/).filter(Boolean)
      if (!justificar || palavras.length <= 1) {
        pagina.drawText(texto, { x: xInicial, y, size: tamanho, font: fonteUsada })
      } else {
        const larguraUtilLinha = LARGURA_UTIL - (recuar ? RECUO_PRIMEIRA_LINHA : 0)
        const larguraPalavras = palavras.reduce((s, p) => s + fonteUsada.widthOfTextAtSize(p, tamanho), 0)
        const espacoEntrePalavras = (larguraUtilLinha - larguraPalavras) / (palavras.length - 1)
        let x = xInicial
        for (const palavra of palavras) {
          pagina.drawText(palavra, { x, y, size: tamanho, font: fonteUsada })
          x += fonteUsada.widthOfTextAtSize(palavra, tamanho) + espacoEntrePalavras
        }
      }
      y -= tamanho * 1.4
    }

    // Desenha um bloco de texto respeitando quebras de linha explícitas
    // (\n) dentro dele — cada uma vira uma linha "forçada", que só quebra
    // mais se não couber na largura (quebrarLinha). Isso é o que faz o
    // bloco de assinatura (assinatura / nome / cargo, cada um na sua linha)
    // funcionar em vez de virar um parágrafo corrido só. `comRecuo` aplica
    // o recuo de primeira linha (só faz sentido pro corpo da declaração,
    // não pra data nem pro bloco de assinatura). `comJustificado` decide se
    // as linhas quebradas automaticamente esticam até a margem.
    const desenharBloco = (texto: string, tamanho: number, fonteUsada: PDFFont, opts: { comRecuo?: boolean; comJustificado?: boolean; espacoDepois?: number } = {}) => {
      const linhasForcadas = texto.split('\n').map((l) => l.trim()).filter(Boolean)
      linhasForcadas.forEach((linhaForcada, fIdx) => {
        const primeiraLinhaForcada = fIdx === 0
        const recuarEstaLinha = !!opts.comRecuo && primeiraLinhaForcada
        const larguraDisponivel = LARGURA_UTIL - (recuarEstaLinha ? RECUO_PRIMEIRA_LINHA : 0)
        const subLinhas = quebrarLinha(linhaForcada, fonteUsada, tamanho, larguraDisponivel)
        subLinhas.forEach((sub, sIdx) => {
          const ultimaSubLinha = sIdx === subLinhas.length - 1
          desenharLinhaJustificada(sub, tamanho, fonteUsada, !!opts.comJustificado && !ultimaSubLinha, recuarEstaLinha && sIdx === 0)
        })
      })
      y -= opts.espacoDepois ?? 8
    }

    // 1) Cabeçalho do cliente — primeiro bloco de anexo.texto (separado por
    // linha em branco), sempre centralizado, primeira linha em destaque.
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

    const linhasCabecalho = blocoCabecalho.split('\n').map((l) => l.trim()).filter(Boolean)
    linhasCabecalho.forEach((linha, li) => {
      const negrito = li === 0
      const tamanho = negrito ? 13 : 10
      const fonteLinha = negrito ? fonteNegrito : fonte
      for (const l of quebrarLinha(linha, fonteLinha, tamanho, LARGURA_UTIL)) {
        desenharLinha(l, tamanho, fonteLinha, true)
      }
    })
    y -= 10

    // 2) Processo/Pregão — negrito, alinhado à esquerda, vindo da própria
    // licitação (não do texto gerado pela IA).
    if (bidding?.processo || bidding?.numero_edital) {
      if (bidding.processo) desenharLinha(`PROCESSO LICITATÓRIO Nº ${bidding.processo}`, 10.5, fonteNegrito, false)
      if (bidding.numero_edital) desenharLinha(`${(bidding.modalidade ?? '').toUpperCase()} Nº ${bidding.numero_edital}`, 10.5, fonteNegrito, false)
      y -= 10
    }

    // 3) Título do anexo — centralizado, negrito.
    if (anexo.titulo?.trim()) {
      for (const l of quebrarLinha(anexo.titulo.trim().toUpperCase(), fonteNegrito, 11.5, LARGURA_UTIL)) {
        desenharLinha(l, 11.5, fonteNegrito, true)
      }
      y -= 14
    }

    // 4) Corpo — os blocos do meio (a declaração em si) levam recuo de
    // primeira linha + justificado; data e assinatura (identificados acima
    // por conteúdo) não levam recuo, e o bloco de assinatura respeita as
    // quebras de linha simples que separam assinatura/nome/cargo.
    blocosCorpo.forEach((bloco, idx) => {
      const ehDataOuAssinatura = idx === indiceData || idx === indiceAssinatura
      desenharBloco(bloco, 11, fonte, {
        comRecuo: !ehDataOuAssinatura,
        comJustificado: !ehDataOuAssinatura,
        espacoDepois: idx === indiceData ? 14 : 8,
      })
    })

    const bytes = await doc.save()
    const fileBase64 = toBase64(bytes)
    const nomeArquivo = `${(anexo.titulo || 'Declaracao').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')}.pdf`

    return json({
      success: true,
      fileBase64,
      mimeType: 'application/pdf',
      fileName: nomeArquivo,
    })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err)
    console.error('Erro ao gerar PDF do anexo de declaração:', mensagem)
    return json({ success: false, error: mensagem }, 500)
  }
})
