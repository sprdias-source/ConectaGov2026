// Edge Function: Analisar-oportunidade-juridico
//
// Cópia adaptada de Analisar-edital-juridico, pro estágio de Oportunidade
// (antes da licitação existir de verdade — ver tabela `opportunities`).
// Mesmo prompt, mesmo schema, mesmo mecanismo de upload — só muda ONDE
// verifica permissão (opportunities em vez de biddings), ONDE busca o
// edital (entity_type='oportunidade' em vez de 'licitacao') e ONDE grava o
// resultado (opportunity_analysis_juridica em vez de bidding_analysis_juridica).
//
// Quando a oportunidade é convertida em licitação, estas análises NÃO são
// copiadas (diferente da análise técnica) — a licitação nasce sem elas e o
// usuário roda de novo no Kanban se quiser, já que o edital pode ter sido
// reenviado/atualizado entre a oportunidade e a conversão.
//
// Recebe { opportunityId, tipo }, onde tipo é 'esclarecimento' | 'impugnacao' | 'raio_x'.
//
// FALLBACK EM 3 NÍVEIS (mesmo padrão de Analisar-edital-juridico): quando a
// cota diária do Gemini estoura (HTTP 429 com "PerDay" no corpo), tenta de
// novo com uma 2ª chave (2º projeto Google Cloud, cota separada) antes de
// cair pro Mistral Document AI como último recurso.
//
// VARIÁVEIS DE AMBIENTE NECESSÁRIAS (Supabase → Edge Functions → Secrets):
// - GEMINI_API_KEY: a mesma chave já usada pelas outras functions de análise.
// - GEMINI_API_KEY_2: opcional — 2º nível de fallback.
// - MISTRAL_API_KEY: opcional — 3º nível de fallback.
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
// Fixo em 3.5 (não 'gemini-flash-latest' nem '2.5-flash'): o 2.5 Flash foi
// de fato descontinuado pelo Google em 2026 ("model ... is no longer
// available to new users", HTTP 404 NOT_FOUND) — exatamente o risco que
// esse comentário já vinha alertando. Se isso voltar a acontecer com o
// 3.5, troque de novo pro sucessor atual — nunca pro alias
// 'gemini-flash-latest', que já apontou pra um preview com cota gratuita
// de só 20 req/dia.
const GEMINI_MODEL = 'gemini-3.5-flash'

const TIPOS_VALIDOS = ['esclarecimento', 'impugnacao', 'raio_x'] as const
type Tipo = typeof TIPOS_VALIDOS[number]

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

// Um único schema pros 3 tipos — os prompts pedem só os campos relevantes
// pra cada um e deixam o resto null, em vez de manter 3 schemas quase iguais.
const RESULTADO_SCHEMA = {
  type: 'OBJECT',
  properties: {
    resumoGeral: { type: 'STRING' },
    pontos: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          tipoPonto: { type: 'STRING', enum: ['Esclarecimento', 'Impugnação'] },
          localizacao: { type: 'STRING' },
          textoOriginal: { type: 'STRING' },
          motivo: { type: 'STRING' },
          fundamentoLegal: { type: 'STRING' },
          jurisprudencia: { type: 'STRING' },
          risco: { type: 'STRING' },
          probabilidade: { type: 'STRING', enum: ['Baixo', 'Médio', 'Alto'] },
          prioridade: { type: 'STRING', enum: ['Alta', 'Média', 'Baixa'] },
          sugestao: { type: 'STRING' },
        },
        required: ['localizacao', 'textoOriginal', 'motivo', 'sugestao'],
      },
    },
  },
  required: ['pontos'],
}

// Mesmo formato de RESULTADO_SCHEMA, em JSON Schema padrão — usado no
// fallback via Mistral Document AI (modo "json_schema" estrito, exige TODO
// campo em "required" e "additionalProperties: false" em todo objeto). Sem
// enum nos campos que os prompts mandam "deixar vazio" quando não se
// aplicam — um enum aqui rejeitaria a string vazia que o próprio prompt pede.
const RESULTADO_SCHEMA_MISTRAL = {
  type: 'object',
  properties: {
    resumoGeral: { type: 'string' },
    pontos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tipoPonto: { type: 'string' },
          localizacao: { type: 'string' },
          textoOriginal: { type: 'string' },
          motivo: { type: 'string' },
          fundamentoLegal: { type: 'string' },
          jurisprudencia: { type: 'string' },
          risco: { type: 'string' },
          probabilidade: { type: 'string' },
          prioridade: { type: 'string' },
          sugestao: { type: 'string' },
        },
        required: ['tipoPonto', 'localizacao', 'textoOriginal', 'motivo', 'fundamentoLegal', 'jurisprudencia', 'risco', 'probabilidade', 'prioridade', 'sugestao'],
        additionalProperties: false,
      },
    },
  },
  required: ['resumoGeral', 'pontos'],
  additionalProperties: false,
}

const INTRO_ESCLARECIMENTO = `Você é um especialista em licitações públicas, com profundo conhecimento da Lei nº 14.133/2021, jurisprudência do TCU, Tribunais de Contas Estaduais e princípios da Administração Pública.

Analise detalhadamente o edital em anexo (e o termo de referência, se estiver junto) e identifique TODOS os pontos que possam gerar pedido de esclarecimento.

Procure especialmente:
- Objeto mal definido ou genérico;
- Especificações técnicas ambíguas;
- Exigências contraditórias entre o edital, termo de referência e anexos;
- Quantidades inconsistentes;
- Itens sem unidade de medida;
- Critérios de julgamento confusos;
- Forma de execução não esclarecida;
- Prazo de entrega ou execução incompatível;
- Critérios de medição ou recebimento não definidos;
- Garantias sem detalhamento;
- Exigências de documentação que gerem dúvida;
- Exigências de qualificação técnica pouco claras;
- Critérios de habilitação contraditórios;
- Requisitos de amostras, catálogos ou laudos sem especificação;
- Exigências de marcas ou modelos sem justificativa;
- Critérios de desempate incompletos;
- Critérios de reajuste ou reequilíbrio econômico-financeiro omissos;
- Forma de pagamento incompleta;
- Penalidades mal definidas;
- Cronograma inconsistente;
- Qualquer ponto que possa gerar interpretações diferentes entre os licitantes.`

const SCHEMA_ESCLARECIMENTO = `Para cada ponto encontrado, preencha um item do array "pontos" com:
- localizacao: a localização exata (item e página);
- textoOriginal: o texto original citado;
- motivo: o motivo da dúvida;
- risco: o risco para os licitantes;
- fundamentoLegal: o fundamento legal, se houver (deixe vazio se não houver);
- sugestao: a sugestão de pergunta objetiva para envio ao órgão público.

Deixe "tipoPonto", "jurisprudencia" e "prioridade" vazios — não se aplicam aqui. Preencha também "resumoGeral" com um parágrafo curto resumindo o panorama geral. Nunca invente informação que não esteja no documento.`

const INTRO_IMPUGNACAO = `Atue como advogado especialista em Direito Administrativo e Licitações Públicas (Lei nº 14.133/2021).

Faça uma auditoria jurídica completa do edital anexo (e do termo de referência, se estiver junto) buscando todos os fundamentos que possam justificar uma impugnação.

Analise principalmente:
- Cláusulas restritivas da competitividade;
- Exigências desproporcionais;
- Exigências sem previsão legal;
- Violação aos princípios da isonomia;
- Direcionamento de marca;
- Direcionamento de fabricante;
- Direcionamento de tecnologia;
- Exigências incompatíveis com o objeto;
- Exigência indevida de atestados;
- Quantitativos mínimos ilegais;
- Exigência indevida de registro em conselho profissional;
- CNAEs incompatíveis;
- Exigência de documentos não previstos em lei;
- Prazos incompatíveis;
- Erros de julgamento;
- Critérios subjetivos;
- Especificações técnicas direcionadas;
- Fracionamento indevido;
- Ausência de justificativas técnicas;
- Violação ao planejamento da contratação;
- Inconsistências entre ETP, TR e Edital.`

const SCHEMA_IMPUGNACAO = `Para cada irregularidade encontrada, preencha um item do array "pontos" com:
- localizacao: o item do edital e a página;
- textoOriginal: o texto integral do trecho citado;
- motivo: qual o problema jurídico;
- fundamentoLegal: os artigos da Lei 14.133/2021 aplicáveis;
- jurisprudencia: jurisprudência do TCU aplicável, quando houver (deixe vazio se não houver);
- risco: a gravidade/risco da irregularidade;
- probabilidade: o grau de probabilidade de êxito da impugnação (Baixo, Médio ou Alto);
- sugestao: sugestão de redação para fundamentar a impugnação.

Deixe "tipoPonto" e "prioridade" vazios — não se aplicam aqui. Preencha também "resumoGeral" com um parágrafo curto resumindo o panorama geral. Nunca invente informação que não esteja no documento.`

const INTRO_RAIO_X = `Faça uma auditoria completa deste edital (e termo de referência, ETP, minuta contratual e anexos, se estiverem junto) como se você fosse:
- um advogado especialista em licitações públicas;
- um auditor do Tribunal de Contas;
- um pregoeiro experiente;
- um engenheiro responsável pelo objeto;
- um licitante interessado em identificar todas as oportunidades de esclarecimento e impugnação.

Analise 100% do edital, termo de referência, ETP, minuta contratual e anexos disponíveis.

Identifique:
- todos os pedidos de esclarecimento possíveis;
- todas as hipóteses de impugnação;
- todos os riscos jurídicos;
- todos os riscos técnicos;
- exigências ilegais;
- exigências restritivas;
- inconsistências documentais;
- erros de especificação;
- cláusulas contraditórias;
- omissões relevantes;
- direcionamentos;
- riscos para futura execução contratual.`

const SCHEMA_RAIO_X = `Para cada ponto encontrado, preencha um item do array "pontos" com:
- tipoPonto: "Esclarecimento" ou "Impugnação";
- localizacao: o item do edital e a página;
- textoOriginal: descrição da inconsistência (cite o trecho relevante);
- motivo: descrição da inconsistência;
- fundamentoLegal: fundamento legal aplicável;
- risco: risco jurídico;
- probabilidade: probabilidade de sucesso (Baixo, Médio ou Alto);
- sugestao: texto sugerido para protocolo;
- prioridade: prioridade (Alta, Média ou Baixa).

Deixe "jurisprudencia" vazio se não houver. Preencha também "resumoGeral" com um parágrafo curto resumindo o panorama geral. Nunca invente informação que não esteja no documento.`

function montarPrompt(tipo: Tipo): string {
  if (tipo === 'esclarecimento') return `${INTRO_ESCLARECIMENTO}\n\n${SCHEMA_ESCLARECIMENTO}`
  if (tipo === 'impugnacao') return `${INTRO_IMPUGNACAO}\n\n${SCHEMA_IMPUGNACAO}`
  return `${INTRO_RAIO_X}\n\n${SCHEMA_RAIO_X}`
}

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
  if (!uploadRes.ok) throw new Error(`Falha ao enviar o edital pro Gemini: ${await uploadRes.text()}`)
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
    throw new Error(`Arquivo não ficou pronto no Gemini (estado: ${file.state})`)
  }

  return file as { name: string; uri: string }
}

// Gemini ocasionalmente responde 503 "model is currently experiencing
// high demand" (ou 429 de limite de taxa) — erro transitório do lado do
// Google, não do nosso código, que hoje exigia o usuário clicar em
// "Analisar novamente" manualmente pra um problema que costuma se
// resolver sozinho em segundos. Tenta de novo automaticamente (backoff
// exponencial) antes de desistir. Só usado na chamada de generateContent
// (corpo é um JSON simples, seguro de reenviar) — não nos uploads de
// arquivo, cujo corpo é uma stream que não dá pra reler depois de falhar.
async function fetchComRetry(url: string, init: RequestInit, tentativas = 4): Promise<Response> {
  let ultimoErro: unknown
  for (let i = 0; i < tentativas; i++) {
    try {
      const res = await fetch(url, init)
      if (res.ok) return res
      // 4xx (exceto 429) é erro de requisição — tentar de novo não resolve.
      if (res.status < 500 && res.status !== 429) return res
      const corpo = await res.text()
      // 429 de COTA DIÁRIA esgotada (ex: limite de 20 requisições/dia do
      // tier gratuito, "GenerateRequestsPerDayPerProjectPerModel") não se
      // resolve tentando de novo em segundos — só reseta depois de um
      // tempo bem maior que qualquer backoff daqui. Retentar só atrasaria
      // um erro que já é certo nesta run; melhor mostrar na hora. Rate
      // limit comum (por minuto/segundo, sem "PerDay" na resposta) continua
      // sendo retentado normalmente.
      if (res.status === 429 && corpo.includes('PerDay')) {
        return new Response(corpo, { status: res.status, statusText: res.statusText, headers: res.headers })
      }
      ultimoErro = new Error(`HTTP ${res.status}: ${corpo}`)
    } catch (err) {
      ultimoErro = err
    }
    if (i < tentativas - 1) {
      console.warn(`[retry] Gemini falhou (tentativa ${i + 1}/${tentativas}), tentando de novo em breve...`, ultimoErro)
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

type Supa = ReturnType<typeof createClient>
type Anexo = { id: string; name: string; storage_path: string; mime_type: string | null; size_bytes: number | null }

type PontoJuridico = {
  tipoPonto: string
  localizacao: string
  textoOriginal: string
  motivo: string
  fundamentoLegal: string
  jurisprudencia: string
  risco: string
  probabilidade: string
  prioridade: string
  sugestao: string
}
type ResultadoJuridico = { resumoGeral: string; pontos: PontoJuridico[] }

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

// Fallback via Mistral Document AI (OCR endpoint com extração estruturada
// por schema, modelo Pixtral por trás) — mesmo formato de chamada já
// confirmado e usado em Analisar-edital-juridico.
async function chamarMistralAnnotation(pdfBytes: Uint8Array, prompt: string): Promise<ResultadoJuridico> {
  const base64 = bytesParaBase64(pdfBytes)
  const res = await fetch('https://api.mistral.ai/v1/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MISTRAL_API_KEY}` },
    body: JSON.stringify({
      model: 'mistral-ocr-latest',
      document: { type: 'document_url', document_url: `data:application/pdf;base64,${base64}` },
      document_annotation_format: {
        type: 'json_schema',
        json_schema: { name: 'resultado_juridico', schema: RESULTADO_SCHEMA_MISTRAL, strict: true },
      },
      document_annotation_prompt: prompt,
    }),
  })
  if (!res.ok) throw new Error(`Falha ao analisar com Mistral: ${await res.text()}`)
  const data = await res.json()
  if (!data.document_annotation) throw new Error('Mistral não retornou document_annotation')
  return JSON.parse(data.document_annotation) as ResultadoJuridico
}

// A OCR da Mistral processa UM documento por chamada (diferente do Gemini,
// que aceita edital + TR juntos numa única requisição) — chama uma vez por
// documento e junta os resultados: "pontos" de todos concatenados,
// "resumoGeral" de cada um emendado.
async function tentarFallbackMistral(supabase: Supa, docs: Anexo[], tipo: Tipo): Promise<ResultadoJuridico> {
  if (!MISTRAL_API_KEY) {
    throw new Error('MISTRAL_API_KEY não configurada nesta function — sem fallback disponível.')
  }
  const prompt = montarPrompt(tipo)
  const porDocumento = await Promise.all(docs.map(async (doc) => {
    const bytes = await baixarBytes(supabase, doc)
    return chamarMistralAnnotation(bytes, prompt)
  }))
  return {
    resumoGeral: porDocumento.map((r) => r.resumoGeral).filter(Boolean).join('\n\n'),
    pontos: porDocumento.flatMap((r) => r.pontos ?? []),
  }
}

// Todo o trabalho pesado — roda depois da resposta HTTP já ter sido
// devolvida (ver EdgeRuntime.waitUntil lá embaixo), por isso não conta
// pro limite de tempo de execução síncrona.
async function baixarEEnviarAoGemini(supabase: Supa, anexo: Anexo, apiKey: string) {
  const downloadRes = await baixarAnexo(supabase, anexo.storage_path)
  if (!downloadRes.ok || !downloadRes.body) throw new Error(`Falha ao baixar "${anexo.name}" do Storage/Drive`)

  const mimeType = anexo.mime_type || 'application/pdf'
  const sizeBytes = anexo.size_bytes ?? Number(downloadRes.headers.get('content-length') ?? 0)
  if (!sizeBytes) throw new Error(`Não foi possível determinar o tamanho de "${anexo.name}"`)

  const geminiFile = await uploadParaGemini(downloadRes.body, sizeBytes, mimeType, anexo.name, apiKey)
  return { fileData: { file_data: { mime_type: mimeType, file_uri: geminiFile.uri } }, geminiFileName: geminiFile.name }
}

// Envia os documentos e gera a análise com UMA chave/projeto específico do
// Gemini — extraído à parte pra poder ser chamado de novo com uma SEGUNDA
// chave (2º projeto Google Cloud) se a 1ª bater a cota diária.
async function tentarAnaliseComGemini(supabase: Supa, docs: Anexo[], tipo: Tipo, apiKey: string): Promise<Response> {
  const arquivosGeminiParaApagar: string[] = []
  const resultados = await Promise.all(docs.map(async (doc) => {
    const r = await baixarEEnviarAoGemini(supabase, doc, apiKey)
    arquivosGeminiParaApagar.push(r.geminiFileName)
    return r
  }))
  const partesArquivos = resultados.map((r) => r.fileData)

  const genRes = await fetchComRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [...partesArquivos, { text: montarPrompt(tipo) }],
        }],
        generationConfig: {
          response_mime_type: 'application/json',
          response_schema: RESULTADO_SCHEMA,
          maxOutputTokens: 8192,
        },
      }),
    }
  )

  for (const nome of arquivosGeminiParaApagar) apagarArquivoGemini(nome, apiKey) // não precisa esperar terminar

  return genRes
}

// Antes só lia o Edital — mesmo o prompt instruindo o Gemini a analisar
// "edital, termo de referência, ETP, minuta contratual", só o Edital era
// de fato enviado. Não existe categoria separada de anexo pra ETP/minuta
// no sistema (só 'Edital' e 'Termo de Referência'), então passa a ler os
// dois quando o TR também tiver sido enviado.
async function processarAnaliseJuridica(supabase: Supa, analysisRowId: string, edital: Anexo, tr: Anexo | undefined, tipo: Tipo) {
  try {
    const docs = [edital, tr].filter((d): d is Anexo => !!d)

    let genRes = await tentarAnaliseComGemini(supabase, docs, tipo, GEMINI_API_KEY)
    let provedor: 'gemini' | 'gemini-2' | 'mistral' = 'gemini'

    // 2º nível: se a 1ª chave bateu a cota diária e existe uma 2ª chave
    // configurada (de um projeto Google Cloud diferente — a cota de 20
    // req/dia é por projeto, não por conta), tenta de novo com ela antes
    // de partir pro Mistral.
    if (genRes.status === 429 && GEMINI_API_KEY_2) {
      console.warn('[Analisar-oportunidade-juridico] Cota diária da 1ª chave do Gemini esgotada — tentando 2ª chave (projeto Google Cloud separado)...')
      genRes = await tentarAnaliseComGemini(supabase, docs, tipo, GEMINI_API_KEY_2)
      provedor = 'gemini-2'
    }

    let resultado: ResultadoJuridico

    // Chegar aqui ainda com status 429 significa: acabou a cota gratuita
    // de hoje em TODAS as chaves do Gemini configuradas — 3º nível, tenta
    // o mesmo documento via Mistral Document AI antes de desistir de vez.
    if (genRes.status === 429) {
      console.warn('[Analisar-oportunidade-juridico] Cota diária do Gemini esgotada em todas as chaves configuradas — tentando fallback via Mistral Document AI...')
      try {
        resultado = await tentarFallbackMistral(supabase, docs, tipo)
        provedor = 'mistral'
      } catch (fallbackErr) {
        const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
        throw new Error(`Cota diária do Gemini esgotada (todas as chaves) e o fallback via Mistral também falhou: ${fallbackMsg}`, { cause: fallbackErr })
      }
    } else if (!genRes.ok) {
      throw new Error(`Falha ao analisar com Gemini: ${await genRes.text()}`)
    } else {
      const genData = await genRes.json()
      const textoResposta = genData.candidates?.[0]?.content?.parts?.[0]?.text
      if (!textoResposta) {
        // finishReason 'MAX_TOKENS' é o caso comum de edital com muitos
        // itens estourando o limite de saída — sem essa checagem, a
        // mensagem de erro genérica não dava nenhuma pista do motivo real.
        if (genData.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
          throw new Error('A resposta do Gemini foi cortada por exceder o limite de tamanho (edital com muitos itens) — tente novamente ou reduza os anexos enviados')
        }
        throw new Error('Gemini não retornou conteúdo na análise')
      }
      resultado = JSON.parse(textoResposta) as ResultadoJuridico
    }

    console.log(`[Analisar-oportunidade-juridico] Análise concluída via ${provedor}.`)

    await supabase.from('opportunity_analysis_juridica').update({ status: 'concluido', resultado, erro_mensagem: null, updated_at: new Date().toISOString() }).eq('id', analysisRowId)
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err)
    console.error('Erro ao analisar oportunidade jurídico (segundo plano):', mensagem)
    await supabase.from('opportunity_analysis_juridica').update({ status: 'erro', erro_mensagem: mensagem, updated_at: new Date().toISOString() }).eq('id', analysisRowId)
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  try {
    const { opportunityId, tipo } = await req.json()
    if (!opportunityId) return json({ error: 'opportunityId é obrigatório' }, 400)
    if (!TIPOS_VALIDOS.includes(tipo)) return json({ error: `tipo deve ser um de: ${TIPOS_VALIDOS.join(', ')}` }, 400)

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

    const edital = (anexos as (Anexo & { category: string })[] | null)?.find((a) => a.category === 'Edital')
    const tr = (anexos as (Anexo & { category: string })[] | null)?.find((a) => a.category === 'Termo de Referência')
    if (!edital) return json({ error: 'Nenhum edital enviado para esta oportunidade' }, 400)

    let analysisRowId: string
    const { data: existente } = await supabase
      .from('opportunity_analysis_juridica')
      .select('id')
      .eq('opportunity_id', opportunityId)
      .eq('tipo', tipo)
      .maybeSingle()
    if (existente) {
      await supabase.from('opportunity_analysis_juridica').update({ status: 'processando', erro_mensagem: null, updated_at: new Date().toISOString() }).eq('id', existente.id)
      analysisRowId = existente.id as string
    } else {
      const { data: novo, error: insertError } = await supabase
        .from('opportunity_analysis_juridica')
        .insert({ user_id: ownerId, opportunity_id: opportunityId, tipo, status: 'processando' })
        .select('id')
        .single()
      if (insertError) throw insertError
      analysisRowId = novo.id as string
    }

    // @ts-expect-error: EdgeRuntime é global no runtime do Supabase, não existe no lib.dom.d.ts do TypeScript
    EdgeRuntime.waitUntil(processarAnaliseJuridica(supabase, analysisRowId, edital as Anexo, tr as Anexo | undefined, tipo as Tipo))

    // Responde já, sem esperar a análise terminar — é isso que evita
    // estourar o limite de execução da function.
    return json({ started: true })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err)
    console.error('Erro ao iniciar análise jurídica da oportunidade:', mensagem)
    return json({ success: false, error: mensagem }, 500)
  }
})
