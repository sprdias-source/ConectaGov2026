import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BROWSERLESS_URL = 'https://production-sfo.browserless.io'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_TENTATIVAS = 1

function buildDownloadCode(cnpjLimpo: string): string {
  return `
    export default async ({ page }) => {
      await page.goto('https://webapp1-vacaria.cidade360.cloud:8443/cidadao/servlet/br.com.cetil.ar.jvlle.hatendimento', {
        waitUntil: 'domcontentloaded',
        timeout: 50000,
      });
      await new Promise((r) => setTimeout(r, 1500));

      await page.evaluate(() => {
        Array.from(document.querySelectorAll('a')).find(a => a.textContent.includes('Emissão de Certidão'))?.click();
      });
      await new Promise((r) => setTimeout(r, 1500));

      await page.type("input[name='_CONTRIBUINTE']", '${cnpjLimpo}');

      await page.evaluate(() => {
        const s = document.querySelector('select[name=_FINALIDADE]');
        if (s) {
          s.value = Array.from(s.options).find(o => o.text.trim() === 'Certid\\u00e3o')?.value ?? s.options[1]?.value;
          s.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      await new Promise((r) => setTimeout(r, 500));

      await page.evaluate(() => { window.confirm = () => true; });
      await page.click("input[name='BTN_CONFIRMAR']");
      await new Promise((r) => setTimeout(r, 2500));

      await page.evaluate(() => {
        Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim() === 'Download')?.click();
      });
      await new Promise((r) => setTimeout(r, 6000));
    };
  `
}

async function tentarBuscarCNDMunicipal(cnpjLimpo: string, apiKey: string) {
  const code = buildDownloadCode(cnpjLimpo)

  const res = await fetch(`${BROWSERLESS_URL}/download?token=${apiKey}&timeout=60000&proxy=residential&proxyCountry=br&proxyPreset=px_gov01&proxySticky=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/javascript' },
    body: code,
    signal: AbortSignal.timeout(60000),
  })

  if (!res.ok) {
    const errorText = await res.text().catch(() => '')
    throw new Error(`Download error: ${res.status} ${errorText}`)
  }

  const arrayBuffer = await res.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)

  console.log('buscar-cnd-municipal-vacaria diagnóstico:', JSON.stringify({
    tamanhoBytes: bytes.length,
  }))

  const sucesso = bytes.length > 1000

  return { sucesso, bytes }
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
        // CORRIGIDO: era gravado 'cnd_municipal_vacaria' aqui mas o upsert
        // de client_documents (mais abaixo) usa 'cnd_municipal'.
        tipo: 'cnd_municipal',
        status,
        tentativa: tentativaLog || null,
        duracao_ms: Date.now() - inicio,
        erro: erro ? erro.slice(0, 500) : null,
      })
    } catch (logErr) {
      console.warn('buscar-cnd-municipal-vacaria: falha ao gravar log:', logErr)
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

    let resultado: { sucesso: boolean; bytes: Uint8Array } | null = null
    let ultimoErro: unknown = null

    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      tentativaLog = tentativa
      try {
        resultado = await tentarBuscarCNDMunicipal(cnpjLimpo, apiKey)
        if (resultado.sucesso) break
      } catch (err) {
        ultimoErro = err
        console.warn(`buscar-cnd-municipal-vacaria tentativa ${tentativa} deu erro: ${String(err)}`)
      }
    }

    if (!resultado || !resultado.sucesso) {
      throw new Error(
        `Não foi possível emitir a CND Municipal após ${MAX_TENTATIVAS} tentativa(s). ` +
        (ultimoErro ? `Último erro: ${String(ultimoErro)}` : 'Nenhum arquivo válido foi baixado.')
      )
    }

    const hoje = new Date()
    const validade = new Date(hoje); validade.setDate(validade.getDate() + 90)
    const dataEmissao = hoje.toISOString().split('T')[0]
    const dataValidade = validade.toISOString().split('T')[0]

    const path = `${user.id}/${clientId}/cnd_municipal_vacaria/cnd_municipal_${dataEmissao}.pdf`
    const { error: uploadError } = await supabase.storage.from('documents')
      .upload(path, resultado.bytes, { contentType: 'application/pdf', upsert: true })

    if (uploadError) throw new Error(`Erro ao salvar PDF: ${uploadError.message}`)

    await supabase.from('client_documents').upsert({
      user_id: user.id, client_id: clientId,
      // CORRIGIDO (10/07/2026): era 'cnd_municipal_vacaria', que não bate
      // com o DocumentTipo real ('cnd_municipal') — o documento nunca
      // aparecia certo no checklist por causa desse nome diferente.
      tipo: 'cnd_municipal',
      nome: 'CND Municipal — Prefeitura de Vacaria/RS',
      storage_path: path, data_emissao: dataEmissao, data_validade: dataValidade,
      status: 'valido', auto_renovavel: true,
    }, { onConflict: 'user_id,client_id,tipo' })

    await registrarLog('sucesso', null)

    return new Response(JSON.stringify({ success: true, dataEmissao, dataValidade, temPdf: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('buscar-cnd-municipal-vacaria error:', err)
    await registrarLog('erro', String(err))
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
