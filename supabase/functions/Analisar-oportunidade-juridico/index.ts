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
// VARIÁVEIS DE AMBIENTE NECESSÁRIAS (Supabase → Edge Functions → Secrets):
// - GEMINI_API_KEY: a mesma chave já usada pelas outras functions de análise.
// - SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm injetadas
//   automaticamente pelo Supabase em toda Edge Function.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
// Alias oficial do Google que sempre aponta pro último release estável da
// família Flash — evita quebrar de novo quando uma versão fixa (ex:
// gemini-2.5-flash) for descontinuada, como aconteceu em jul/2026.
const GEMINI_MODEL = 'gemini-flash-latest'

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

// Upload em streaming pro Gemini Files API — idêntico ao usado em
// Analisar-oportunidade (o corpo da resposta do Storage é canalizado direto
// pro corpo da requisição de upload, sem materializar o arquivo inteiro em memória).
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
  if (!uploadRes.ok) throw new Error(`Falha ao enviar o edital pro Gemini: ${await uploadRes.text()}`)
  const uploaded = await uploadRes.json()

  let file = uploaded.file
  let tentativas = 0
  while (file.state === 'PROCESSING' && tentativas < 20) {
    await new Promise((r) => setTimeout(r, 2000))
    const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${GEMINI_API_KEY}`)
    file = await checkRes.json()
    tentativas++
  }
  if (file.state !== 'ACTIVE') throw new Error(`Arquivo não ficou pronto no Gemini (estado: ${file.state})`)

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
      ultimoErro = new Error(`HTTP ${res.status}: ${await res.text()}`)
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

async function apagarArquivoGemini(fileName: string) {
  try {
    await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_API_KEY}`, { method: 'DELETE' })
  } catch {
    // best-effort — o Gemini expira arquivos sozinho depois de um tempo
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  let analysisRowId: string | null = null

  try {
    const { opportunityId, tipo } = await req.json()
    if (!opportunityId) return json({ error: 'opportunityId é obrigatório' }, 400)
    if (!TIPOS_VALIDOS.includes(tipo)) return json({ error: `tipo deve ser um de: ${TIPOS_VALIDOS.join(', ')}` }, 400)

    const authHeader = req.headers.get('Authorization')
    const jwt = authHeader?.replace('Bearer ', '')
    if (!jwt) return json({ error: 'Não autenticado' }, 401)
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt)
    if (userError || !user) return json({ error: 'Não autenticado' }, 401)

    const { data: opportunity, error: opportunityError } = await supabase
      .from('opportunities')
      .select('id, user_id')
      .eq('id', opportunityId)
      .single()
    if (opportunityError || !opportunity) return json({ error: 'Oportunidade não encontrada' }, 404)
    if (opportunity.user_id !== user.id) return json({ error: 'Sem permissão para esta oportunidade' }, 403)

    const { data: edital, error: editalError } = await supabase
      .from('attached_files')
      .select('id, name, storage_path, mime_type, size_bytes')
      .eq('entity_type', 'oportunidade')
      .eq('entity_id', opportunityId)
      .eq('category', 'Edital')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (editalError || !edital) return json({ error: 'Nenhum edital enviado para esta oportunidade' }, 400)

    const { data: existente } = await supabase
      .from('opportunity_analysis_juridica')
      .select('id')
      .eq('opportunity_id', opportunityId)
      .eq('tipo', tipo)
      .maybeSingle()
    if (existente) {
      await supabase.from('opportunity_analysis_juridica').update({ status: 'processando', erro_mensagem: null }).eq('id', existente.id)
      analysisRowId = existente.id
    } else {
      const { data: novo, error: insertError } = await supabase
        .from('opportunity_analysis_juridica')
        .insert({ user_id: user.id, opportunity_id: opportunityId, tipo, status: 'processando' })
        .select('id')
        .single()
      if (insertError) throw insertError
      analysisRowId = novo.id
    }

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('client-documents')
      .createSignedUrl(edital.storage_path, 300)
    if (signedUrlError || !signedUrlData) throw new Error('Não foi possível gerar a URL do edital no Storage')

    const downloadRes = await fetch(signedUrlData.signedUrl)
    if (!downloadRes.ok || !downloadRes.body) throw new Error('Falha ao baixar o edital do Storage')

    const mimeType = edital.mime_type || 'application/pdf'
    const sizeBytes = edital.size_bytes ?? Number(downloadRes.headers.get('content-length') ?? 0)
    if (!sizeBytes) throw new Error('Não foi possível determinar o tamanho do arquivo')

    const geminiFile = await uploadParaGemini(downloadRes.body, sizeBytes, mimeType, edital.name)

    const genRes = await fetchComRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { file_data: { mime_type: mimeType, file_uri: geminiFile.uri } },
              { text: montarPrompt(tipo as Tipo) },
            ],
          }],
          generationConfig: {
            response_mime_type: 'application/json',
            response_schema: RESULTADO_SCHEMA,
          },
        }),
      }
    )

    apagarArquivoGemini(geminiFile.name) // não precisa esperar terminar

    if (!genRes.ok) throw new Error(`Falha ao analisar com Gemini: ${await genRes.text()}`)
    const genData = await genRes.json()
    const textoResposta = genData.candidates?.[0]?.content?.parts?.[0]?.text
    if (!textoResposta) throw new Error('Gemini não retornou conteúdo na análise')

    const resultado = JSON.parse(textoResposta)

    await supabase.from('opportunity_analysis_juridica').update({ status: 'concluido', resultado, erro_mensagem: null }).eq('id', analysisRowId)

    return json({ success: true })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err)
    console.error('Erro ao analisar oportunidade (jurídico):', mensagem)
    if (analysisRowId) {
      await supabase.from('opportunity_analysis_juridica').update({ status: 'erro', erro_mensagem: mensagem }).eq('id', analysisRowId)
    }
    return json({ success: false, error: mensagem }, 500)
  }
})
