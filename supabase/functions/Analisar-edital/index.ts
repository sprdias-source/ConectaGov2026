// Edge Function: Analisar-edital
//
// Recebe { biddingId }, marca a análise como "processando" e devolve a
// resposta IMEDIATAMENTE — o trabalho pesado (baixar edital/TR, subir pro
// Gemini, esperar processar, gerar a análise) roda em SEGUNDO PLANO via
// EdgeRuntime.waitUntil(), depois que a resposta já foi enviada.
//
// Isso existe porque editais grandes/escaneados podem levar mais de 150
// segundos pra processar — que é perto do limite de execução síncrona de
// uma Edge Function no Supabase. Rodando em segundo plano, a função nunca
// estoura esse limite (ela só fica "esperando" o resultado, sem contar
// pro tempo de resposta). A tela já foi feita pra funcionar assim: ela
// consulta bidding_analysis periodicamente enquanto o status for
// "processando", até virar "concluido" ou "erro" — não muda nada nela.
//
// Edital e Termo de Referência (quando os dois existem) são enviados pro
// Gemini EM PARALELO, não um depois do outro, pra reduzir ainda mais o
// tempo total.
//
// FALLBACK EM 3 NÍVEIS (mesmo padrão de Analisar-edital-juridico): quando a
// cota diária do Gemini estoura (HTTP 429 com "PerDay" no corpo), tenta de
// novo com uma 2ª chave (2º projeto Google Cloud, cota separada) antes de
// cair pro Mistral Document AI como último recurso. A tela consome o JSON
// sem saber qual dos três respondeu.
//
// VARIÁVEIS DE AMBIENTE NECESSÁRIAS (Supabase → Edge Functions → Secrets):
// - GEMINI_API_KEY: chave da API do Google AI Studio
// - GEMINI_API_KEY_2: opcional — 2º nível de fallback (2º projeto Google
//   Cloud, mesma cota gratuita de 20/dia, mas separada). Sem ela, só existe
//   a 1ª chave + o fallback do Mistral.
// - MISTRAL_API_KEY: opcional — 3º nível de fallback. Sem ela, o erro de
//   cota do Gemini sobe normalmente quando as chaves configuradas esgotarem.
// - SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm injetadas
//   automaticamente pelo Supabase em toda Edge Function.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
// 2º nível de fallback, ANTES do Mistral — mesmo raciocínio de
// Analisar-edital-juridico: a cota gratuita de 20 req/dia do Gemini é por
// PROJETO do Google Cloud, não por conta, então uma chave de um 2º projeto
// dá mais 20/dia de graça.
const GEMINI_API_KEY_2 = Deno.env.get('GEMINI_API_KEY_2')
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_DRIVE_CLIENT_ID')
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET')
const GOOGLE_REFRESH_TOKEN = Deno.env.get('GOOGLE_DRIVE_REFRESH_TOKEN')
const DRIVE_PREFIX = 'gdrive:'
// 3º nível de fallback — só entra em ação se as chaves do Gemini
// configuradas (1 ou 2) esgotarem a cota diária no mesmo dia. Opcional: sem
// ela, o erro de cota simplesmente sobe, como já era antes desta mudança.
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
// Fixo em 3.5 (não 'gemini-flash-latest' nem '2.5-flash'): o Google
// aposentou o 2.5 Flash em 2026 ("model ... is no longer available to new
// users", HTTP 404 NOT_FOUND) — foi exatamente esse erro que quebrou TODAS
// as análises de uma vez, sem aviso prévio. Se isso voltar a acontecer com
// o 3.5, é sinal de que ele também foi descontinuado — troque de novo pro
// sucessor atual. 'gemini-flash-latest' segue arriscado como alias: já
// apontou pra um preview com cota gratuita de só 20 req/dia.
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

type ItemEdital = { numero: string; lote: string; descricao: string; unidade: string; quantidade: number; valorReferencia: number }
type ChecklistItem = { descricao: string; categoria: string; obrigatorio: boolean }
type AnaliseResultado = {
  municipio: string; orgao: string; objeto: string; numeroEdital: string; numeroProcesso: string
  modalidade: string; srp: boolean; data: string; horario: string; portal: string; intervaloLances: string
  modoDisputa: {
    tipo: string; duracaoFaseAberta: string; duracaoFaseFechada: string
    prorrogacaoAutomatica: string; tempoAleatorio: string; criterioEncerramento: string; observacoes: string
  }
  resumoTecnico: string; valorTotalEstimado: number; itens: ItemEdital[]
  validadeProposta: string; catalogo: string; garantias: string; amostras: string; marcasPreAprovadas: string
  habilitacao: {
    habilitacaoJuridica: string; regularidadeFiscalTrabalhista: string
    qualificacaoEconomicoFinanceira: string; qualificacaoTecnica: string; proposta: string
  }
  prazos: string; formaEntrega: string; localEntrega: string; condicoesPagamento: string
  clausulasRestritivas: string; conclusaoTecnica: string; checklistDocumentacao: ChecklistItem[]
}

// Schema que obriga o Gemini a devolver exatamente os campos que o
// frontend (LicitacaoPage.tsx, interface AnaliseEdital) já espera.
const ANALISE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    municipio: { type: 'STRING' },
    orgao: { type: 'STRING' },
    objeto: { type: 'STRING' },
    numeroEdital: { type: 'STRING' },
    numeroProcesso: { type: 'STRING' },
    modalidade: { type: 'STRING' },
    srp: { type: 'BOOLEAN' },
    data: { type: 'STRING' },
    horario: { type: 'STRING' },
    portal: { type: 'STRING' },
    intervaloLances: { type: 'STRING' },
    modoDisputa: {
      type: 'OBJECT',
      properties: {
        tipo: { type: 'STRING' },
        duracaoFaseAberta: { type: 'STRING' },
        duracaoFaseFechada: { type: 'STRING' },
        prorrogacaoAutomatica: { type: 'STRING' },
        tempoAleatorio: { type: 'STRING' },
        criterioEncerramento: { type: 'STRING' },
        observacoes: { type: 'STRING' },
      },
    },
    resumoTecnico: { type: 'STRING' },
    valorTotalEstimado: { type: 'NUMBER' },
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
    validadeProposta: { type: 'STRING' },
    catalogo: { type: 'STRING' },
    garantias: { type: 'STRING' },
    amostras: { type: 'STRING' },
    marcasPreAprovadas: { type: 'STRING' },
    habilitacao: {
      type: 'OBJECT',
      properties: {
        habilitacaoJuridica: { type: 'STRING' },
        regularidadeFiscalTrabalhista: { type: 'STRING' },
        qualificacaoEconomicoFinanceira: { type: 'STRING' },
        qualificacaoTecnica: { type: 'STRING' },
        proposta: { type: 'STRING' },
      },
    },
    prazos: { type: 'STRING' },
    formaEntrega: { type: 'STRING' },
    localEntrega: { type: 'STRING' },
    condicoesPagamento: { type: 'STRING' },
    clausulasRestritivas: { type: 'STRING' },
    conclusaoTecnica: { type: 'STRING' },
    checklistDocumentacao: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          descricao: { type: 'STRING' },
          categoria: { type: 'STRING' },
          obrigatorio: { type: 'BOOLEAN' },
        },
        required: ['descricao'],
      },
    },
  },
}

// Mesmo formato de ANALISE_SCHEMA, em JSON Schema padrão (tipos em
// minúsculo) — usado no fallback via Mistral Document AI, cujo modo
// "json_schema" estrito (strict: true) exige TODO campo declarado também em
// "required" e "additionalProperties: false" em todo objeto. Os campos que
// o prompt manda deixar vazio quando não encontrar continuam sem problema,
// já que ficam como string vazia — nunca null (Mistral strict não aceita
// tipos nullable sem declarar união de tipos).
const ANALISE_SCHEMA_MISTRAL = {
  type: 'object',
  properties: {
    municipio: { type: 'string' },
    orgao: { type: 'string' },
    objeto: { type: 'string' },
    numeroEdital: { type: 'string' },
    numeroProcesso: { type: 'string' },
    modalidade: { type: 'string' },
    srp: { type: 'boolean' },
    data: { type: 'string' },
    horario: { type: 'string' },
    portal: { type: 'string' },
    intervaloLances: { type: 'string' },
    modoDisputa: {
      type: 'object',
      properties: {
        tipo: { type: 'string' },
        duracaoFaseAberta: { type: 'string' },
        duracaoFaseFechada: { type: 'string' },
        prorrogacaoAutomatica: { type: 'string' },
        tempoAleatorio: { type: 'string' },
        criterioEncerramento: { type: 'string' },
        observacoes: { type: 'string' },
      },
      required: ['tipo', 'duracaoFaseAberta', 'duracaoFaseFechada', 'prorrogacaoAutomatica', 'tempoAleatorio', 'criterioEncerramento', 'observacoes'],
      additionalProperties: false,
    },
    resumoTecnico: { type: 'string' },
    valorTotalEstimado: { type: 'number' },
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
    validadeProposta: { type: 'string' },
    catalogo: { type: 'string' },
    garantias: { type: 'string' },
    amostras: { type: 'string' },
    marcasPreAprovadas: { type: 'string' },
    habilitacao: {
      type: 'object',
      properties: {
        habilitacaoJuridica: { type: 'string' },
        regularidadeFiscalTrabalhista: { type: 'string' },
        qualificacaoEconomicoFinanceira: { type: 'string' },
        qualificacaoTecnica: { type: 'string' },
        proposta: { type: 'string' },
      },
      required: ['habilitacaoJuridica', 'regularidadeFiscalTrabalhista', 'qualificacaoEconomicoFinanceira', 'qualificacaoTecnica', 'proposta'],
      additionalProperties: false,
    },
    prazos: { type: 'string' },
    formaEntrega: { type: 'string' },
    localEntrega: { type: 'string' },
    condicoesPagamento: { type: 'string' },
    clausulasRestritivas: { type: 'string' },
    conclusaoTecnica: { type: 'string' },
    checklistDocumentacao: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          descricao: { type: 'string' },
          categoria: { type: 'string' },
          obrigatorio: { type: 'boolean' },
        },
        required: ['descricao', 'categoria', 'obrigatorio'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'municipio', 'orgao', 'objeto', 'numeroEdital', 'numeroProcesso', 'modalidade', 'srp', 'data', 'horario',
    'portal', 'intervaloLances', 'modoDisputa', 'resumoTecnico', 'valorTotalEstimado', 'itens', 'validadeProposta',
    'catalogo', 'garantias', 'amostras', 'marcasPreAprovadas', 'habilitacao', 'prazos', 'formaEntrega',
    'localEntrega', 'condicoesPagamento', 'clausulasRestritivas', 'conclusaoTecnica', 'checklistDocumentacao',
  ],
  additionalProperties: false,
}

const PROMPT = `Você é um analista de licitações públicas brasileiras, especialista na Lei nº 14.133/2021 e no Decreto nº 10.024/2019 (pregão eletrônico). Analise o edital (e o termo de referência, se estiver junto) em anexo e devolva um JSON com os campos do schema fornecido.

Preencha todos os campos que conseguir identificar no documento; deixe null ou vazio o que não encontrar — nunca invente informação.

IMPORTANTE: quando a mesma informação aparecer repetida em várias partes do edital (isso é comum — o mesmo prazo ou regra costuma aparecer no resumo, no modelo de proposta e nas condições gerais, cada vez com uma frase um pouco diferente), responda UMA ÚNICA VEZ, de forma direta e resumida — nunca liste cada variação de texto que encontrar. Ex: se o edital disser "90 dias" em três lugares com frases diferentes, o campo deve conter só "90 dias, contados da abertura da sessão", nunca as três frases juntas.

Para "objeto", transcreva (resumindo só o essencial, sem cortar o sentido) a cláusula "Do Objeto" do edital — a frase formal que descreve o que está sendo licitado, tipo "Contratação de empresa especializada para fornecimento de...". Não confunda com "resumoTecnico", que é uma análise, não uma transcrição.

Para "numeroEdital", extraia o número de identificação do edital tal como escrito no documento (ex: "05/2026", "Edital nº 012/2026").

Para "numeroProcesso", extraia o número do processo administrativo/licitatório associado, se o edital mencionar (ex: "Processo nº 423/2026", "Processo Administrativo 1234/2026").

Para "intervaloLances", procure a cláusula do edital que define o intervalo/diferença MÍNIMA exigida entre um lance e o lance anterior durante a disputa (geralmente na seção sobre "modo de disputa", "lances" ou "fase de lances" do pregão eletrônico). Transcreva a regra tal como o edital define, incluindo a unidade (percentual ou valor fixo) — ex: "1% (um por cento)", "0,5%", "R$ 50,00". Se o edital definir regras diferentes pra fases diferentes (ex: lances abertos x fechados), traga a regra da fase de lances abertos/aberta, que é a que vale durante a disputa ao vivo. Se não encontrar essa cláusula, deixe null — não invente um percentual.

Para "modoDisputa", localize a cláusula do edital que define o MODO DE DISPUTA da sessão pública (geralmente na seção "Do Modo de Disputa", "Da Sessão Pública" ou "Dos Lances") e preencha, como um analista de licitações preencheria uma ficha de acompanhamento de sessão:
- tipo: "Aberto", "Fechado" ou "Aberto e Fechado", exatamente como o edital classificar;
- duracaoFaseAberta: a duração da fase de lances abertos, se houver — inclua tanto o tempo fixo quanto a regra de encerramento por inatividade, se o edital definir as duas coisas (ex: "15 minutos, encerrando automaticamente após 10 minutos sem novo lance");
- duracaoFaseFechada: a duração/regra da fase fechada, se houver (ex: "10 minutos para envio da proposta final lacrada", "os 3 melhores classificados têm até 5 minutos para ofertar nova proposta");
- prorrogacaoAutomatica: a regra de prorrogação automática da fase aberta, se o edital previr (ex: "prorroga automaticamente por mais 2 minutos a cada novo lance registrado nos 2 minutos finais");
- tempoAleatorio: se o edital previr um tempo aleatório de encerramento decidido pelo sistema (comum no modo aberto, tipicamente de até 30 minutos), descreva a regra tal como escrita;
- criterioEncerramento: resuma, em poucas palavras, o que efetivamente encerra a disputa (ex: "inatividade + tempo aleatório do sistema", "decisão do pregoeiro", "prazo fixo sem prorrogação");
- observacoes: qualquer outra regra relevante da disputa que não caiba nos campos acima (ex: regra específica de desempate na fase de lances, retorno à fase de lances em caso de desclassificação, particularidades do modo combinado).
Preencha só o que o próprio edital detalhar explicitamente — nunca complete uma regra com o que é "padrão" ou "comum" no mercado se o documento não disser isso.

Para "valorTotalEstimado", extraia o valor total estimado/máximo da licitação exatamente como declarado no próprio edital (geralmente numa cláusula do tipo "Do Valor Estimado" ou no preâmbulo, ex: "R$ 1.234.567,89"). Traga o número tal como o edital afirma — NUNCA calcule somando os valores dos itens, mesmo que pareça dar no mesmo; se o edital não declarar esse valor total explicitamente, deixe null.

Se a licitação for organizada em LOTES (grupos de itens que devem ser disputados/adjudicados em conjunto), preencha o campo "lote" de cada item com o número/identificação do lote ao qual ele pertence, exatamente como o edital o identifica (ex: "1", "Lote 01", "Lote II"). Se a licitação for por item individual (sem lotes), deixe "lote" vazio em todos os itens.

ATENÇÃO ESPECIAL com unidades que têm expoente (m², m³, cm³, km² etc.) nos itens: releia a quantidade e a unidade completas com cuidado antes de preencher — o caractere de expoente (², ³) não pode cortar ou confundir o número nem a unidade ao lado dele. Exemplo: "405 m³" tem que virar quantidade 405 e unidade "m³" — nunca quantidade 4 e unidade "m", nem qualquer outra combinação truncada.

Para "checklistDocumentacao", liste TODOS os documentos de habilitação exigidos no edital (jurídica, fiscal/trabalhista, econômico-financeira, técnica), um item por documento, marcando "obrigatorio: true" para os exigidos e "obrigatorio: false" só se o próprio edital disser que é facultativo/complementar. SEMPRE que o próprio edital numerar aquele documento (cláusula, item ou alínea, ex: "5.2", "5.2.1", "5 a)", "8.3 b)"), inicie o campo "descricao" com esse número/alínea EXATAMENTE como aparece no edital, seguido de um espaço e então o nome do documento — ex: "5.2 a) Comprovação de inscrição no CNPJ", "8.3 Certidão Negativa de Débitos Trabalhistas (CNDT)". Se o edital não numerar aquele item especificamente, escreva só a descrição, sem inventar numeração.

Para os 5 campos de "habilitacao", resuma em texto corrido o que o edital exige em cada categoria (habilitação jurídica, regularidade fiscal e trabalhista, qualificação econômico-financeira, qualificação técnica, proposta).`

// Faz upload de um arquivo pro Gemini Files API em streaming (o corpo da
// resposta do download do Storage é canalizado direto pro corpo da
// requisição de upload — o arquivo nunca é materializado inteiro numa
// variável). Recebe a chave como parâmetro (não fixa) pra poder ser chamada
// de novo com uma 2ª chave/projeto se a 1ª bater a cota diária — os
// arquivos enviados ficam vinculados ao projeto dono da chave que fez o
// upload, então trocar de chave exige reenviar os documentos.
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

// Envia os documentos e gera a análise com UMA chave/projeto específico do
// Gemini — extraído à parte pra poder ser chamado de novo com uma SEGUNDA
// chave se a 1ª bater a cota diária.
async function tentarAnaliseComGemini(supabase: Supa, docs: Anexo[], apiKey: string): Promise<Response> {
  const arquivosGeminiParaApagar: string[] = []
  const resultados = await Promise.all(docs.map((doc) => processarDocumento(supabase, doc, apiKey, arquivosGeminiParaApagar)))
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
          response_schema: ANALISE_SCHEMA,
          maxOutputTokens: 8192,
        },
      }),
    }
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

async function baixarBytes(supabase: Supa, anexo: Anexo): Promise<Uint8Array> {
  const downloadRes = await baixarAnexo(supabase, anexo.storage_path)
  if (!downloadRes.ok || !downloadRes.body) throw new Error(`Falha ao baixar "${anexo.name}" do Storage/Drive`)
  return new Uint8Array(await downloadRes.arrayBuffer())
}

// Fallback via Mistral Document AI (OCR endpoint com extração estruturada
// por schema, modelo Pixtral por trás) — mesmo formato de chamada já
// confirmado e usado em Analisar-edital-juridico.
async function chamarMistralAnnotation(pdfBytes: Uint8Array): Promise<AnaliseResultado> {
  const base64 = bytesParaBase64(pdfBytes)
  const res = await fetch('https://api.mistral.ai/v1/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MISTRAL_API_KEY}` },
    body: JSON.stringify({
      model: 'mistral-ocr-latest',
      document: { type: 'document_url', document_url: `data:application/pdf;base64,${base64}` },
      document_annotation_format: {
        type: 'json_schema',
        json_schema: { name: 'analise_edital', schema: ANALISE_SCHEMA_MISTRAL, strict: true },
      },
      document_annotation_prompt: PROMPT,
    }),
  })
  if (!res.ok) throw new Error(`Falha ao analisar com Mistral: ${await res.text()}`)
  const data = await res.json()
  if (!data.document_annotation) throw new Error('Mistral não retornou document_annotation')
  return JSON.parse(data.document_annotation) as AnaliseResultado
}

// A OCR da Mistral processa UM documento por chamada (diferente do Gemini,
// que aceita edital + TR juntos numa única requisição). Só o Edital vai pro
// Mistral no fallback — o TR é complementar e mesclar duas extrações
// estruturadas completas de forma confiável (campo a campo) foge do escopo
// razoável aqui; o Edital sozinho já é a fonte primária de quase todo o
// schema. Itens/checklist continuam vindo só do Edital nesse caminho.
async function tentarFallbackMistral(supabase: Supa, edital: Anexo): Promise<AnaliseResultado> {
  if (!MISTRAL_API_KEY) {
    throw new Error('MISTRAL_API_KEY não configurada nesta function — sem fallback disponível.')
  }
  const bytes = await baixarBytes(supabase, edital)
  return chamarMistralAnnotation(bytes)
}

// Todo o trabalho pesado — roda depois da resposta HTTP já ter sido
// devolvida (ver EdgeRuntime.waitUntil lá embaixo), por isso não conta
// pro limite de tempo de execução síncrona.
async function processarAnalise(supabase: Supa, analysisRowId: string, edital: Anexo, tr: Anexo | undefined) {
  try {
    const docs = [edital, tr].filter((d): d is Anexo => !!d)

    let genRes = await tentarAnaliseComGemini(supabase, docs, GEMINI_API_KEY)
    let provedor: 'gemini' | 'gemini-2' | 'mistral' = 'gemini'

    // 2º nível: se a 1ª chave bateu a cota diária e existe uma 2ª chave
    // configurada, tenta de novo com ela antes de partir pro Mistral.
    if (genRes.status === 429 && GEMINI_API_KEY_2) {
      console.warn('[Analisar-edital] Cota diária da 1ª chave do Gemini esgotada — tentando 2ª chave (projeto Google Cloud separado)...')
      genRes = await tentarAnaliseComGemini(supabase, docs, GEMINI_API_KEY_2)
      provedor = 'gemini-2'
    }

    let analise: AnaliseResultado

    // Chegar aqui ainda com status 429 significa: acabou a cota gratuita
    // de hoje em TODAS as chaves do Gemini configuradas — 3º nível, tenta
    // o mesmo edital via Mistral Document AI antes de desistir de vez.
    if (genRes.status === 429) {
      console.warn('[Analisar-edital] Cota diária do Gemini esgotada em todas as chaves configuradas — tentando fallback via Mistral Document AI...')
      try {
        analise = await tentarFallbackMistral(supabase, edital)
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
      analise = JSON.parse(textoResposta) as AnaliseResultado
    }

    // Log só pra diagnóstico (qual provedor de fato gerou o resultado) — o
    // JSON gravado em "analise" continua exatamente no mesmo formato dos
    // três provedores, então a tela não precisa saber qual respondeu.
    console.log(`[Analisar-edital] Análise concluída via ${provedor}.`)

    await supabase.from('bidding_analysis').update({ status: 'concluido', analise, erro_mensagem: null, updated_at: new Date().toISOString() }).eq('id', analysisRowId)
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err)
    console.error('Erro ao analisar edital (segundo plano):', mensagem)
    await supabase.from('bidding_analysis').update({ status: 'erro', erro_mensagem: mensagem, updated_at: new Date().toISOString() }).eq('id', analysisRowId)
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

    // Compara com o DONO da conta (owner_efetivo), não com quem está
    // logado — toda licitação sempre tem user_id = dono, então um membro
    // de equipe (com permissão de verdade, garantida por RLS/Matriz)
    // sempre bateria 403 se comparássemos direto com user.id.
    const { data: ownerId, error: ownerError } = await supabase.rpc('owner_efetivo', { usuario_id: user.id })
    if (ownerError || !ownerId) return json({ error: 'Não foi possível identificar a conta do usuário' }, 500)

    const { data: bidding, error: biddingError } = await supabase
      .from('biddings')
      .select('id, user_id, objeto')
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

    let analysisRowId: string
    const { data: existente } = await supabase.from('bidding_analysis').select('id').eq('bidding_id', biddingId).maybeSingle()
    if (existente) {
      await supabase.from('bidding_analysis').update({ status: 'processando', erro_mensagem: null, updated_at: new Date().toISOString() }).eq('id', existente.id)
      analysisRowId = existente.id as string
    } else {
      const { data: novo, error: insertError } = await supabase
        .from('bidding_analysis')
        .insert({ user_id: ownerId, bidding_id: biddingId, status: 'processando' })
        .select('id')
        .single()
      if (insertError) throw insertError
      analysisRowId = novo.id as string
    }

    // @ts-expect-error: EdgeRuntime é global no runtime do Supabase, não existe no lib.dom.d.ts do TypeScript
    EdgeRuntime.waitUntil(processarAnalise(supabase, analysisRowId, edital, tr))

    // Responde já, sem esperar a análise terminar — é isso que evita
    // estourar o limite de execução da function.
    return json({ started: true })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err)
    console.error('Erro ao iniciar análise:', mensagem)
    return json({ success: false, error: mensagem }, 500)
  }
})
