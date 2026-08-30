import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BROWSERLESS_URL = 'https://production-sfo.browserless.io'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_TENTATIVAS = 3

function buildDownloadCode(cnpjLimpo: string): string {
  return `
    export default async ({ page }) => {
      await page.goto('https://www.sefaz.rs.gov.br/sat/CertidaoSitFiscalSolic.aspx', {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      await new Promise((r) => setTimeout(r, 2000));
      await page.type("input[name='campoCnpj']", '${cnpjLimpo}');
      await page.click("#altcha input[type='checkbox']");
      await page.waitForSelector("div.altcha[data-state='verified']", { timeout: 15000 });
      await page.click('input#btnEnviar');
      await new Promise((r) => setTimeout(r, 8000));
    };
  `
}

async function tentarBuscarCNDEstadualRS(cnpjLimpo: string, apiKey: string) {
  const code = buildDownloadCode(cnpjLimpo)

  const res = await fetch(`${BROWSERLESS_URL}/download?token=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/javascript' },
    body: code,
    signal: AbortSignal.timeout(45000),
  })

  if (!res.ok) {
    const errorText = await res.text().catch(() => '')
    throw new Error(`Download error: ${res.status} ${errorText}`)
  }

  const arrayBuffer = await res.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)

  const pareceValido = bytes.length > 5000

  return { sucesso: pareceValido, bytes }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // ---- Instrumentação de log (document_logs) ----
  const inicio = Date.now()
  let supabaseLog: ReturnType<typeof createClient> | null = null
  let userIdLog: string | null = null
  let clientIdLog: string | null = null
  let tentativaLog = 0

  async function registrarLog(status: 'sucesso' | 'erro', erro: string | null) {
    if (!supabaseLog || !userIdLog || !clientIdLog) return
    try {
      await supabaseLog.from('document_logs').insert({
        user_id: userIdLog,
        client_id: clientIdLog,
        tipo: 'cnd_estadual_rs',
        status,
        tentativa: tentativaLog || null,
        duracao_ms: Date.now() - inicio,
        erro: erro ? erro.slice(0, 500) : null,
      })
    } catch (logErr) {
      console.warn('buscar-cnd-estadual-rs: falha ao gravar log:', logErr)
    }
  }

  try {
    const { cnpj, clientId } = await req.json()
    clientIdLog = clientId ?? null
    if (!cnpj || !clientId) {
      return new Response(JSON.stringify({ error: 'cnpj e clientId são obrigatórios' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const cnpjLimpo = cnpj.replace(/\D/g, '')
    const apiKey = Deno.env.get('BROWSERLESS_API_KEY')!

    const authHeader = req.headers.get('Authorization')!
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    supabaseLog = supabase
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) throw new Error('Não autenticado')

    // Compara com o DONO da conta (owner_efetivo), não com quem está
    // logado — client_documents.user_id (e o caminho no Storage) sempre
    // usam o dono, já que clients.user_id também é sempre o dono.
    const { data: ownerId, error: ownerError } = await supabase.rpc('owner_efetivo', { usuario_id: user.id })
    if (ownerError || !ownerId) throw new Error('Não foi possível identificar a conta do usuário')
    userIdLog = ownerId as string

    // Confirma que o cliente pertence à conta de quem chamou (respeita
    // RLS) antes de gastar uma sessão paga do Browserless.
    const { data: clienteExiste, error: clienteError } = await supabase
      .from('clients').select('id').eq('id', clientId).single()
    if (clienteError || !clienteExiste) throw new Error('Cliente não encontrado ou sem permissão de acesso')

    let resultado: { sucesso: boolean; bytes: Uint8Array } | null = null
    let ultimoErro: unknown = null

    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      tentativaLog = tentativa
      try {
        resultado = await tentarBuscarCNDEstadualRS(cnpjLimpo, apiKey)
        if (resultado.sucesso) break
        console.warn(`buscar-cnd-estadual-rs tentativa ${tentativa} falhou (arquivo inválido/pequeno demais), tentando de novo...`)
      } catch (err) {
        ultimoErro = err
        console.warn(`buscar-cnd-estadual-rs tentativa ${tentativa} deu erro: ${String(err)}`)
      }
    }

    if (!resultado || !resultado.sucesso) {
      throw new Error(
        `Não foi possível baixar a certidão após ${MAX_TENTATIVAS} tentativas. ` +
        (ultimoErro ? `Último erro: ${String(ultimoErro)}` : 'O arquivo retornado não parecia válido.')
      )
    }

    const { bytes } = resultado

    const hoje = new Date()
    const validade = new Date(hoje); validade.setDate(validade.getDate() + 90)
    const dataEmissao = hoje.toISOString().split('T')[0]
    const dataValidade = validade.toISOString().split('T')[0]

    const path = `${ownerId}/${clientId}/cnd_estadual_rs/cnd_estadual_rs_${dataEmissao}.pdf`
    const { error: uploadError } = await supabase.storage.from('documents')
      .upload(path, bytes, { contentType: 'application/pdf', upsert: true })

    if (uploadError) throw new Error(`Erro ao salvar PDF: ${uploadError.message}`)

    await supabase.from('client_documents').upsert({
      user_id: ownerId, client_id: clientId, tipo: 'cnd_estadual_rs',
      nome: 'CND Estadual RS — SEFAZ-RS',
      storage_path: path, data_emissao: dataEmissao, data_validade: dataValidade,
      status: 'valido', auto_renovavel: true,
    }, { onConflict: 'user_id,client_id,tipo' })

    await registrarLog('sucesso', null)

    return new Response(JSON.stringify({ success: true, dataEmissao, dataValidade, temPdf: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('buscar-cnd-estadual-rs error:', err)
    await registrarLog('erro', String(err))
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
