// Edge Function: Perguntar-edital
//
// Pergunta livre sobre o edital já enviado, no estilo "converse com o
// documento" — complementa a Análise de Edital (Analisar-edital), que só
// extrai campos fixos, pra quando a pergunta de quem está usando o sistema
// (ou do cliente, numa ligação) não cai em nenhum desses campos.
//
// Reenvia o PDF pro Gemini a cada pergunta — não reaproveita nenhum
// arquivo de uma análise anterior, porque Analisar-edital apaga o arquivo
// do Gemini logo depois de gerar a análise (ver apagarArquivoGemini lá).
// Diferente de Analisar-edital, responde de forma SÍNCRONA (sem
// EdgeRuntime.waitUntil): uma pergunta pontual, sem schema estruturado de
// dezenas de campos, processa bem mais rápido que a análise completa — cabe
// dentro do limite de execução síncrona da function.
//
// FALLBACK EM 3 NÍVEIS (mesmo padrão de Analisar-edital-juridico): quando a
// cota diária do Gemini estoura (HTTP 429 com "PerDay" no corpo), tenta de
// novo com uma 2ª chave (2º projeto Google Cloud, cota separada) antes de
// cair pro Mistral Document AI como último recurso. Como o Mistral processa
// um documento por chamada e não é feito pra bate-papo (é extração
// estruturada por schema), o fallback usa um schema mínimo { resposta:
// string } com o mesmo texto da pergunta como prompt de anotação — e só
// olha o Edital (não o TR) nesse caminho.
//
// Recebe { biddingId, pergunta } e devolve { resposta }.
//
// VARIÁVEIS DE AMBIENTE NECESSÁRIAS (Supabase → Edge Functions → Secrets):
// - GEMINI_API_KEY: a mesma chave já usada pela function Analisar-edital.
// - GEMINI_API_KEY_2: opcional — 2º nível de fallback.
// - MISTRAL_API_KEY: opcional — 3º nível de fallback.
// - SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm injetadas
//   automaticamente pelo Supabase em toda Edge Function.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const GEMINI_API_KEY_2 = Deno.env.get('GEMINI_API_KEY_2')
// Ver o mesmo comentário em Analisar-edital/index.ts sobre por que é fixo
// (não 'gemini-flash-latest') e por que já trocou uma vez de 2.5 pra 3.5.
const GEMINI_MODEL = 'gemini-3.5-flash'
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_DRIVE_CLIENT_ID')
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET')
const GOOGLE_REFRESH_TOKEN = Deno.env.get('GOOGLE_DRIVE_REFRESH_TOKEN')
const DRIVE_PREFIX = 'gdrive:'
const MISTRAL_API_KEY = Deno.env.get('MISTRAL_API_KEY')

// Embutido aqui em vez de importado de ../_shared/googleDrive.ts: essa
// function é colada manualmente no Dashboard do Supabase (um arquivo por
// vez), e o bundler do editor não enxerga pastas irmãs fora da function —
// só o deploy via CLI/git, que envia o repositório inteiro de uma vez, é que
// consegue resolver esse import. Fica autossuficiente de propósito.
async function obterAccessTokenDrive(): Promise<string> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error('Credenciais do Google Drive não configuradas nesta function (GOOGLE_DRIVE_CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN).')
  }
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: GOOGLE_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  })
  if (!res.ok) throw new Error(`Falha ao renovar o acesso ao Google Drive: ${await res.text()}`)
  const data = await res.json()
  return data.access_token as string
}

// Baixa um anexo de onde ele estiver — Google Drive (storage_path com
// prefixo "gdrive:") ou Supabase Storage (caminho antigo, de antes da
// migração pro Drive) — sempre devolvendo um Response comum, exatamente
// como um fetch(signedUrl) faria.
async function baixarAnexo(supabase: ReturnType<typeof createClient>, storagePath: string): Promise<Response> {
  if (storagePath.startsWith(DRIVE_PREFIX)) {
    const driveFileId = storagePath.slice(DRIVE_PREFIX.length)
    const accessToken = await obterAccessTokenDrive()
    return fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  }
  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from('client-documents')
    .createSignedUrl(storagePath, 300)
  if (signedUrlError || !signedUrlData) throw new Error('Não foi possível gerar a URL do arquivo no Storage')
  return fetch(signedUrlData.signedUrl)
}

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

// Upload em streaming pro Gemini Files API — recebe a chave como parâmetro
// pra poder ser chamada de novo com uma SEGUNDA chave se a 1ª bater a cota
// diária (arquivos enviados ficam vinculados ao projeto dono da chave que
// fez o upload, então trocar de chave exige reenviar os documentos).
async function uploadParaGemini(fileStream: ReadableStream<Uint8Array>, sizeBytes: number, mimeType: string, displayName: string, apiKey: string) {
  const startRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
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

  // Arquivos grandes/escaneados podem passar bem de 40s em "PROCESSING" no
  // Gemini antes de ficar ACTIVE (editais de até 60 páginas escaneadas já
  // observados levando mais que isso) — espera até ~100s antes de desistir.
  let file = uploaded.file
  let tentativas = 0
  while (file.state === 'PROCESSING' && tentativas < 50) {
    await new Promise((r) => setTimeout(r, 2000))
    const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${apiKey}`)
    file = await checkRes.json()
    tentativas++
  }
  if (file.state !== 'ACTIVE') {
    // Vazamento de cota: se o arquivo nunca chegou a ACTIVE (travou em
    // PROCESSING ou foi pra FAILED), ele já foi consumido no Gemini mas
    // nunca seria apagado — quem chama uploadParaGemini só recebe o
    // file.name em caso de sucesso, então sem isso o arquivo ficava órfão
    // até expirar sozinho em 48h.
    await apagarArquivoGemini(file.name, apiKey)
    throw new Error(`"${displayName}" não ficou pronto no Gemini (estado: ${file.state})`)
  }

  return file as { name: string; uri: string }
}

// Mesmo mecanismo de retry de Analisar-edital — Gemini ocasionalmente
// responde 503 (sobrecarga) ou 429 de limite de taxa transitório.
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

async function apagarArquivoGemini(fileName: string, apiKey: string) {
  try {
    await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`, { method: 'DELETE' })
  } catch {
    // best-effort — o Gemini expira arquivos sozinho depois de um tempo
  }
}

async function processarDocumento(supabase: Supa, doc: Anexo, apiKey: string, arquivosGeminiParaApagar: string[]) {
  const downloadRes = await baixarAnexo(supabase, doc.storage_path)
  if (!downloadRes.ok || !downloadRes.body) throw new Error(`Falha ao baixar "${doc.name}" do Storage/Drive`)

  const mimeType = doc.mime_type || 'application/pdf'
  const sizeBytes = doc.size_bytes ?? Number(downloadRes.headers.get('content-length') ?? 0)
  if (!sizeBytes) throw new Error(`Não foi possível determinar o tamanho de "${doc.name}"`)

  const geminiFile = await uploadParaGemini(downloadRes.body, sizeBytes, mimeType, doc.name, apiKey)
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

// Envia os documentos + pergunta com UMA chave/projeto específico do
// Gemini — extraído à parte pra poder ser chamado de novo com uma SEGUNDA
// chave se a 1ª bater a cota diária. Cada chamada tem sua própria lista de
// arquivos a apagar, já que um arquivo enviado com uma chave só pode ser
// apagado com a MESMA chave.
async function perguntarComGemini(supabase: Supa, docs: Anexo[], prompt: string, apiKey: string): Promise<Response> {
  const arquivosGeminiParaApagar: string[] = []
  try {
    const resultados = await Promise.all(docs.map((doc) => processarDocumento(supabase, doc, apiKey, arquivosGeminiParaApagar)))
    const partesArquivos = resultados.map((r) => r.fileData)

    return await fetchComRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [...partesArquivos, { text: prompt }] }],
          generationConfig: { maxOutputTokens: 8192 },
        }),
      }
    )
  } finally {
    // Sempre limpa os arquivos enviados com ESTA chave, mesmo se o upload
    // de algum documento do lote falhar antes de chegar no generateContent
    // — sem isso, um arquivo que subiu com sucesso antes da falha ficava
    // órfão no Gemini até expirar sozinho em 48h.
    for (const nome of arquivosGeminiParaApagar) apagarArquivoGemini(nome, apiKey) // não precisa esperar terminar
  }
}

function bytesParaBase64(bytes: Uint8Array): string {
  let binario = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binario += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binario)
}

async function baixarBytes(supabase: Supa, anexo: Anexo): Promise<Uint8Array> {
  const downloadRes = await baixarAnexo(supabase, anexo.storage_path)
  if (!downloadRes.ok || !downloadRes.body) throw new Error(`Falha ao baixar "${anexo.name}" do Storage/Drive`)
  return new Uint8Array(await downloadRes.arrayBuffer())
}

// Schema mínimo pro fallback via Mistral — a OCR da Mistral é feita pra
// extração estruturada por schema, não pra bate-papo livre, então o "chat"
// aqui é simulado pedindo um objeto só com o campo "resposta".
const PERGUNTA_SCHEMA_MISTRAL = {
  type: 'object',
  properties: { resposta: { type: 'string' } },
  required: ['resposta'],
  additionalProperties: false,
}

// Fallback via Mistral Document AI — só olha o Edital (não o TR): a OCR da
// Mistral processa um documento por chamada, e o edital sozinho já cobre a
// grande maioria das perguntas feitas nesta tela.
async function tentarFallbackMistral(supabase: Supa, edital: Anexo, pergunta: string): Promise<string> {
  if (!MISTRAL_API_KEY) {
    throw new Error('MISTRAL_API_KEY não configurada nesta function — sem fallback disponível.')
  }
  const bytes = await baixarBytes(supabase, edital)
  const base64 = bytesParaBase64(bytes)
  const promptAnotacao = `Você é um assistente que responde perguntas objetivas sobre um edital de licitação pública brasileira anexado. Responda à pergunta abaixo de forma direta, em português, citando o trecho ou cláusula do edital que embasa a resposta sempre que possível, no campo "resposta". Se a informação não estiver no documento, diga claramente que não encontrou essa informação no edital — nunca invente uma resposta.\n\nPERGUNTA: ${pergunta}`

  const res = await fetch('https://api.mistral.ai/v1/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MISTRAL_API_KEY}` },
    body: JSON.stringify({
      model: 'mistral-ocr-latest',
      document: { type: 'document_url', document_url: `data:application/pdf;base64,${base64}` },
      document_annotation_format: {
        type: 'json_schema',
        json_schema: { name: 'pergunta_edital', schema: PERGUNTA_SCHEMA_MISTRAL, strict: true },
      },
      document_annotation_prompt: promptAnotacao,
    }),
  })
  if (!res.ok) throw new Error(`Falha ao perguntar via Mistral: ${await res.text()}`)
  const data = await res.json()
  if (!data.document_annotation) throw new Error('Mistral não retornou document_annotation')
  const anotacao = JSON.parse(data.document_annotation) as { resposta: string }
  return anotacao.resposta
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  try {
    const { biddingId, pergunta } = await req.json()
    if (!biddingId) return json({ error: 'biddingId é obrigatório' }, 400)
    if (!pergunta || !String(pergunta).trim()) return json({ error: 'pergunta é obrigatória' }, 400)
    if (String(pergunta).length > 2000) return json({ error: 'Pergunta muito longa (máximo 2000 caracteres)' }, 400)

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
      .select('id, user_id')
      .eq('id', biddingId)
      .single()
    if (biddingError || !bidding) return json({ error: 'Licitação não encontrada' }, 404)
    if (bidding.user_id !== ownerId) return json({ error: 'Sem permissão para esta licitação' }, 403)

    const { data: anexos, error: anexosError } = await supabase
      .from('attached_files')
      .select('id, name, storage_path, mime_type, size_bytes, category')
      .eq('entity_type', 'licitacao')
      .eq('entity_id', biddingId)
      .in('category', ['Edital', 'Termo de Referência'])
      .order('created_at', { ascending: false })
    if (anexosError) throw anexosError

    const edital = (anexos as Anexo[] | null)?.find((a) => a.category === 'Edital')
    const tr = (anexos as Anexo[] | null)?.find((a) => a.category === 'Termo de Referência')
    if (!edital) return json({ error: 'Nenhum edital enviado para esta licitação' }, 400)

    const docs = [edital, tr].filter((d): d is Anexo => !!d)
    const perguntaTexto = String(pergunta).trim()
    const prompt = `Você é um assistente que responde perguntas objetivas sobre um edital de licitação pública brasileira anexado (e o termo de referência, se estiver junto). Responda À PERGUNTA ABAIXO de forma direta, em português, citando o trecho ou cláusula do edital que embasa a resposta sempre que possível. Se a informação não estiver no documento, diga claramente que não encontrou essa informação no edital — nunca invente uma resposta.\n\nPERGUNTA: ${perguntaTexto}`

    let genRes = await perguntarComGemini(supabase, docs, prompt, GEMINI_API_KEY)
    let provedor: 'gemini' | 'gemini-2' | 'mistral' = 'gemini'

    // 2º nível: se a 1ª chave bateu a cota diária e existe uma 2ª chave
    // configurada, tenta de novo com ela antes de partir pro Mistral.
    if (genRes.status === 429 && GEMINI_API_KEY_2) {
      console.warn('[Perguntar-edital] Cota diária da 1ª chave do Gemini esgotada — tentando 2ª chave (projeto Google Cloud separado)...')
      genRes = await perguntarComGemini(supabase, docs, prompt, GEMINI_API_KEY_2)
      provedor = 'gemini-2'
    }

    let resposta: string

    // Chegar aqui ainda com status 429 significa: acabou a cota gratuita
    // de hoje em TODAS as chaves do Gemini configuradas — 3º nível, tenta
    // a mesma pergunta via Mistral Document AI antes de desistir de vez.
    if (genRes.status === 429) {
      console.warn('[Perguntar-edital] Cota diária do Gemini esgotada em todas as chaves configuradas — tentando fallback via Mistral Document AI...')
      try {
        resposta = await tentarFallbackMistral(supabase, edital, perguntaTexto)
        provedor = 'mistral'
      } catch (fallbackErr) {
        const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
        throw new Error(`Cota diária do Gemini esgotada (todas as chaves) e o fallback via Mistral também falhou: ${fallbackMsg}`, { cause: fallbackErr })
      }
    } else if (!genRes.ok) {
      throw new Error(`Falha ao perguntar ao Gemini: ${await genRes.text()}`)
    } else {
      const genData = await genRes.json()
      const textoResposta = genData.candidates?.[0]?.content?.parts?.[0]?.text
      if (!textoResposta) {
        if (genData.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
          throw new Error('A resposta do Gemini foi cortada por exceder o limite de tamanho — tente fazer uma pergunta mais específica')
        }
        throw new Error('Gemini não retornou resposta')
      }
      resposta = textoResposta
    }

    console.log(`[Perguntar-edital] Resposta gerada via ${provedor}.`)

    return json({ resposta })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err)
    console.error('Erro ao perguntar sobre o edital:', mensagem)
    return json({ success: false, error: mensagem }, 500)
  }
})
