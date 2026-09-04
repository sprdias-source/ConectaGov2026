// Edge Function: Analisar-oportunidade
//
// Cópia adaptada de Analisar-edital, pro estágio de Oportunidade (antes da
// licitação existir de verdade — ver tabela `opportunities`). Mesmo prompt,
// mesmo schema, mesmo mecanismo de upload em segundo plano — só muda ONDE
// verifica permissão (opportunities em vez de biddings) e ONDE grava o
// resultado (opportunity_analysis em vez de bidding_analysis).
//
// Quando a oportunidade é convertida em licitação (ver fluxo de conversão
// em useOpportunities.ts), o resultado desta análise é COPIADO direto pra
// bidding_analysis da licitação nova — não roda a IA de novo.
//
// Recebe { opportunityId }, marca a análise como "processando" e devolve a
// resposta IMEDIATAMENTE — o trabalho pesado roda em SEGUNDO PLANO via
// EdgeRuntime.waitUntil(), depois que a resposta já foi enviada (mesmo
// motivo de Analisar-edital: editais grandes podem passar do limite de
// execução síncrona de uma Edge Function).
//
// FALLBACK EM 3 NÍVEIS (mesmo padrão de Analisar-edital-juridico): quando a
// cota diária do Gemini estoura (HTTP 429 com "PerDay" no corpo), tenta de
// novo com uma 2ª chave (2º projeto Google Cloud, cota separada) antes de
// cair pro Mistral Document AI como último recurso. A tela consome o JSON
// sem saber qual dos três respondeu.
//
// VARIÁVEIS DE AMBIENTE NECESSÁRIAS (Supabase → Edge Functions → Secrets):
// - GEMINI_API_KEY: a mesma chave já usada pela function Analisar-edital.
// - GEMINI_API_KEY_2: opcional — 2º nível de fallback (2º projeto Google
//   Cloud, mesma cota gratuita de 20/dia, mas separada).
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

// Mesmo schema de Analisar-edital — os dois alimentam o mesmo tipo
// AnaliseEdital no frontend (src/types/domain.ts).
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

// Mesmo formato de ANALISE_SCHEMA, em JSON Schema padrão — usado no
// fallback via Mistral Document AI (modo "json_schema" estrito, exige TODO
// campo em "required" e "additionalProperties: false" em todo objeto).
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

// Mesmo prompt de Analisar-edital, palavra por palavra — mantém as duas
// functions devolvendo o mesmo formato de resultado.
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
  let ultimaResposta: Response | undefined
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
      ultimaResposta = new Response(corpo, { status: res.status, statusText: res.statusText, headers: res.headers })
      ultimoErro = new Error(`HTTP ${res.status}: ${corpo}`)
    } catch (err) {
      ultimaResposta = undefined
      ultimoErro = err
    }
    if (i < tentativas - 1) {
      console.warn(`[retry] Gemini falhou (tentativa ${i + 1}/${tentativas}), tentando de novo em breve...`, ultimoErro)
      await new Promise((r) => setTimeout(r, 1500 * 2 ** i))
    }
  }
  // Esgotadas as tentativas: se a última falha veio de uma resposta HTTP (ex:
  // 503 persistente de sobrecarga do Gemini, "model is currently experiencing
  // high demand"), devolve essa Response em vez de lançar exceção — assim
  // quem chamou trata como mais um caso de "esta chave não deu conta agora"
  // e cascateia pra 2ª chave/Mistral, igual já fazia só pra cota diária
  // esgotada. Sem isso, um Gemini sobrecarregado por minutos derrubava a
  // análise inteira mesmo com Mistral configurado e disponível. Erro de rede
  // de verdade (sem resposta HTTP nenhuma) continua sendo lançado, já que não
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

// Limite pra decidir se o documento vai direto no corpo da requisição
// (inline_data, sem passar pelo Files API) ou pelo caminho antigo (upload +
// espera de até ~100s até o Gemini marcar o arquivo como ACTIVE). Essa
// espera era a maior fonte isolada de demora do pipeline — crítica no plano
// Free/Hobby do Supabase, cujo teto de wall-clock (~150s) o pipeline
// completo já chegava perto de estourar. Documentos de até ~15MB (a grande
// maioria dos editais, mesmo os mais longos, quando não são escaneados em
// altíssima resolução) cabem tranquilamente inline — só os poucos casos
// realmente grandes continuam pelo caminho com upload, que segue
// funcionando como reforço.
const LIMITE_INLINE_BYTES = 15 * 1024 * 1024

async function processarDocumento(supabase: Supa, doc: Anexo, apiKey: string, arquivosGeminiParaApagar: string[]) {
  const tInicio = Date.now()
  const downloadRes = await baixarAnexo(supabase, doc.storage_path)
  if (!downloadRes.ok || !downloadRes.body) throw new Error(`Falha ao baixar "${doc.name}" do Storage/Drive`)

  const mimeType = doc.mime_type || 'application/pdf'
  const sizeBytes = doc.size_bytes ?? Number(downloadRes.headers.get('content-length') ?? 0)
  if (!sizeBytes) throw new Error(`Não foi possível determinar o tamanho de "${doc.name}"`)

  if (sizeBytes <= LIMITE_INLINE_BYTES) {
    const bytes = new Uint8Array(await downloadRes.arrayBuffer())
    console.log(`[Analisar-oportunidade][timing] "${doc.name}" baixado e codificado (inline) em ${Date.now() - tInicio}ms (${sizeBytes} bytes)`)
    return { fileData: { inline_data: { mime_type: mimeType, data: bytesParaBase64(bytes) } } }
  }

  const geminiFile = await uploadParaGemini(downloadRes.body, sizeBytes, mimeType, doc.name, apiKey)
  console.log(`[Analisar-oportunidade][timing] "${doc.name}" enviado via Files API em ${Date.now() - tInicio}ms (${sizeBytes} bytes)`)
  // Registra ANTES de retornar — se outro documento do MESMO lote (ver
  // Promise.all abaixo) falhar depois deste já ter subido com sucesso, o
  // Promise.all rejeita sem nunca rodar o .forEach que populava esta lista
  // só no fim, deixando este arquivo órfão no Gemini até expirar sozinho.
  arquivosGeminiParaApagar.push(geminiFile.name)
  return { fileData: { file_data: { mime_type: mimeType, file_uri: geminiFile.uri } } }
}

// Envia os documentos e gera a análise com UMA chave/projeto específico do
// Gemini — extraído à parte pra poder ser chamado de novo com uma SEGUNDA
// chave se a 1ª bater a cota diária.
async function tentarAnaliseComGemini(supabase: Supa, docs: Anexo[], apiKey: string): Promise<Response> {
  const arquivosGeminiParaApagar: string[] = []
  const tDocs = Date.now()
  const resultados = await Promise.all(docs.map((doc) => processarDocumento(supabase, doc, apiKey, arquivosGeminiParaApagar)))
  console.log(`[Analisar-oportunidade][timing] preparo de todos os documentos: ${Date.now() - tDocs}ms`)
  const partesArquivos = resultados.map((r) => r.fileData)

  const tGemini = Date.now()
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
  console.log(`[Analisar-oportunidade][timing] chamada generateContent ao Gemini (status ${genRes.status}): ${Date.now() - tGemini}ms`)

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

async function chamarMistralAnnotation(pdfBytes: Uint8Array): Promise<AnaliseResultado> {
  const base64 = bytesParaBase64(pdfBytes)
  const res = await fetchMistralComRetry({
    model: 'mistral-ocr-latest',
    document: { type: 'document_url', document_url: `data:application/pdf;base64,${base64}` },
    document_annotation_format: {
      type: 'json_schema',
      json_schema: { name: 'analise_edital', schema: ANALISE_SCHEMA_MISTRAL, strict: true },
    },
    document_annotation_prompt: PROMPT,
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
// schema.
async function tentarFallbackMistral(supabase: Supa, edital: Anexo): Promise<AnaliseResultado> {
  if (!MISTRAL_API_KEY) {
    throw new Error('MISTRAL_API_KEY não configurada nesta function — sem fallback disponível.')
  }
  const bytes = await baixarBytes(supabase, edital)
  return chamarMistralAnnotation(bytes)
}

// Limite de segurança pra SEMPRE gravar um status final antes do runtime do
// Supabase matar esta function à força por estourar o tempo máximo de
// execução (erro visto nos logs: "shutdown"/"WallClockTime", sem nenhum
// erro da nossa aplicação — a function é encerrada NO MEIO, sem rodar nada
// do catch abaixo). No plano Free/Hobby esse teto é de ~150s; o pipeline
// completo (baixar do Drive + subir pro Gemini + esperar processar +
// gerar a análise, com possíveis fallbacks pra 2ª chave/Mistral) pode
// chegar perto ou passar disso em editais grandes/escaneados. Sem este
// limite interno, o registro ficava preso em "processando" pra sempre,
// até a tela desistir sozinha (timeout de 3min do lado do cliente) e
// mostrar "travou" sem nenhuma explicação real.
//
// Elevado de 110s pra 135s depois de um caso real medido: um edital de só
// 2,7MB/44 páginas (já usando o fast-path inline_data, preparo do
// documento em ~3s) ainda assim ficou mais de 107s esperando o próprio
// generateContent do Gemini responder, sem nenhum retry logado — ou seja,
// o gargalo é o tempo de geração do Gemini pra editais com bastante item/
// checklist pra extrair, não mais o upload. 135s deixa ~15s de folga pro
// resto do pipeline (gravar o resultado, etc.) antes do teto real do
// plano.
const LIMITE_EXECUCAO_MS = 135_000

async function comLimiteDeTempo<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(
      'A análise demorou mais do que o tempo de execução disponível no plano atual do Supabase — tente novamente. Se isso acontecer com frequência (principalmente em editais grandes/escaneados), considere migrar pra um plano com mais tempo de execução por function.'
    )), LIMITE_EXECUCAO_MS)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer!)
  }
}

async function realizarAnalise(supabase: Supa, edital: Anexo, tr: Anexo | undefined): Promise<{ analise: AnaliseResultado; provedor: string }> {
  const docs = [edital, tr].filter((d): d is Anexo => !!d)

  let genRes = await tentarAnaliseComGemini(supabase, docs, GEMINI_API_KEY)
  let provedor: 'gemini' | 'gemini-2' | 'mistral' = 'gemini'

  // 2º nível: se a 1ª chave bateu a cota diária OU o Gemini está
  // sobrecarregado (503 persistente mesmo após as tentativas de retry), e
  // existe uma 2ª chave configurada, tenta de novo com ela antes de
  // partir pro Mistral.
  if ((genRes.status === 429 || genRes.status >= 500) && GEMINI_API_KEY_2) {
    console.warn('[Analisar-oportunidade] 1ª chave do Gemini indisponível (cota esgotada ou sobrecarga) — tentando 2ª chave (projeto Google Cloud separado)...')
    genRes = await tentarAnaliseComGemini(supabase, docs, GEMINI_API_KEY_2)
    provedor = 'gemini-2'
  }

  let analise: AnaliseResultado

  // Chegar aqui ainda com 429/5xx significa: nenhuma chave do Gemini
  // configurada deu conta agora (cota esgotada ou sobrecarga persistente)
  // — 3º nível, tenta o mesmo edital via Mistral Document AI antes de
  // desistir de vez. É o que garante que as 3 alternativas configuradas
  // são de fato tentadas antes do erro subir pro usuário.
  if (genRes.status === 429 || genRes.status >= 500) {
    // Distingue as duas causas que fetchComRetry cobre com o mesmo "status
    // não-ok" (cota diária esgotada vs sobrecarga persistente) na mensagem
    // gravada — sem isso, o erro final (quando o Mistral também falha)
    // sempre dizia "cota esgotada ou sobrecarga" genérico, mesmo quando só
    // uma das duas era a causa real, tornando impossível saber qual das
    // duas aconteceu (inclusive pra quem for investigar depois, olhando só
    // a mensagem salva). As palavras usadas aqui batem de propósito com o
    // regex de mensagemAmigavelErroAnalise (src/lib/analiseEdital.ts), que
    // já sabia separar as duas mas nunca recebia o texto certo pra isso.
    const motivoGemini = genRes.status === 429
      ? 'cota diária esgotada (RESOURCE_EXHAUSTED/PerDay)'
      : `servidor sobrecarregado (HTTP ${genRes.status})`
    console.warn(`[Analisar-oportunidade] Gemini indisponível (${motivoGemini}) em todas as chaves configuradas — tentando fallback via Mistral Document AI...`)
    try {
      analise = await tentarFallbackMistral(supabase, edital)
      provedor = 'mistral'
    } catch (fallbackErr) {
      const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
      throw new Error(`Gemini indisponível (${motivoGemini}) em todas as chaves configuradas, e o fallback via Mistral também falhou: ${fallbackMsg}`, { cause: fallbackErr })
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
    try {
      analise = JSON.parse(textoResposta) as AnaliseResultado
    } catch (parseErr) {
      // Mesmo com texto não-vazio, a resposta pode vir com o JSON cortado
      // no meio (aspas/chave sem fechar) quando o finishReason é
      // MAX_TOKENS — a checagem acima só cobre o caso de texto totalmente
      // vazio. Sem isso, o erro que chegava ao usuário era o genérico do
      // JSON.parse ("Unterminated string..."), sem nenhuma pista real.
      if (genData.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
        throw new Error('A resposta do Gemini foi cortada por exceder o limite de tamanho (edital com muitos itens) — tente novamente ou reduza os anexos enviados')
      }
      const parseMsg = parseErr instanceof Error ? parseErr.message : String(parseErr)
      throw new Error(`Gemini retornou uma resposta em formato inválido: ${parseMsg}`)
    }
  }

  return { analise, provedor }
}

async function processarAnalise(supabase: Supa, analysisRowId: string, edital: Anexo, tr: Anexo | undefined) {
  const tInicio = Date.now()
  try {
    const { analise, provedor } = await comLimiteDeTempo(realizarAnalise(supabase, edital, tr))

    console.log(`[Analisar-oportunidade] Análise concluída via ${provedor} em ${Date.now() - tInicio}ms total.`)

    await supabase.from('opportunity_analysis').update({ status: 'concluido', analise, erro_mensagem: null, updated_at: new Date().toISOString() }).eq('id', analysisRowId)
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err)
    console.error(`Erro ao analisar oportunidade (segundo plano) após ${Date.now() - tInicio}ms:`, mensagem)
    await supabase.from('opportunity_analysis').update({ status: 'erro', erro_mensagem: mensagem, updated_at: new Date().toISOString() }).eq('id', analysisRowId)
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  try {
    const { opportunityId } = await req.json()
    if (!opportunityId) return json({ error: 'opportunityId é obrigatório' }, 400)

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

    let analysisRowId: string
    const { data: existente } = await supabase.from('opportunity_analysis').select('id').eq('opportunity_id', opportunityId).maybeSingle()
    if (existente) {
      await supabase.from('opportunity_analysis').update({ status: 'processando', erro_mensagem: null, updated_at: new Date().toISOString() }).eq('id', existente.id)
      analysisRowId = existente.id as string
    } else {
      const { data: novo, error: insertError } = await supabase
        .from('opportunity_analysis')
        .insert({ user_id: ownerId, opportunity_id: opportunityId, status: 'processando' })
        .select('id')
        .single()
      if (insertError) throw insertError
      analysisRowId = novo.id as string
    }

    // @ts-expect-error: EdgeRuntime é global no runtime do Supabase, não existe no lib.dom.d.ts do TypeScript
    EdgeRuntime.waitUntil(processarAnalise(supabase, analysisRowId, edital, tr))

    return json({ started: true })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err)
    console.error('Erro ao iniciar análise de oportunidade:', mensagem)
    return json({ success: false, error: mensagem }, 500)
  }
})
