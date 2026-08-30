import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BROWSERLESS_URL = 'https://production-sfo.browserless.io'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { cnpj, clientId } = await req.json()
    if (!cnpj || !clientId) {
      return new Response(JSON.stringify({ error: 'cnpj e clientId são obrigatórios' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    const cnpjLimpo = cnpj.replace(/\D/g, '')
    const apiKey = Deno.env.get('BROWSERLESS_API_KEY')!

    // Autentica ANTES de gastar uma sessão paga do Browserless — antes essa
    // checagem só acontecia depois da busca já ter rodado, então qualquer
    // pessoa (mesmo sem login) que descobrisse a URL desta function
    // conseguia disparar sessões pagas repetidamente, sem nunca precisar
    // estar autenticada.
    const authHeader = req.headers.get('Authorization')!
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) throw new Error('Não autenticado')

    // Compara com o DONO da conta (owner_efetivo), não com quem está
    // logado — client_documents.user_id (e o caminho no Storage) sempre
    // usam o dono, já que clients.user_id também é sempre o dono.
    const { data: ownerId, error: ownerError } = await supabase.rpc('owner_efetivo', { usuario_id: user.id })
    if (ownerError || !ownerId) throw new Error('Não foi possível identificar a conta do usuário')

    // Confirma que o cliente pertence à conta de quem chamou (respeita
    // RLS) antes de gastar uma sessão paga do Browserless.
    const { data: clienteExiste, error: clienteError } = await supabase
      .from('clients').select('id').eq('id', clientId).single()
    if (clienteError || !clienteExiste) throw new Error('Cliente não encontrado ou sem permissão de acesso')

    const query = `
      mutation BuscarFGTS {
        goto(url: "https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf", waitUntil: networkIdle) {
          status
        }

        type(selector: "input[id*='cnpj'], input[id*='CNPJ']", text: "${cnpjLimpo}") {
          time
        }

        solveImageCaptcha(
          captchaSelector: "img[id*='captcha'], img[src*='captcha']"
          inputSelector: "input[id*='captcha'], input[name*='captcha']"
          timeout: 30000
        ) {
          found
          solved
          time
        }

        click(selector: "input[type='submit'], button[type='submit'], input[value*='Consultar']") {
          time
        }

        waitForNavigation(waitUntil: networkIdle, timeout: 30000) {
          status
        }

        pdf(fullPage: true) {
          base64
        }

        text(selector: "body") {
          text
        }
      }
    `

    const res = await fetch(`${BROWSERLESS_URL}/chromium/bql?token=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })

    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()
    const pageText: string = data?.data?.text?.text ?? ''
    const pdfBase64: string | null = data?.data?.pdf?.base64 ?? null
    const irregular = pageText.toLowerCase().includes('irregular')

    if (irregular) {
      return new Response(JSON.stringify({
        error: 'CRF FGTS IRREGULAR — o CNPJ possui pendências junto à Caixa Econômica Federal.',
        irregular: true,
      }), { status: 422, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const hoje = new Date()
    const validade = new Date(hoje); validade.setDate(validade.getDate() + 30)
    const dataEmissao = hoje.toISOString().split('T')[0]
    const dataValidade = validade.toISOString().split('T')[0]

    let storagePath = null
    if (pdfBase64) {
      const bytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0))
      const path = `${ownerId}/${clientId}/fgts/crf_fgts_${dataEmissao}.pdf`
      const { error } = await supabase.storage.from('client-documents')
        .upload(path, bytes, { contentType: 'application/pdf', upsert: true })
      if (!error) storagePath = path
    }

    await supabase.from('client_documents').upsert({
      user_id: ownerId, client_id: clientId, tipo: 'fgts',
      nome: 'CRF — Certificado de Regularidade do FGTS (Caixa)',
      storage_path: storagePath, data_emissao: dataEmissao, data_validade: dataValidade,
      status: 'valido', auto_renovavel: true,
    }, { onConflict: 'user_id,client_id,tipo' })

    return new Response(JSON.stringify({ success: true, dataEmissao, dataValidade }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
