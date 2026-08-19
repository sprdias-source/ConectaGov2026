// Edge Function: gerar-anexo-declaracao-word
//
// Gera o .docx de uma declaração já preenchida (bidding_declaracao_anexos) —
// mesmo conteúdo e mesma formatação do gerar-anexo-declaracao (PDF): primeiro
// bloco (separado por linha em branco) é o cabeçalho do cliente, centralizado
// com a primeira linha em destaque; os blocos seguintes são parágrafos
// justificados (padrão ABNT), com quebra de página automática do próprio
// Word. Serve pra quem prefere ajustar o texto no Word antes de mandar pro
// cliente assinar, em vez de ir direto pro PDF.
//
// Diferente de gerar-proposta (que usa um modelo .docx com {{placeholders}}
// no Storage), aqui não existe planilha/tabela pra montar — é só texto
// corrido — então o documento é construído direto via biblioteca `docx`, que
// já suporta alinhamento justificado nativamente (sem precisar montar OOXML
// à mão feito o pdf-lib exige pro PDF).
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

    // Primeiro bloco (separado por linha em branco) = cabeçalho do cliente,
    // centralizado, primeira linha em destaque — mesma convenção do PDF
    // (gerar-anexo-declaracao) e de clients.cabecalho_declaracao. Os blocos
    // seguintes são parágrafos normais, justificados.
    const paragrafosTexto = anexo.texto.split(/\n{2,}/).map((p: string) => p.trim()).filter(Boolean)

    const paragrafosDoc: Paragraph[] = []
    paragrafosTexto.forEach((paragrafo: string, idx: number) => {
      if (idx === 0) {
        const linhasCabecalho = paragrafo.split('\n').map((l) => l.trim()).filter(Boolean)
        linhasCabecalho.forEach((linha, li) => {
          const negrito = li === 0
          paragrafosDoc.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: li === linhasCabecalho.length - 1 ? 200 : 40 },
            children: [new TextRun({ text: linha, bold: negrito, size: negrito ? 26 : 20 })],
          }))
        })
      } else {
        paragrafosDoc.push(new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 160, line: 360, lineRule: 'auto' },
          children: [new TextRun({ text: paragrafo, size: 22 })],
        }))
      }
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
