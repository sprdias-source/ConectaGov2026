import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BROWSERLESS_URL = 'https://production-sfo.browserless.io'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SESSION_TIMEOUT_SECONDS = 58
const MAX_TENTATIVAS = 1

function formatarCnpj(cnpjLimpo: string): string {
  return cnpjLimpo.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

function buildQuery(cnpjLimpo: string) {
  const cnpjFormatado = formatarCnpj(cnpjLimpo)
  return `
    mutation BuscarCartaoCNPJ {
      goto(url: "https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/", waitUntil: domContentLoaded, timeout: 15000) {
        status
      }

      waitAfterGoto: waitForTimeout(time: 1500) {
        time
      }

      type(selector: "div#alert-cnpj input[type='text']", text: "${cnpjFormatado}") {
        time
      }

      waitAfterType: waitForTimeout(time: 800) {
        time
      }

      solve(type: hcaptcha, timeout: 38000) {
        found
        solved
        time
      }

      click(selector: "button.btn.btn-primary") {
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

async function chamarBrowserless(query: string, apiKey: string) {
  const res = await fetch(
    `${BROWSERLESS_URL}/stealth/bql?token=${apiKey}&timeout=${SESSION_TIMEOUT_SECONDS * 1000}&humanlike=true&blockConsentModals=true`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(SESSION_TIMEOUT_SECONDS * 1000 + 10000),
    }
  )
  if (!res.ok) throw new Error(`BrowserQL error: ${await res.text()}`)
  const data = await res.json()
  const errors = data?.errors
  if (errors?.length) console.warn('buscar-cnpj-cartao aviso do BrowserQL:', JSON.stringify(errors))
  return data
}

async function tentarBuscarCartaoCNPJ(cnpjLimpo: string, apiKey: string) {
  const data = await chamarBrowserless(buildQuery(cnpjLimpo), apiKey)

  const captchaResolvido = data?.data?.solve?.solved === true
  const pageText: string = data?.data?.text?.text ?? ''
  const pdfBase64: string | null = data?.data?.pdf?.base64 ?? null

  const cnpjNaoEncontrado = pageText.toLowerCase().includes('não foi encontrado') ||
    pageText.toLowerCase().includes('cnpj inválido') ||
    pageText.toLowerCase().includes('não consta')
  const aindaMostrandoFormularioVazio = pageText.includes('Digite o número de CNPJ') && !pdfBase64

  const sucesso = captchaResolvido && !!pdfBase64 && !cnpjNaoEncontrado && !aindaMostrandoFormularioVazio

  console.log('buscar-cnpj-cartao diagnóstico:', JSON.stringify({
    solveFound: data?.data?.solve?.found,
    solveSolved: data?.data?.solve?.solved,
    solveTime: data?.data?.solve?.time,
    temPdf: !!pdfBase64,
    cnpjNaoEncontrado,
    aindaMostrandoFormularioVazio,
    inicioDoTextoDaPagina: pageText.slice(0, 400),
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
        tipo: 'cnpj_cartao',
        status,
        tentativa: tentativaLog || null,
        duracao_ms: Date.now() - inicio,
        erro: erro ? erro.slice(0, 500) : null,
      })
    } catch (logErr) {
      console.warn('buscar-cnpj-cartao: falha ao gravar log:', logErr)
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const authHeader = req.headers.get('Authorization')!
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    supabaseLog = supabase
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) throw new Error('Não autenticado')
    userIdLog = user.id

    let resultado: { sucesso: boolean; pageText: string; pdfBase64: string | null } | null = null
    let ultimoErro: unknown = null

    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      tentativaLog = tentativa
      try {
        resultado = await tentarBuscarCartaoCNPJ(cnpjLimpo, apiKey)
        if (resultado.sucesso) break
      } catch (err) {
        ultimoErro = err
        console.warn(`buscar-cnpj-cartao tentativa ${tentativa} deu erro: ${String(err)}`)
      }
    }

    if (!resultado || !resultado.sucesso) {
      throw new Error(
        `Não foi possível emitir o Cartão CNPJ após ${MAX_TENTATIVAS} tentativa(s). ` +
        (ultimoErro ? `Último erro: ${String(ultimoErro)}` : 'A página não retornou o comprovante esperado.')
      )
    }

    const { pdfBase64 } = resultado

    const hoje = new Date()
    const validade = new Date(hoje); validade.setDate(validade.getDate() + 60)
    const dataEmissao = hoje.toISOString().split('T')[0]
    const dataValidade = validade.toISOString().split('T')[0]

    let storagePath = null
    if (pdfBase64) {
      const bytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0))
      const path = `${user.id}/${clientId}/cnpj_cartao/cnpj_cartao_${dataEmissao}.pdf`
      const { error } = await supabase.storage.from('documents')
        .upload(path, bytes, { contentType: 'application/pdf', upsert: true })
      if (!error) storagePath = path
    }

    await supabase.from('client_documents').upsert({
      user_id: user.id, client_id: clientId, tipo: 'cnpj_cartao',
      nome: 'Cartão CNPJ — Comprovante de Inscrição e Situação Cadastral',
      storage_path: storagePath, data_emissao: dataEmissao, data_validade: dataValidade,
      status: 'valido', auto_renovavel: true,
    }, { onConflict: 'user_id,client_id,tipo' })

    await registrarLog('sucesso', null)

    return new Response(JSON.stringify({ success: true, dataEmissao, dataValidade, temPdf: !!storagePath }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('buscar-cnpj-cartao error:', err)
    await registrarLog('erro', String(err))
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
