// Edge Function: Extrair-itens-edital
//
// Recebe { biddingId }, marca a extração como "processando" e devolve a
// resposta IMEDIATAMENTE — o trabalho pesado roda em SEGUNDO PLANO via
// EdgeRuntime.waitUntil(), igual Analisar-edital.
//
// POR QUE ESTA FUNCTION EXISTE (separada de Analisar-edital): editais com
// muitos itens (100+) fazem a análise completa (resumo + checklist +
// habilitação + itens, tudo numa chamada só) estourar o teto de tempo de
// execução (~135s) — gerar uma resposta longa o bastante pra listar todos os
// itens é lento por natureza (a geração de tokens de um LLM é sequencial,
// diferente da leitura do documento de entrada, que é paralela e rápida).
// Aumentar ainda mais maxOutputTokens não resolve: o gargalo é TEMPO DE
// GERAÇÃO, não o teto de tokens em si (ver Analisar-edital, que já usa
// 32768 e mesmo assim pode estourar em editais de 100+ itens).
//
// A solução é dar aos itens uma invocação PRÓPRIA da function, com seu
// PRÓPRIO orçamento de ~135s do zero, sem competir com resumo/checklist/
// habilitação pelo mesmo teto — o botão "Puxar Itens" (ao lado de "Analisar
// com IA") dispara esta function em vez de rodar tudo junto.
//
// Edital e Termo de Referência (quando os dois existem) são enviados pro
// Gemini EM PARALELO, mesma lógica de Analisar-edital.
//
// FALLBACK EM 3 NÍVEIS (mesmo padrão das outras 4 functions de análise):
// quando a cota diária do Gemini estoura (HTTP 429 com "PerDay" no corpo),
// tenta de novo com uma 2ª chave antes de cair pro Mistral Document AI como
// último recurso.
//
// VARIÁVEIS DE AMBIENTE NECESSÁRIAS (Supabase → Edge Functions → Secrets):
// - GEMINI_API_KEY: chave da API do Google AI Studio
// - GEMINI_API_KEY_2: opcional — 2º nível de fallback
// - MISTRAL_API_KEY: opcional — 3º nível de fallback
// - SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm injetadas
//   automaticamente pelo Supabase em toda Edge Function.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const GEMINI_API_KEY_2 = Deno.env.get('GEMINI_API_KEY_2')
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
async function obterAccessTokenDrive(signal: AbortSignal): Promise<string> {
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
    signal,
  })
  if (!res.ok) throw new Error(`Falha ao renovar o acesso ao Google Drive: ${await res.text()}`)
  const data = await res.json()
  return data.access_token as string
}

async function baixarAnexo(supabase: ReturnType<typeof createClient>, storagePath: string, signal: AbortSignal): Promise<Response> {
  if (storagePath.startsWith(DRIVE_PREFIX)) {
    const driveFileId = storagePath.slice(DRIVE_PREFIX.length)
    const accessToken = await obterAccessTokenDrive(signal)
    return fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    })
  }
  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from('client-documents')
    .createSignedUrl(storagePath, 300)
  if (signedUrlError || !signedUrlData) throw new Error('Não foi possível gerar a URL do arquivo no Storage')
  return fetch(signedUrlData.signedUrl, { signal })
}

// Fixo em 3.5 (não 'gemini-flash-latest' nem '2.5-flash') — mesmo aviso das
// outras functions de análise: o Google já aposentou o 2.5 Flash sem
// aviso prévio. Se isso voltar a acontecer com o 3.5, troque pro sucessor
// atual — nunca pro alias 'gemini-flash-latest' (cota gratuita de só 20/dia).
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

// Mesmo formato de AnaliseEdital.itens (src/types/domain.ts) — o resultado
// desta function é consumido por mapearItensDaAnalise (src/lib/analiseEdital.ts)
// exatamente como os itens da análise completa, sem nenhuma adaptação.
type ItemEdital = { numero: string; lote: string; descricao: string; unidade: string; quantidade: number; valorReferencia: number }

const ITENS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    itens: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          numero: { type: 'STRING' },
          lote: { type: 'STRING' },
          descricao: { type: 'STRING' },
          unidade: { type: 'STRING' },
          quantidade: { type: 'NUMBER' },
          valorReferencia: { type: 'NUMBER' },
        },
      },
    },
  },
  required: ['itens'],
}

// Mesmo formato de ITENS_SCHEMA, em JSON Schema padrão — usado no fallback
// via Mistral Document AI (modo "json_schema" estrito).
const ITENS_SCHEMA_MISTRAL = {
  type: 'object',
  properties: {
    itens: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          numero: { type: 'string' },
          lote: { type: 'string' },
          descricao: { type: 'string' },
          unidade: { type: 'string' },
          quantidade: { type: 'number' },
          valorReferencia: { type: 'number' },
        },
        required: ['numero', 'lote', 'descricao', 'unidade', 'quantidade', 'valorReferencia'],
        additionalProperties: false,
      },
    },
  },
  required: ['itens'],
  additionalProperties: false,
}

// Prompt focado SÓ em itens — mesmas instruções de precisão de
// Analisar-edital (unidades com expoente, lotes), sem os outros ~20 campos
// da análise completa, pra manter a saída (e o tempo de geração) só no que
// esta function precisa entregar.
const PROMPT = `Você é um analista de licitações públicas brasileiras. Leia o edital (e o termo de referência, se estiver junto) em anexo e extraia a lista COMPLETA de itens/lotes da licitação, devolvendo um JSON com o schema fornecido.

Extraia TODOS os itens do documento, sem pular nenhum, mesmo que a lista seja longa (podem ser dezenas ou centenas de itens) — nunca resuma, agrupe ou interrompa a lista antes do fim.

Se a licitação for organizada em LOTES (grupos de itens que devem ser disputados/adjudicados em conjunto), preencha o campo "lote" de cada item com o número/identificação do lote ao qual ele pertence, exatamente como o edital o identifica (ex: "1", "Lote 01", "Lote II"). Se a licitação for por item individual (sem lotes), deixe "lote" vazio em todos os itens.

ATENÇÃO ESPECIAL com unidades que têm expoente (m², m³, cm³, km² etc.): releia a quantidade e a unidade completas com cuidado antes de preencher — o caractere de expoente (², ³) não pode cortar ou confundir o número nem a unidade ao lado dele. Exemplo: "405 m³" tem que virar quantidade 405 e unidade "m³" — nunca quantidade 4 e unidade "m", nem qualquer outra combinação truncada.

Para "valorReferencia", use o valor unitário de referência/estimado do item tal como declarado no edital — nunca invente um valor que não esteja no documento (deixe 0 se o edital não declarar valor unitário pra aquele item).

Nunca invente item que não esteja no documento, e nunca deixe de incluir um item que esteja lá.`

async function uploadParaGemini(fileStream: ReadableStream<Uint8Array>, sizeBytes: number, mimeType: string, displayName: string, apiKey: string, signal: AbortSignal) {
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
    signal,
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
    signal,
    // @ts-expect-error: 'duplex' é exigido pelo fetch quando o body é uma stream, mas ainda não está no lib.dom.d.ts do TS
    duplex: 'half',
  })
  if (!uploadRes.ok) throw new Error(`Falha ao enviar "${displayName}" pro Gemini: ${await uploadRes.text()}`)
  const uploaded = await uploadRes.json()

  let file = uploaded.file
  let tentativas = 0
  while (file.state === 'PROCESSING' && tentativas < 50 && !signal.aborted) {
    await new Promise((r) => setTimeout(r, 2000))
    const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${apiKey}`, { signal })
    file = await checkRes.json()
    tentativas++
  }
  if (file.state !== 'ACTIVE') {
    await apagarArquivoGemini(file.name, apiKey)
    throw new Error(`"${displayName}" não ficou pronto no Gemini (estado: ${file.state})`)
  }

  return file as { name: string; uri: string }
}

async function fetchComRetry(url: string, init: RequestInit, signal: AbortSignal, tentativas = 2): Promise<Response> {
  let ultimoErro: unknown
  let ultimaResposta: Response | undefined
  for (let i = 0; i < tentativas; i++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    try {
      const res = await fetch(url, { ...init, signal })
      if (res.ok) return res
      if (res.status < 500 && res.status !== 429) return res
      const corpo = await res.text()
      if (res.status === 429 && corpo.includes('PerDay')) {
        return new Response(corpo, { status: res.status, statusText: res.statusText, headers: res.headers })
      }
      ultimaResposta = new Response(corpo, { status: res.status, statusText: res.statusText, headers: res.headers })
      ultimoErro = new Error(`HTTP ${res.status}: ${corpo}`)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err
      ultimaResposta = undefined
      ultimoErro = err
    }
    if (i < tentativas - 1) {
      console.warn(`[retry] Gemini falhou (tentativa ${i + 1}/${tentativas}), tentando de novo em breve...`, ultimoErro)
      await new Promise((r) => setTimeout(r, 1500 * 2 ** i))
    }
  }
  if (ultimaResposta) return ultimaResposta
  throw ultimoErro instanceof Error ? ultimoErro : new Error(String(ultimoErro))
}

async function apagarArquivoGemini(fileName: string, apiKey: string) {
  try {
    await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`, { method: 'DELETE' })
  } catch {
    // best-effort — o Gemini expira arquivos sozinho depois de um tempo
  }
}

// Mesmo limite de Analisar-edital: documentos de até ~15MB vão inline no
// corpo da requisição (rápido); só os poucos casos maiores passam pelo
// upload assíncrono do Files API.
const LIMITE_INLINE_BYTES = 15 * 1024 * 1024

async function processarDocumento(supabase: Supa, doc: Anexo, apiKey: string, arquivosGeminiParaApagar: string[], signal: AbortSignal) {
  const downloadRes = await baixarAnexo(supabase, doc.storage_path, signal)
  if (!downloadRes.ok || !downloadRes.body) throw new Error(`Falha ao baixar "${doc.name}" do Storage/Drive`)

  const mimeType = doc.mime_type || 'application/pdf'
  const sizeBytes = doc.size_bytes ?? Number(downloadRes.headers.get('content-length') ?? 0)
  if (!sizeBytes) throw new Error(`Não foi possível determinar o tamanho de "${doc.name}"`)

  if (sizeBytes <= LIMITE_INLINE_BYTES) {
    const bytes = new Uint8Array(await downloadRes.arrayBuffer())
    return { fileData: { inline_data: { mime_type: mimeType, data: bytesParaBase64(bytes) } } }
  }

  const geminiFile = await uploadParaGemini(downloadRes.body, sizeBytes, mimeType, doc.name, apiKey, signal)
  arquivosGeminiParaApagar.push(geminiFile.name)
  return { fileData: { file_data: { mime_type: mimeType, file_uri: geminiFile.uri } } }
}

async function tentarExtracaoComGemini(supabase: Supa, docs: Anexo[], apiKey: string, signal: AbortSignal): Promise<Response> {
  const arquivosGeminiParaApagar: string[] = []
  const resultados = await Promise.all(docs.map((doc) => processarDocumento(supabase, doc, apiKey, arquivosGeminiParaApagar, signal)))
  const partesArquivos = resultados.map((r) => r.fileData)

  const genRes = await fetchComRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [...partesArquivos, { text: PROMPT }] }],
        generationConfig: {
          response_mime_type: 'application/json',
          response_schema: ITENS_SCHEMA,
          maxOutputTokens: 32768,
        },
      }),
    },
    signal,
  )

  for (const nome of arquivosGeminiParaApagar) apagarArquivoGemini(nome, apiKey) // não precisa esperar terminar

  return genRes
}

function bytesParaBase64(bytes: Uint8Array): string {
  let binario = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binario += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binario)
}

async function baixarBytes(supabase: Supa, anexo: Anexo, signal: AbortSignal): Promise<Uint8Array> {
  const downloadRes = await baixarAnexo(supabase, anexo.storage_path, signal)
  if (!downloadRes.ok || !downloadRes.body) throw new Error(`Falha ao baixar "${anexo.name}" do Storage/Drive`)
  return new Uint8Array(await downloadRes.arrayBuffer())
}

async function fetchMistralComRetry(body: unknown, signal: AbortSignal, tentativas = 3): Promise<Response> {
  let res: Response
  for (let i = 0; i < tentativas; i++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    res = await fetch('https://api.mistral.ai/v1/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MISTRAL_API_KEY}` },
      body: JSON.stringify(body),
      signal,
    })
    if (res.ok || res.status !== 429) return res
    if (i < tentativas - 1) {
      console.warn(`[retry] Mistral em rate limit (tentativa ${i + 1}/${tentativas}), tentando de novo em breve...`)
      await new Promise((r) => setTimeout(r, 2000 * 2 ** i))
    }
  }
  return res!
}

async function chamarMistralAnnotation(pdfBytes: Uint8Array, signal: AbortSignal): Promise<ItemEdital[]> {
  const base64 = bytesParaBase64(pdfBytes)
  const res = await fetchMistralComRetry({
    model: 'mistral-ocr-latest',
    document: { type: 'document_url', document_url: `data:application/pdf;base64,${base64}` },
    document_annotation_format: {
      type: 'json_schema',
      json_schema: { name: 'itens_edital', schema: ITENS_SCHEMA_MISTRAL, strict: true },
    },
    document_annotation_prompt: PROMPT,
  }, signal)
  if (!res.ok) throw new Error(`Falha ao extrair itens com Mistral: ${await res.text()}`)
  const data = await res.json()
  if (!data.document_annotation) throw new Error('Mistral não retornou document_annotation')
  const resultado = JSON.parse(data.document_annotation) as { itens: ItemEdital[] }
  return resultado.itens ?? []
}

// A OCR da Mistral processa UM documento por chamada — chama os dois EM
// PARALELO (quando o TR existir) e fica com a lista MAIS LONGA das duas
// (mesmo critério de Analisar-edital: em editais de Registro de Preços é
// comum a tabela de itens estar detalhada só no TR, e uma lista curta da
// Mistral processando o Edital sozinho costuma ser alucinação, não uma
// extração real).
async function tentarFallbackMistral(supabase: Supa, edital: Anexo, tr: Anexo | undefined, signal: AbortSignal): Promise<ItemEdital[]> {
  if (!MISTRAL_API_KEY) {
    throw new Error('MISTRAL_API_KEY não configurada nesta function — sem fallback disponível.')
  }
  const bytesEdital = await baixarBytes(supabase, edital, signal)
  if (!tr) return chamarMistralAnnotation(bytesEdital, signal)

  const [resEdital, resTr] = await Promise.allSettled([
    chamarMistralAnnotation(bytesEdital, signal),
    baixarBytes(supabase, tr, signal).then((bytes) => chamarMistralAnnotation(bytes, signal)),
  ])
  if (resEdital.status === 'rejected') throw resEdital.reason
  if (resTr.status === 'rejected') {
    console.warn('[Extrair-itens-edital] Mistral não conseguiu processar o Termo de Referência (usando só o Edital):', resTr.reason instanceof Error ? resTr.reason.message : String(resTr.reason))
    return resEdital.value
  }
  return resTr.value.length > resEdital.value.length ? resTr.value : resEdital.value
}

// Mesmo teto de Analisar-edital — deixa ~15s de folga antes do teto real do
// plano (~150s no Free/Hobby).
const LIMITE_EXECUCAO_MS = 135_000

async function comLimiteDeTempo<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error(
        'A extração de itens demorou mais do que o tempo de execução disponível no plano atual do Supabase — tente novamente. Se isso acontecer com frequência (principalmente em editais com centenas de itens), fale com o suporte.'
      ))
    }, LIMITE_EXECUCAO_MS)
  })
  try {
    return await Promise.race([fn(controller.signal), timeout])
  } finally {
    clearTimeout(timer!)
  }
}

type TentativaResultado = { itens: ItemEdital[]; provedor: 'gemini' | 'gemini-2' | 'mistral' }

async function processarRespostaGemini(genRes: Response, provedor: 'gemini' | 'gemini-2'): Promise<TentativaResultado> {
  if (genRes.status === 429 || genRes.status >= 500) {
    const motivo = genRes.status === 429
      ? 'cota diária esgotada (RESOURCE_EXHAUSTED/PerDay)'
      : `servidor sobrecarregado (HTTP ${genRes.status})`
    throw new Error(`Gemini (${provedor}) indisponível: ${motivo}`)
  }
  if (!genRes.ok) {
    throw new Error(`Falha ao extrair itens com Gemini (${provedor}): ${await genRes.text()}`)
  }
  const genData = await genRes.json()
  const textoResposta = genData.candidates?.[0]?.content?.parts?.[0]?.text
  if (!textoResposta) {
    if (genData.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
      throw new Error(`Gemini (${provedor}): resposta cortada por exceder o limite de tamanho (edital com muitos itens)`)
    }
    throw new Error(`Gemini (${provedor}) não retornou conteúdo na extração`)
  }
  try {
    const resultado = JSON.parse(textoResposta) as { itens: ItemEdital[] }
    return { itens: resultado.itens ?? [], provedor }
  } catch (parseErr) {
    if (genData.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
      throw new Error(`Gemini (${provedor}): resposta cortada por exceder o limite de tamanho (edital com muitos itens)`, { cause: parseErr })
    }
    const parseMsg = parseErr instanceof Error ? parseErr.message : String(parseErr)
    throw new Error(`Gemini (${provedor}) retornou uma resposta em formato inválido: ${parseMsg}`, { cause: parseErr })
  }
}

// Mesma corrida em paralelo de Analisar-edital: Gemini (1 ou 2 chaves) via
// Promise.any primeiro; Mistral só entra DEPOIS que todas as chaves do
// Gemini já falharam (nunca correndo junto — ver comentário de
// Analisar-edital sobre o corte silencioso do schema estrito da Mistral).
async function realizarExtracao(supabase: Supa, edital: Anexo, tr: Anexo | undefined, signal: AbortSignal): Promise<{ itens: ItemEdital[]; provedor: string }> {
  const docs = [edital, tr].filter((d): d is Anexo => !!d)

  const pistasGemini: Promise<TentativaResultado>[] = [
    tentarExtracaoComGemini(supabase, docs, GEMINI_API_KEY, signal).then((r) => processarRespostaGemini(r, 'gemini')),
  ]
  if (GEMINI_API_KEY_2) {
    pistasGemini.push(tentarExtracaoComGemini(supabase, docs, GEMINI_API_KEY_2, signal).then((r) => processarRespostaGemini(r, 'gemini-2')))
  }

  try {
    return await Promise.any(pistasGemini)
  } catch (erroGemini) {
    if (!MISTRAL_API_KEY) {
      const erros = erroGemini instanceof AggregateError ? erroGemini.errors : [erroGemini]
      const mensagens = erros.map((e) => (e instanceof Error ? e.message : String(e))).join(' | ')
      throw new Error(`Nenhuma das fontes de IA configuradas conseguiu concluir a extração: ${mensagens}`, { cause: erroGemini })
    }
    try {
      const itens = await tentarFallbackMistral(supabase, edital, tr, signal)
      return { itens, provedor: 'mistral' }
    } catch (erroMistral) {
      const errosGemini = erroGemini instanceof AggregateError ? erroGemini.errors : [erroGemini]
      const mensagens = [...errosGemini, erroMistral].map((e) => (e instanceof Error ? e.message : String(e))).join(' | ')
      throw new Error(`Nenhuma das fontes de IA configuradas conseguiu concluir a extração: ${mensagens}`, { cause: erroMistral })
    }
  }
}

async function processarExtracao(supabase: Supa, extracaoRowId: string, edital: Anexo, tr: Anexo | undefined) {
  const tInicio = Date.now()
  try {
    const { itens, provedor } = await comLimiteDeTempo((signal) => realizarExtracao(supabase, edital, tr, signal))

    console.log(`[Extrair-itens-edital] Extração concluída via ${provedor} em ${Date.now() - tInicio}ms total (${itens.length} itens).`)

    await supabase.from('bidding_itens_extracao').update({ status: 'concluido', itens, erro_mensagem: null, updated_at: new Date().toISOString() }).eq('id', extracaoRowId)
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err)
    console.error(`Erro ao extrair itens do edital (segundo plano) após ${Date.now() - tInicio}ms:`, mensagem)
    await supabase.from('bidding_itens_extracao').update({ status: 'erro', erro_mensagem: mensagem, updated_at: new Date().toISOString() }).eq('id', extracaoRowId)
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  try {
    const { biddingId } = await req.json()
    if (!biddingId) return json({ error: 'biddingId é obrigatório' }, 400)

    const authHeader = req.headers.get('Authorization')
    const jwt = authHeader?.replace('Bearer ', '')
    if (!jwt) return json({ error: 'Não autenticado' }, 401)
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt)
    if (userError || !user) return json({ error: 'Não autenticado' }, 401)

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

    let extracaoRowId: string
    const { data: existente } = await supabase.from('bidding_itens_extracao').select('id').eq('bidding_id', biddingId).maybeSingle()
    if (existente) {
      await supabase.from('bidding_itens_extracao').update({ status: 'processando', erro_mensagem: null, updated_at: new Date().toISOString() }).eq('id', existente.id)
      extracaoRowId = existente.id as string
    } else {
      const { data: novo, error: insertError } = await supabase
        .from('bidding_itens_extracao')
        .insert({ user_id: ownerId, bidding_id: biddingId, status: 'processando' })
        .select('id')
        .single()
      if (insertError) throw insertError
      extracaoRowId = novo.id as string
    }

    // @ts-expect-error: EdgeRuntime é global no runtime do Supabase, não existe no lib.dom.d.ts do TypeScript
    EdgeRuntime.waitUntil(processarExtracao(supabase, extracaoRowId, edital, tr))

    return json({ started: true })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err)
    console.error('Erro ao iniciar extração de itens:', mensagem)
    return json({ success: false, error: mensagem }, 500)
  }
})
