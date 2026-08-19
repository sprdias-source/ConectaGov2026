// Edge Function: gerar-anexo-declaracao
//
// Gera o .pdf de uma declaração já preenchida (bidding_declaracao_anexos)
// pronta pra mandar o cliente assinar — troca o antigo botão "Copiar"
// (que só copiava o texto pra área de transferência) por um documento de
// verdade, formatado, que o usuário baixa e envia.
//
// O texto do anexo já vem pronto (Analisar-anexos-declaracao preenche e
// prefixa o cabeçalho salvo do cliente) — aqui é só o texto virando PDF:
// o primeiro bloco (separado por linha em branco) é o cabeçalho, renderizado
// centralizado com a primeira linha em destaque (mesma convenção usada em
// clients.cabecalho_declaracao); os blocos seguintes são parágrafos normais,
// com quebra de linha automática e quebra de página quando necessário.
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

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

// Quebra um texto em linhas que cabem em LARGURA_UTIL na fonte/tamanho
// dados — pdf-lib não quebra linha sozinho, então isso é feito à mão,
// palavra por palavra.
function quebrarLinha(texto: string, fonte: PDFFont, tamanho: number): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean)
  const linhas: string[] = []
  let atual = ''
  for (const palavra of palavras) {
    const teste = atual ? `${atual} ${palavra}` : palavra
    if (fonte.widthOfTextAtSize(teste, tamanho) > LARGURA_UTIL && atual) {
      linhas.push(atual)
      atual = palavra
    } else {
      atual = teste
    }
  }
  if (atual) linhas.push(atual)
  return linhas
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
      .select('id, user_id, titulo, texto')
      .eq('id', anexoId)
      .single()
    if (anexoError || !anexo) return json({ error: 'Anexo de declaração não encontrado' }, 404)
    if (anexo.user_id !== user.id) return json({ error: 'Sem permissão para este anexo' }, 403)
    if (!anexo.texto?.trim()) return json({ error: 'Este anexo ainda não tem texto preenchido' }, 400)

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
    // palavras da linha até encostar na margem direita. A ÚLTIMA linha de
    // cada parágrafo nunca é esticada (regra tipográfica padrão — só a
    // última linha fica "curta" e alinhada à esquerda, como no Word/ABNT).
    const desenharLinhaJustificada = (texto: string, tamanho: number, fonteUsada: PDFFont, ultimaLinhaDoParagrafo: boolean) => {
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

    // Primeiro bloco (separado por linha em branco) = cabeçalho do
    // cliente, sempre centralizado, primeira linha em destaque — mesma
    // convenção de clients.cabecalho_declaracao. Os blocos seguintes são
    // parágrafos normais, alinhados à esquerda.
    const paragrafos = anexo.texto.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)

    paragrafos.forEach((paragrafo, idx) => {
      if (idx === 0) {
        const linhasCabecalho = paragrafo.split('\n').map((l) => l.trim()).filter(Boolean)
        linhasCabecalho.forEach((linha, li) => {
          const negrito = li === 0
          const tamanho = negrito ? 13 : 10
          const fonteLinha = negrito ? fonteNegrito : fonte
          for (const l of quebrarLinha(linha, fonteLinha, tamanho)) {
            desenharLinha(l, tamanho, fonteLinha, true)
          }
        })
        y -= 10
      } else {
        const linhas = quebrarLinha(paragrafo, fonte, 11)
        linhas.forEach((linha, li) => desenharLinhaJustificada(linha, 11, fonte, li === linhas.length - 1))
        y -= 8
      }
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
