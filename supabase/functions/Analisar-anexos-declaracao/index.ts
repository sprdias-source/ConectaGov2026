// Edge Function: Analisar-anexos-declaracao
//
// Lê o edital (e o Termo de Referência, se houver) já anexados à licitação
// e procura os ANEXOS-MODELO de declaração que o próprio edital fornece
// (ex: "ANEXO II — MODELO DE DECLARAÇÃO DE ATENDIMENTO AOS REQUISITOS DE
// HABILITAÇÃO"), devolvendo o texto já preenchido com os dados do cliente
// e da licitação — pronto pra revisão antes de mandar pro cliente assinar.
//
// Diferente de Analisar-edital, roda SÍNCRONO (sem EdgeRuntime.waitUntil):
// o volume de saída aqui é bem menor (só os anexos de declaração, não
// dezenas de campos + itens + checklist inteiro), então cabe dentro do
// limite de execução síncrona mesmo com o mesmo custo de upload do PDF.
//
// FALLBACK EM 3 NÍVEIS (mesmo padrão de Analisar-edital-juridico): quando a
// cota diária do Gemini estoura (HTTP 429 com "PerDay" no corpo), tenta de
// novo com uma 2ª chave (2º projeto Google Cloud, cota separada) antes de
// cair pro Mistral Document AI como último recurso. Como o Mistral processa
// um documento por chamada, o fallback manda só o Edital (não o TR) — os
// anexos-modelo de declaração praticamente sempre vêm do próprio edital.
//
// Recebe { biddingId } e devolve { success: true, criados: N }. Os anexos
// já ficam salvos em bidding_declaracao_anexos (status 'rascunho') — quem
// já estava em 'enviado' ou 'assinado' não é tocado por uma nova análise,
// só os rascunhos anteriores são substituídos.
//
// VARIÁVEIS DE AMBIENTE NECESSÁRIAS (Supabase → Edge Functions → Secrets):
// - GEMINI_API_KEY: a mesma chave já usada pelas outras functions de IA.
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
type ChecklistItemRef = { id: string; numero_edital: string | null; descricao: string }
type AnexosResultado = { anexos: { fonte: string; titulo: string; texto: string; itensNumeroEdital?: string[] }[] }

const ANEXOS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    anexos: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          fonte: { type: 'STRING' },
          titulo: { type: 'STRING' },
          texto: { type: 'STRING' },
          itensNumeroEdital: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['fonte', 'titulo', 'texto'],
      },
    },
  },
}

// Mesmo formato de ANEXOS_SCHEMA, em JSON Schema padrão (tipos em
// minúsculo) — usado no fallback via Mistral Document AI, cujo modo
// "json_schema" estrito (strict: true) exige TODO campo declarado também em
// "required" e "additionalProperties: false" em todo objeto.
const ANEXOS_SCHEMA_MISTRAL = {
  type: 'object',
  properties: {
    anexos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fonte: { type: 'string' },
          titulo: { type: 'string' },
          texto: { type: 'string' },
          itensNumeroEdital: { type: 'array', items: { type: 'string' } },
        },
        required: ['fonte', 'titulo', 'texto', 'itensNumeroEdital'],
        additionalProperties: false,
      },
    },
  },
  required: ['anexos'],
  additionalProperties: false,
}

function montarPrompt(opts: {
  clientName: string
  clientCnpj: string
  clientAddress: string
  clientCidade: string
  responsavelNome: string
  responsavelCpf: string
  responsavelCargo: string
  responsavelRg: string
  estadoCivil: string
  porteEmpresa: string
  orgao: string
  numeroEdital: string
  municipio: string
  itensChecklist: ChecklistItemRef[]
}): string {
  const listaItens = opts.itensChecklist
    .map((i) => `- numeroEdital: "${i.numero_edital ?? ''}" | descrição: "${i.descricao}"`)
    .join('\n')

  return `Você é um analista de licitações públicas brasileiras. No edital (e termo de referência, se anexado) em anexo, procure os ANEXOS-MODELO DE DECLARAÇÃO que o próprio edital fornece pra o licitante preencher e assinar — geralmente nomeados "Anexo II", "Anexo III" etc., com título do tipo "MODELO DE DECLARAÇÃO DE...". NÃO confunda com os anexos que são só informativos (planilha de itens, minuta de contrato, termo de referência) — só os que são modelos de declaração pra assinatura do licitante.

Para CADA anexo-modelo de declaração encontrado, devolva:
- "fonte": de onde veio, no formato "Anexo <número/letra> do edital" (ex: "Anexo II do edital"). Se o edital não numerar o anexo, descreva a seção onde está.
- "titulo": o título da declaração tal como está no edital (ex: "Declaração de Atendimento aos Requisitos de Habilitação").
- "texto": o texto COMPLETO do modelo, preenchido com os dados abaixo no lugar dos campos em branco/colchetes/lacunas do modelo original — preserve a redação jurídica do edital EXATAMENTE como está, mudando só os dados de identificação (nome da empresa, CNPJ, endereço, representante legal, RG/CPF, porte) e a referência ao edital/órgão. Nunca invente ou altere o conteúdo da declaração em si. NÃO inclua cabeçalho/letterhead da empresa no início do texto (isso é adicionado à parte), NÃO inclua o número do processo/edital nem o título do anexo (isso também é adicionado à parte, a partir dos campos "fonte"/"titulo" e dos dados da licitação). Comece direto no corpo do parágrafo (ex: "A empresa ..., DECLARA..."). O texto SEMPRE tem 3 partes separadas entre si por uma LINHA EM BRANCO (uma quebra de parágrafo de verdade, nunca tudo corrido num parágrafo só): (1) o corpo da declaração; (2) o local e a data de emissão, usando SEMPRE a cidade da EMPRESA/CLIENTE listada abaixo — NUNCA a cidade do órgão licitante, mesmo que o modelo do edital venha pré-preenchido com a cidade do órgão — e a data de hoje; (3) o campo de assinatura. PULE UMA LINHA depois do corpo (antes da data) e PULE UMA LINHA depois da data (antes da assinatura) — essas 3 partes nunca podem ficar coladas num único parágrafo. Dentro da parte (3), cada elemento fica em sua PRÓPRIA LINHA (uma quebra de linha simples entre cada um, não tudo corrido): a linha de assinatura ("_______________________________________"), depois "Assinatura do representante legal", depois o nome do representante legal, depois o cargo dele.
- "itensNumeroEdital": uma lista com os valores EXATOS de "numeroEdital" (copiados tal como aparecem na lista abaixo, sem alterar) dos itens do checklist que ESSA declaração específica resolve. Um mesmo anexo pode resolver vários itens de uma vez. Se não conseguir identificar com segurança, devolva uma lista vazia — nunca invente um numeroEdital que não esteja na lista.

DADOS PRA PREENCHER:
- Empresa: ${opts.clientName}
- CNPJ: ${opts.clientCnpj || '[CNPJ não informado]'}
- Endereço: ${opts.clientAddress || '[endereço não informado]'}
- Cidade da empresa (usar SEMPRE esta cidade no local/data de emissão, nunca a do órgão): ${opts.clientCidade || '[cidade não informada]'}
- Porte da empresa: ${opts.porteEmpresa || '[porte não informado]'}
- Representante legal: ${opts.responsavelNome || '[representante não informado]'}
- CPF do representante: ${opts.responsavelCpf || '[CPF não informado]'}
- RG do representante: ${opts.responsavelRg || '[RG não informado]'}
- Estado civil do representante: ${opts.estadoCivil || '[estado civil não informado]'}
- Cargo do representante: ${opts.responsavelCargo || '[cargo não informado]'}
- Órgão licitante: ${opts.orgao || '[órgão não informado]'}
- Número do edital: ${opts.numeroEdital || '[número não informado]'}
- Município da licitação: ${opts.municipio || ''}

ITENS DO CHECKLIST DESTA LICITAÇÃO (pra você casar em "itensNumeroEdital"):
${listaItens || '(nenhum item de checklist cadastrado ainda)'}

Se o edital não tiver nenhum anexo-modelo de declaração, devolva "anexos": [].`
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

async function fetchComRetry(url: string, init: RequestInit, tentativas = 4): Promise<Response> {
  let ultimoErro: unknown
  let ultimaResposta: Response | undefined
  for (let i = 0; i < tentativas; i++) {
    try {
      const res = await fetch(url, init)
      if (res.ok) return res
      if (res.status < 500 && res.status !== 429) return res
      const corpo = await res.text()
      if (res.status === 429 && corpo.includes('PerDay')) {
        return new Response(corpo, { status: res.status, statusText: res.statusText, headers: res.headers })
      }
      ultimaResposta = new Response(corpo, { status: res.status, statusText: res.statusText, headers: res.headers })
      ultimoErro = new Error(`HTTP ${res.status}: ${corpo}`)
    } catch (err) {
      ultimaResposta = undefined
      ultimoErro = err
    }
    if (i < tentativas - 1) {
      await new Promise((r) => setTimeout(r, 1500 * 2 ** i))
    }
  }
  // Esgotadas as tentativas: se a última falha veio de uma resposta HTTP (ex:
  // 503 persistente de sobrecarga do Gemini, "model is currently experiencing
  // high demand"), devolve essa Response em vez de lançar exceção — assim
  // quem chamou trata como mais um caso de "esta chave não deu conta agora"
  // e cascateia pra 2ª chave/Mistral, igual já fazia só pra cota diária
  // esgotada. Sem isso, um Gemini sobrecarregado por minutos derrubava a
  // análise mesmo com Mistral configurado e disponível. Erro de rede de
  // verdade (sem resposta HTTP nenhuma) continua sendo lançado, já que não
  // há status pra repassar adiante.
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

// Envia os documentos + prompt com UMA chave/projeto específico do Gemini —
// extraído à parte pra poder ser chamado de novo com uma SEGUNDA chave se a
// 1ª bater a cota diária. O try/finally garante que os arquivos enviados
// COM ESTA chave são sempre apagados, mesmo se o Promise.all ou o
// fetchComRetry falharem antes do fim.
async function processarAnexosComGemini(supabase: Supa, docs: Anexo[], prompt: string, apiKey: string): Promise<Response> {
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
          generationConfig: {
            response_mime_type: 'application/json',
            response_schema: ANEXOS_SCHEMA,
            maxOutputTokens: 8192,
          },
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

// Fallback via Mistral Document AI (OCR endpoint com extração estruturada
// por schema, modelo Pixtral por trás) — mesmo formato de chamada já
// confirmado e usado em Analisar-edital/Analisar-edital-juridico.
// Mistral também pode responder 429 "rate_limited" quando várias análises
// disparam em sequência num curto intervalo — diferente do 429 "PerDay" do
// Gemini (que só libera bem mais tarde), esse costuma se resolver sozinho
// em poucos segundos. Tenta de novo (backoff exponencial) antes de contar
// como "as 3 alternativas falharam" — sem isso, um pico breve de tráfego já
// derrubava a análise mesmo com o Mistral configurado e de pé.
async function fetchMistralComRetry(body: unknown, tentativas = 3): Promise<Response> {
  let res: Response
  for (let i = 0; i < tentativas; i++) {
    res = await fetch('https://api.mistral.ai/v1/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MISTRAL_API_KEY}` },
      body: JSON.stringify(body),
    })
    if (res.ok || res.status !== 429) return res
    if (i < tentativas - 1) {
      console.warn(`[retry] Mistral em rate limit (tentativa ${i + 1}/${tentativas}), tentando de novo em breve...`)
      await new Promise((r) => setTimeout(r, 2000 * 2 ** i))
    }
  }
  return res!
}

async function chamarMistralAnnotation(pdfBytes: Uint8Array, prompt: string): Promise<AnexosResultado> {
  const base64 = bytesParaBase64(pdfBytes)
  const res = await fetchMistralComRetry({
    model: 'mistral-ocr-latest',
    document: { type: 'document_url', document_url: `data:application/pdf;base64,${base64}` },
    document_annotation_format: {
      type: 'json_schema',
      json_schema: { name: 'anexos_declaracao', schema: ANEXOS_SCHEMA_MISTRAL, strict: true },
    },
    document_annotation_prompt: prompt,
  })
  if (!res.ok) throw new Error(`Falha ao analisar anexos com Mistral: ${await res.text()}`)
  const data = await res.json()
  if (!data.document_annotation) throw new Error('Mistral não retornou document_annotation')
  return JSON.parse(data.document_annotation) as AnexosResultado
}

// A OCR da Mistral processa UM documento por chamada — só o Edital vai pro
// Mistral no fallback, já que os anexos-modelo de declaração praticamente
// sempre vêm do próprio edital (o TR é complementar/técnico).
async function tentarFallbackMistral(supabase: Supa, edital: Anexo, prompt: string): Promise<AnexosResultado> {
  if (!MISTRAL_API_KEY) {
    throw new Error('MISTRAL_API_KEY não configurada nesta function — sem fallback disponível.')
  }
  const bytes = await baixarBytes(supabase, edital)
  return chamarMistralAnnotation(bytes, prompt)
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

    // Compara com o DONO da conta (owner_efetivo), não com quem está
    // logado — toda licitação sempre tem user_id = dono, então um membro
    // de equipe sempre bateria 403 se comparássemos direto com user.id.
    const { data: ownerId, error: ownerError } = await supabase.rpc('owner_efetivo', { usuario_id: user.id })
    if (ownerError || !ownerId) return json({ error: 'Não foi possível identificar a conta do usuário' }, 500)

    const { data: bidding, error: biddingError } = await supabase
      .from('biddings')
      .select('id, user_id, orgao, municipio, numero_edital, client_id')
      .eq('id', biddingId)
      .single()
    if (biddingError || !bidding) return json({ error: 'Licitação não encontrada' }, 404)
    if (bidding.user_id !== ownerId) return json({ error: 'Sem permissão para esta licitação' }, 403)

    const { data: client } = await supabase
      .from('clients')
      .select('name, cnpj, address, bairro, cidade, responsavel_nome, responsavel_cpf, responsavel_cargo, responsavel_rg, estado_civil, porte_empresa, cabecalho_declaracao')
      .eq('id', bidding.client_id)
      .maybeSingle()

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

    const { data: itensChecklist, error: checklistError } = await supabase
      .from('bidding_checklist_items')
      .select('id, numero_edital, descricao')
      .eq('bidding_id', biddingId)
    if (checklistError) throw checklistError

    const enderecoCompleto = [client?.address, client?.bairro].filter(Boolean).join(', ')

    const prompt = montarPrompt({
      clientName: client?.name ?? '',
      clientCnpj: client?.cnpj ?? '',
      clientAddress: enderecoCompleto,
      clientCidade: client?.cidade ?? '',
      responsavelNome: client?.responsavel_nome ?? '',
      responsavelCpf: client?.responsavel_cpf ?? '',
      responsavelCargo: client?.responsavel_cargo ?? '',
      responsavelRg: client?.responsavel_rg ?? '',
      estadoCivil: client?.estado_civil ?? '',
      porteEmpresa: client?.porte_empresa ?? '',
      orgao: bidding.orgao ?? '',
      numeroEdital: bidding.numero_edital ?? '',
      municipio: bidding.municipio ?? '',
      itensChecklist: (itensChecklist ?? []) as ChecklistItemRef[],
    })

    const docs = [edital, tr].filter((d): d is Anexo => !!d)

    let genRes = await processarAnexosComGemini(supabase, docs, prompt, GEMINI_API_KEY)
    let provedor: 'gemini' | 'gemini-2' | 'mistral' = 'gemini'

    // 2º nível: se a 1ª chave bateu a cota diária OU o Gemini está
    // sobrecarregado (503 persistente mesmo após as tentativas de retry), e
    // existe uma 2ª chave configurada, tenta de novo com ela antes de
    // partir pro Mistral.
    if ((genRes.status === 429 || genRes.status >= 500) && GEMINI_API_KEY_2) {
      console.warn('[Analisar-anexos-declaracao] 1ª chave do Gemini indisponível (cota esgotada ou sobrecarga) — tentando 2ª chave (projeto Google Cloud separado)...')
      genRes = await processarAnexosComGemini(supabase, docs, prompt, GEMINI_API_KEY_2)
      provedor = 'gemini-2'
    }

    let anexosEncontrados: AnexosResultado['anexos']

    // Chegar aqui ainda com 429/5xx significa: nenhuma chave do Gemini
    // configurada deu conta agora (cota esgotada ou sobrecarga persistente)
    // — 3º nível, tenta o mesmo edital via Mistral Document AI antes de
    // desistir de vez. É o que garante que as 3 alternativas configuradas
    // são de fato tentadas antes do erro subir pro usuário.
    if (genRes.status === 429 || genRes.status >= 500) {
      console.warn('[Analisar-anexos-declaracao] Gemini indisponível (cota esgotada ou sobrecarga) em todas as chaves configuradas — tentando fallback via Mistral Document AI...')
      try {
        const resultado = await tentarFallbackMistral(supabase, edital, prompt)
        anexosEncontrados = resultado.anexos ?? []
        provedor = 'mistral'
      } catch (fallbackErr) {
        const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
        throw new Error(`Gemini indisponível (cota esgotada ou sobrecarga) em todas as chaves configuradas, e o fallback via Mistral também falhou: ${fallbackMsg}`, { cause: fallbackErr })
      }
    } else if (!genRes.ok) {
      throw new Error(`Falha ao analisar anexos com Gemini: ${await genRes.text()}`)
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
      const resultado = JSON.parse(textoResposta) as AnexosResultado
      anexosEncontrados = resultado.anexos ?? []
    }

    console.log(`[Analisar-anexos-declaracao] Anexos extraídos via ${provedor}.`)

    // Uma nova análise substitui só os RASCUNHOS anteriores — anexos já
    // enviados ao cliente ou já assinados não podem ser apagados por uma
    // reanálise, senão perderia o histórico de algo que já foi assinado.
    // Os IDs são capturados agora, mas o delete só roda DEPOIS que os novos
    // já estiverem inseridos com sucesso (ver fim do loop abaixo) — se a
    // function fosse interrompida entre um delete antecipado e o insert dos
    // novos, o usuário perdia os rascunhos até rodar a análise de novo, sem
    // nenhum jeito de recuperar.
    const { data: rascunhosAntigos } = await supabase
      .from('bidding_declaracao_anexos')
      .select('id')
      .eq('bidding_id', biddingId)
      .eq('status', 'rascunho')

    const numeroEditalParaId = new Map(
      (itensChecklist ?? [])
        .filter((i: ChecklistItemRef) => i.numero_edital)
        .map((i: ChecklistItemRef) => [i.numero_edital, i.id])
    )

    // O cabeçalho/letterhead do cliente (nome em destaque, CNPJ, porte,
    // endereço, contato) é fixo por cliente e não muda de uma declaração
    // pra outra — em vez de pedir pra IA reproduzir a formatação toda vez
    // (arriscando variar), colamos o texto salvo no cadastro do cliente na
    // frente de cada anexo gerado, de forma determinística.
    const cabecalho = client?.cabecalho_declaracao?.trim()

    let criados = 0
    for (const a of anexosEncontrados) {
      if (!a.titulo || !a.texto) continue
      const texto = cabecalho ? `${cabecalho}\n\n${a.texto}` : a.texto
      const { data: novoAnexo, error: insertError } = await supabase
        .from('bidding_declaracao_anexos')
        .insert({ user_id: ownerId, bidding_id: biddingId, fonte: a.fonte || 'Anexo do edital', titulo: a.titulo, texto, status: 'rascunho' })
        .select('id')
        .single()
      if (insertError || !novoAnexo) continue
      criados++

      const itensIds = (a.itensNumeroEdital ?? [])
        .map((n) => numeroEditalParaId.get(n))
        .filter((id): id is string => !!id)
      if (itensIds.length > 0) {
        await supabase.from('bidding_declaracao_anexo_itens').insert(
          itensIds.map((checklist_item_id) => ({ anexo_id: novoAnexo.id, checklist_item_id }))
        )
      }
    }

    // Só agora, com os novos anexos já gravados com sucesso, remove os
    // rascunhos antigos — nunca ficam os dois períodos (perder tudo) sem
    // que pelo menos um dos dois conjuntos já esteja garantido no banco.
    if (rascunhosAntigos && rascunhosAntigos.length > 0) {
      await supabase.from('bidding_declaracao_anexos').delete().in('id', rascunhosAntigos.map((r) => r.id))
    }

    return json({ success: true, criados })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err)
    console.error('Erro ao analisar anexos de declaração:', mensagem)
    return json({ success: false, error: mensagem }, 500)
  }
})
