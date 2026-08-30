import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BROWSERLESS_URL = 'https://production-sfo.browserless.io'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SESSION_TIMEOUT_SECONDS = 58
const MAX_TENTATIVAS = 1

function buildQuery(cnpjLimpo: string) {
  return `
    mutation BuscarCNDFederal {
      goto(url: "https://servicos.receitafederal.gov.br/servico/certidoes/#/home/cnpj", waitUntil: domContentLoaded, timeout: 15000) {
        status
      }

      waitAfterGoto: waitForTimeout(time: 1200) {
        time
      }

      aceitarCookies: evaluate(content: "Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Aceitar')?.click()") {
        time
      }

      waitAfterCookies: waitForTimeout(time: 700) {
        time
      }

      type(selector: "input[name='niContribuinte']", text: "${cnpjLimpo}") {
        time
      }

      waitAfterType: waitForTimeout(time: 800) {
        time
      }

      fecharPopupCertidaoExistente: evaluate(content: "Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().includes('Emitir Nova Certidão'))?.click()") {
        time
      }

      waitAfterPopup: waitForTimeout(time: 700) {
        time
      }

      solve(type: hcaptcha, timeout: 25000) {
        found
        solved
        time
      }

      click(selector: "button[type='submit']") {
        time
      }

      waitAfterClick: waitForTimeout(time: 5000) {
        time
      }

      pdf(fullPage: true) {
        base64
      }

      text(selector: "body") {
        text
      }
    }
  `
}

async function tentarBuscarCNDFederal(cnpjLimpo: string, apiKey: string) {
  const query = buildQuery(cnpjLimpo)

  const res = await fetch(
    `${BROWSERLESS_URL}/stealth/bql?token=${apiKey}&timeout=${SESSION_TIMEOUT_SECONDS * 1000}&humanlike=true&blockConsentModals=true&proxy=residential&proxyCountry=br&proxyPreset=px_gov01&proxySticky=true`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(SESSION_TIMEOUT_SECONDS * 1000 + 5000),
    }
  )

  if (!res.ok) throw new Error(`BrowserQL error: ${await res.text()}`)

  const data = await res.json()
  const errors = data?.errors
  if (errors?.length) {
    console.warn('buscar-cnd-federal aviso do BrowserQL:', JSON.stringify(errors))
  }

  const captchaResolvido = data?.data?.solve?.solved === true
  const pageText: string = data?.data?.text?.text ?? ''
  const pdfBase64: string | null = data?.data?.pdf?.base64 ?? null

  const aindaCarregando = pageText.includes('Carregando') && !pdfBase64
  const voltouParaFormularioVazio = pageText.includes('CNPJ') && pageText.includes('Emitir Certidão') && !pdfBase64 && !captchaResolvido

  const sucesso = captchaResolvido && !aindaCarregando && !voltouParaFormularioVazio

  console.log('buscar-cnd-federal diagnóstico:', JSON.stringify({
    solveFound: data?.data?.solve?.found,
    solveSolved: data?.data?.solve?.solved,
    solveTime: data?.data?.solve?.time,
    temPdf: !!pdfBase64,
    aindaCarregando,
    voltouParaFormularioVazio,
    inicioDoTextoDaPagina: pageText.slice(0, 300),
  }))

  return { sucesso, pageText, pdfBase64 }
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
        tipo: 'cnd_federal',
        status,
        tentativa: tentativaLog || null,
        duracao_ms: Date.now() - inicio,
        erro: erro ? erro.slice(0, 500) : null,
      })
    } catch (logErr) {
      console.warn('buscar-cnd-federal: falha ao gravar log:', logErr)
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

    // Cria o cliente Supabase (e autentica) já no início, pra poder logar
    // mesmo em caso de falha na busca em si.
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
    // usam o dono, já que clients.user_id também é sempre o dono. Sem
    // isso, um membro de equipe rodando esta busca gravaria o documento
    // com o próprio ID em vez do dono, e ele nunca apareceria em nenhuma
    // tela que filtra os documentos do cliente pelo dono da conta.
    const { data: ownerId, error: ownerError } = await supabase.rpc('owner_efetivo', { usuario_id: user.id })
    if (ownerError || !ownerId) throw new Error('Não foi possível identificar a conta do usuário')
    userIdLog = ownerId as string

    let resultado: { sucesso: boolean; pageText: string; pdfBase64: string | null } | null = null
    let ultimoErro: unknown = null

    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      tentativaLog = tentativa
      try {
        resultado = await tentarBuscarCNDFederal(cnpjLimpo, apiKey)
        if (resultado.sucesso) break
        console.warn(`buscar-cnd-federal tentativa ${tentativa} falhou (captcha/carregando), tentando de novo...`)
      } catch (err) {
        ultimoErro = err
        console.warn(`buscar-cnd-federal tentativa ${tentativa} deu erro: ${String(err)}`)
      }
    }

    if (!resultado || !resultado.sucesso) {
      // Não loga aqui — o catch geral no final da function já grava o log.
      throw new Error(
        `Não foi possível resolver o captcha/emitir a certidão após ${MAX_TENTATIVAS} tentativas. ` +
        (ultimoErro ? `Último erro: ${String(ultimoErro)}` : 'A página não terminou de carregar o resultado.')
      )
    }

    const { pageText, pdfBase64 } = resultado
    const isPositiva = pageText.toLowerCase().includes('positiva') && !pageText.toLowerCase().includes('negativa')
    const isNegativa = pageText.toLowerCase().includes('negativa') || !!pdfBase64

    if (isPositiva && !isNegativa) {
      await registrarLog('erro', 'CND Federal positiva (débitos com Receita/PGFN)')
      return new Response(JSON.stringify({
        error: 'CND Federal POSITIVA — o CNPJ possui débitos com a Receita/PGFN. Regularize antes de participar da licitação.',
        positiva: true,
      }), { status: 422, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const hoje = new Date()
    const validade = new Date(hoje); validade.setDate(validade.getDate() + 180)
    const dataEmissao = hoje.toISOString().split('T')[0]
    const dataValidade = validade.toISOString().split('T')[0]

    let storagePath = null
    if (pdfBase64) {
      const bytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0))
      const path = `${ownerId}/${clientId}/cnd_federal/cnd_federal_${dataEmissao}.pdf`
      const { error } = await supabase.storage.from('documents')
        .upload(path, bytes, { contentType: 'application/pdf', upsert: true })
      if (!error) storagePath = path
    }

    await supabase.from('client_documents').upsert({
      user_id: ownerId, client_id: clientId, tipo: 'cnd_federal',
      nome: 'CND Federal — Receita Federal + PGFN',
      storage_path: storagePath, data_emissao: dataEmissao, data_validade: dataValidade,
      status: 'valido', auto_renovavel: true,
    }, { onConflict: 'user_id,client_id,tipo' })

    await registrarLog('sucesso', null)

    return new Response(JSON.stringify({ success: true, dataEmissao, dataValidade, temPdf: !!storagePath }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('buscar-cnd-federal error:', err)
    await registrarLog('erro', String(err))
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
