// Edge Function: Perguntar-oportunidade
//
// Cópia adaptada de Perguntar-edital, pro estágio de Oportunidade (antes da
// licitação existir de verdade — ver tabela `opportunities`). Mesmo prompt,
// mesmo mecanismo de upload — só muda ONDE verifica permissão
// (opportunities em vez de biddings) e onde busca o anexo (entity_type
// 'oportunidade' em vez de 'licitacao').
//
// Recebe { opportunityId, pergunta } e devolve { resposta }. Responde de
// forma SÍNCRONA (sem EdgeRuntime.waitUntil) — mesmo motivo de
// Perguntar-edital: uma pergunta pontual processa rápido o bastante pra
// caber no limite de execução síncrona.
//
// VARIÁVEIS DE AMBIENTE NECESSÁRIAS (Supabase → Edge Functions → Secrets):
// - GEMINI_API_KEY: a mesma chave já usada pelas outras functions de IA.
// - SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm injetadas
//   automaticamente pelo Supabase em toda Edge Function.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { baixarAnexo } from '../_shared/googleDrive.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
// Ver o mesmo comentário em Analisar-edital/index.ts sobre por que é fixo
// (não 'gemini-flash-latest') e por que já trocou uma vez de 2.5 pra 3.5.
const GEMINI_MODEL = 'gemini-3.5-flash'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

type Supa = ReturnType<typeof createClient>
type Anexo = { id: string; name: string; storage_path: string; mime_type: string | null; size_bytes: number | null; category: string }

async function uploadParaGemini(fileStream: ReadableStream<Uint8Array>, sizeBytes: number, mimeType: string, displayName: string) {
  const startRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(sizeBytes),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  })
  if (!startRes.ok) throw new Error(`Falha ao iniciar upload no Gemini: ${await startRes.text()}`)
  const uploadUrl = startRes.headers.get('x-goog-upload-url')
  if (!uploadUrl) throw new Error('Gemini não retornou a URL de upload')

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(sizeBytes),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: fileStream,
    // @ts-ignore: 'duplex' é exigido pelo fetch quando o body é uma stream, mas ainda não está no lib.dom.d.ts do TS
    duplex: 'half',
  })
  if (!uploadRes.ok) throw new Error(`Falha ao enviar "${displayName}" pro Gemini: ${await uploadRes.text()}`)
  const uploaded = await uploadRes.json()

  let file = uploaded.file
  let tentativas = 0
  while (file.state === 'PROCESSING' && tentativas < 20) {
    await new Promise((r) => setTimeout(r, 2000))
    const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${GEMINI_API_KEY}`)
    file = await checkRes.json()
    tentativas++
  }
  if (file.state !== 'ACTIVE') throw new Error(`"${displayName}" não ficou pronto no Gemini (estado: ${file.state})`)

  return file as { name: string; uri: string }
}

async function fetchComRetry(url: string, init: RequestInit, tentativas = 4): Promise<Response> {
  let ultimoErro: unknown
  for (let i = 0; i < tentativas; i++) {
    try {
      const res = await fetch(url, init)
      if (res.ok) return res
      if (res.status < 500 && res.status !== 429) return res
      const corpo = await res.text()
      if (res.status === 429 && corpo.includes('PerDay')) {
        return new Response(corpo, { status: res.status, statusText: res.statusText, headers: res.headers })
      }
      ultimoErro = new Error(`HTTP ${res.status}: ${corpo}`)
    } catch (err) {
      ultimoErro = err
    }
    if (i < tentativas - 1) {
      await new Promise((r) => setTimeout(r, 1500 * 2 ** i))
    }
  }
  throw ultimoErro instanceof Error ? ultimoErro : new Error(String(ultimoErro))
}

async function apagarArquivoGemini(fileName: string) {
  try {
    await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_API_KEY}`, { method: 'DELETE' })
  } catch {
    // best-effort — o Gemini expira arquivos sozinho depois de um tempo
  }
}

async function processarDocumento(supabase: Supa, doc: Anexo, arquivosGeminiParaApagar: string[]) {
  const downloadRes = await baixarAnexo(supabase, doc.storage_path)
  if (!downloadRes.ok || !downloadRes.body) throw new Error(`Falha ao baixar "${doc.name}" do Storage/Drive`)

  const mimeType = doc.mime_type || 'application/pdf'
  const sizeBytes = doc.size_bytes ?? Number(downloadRes.headers.get('content-length') ?? 0)
  if (!sizeBytes) throw new Error(`Não foi possível determinar o tamanho de "${doc.name}"`)

  const geminiFile = await uploadParaGemini(downloadRes.body, sizeBytes, mimeType, doc.name)
  // Registra ANTES de retornar — se outro documento do MESMO lote (ver
  // Promise.all abaixo) falhar depois deste já ter subido com sucesso, o
  // Promise.all rejeita sem nunca rodar o .forEach que populava esta lista
  // só no fim, deixando este arquivo órfão no Gemini até expirar sozinho.
  arquivosGeminiParaApagar.push(geminiFile.name)
  return {
    fileData: { file_data: { mime_type: mimeType, file_uri: geminiFile.uri } },
    geminiFileName: geminiFile.name,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const arquivosGeminiParaApagar: string[] = []

  try {
    const { opportunityId, pergunta } = await req.json()
    if (!opportunityId) return json({ error: 'opportunityId é obrigatório' }, 400)
    if (!pergunta || !String(pergunta).trim()) return json({ error: 'pergunta é obrigatória' }, 400)
    if (String(pergunta).length > 2000) return json({ error: 'Pergunta muito longa (máximo 2000 caracteres)' }, 400)

    const authHeader = req.headers.get('Authorization')
    const jwt = authHeader?.replace('Bearer ', '')
    if (!jwt) return json({ error: 'Não autenticado' }, 401)
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt)
    if (userError || !user) return json({ error: 'Não autenticado' }, 401)

    // Compara com o DONO da conta (owner_efetivo), não com quem está
    // logado — toda oportunidade sempre tem user_id = dono, então um
    // membro de equipe sempre bateria 403 se comparássemos direto com
    // user.id.
    const { data: ownerId, error: ownerError } = await supabase.rpc('owner_efetivo', { usuario_id: user.id })
    if (ownerError || !ownerId) return json({ error: 'Não foi possível identificar a conta do usuário' }, 500)

    const { data: opportunity, error: opportunityError } = await supabase
      .from('opportunities')
      .select('id, user_id')
      .eq('id', opportunityId)
      .single()
    if (opportunityError || !opportunity) return json({ error: 'Oportunidade não encontrada' }, 404)
    if (opportunity.user_id !== ownerId) return json({ error: 'Sem permissão para esta oportunidade' }, 403)

    const { data: anexos, error: anexosError } = await supabase
      .from('attached_files')
      .select('id, name, storage_path, mime_type, size_bytes, category')
      .eq('entity_type', 'oportunidade')
      .eq('entity_id', opportunityId)
      .in('category', ['Edital', 'Termo de Referência'])
      .order('created_at', { ascending: false })
    if (anexosError) throw anexosError

    const edital = (anexos as Anexo[] | null)?.find((a) => a.category === 'Edital')
    const tr = (anexos as Anexo[] | null)?.find((a) => a.category === 'Termo de Referência')
    if (!edital) return json({ error: 'Nenhum edital enviado para esta oportunidade' }, 400)

    const docs = [edital, tr].filter((d): d is Anexo => !!d)
    const resultados = await Promise.all(docs.map((doc) => processarDocumento(supabase, doc, arquivosGeminiParaApagar)))
    const partesArquivos = resultados.map((r) => r.fileData)

    const prompt = `Você é um assistente que responde perguntas objetivas sobre um edital de licitação pública brasileira anexado (e o termo de referência, se estiver junto). Responda À PERGUNTA ABAIXO de forma direta, em português, citando o trecho ou cláusula do edital que embasa a resposta sempre que possível. Se a informação não estiver no documento, diga claramente que não encontrou essa informação no edital — nunca invente uma resposta.\n\nPERGUNTA: ${String(pergunta).trim()}`

    const genRes = await fetchComRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [...partesArquivos, { text: prompt }] }],
        }),
      }
    )

    for (const nome of arquivosGeminiParaApagar) apagarArquivoGemini(nome) // não precisa esperar terminar

    if (!genRes.ok) throw new Error(`Falha ao perguntar ao Gemini: ${await genRes.text()}`)
    const genData = await genRes.json()
    const resposta = genData.candidates?.[0]?.content?.parts?.[0]?.text
    if (!resposta) throw new Error('Gemini não retornou resposta')

    return json({ resposta })
  } catch (err) {
    for (const nome of arquivosGeminiParaApagar) apagarArquivoGemini(nome)
    const mensagem = err instanceof Error ? err.message : String(err)
    console.error('Erro ao perguntar sobre a oportunidade:', mensagem)
    return json({ success: false, error: mensagem }, 500)
  }
})
