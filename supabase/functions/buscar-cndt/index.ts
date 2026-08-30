import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BROWSERLESS_URL = 'https://production-sfo.browserless.io'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Duração máxima que damos pra sessão do navegador remoto (Browserless).
// NÃO é um teto travado do plano Free — isso era um entendimento errado
// anterior. O suporte do Browserless confirmou (06/07/2026) que os 408 eram
// causados por passar o parâmetro `timeout` em segundos quando a API espera
// MILISSEGUNDOS. Esse valor aqui pode ser testado/ajustado pra cima se
// precisar de mais tempo (ex: pro modo manual, que espera o usuário digitar).
const SESSION_TIMEOUT_SECONDS = 60
const MAX_TENTATIVAS = 3

// Quanto tempo (em ms) o usuário tem, DENTRO da mesma sessão de 60s do
// Browserless, pra digitar o captcha depois que a imagem aparece na tela.
// Ajuste com cuidado: o resto do fluxo (goto, preencher CNPJ, clicar em
// emitir, esperar o AJAX, gerar o PDF) já consome uns 8-10s sozinho.
const POLL_TIMEOUT_MS = 30000
const POLL_INTERVAL_MS = 1500

// =====================================================================
// MODO AUTOMÁTICO (como já era) — o próprio Browserless resolve o captcha
// via OCR (solveImageCaptcha). Mantido sem alterações.
// =====================================================================
function buildQueryAuto(cnpjLimpo: string) {
  return `
    mutation BuscarCNDT {
      goto(url: "https://cndt-certidao.tst.jus.br/gerarCertidao.faces", waitUntil: domContentLoaded, timeout: 15000) {
        status
      }

      waitAfterGoto: waitForTimeout(time: 2000) {
        time
      }

      type(selector: "input[name='gerarCertidaoForm:cpfCnpj']", text: "${cnpjLimpo}") {
        time
      }

      waitBeforeCaptcha: waitForTimeout(time: 2000) {
        time
      }

      solveImageCaptcha(
        captchaSelector: "img#idImgBase64"
        inputSelector: "input#idCampoResposta"
        timeout: 20000
      ) {
        found
        solved
        time
      }

      click(selector: "input[value='Emitir Certidão'], input[type='submit']") {
        time
      }

      waitAfterClick: waitForTimeout(time: 3000) {
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

// =====================================================================
// MODO MANUAL (híbrido) — a página captura a imagem do captcha e a publica
// no Supabase (via fetch de dentro do próprio navegador remoto), fica em
// loop esperando o usuário responder pela tela do ConectaGov, e só então
// continua o preenchimento. Tudo isso acontece DENTRO da mesma sessão do
// Browserless (sem reconnect, que é recurso pago) — por isso o polling é
// feito em JavaScript rodando na própria página, não em duas chamadas
// separadas de Edge Function.
// =====================================================================
function buildQueryManual(
  cnpjLimpo: string,
  sessionId: string,
  supabaseUrl: string,
  anonKey: string,
  userAccessToken: string
) {
  // JS que roda DENTRO da página do TST. Publica a imagem do captcha
  // (lida do próprio <img id="idImgBase64">) na tabela captcha_sessions.
  const publicarCaptchaJs = `
    (async () => {
      const img = document.querySelector('img#idImgBase64');
      const src = img ? img.src : null;
      if (!src) return { publicado: false };
      const resp = await fetch('${supabaseUrl}/rest/v1/captcha_sessions?id=eq.${sessionId}', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': '${anonKey}',
          'Authorization': 'Bearer ${userAccessToken}',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ imagem_base64: src }),
      });
      return { publicado: resp.ok };
    })()
  `

  // JS que fica em loop consultando a MESMA linha até o usuário responder
  // pela tela do ConectaGov, e — assim que a resposta chega — já digita ela
  // no campo do captcha e clica em "Emitir", tudo dentro do MESMO bloco.
  // Isso é proposital: o BQL não permite usar o resultado de um passo como
  // argumento de outro passo dentro da mesma query, então espera+digitação+
  // clique precisam acontecer juntos aqui dentro, em JavaScript puro.
  const esperarEDigitarJs = `
    (async () => {
      const deadline = Date.now() + ${POLL_TIMEOUT_MS};
      let resposta = null;
      while (Date.now() < deadline) {
        const resp = await fetch('${supabaseUrl}/rest/v1/captcha_sessions?id=eq.${sessionId}&select=status,resposta', {
          headers: {
            'apikey': '${anonKey}',
            'Authorization': 'Bearer ${userAccessToken}',
          },
        });
        const rows = await resp.json();
        const row = rows && rows[0];
        if (row && row.status === 'respondida' && row.resposta) {
          resposta = row.resposta;
          break;
        }
        await new Promise((r) => setTimeout(r, ${POLL_INTERVAL_MS}));
      }
      if (!resposta) return { expirou: true };

      const input = document.querySelector('input#idCampoResposta');
      if (!input) return { expirou: false, erro: 'campo do captcha não encontrado' };
      input.value = resposta;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      const botao = document.querySelector("input[value='Emitir Certidão'], input[type='submit']");
      if (!botao) return { expirou: false, erro: 'botão de emitir não encontrado' };
      botao.click();

      return { expirou: false };
    })()
  `

  return `
    mutation BuscarCNDTManual {
      goto(url: "https://cndt-certidao.tst.jus.br/gerarCertidao.faces", waitUntil: domContentLoaded, timeout: 15000) {
        status
      }

      waitAfterGoto: waitForTimeout(time: 1500) {
        time
      }

      type(selector: "input[name='gerarCertidaoForm:cpfCnpj']", text: "${cnpjLimpo}") {
        time
      }

      waitBeforeCaptcha: waitForTimeout(time: 1000) {
        time
      }

      publicarCaptcha: evaluate(content: ${JSON.stringify(publicarCaptchaJs)}) {
        value
      }

      esperarEDigitar: evaluate(content: ${JSON.stringify(esperarEDigitarJs)}, timeout: ${POLL_TIMEOUT_MS + 5000}) {
        value
      }

      waitAfterClick: waitForTimeout(time: 3000) {
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
  // ATENÇÃO: o parâmetro `timeout` na URL do Browserless é em MILISSEGUNDOS,
  // não em segundos. Esse era o bug real por trás dos 408 (confirmado pelo
  // suporte em 06/07/2026) — passar `timeout=60` fazia a sessão morrer em
  // ~60ms, antes até da página carregar. Por isso aqui multiplicamos por 1000.
  const res = await fetch(
    `${BROWSERLESS_URL}/chromium/bql?token=${apiKey}&timeout=${SESSION_TIMEOUT_SECONDS * 1000}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(SESSION_TIMEOUT_SECONDS * 1000 + POLL_TIMEOUT_MS + 10000),
    }
  )
  if (!res.ok) throw new Error(`BrowserQL error: ${await res.text()}`)
  const data = await res.json()
  const errors = data?.errors
  if (errors?.length) console.warn('buscar-cndt aviso do BrowserQL:', JSON.stringify(errors))
  return data
}

async function tentarBuscarCNDTAuto(cnpjLimpo: string, apiKey: string) {
  const data = await chamarBrowserless(buildQueryAuto(cnpjLimpo), apiKey)
  const captchaResolvido = data?.data?.solveImageCaptcha?.solved === true
  const pageText: string = data?.data?.text?.text ?? ''
  const pdfBase64: string | null = data?.data?.pdf?.base64 ?? null
  const voltouParaFormularioVazio = pageText.includes('Informe o número do CNPJ') && !pdfBase64
  const sucesso = captchaResolvido && !voltouParaFormularioVazio
  return { sucesso, pageText, pdfBase64 }
}

async function tentarBuscarCNDTManual(
  cnpjLimpo: string,
  apiKey: string,
  sessionId: string,
  supabaseUrl: string,
  anonKey: string,
  userAccessToken: string
) {
  const query = buildQueryManual(cnpjLimpo, sessionId, supabaseUrl, anonKey, userAccessToken)
  const data = await chamarBrowserless(query, apiKey)

  const resultadoEspera = data?.data?.esperarEDigitar?.value
  if (!resultadoEspera || resultadoEspera.expirou) {
    return { sucesso: false, expirou: true, pageText: '', pdfBase64: null }
  }
  if (resultadoEspera.erro) {
    return { sucesso: false, expirou: false, pageText: resultadoEspera.erro, pdfBase64: null }
  }

  const pageText: string = data?.data?.text?.text ?? ''
  const pdfBase64: string | null = data?.data?.pdf?.base64 ?? null
  const voltouParaFormularioVazio = pageText.includes('Informe o número do CNPJ') && !pdfBase64
  const sucesso = !voltouParaFormularioVazio && !!pdfBase64

  return { sucesso, expirou: false, pageText, pdfBase64 }
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
        tipo: 'cndt',
        status,
        tentativa: tentativaLog || null,
        duracao_ms: Date.now() - inicio,
        erro: erro ? erro.slice(0, 500) : null,
      })
    } catch (logErr) {
      console.warn('buscar-cndt: falha ao gravar log:', logErr)
    }
  }

  try {
    const { cnpj, clientId, modo, sessionId: sessionIdRecebido } = await req.json()
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
    // auth.getUser() SEM argumento espera uma sessão salva (que não existe
    // dentro de uma Edge Function) e sempre retorna null nesse contexto —
    // por isso é preciso passar o token explicitamente aqui.
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) throw new Error('Não autenticado')
    userIdLog = user.id

    let resultado: { sucesso: boolean; pageText: string; pdfBase64: string | null } | null = null
    let ultimoErro: unknown = null

    if (modo === 'manual') {
      tentativaLog = 1
      // Extrai o token puro (sem "Bearer ") pra reusar dentro do JS que roda
      // no navegador remoto.
      const userAccessToken = authHeader.replace(/^Bearer\s+/i, '')

      const expiraEm = new Date(Date.now() + POLL_TIMEOUT_MS + 5000).toISOString()
      const linhaNova: Record<string, unknown> = {
        user_id: user.id,
        client_id: clientId,
        tipo: 'cndt',
        imagem_base64: '',
        status: 'aguardando',
        expira_em: expiraEm,
      }
      // Se o frontend já gerou um id (pra poder se inscrever no Realtime
      // ANTES de chamar a function, evitando perder o evento de UPDATE),
      // reaproveita ele. Senão, deixa o banco gerar um novo.
      if (sessionIdRecebido) linhaNova.id = sessionIdRecebido

      const { data: sessao, error: erroSessao } = await supabase
        .from('captcha_sessions')
        .insert(linhaNova)
        .select('id')
        .single()

      if (erroSessao || !sessao) throw new Error('Não foi possível criar a sessão de captcha manual')

      try {
        const r = await tentarBuscarCNDTManual(
          cnpjLimpo, apiKey, sessao.id, supabaseUrl, anonKey, userAccessToken
        )
        if (r.expirou) {
          await supabase.from('captcha_sessions').update({ status: 'expirada' }).eq('id', sessao.id)
          await registrarLog('erro', 'Tempo esgotado para digitar o captcha (modo manual)')
          return new Response(JSON.stringify({
            error: 'Tempo esgotado para digitar o captcha. Tente novamente.',
            expirou: true,
          }), { status: 408, headers: { ...CORS, 'Content-Type': 'application/json' } })
        }
        await supabase.from('captcha_sessions').update({ status: 'usada' }).eq('id', sessao.id)
        resultado = r
      } catch (err) {
        ultimoErro = err
        await supabase.from('captcha_sessions').update({ status: 'expirada' }).eq('id', sessao.id)
      }
    } else {
      for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
        tentativaLog = tentativa
        try {
          resultado = await tentarBuscarCNDTAuto(cnpjLimpo, apiKey)
          if (resultado.sucesso) break
          console.warn(`buscar-cndt tentativa ${tentativa} falhou (captcha/submissão), tentando de novo...`)
        } catch (err) {
          ultimoErro = err
          console.warn(`buscar-cndt tentativa ${tentativa} deu erro: ${String(err)}`)
        }
      }
    }

    if (!resultado || !resultado.sucesso) {
      // Não loga aqui — o catch geral no final da function já grava o log
      // de erro pra qualquer exceção lançada, evitando registro duplicado.
      throw new Error(
        `Não foi possível resolver o captcha/emitir a certidão. ` +
        (ultimoErro ? `Último erro: ${String(ultimoErro)}` : 'O portal do TST retornou ao formulário vazio.')
      )
    }

    const { pageText, pdfBase64 } = resultado
    const isPositiva = pageText.toLowerCase().includes('positiva')
    const isNegativa = pageText.toLowerCase().includes('negativa') || !!pdfBase64

    if (isPositiva && !isNegativa) {
      await registrarLog('erro', 'CNDT positiva (débitos trabalhistas)')
      return new Response(JSON.stringify({
        error: 'CNDT POSITIVA — o CNPJ possui débitos trabalhistas. Regularize antes de participar da licitação.',
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
      const path = `${user.id}/${clientId}/cndt/cndt_${dataEmissao}.pdf`
      const { error } = await supabase.storage.from('documents')
        .upload(path, bytes, { contentType: 'application/pdf', upsert: true })
      if (!error) storagePath = path
    }

    await supabase.from('client_documents').upsert({
      user_id: user.id, client_id: clientId, tipo: 'cndt',
      nome: 'CNDT — Certidão Negativa de Débitos Trabalhistas (TST)',
      storage_path: storagePath, data_emissao: dataEmissao, data_validade: dataValidade,
      status: 'valido', auto_renovavel: true,
    }, { onConflict: 'user_id,client_id,tipo' })

    await registrarLog('sucesso', null)

    return new Response(JSON.stringify({ success: true, dataEmissao, dataValidade, temPdf: !!storagePath }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('buscar-cndt error:', err)
    await registrarLog('erro', String(err))
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
