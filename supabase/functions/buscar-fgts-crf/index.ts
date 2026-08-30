import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BROWSERLESS_URL = 'https://production-sfo.browserless.io'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function buildFunctionCode(cnpjLimpo: string): string {
  return `
    export default async ({ page }) => {
      const cnpj = ${JSON.stringify(cnpjLimpo)};
      let tituloInicial = '';
      let textoInicial = '';

      try {
        await page.goto('https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf', {
          waitUntil: 'domcontentloaded',
          timeout: 50000,
        });
        await new Promise((r) => setTimeout(r, 1500));

        const tituloInicial2 = await page.title();
        const textoInicial2 = await page.evaluate(() => document.body.innerText || '');
        tituloInicial = tituloInicial2;
        textoInicial = textoInicial2;

        await page.waitForSelector("input[name='mainForm:txtInscricao1']", { timeout: 20000 });
        await page.type("input[name='mainForm:txtInscricao1']", cnpj, { delay: 20 });
        await page.click("input[name='mainForm:btnConsultar']");
        await new Promise((r) => setTimeout(r, 3000));

        const textoConsulta = await page.evaluate(() => document.body.innerText || '');

        if (
          textoConsulta.toLowerCase().includes('não está regular') ||
          textoConsulta.toLowerCase().includes('irregular perante')
        ) {
          return {
            data: { status: 'irregular', texto: textoConsulta.slice(0, 500) },
            type: 'application/json',
          };
        }

        if (!textoConsulta.includes('Certificado de Regularidade')) {
          return {
            data: { status: 'nao_encontrado', texto: textoConsulta.slice(0, 500) },
            type: 'application/json',
          };
        }

        await page.evaluate(() => {
          const link = Array.from(document.querySelectorAll('a')).find((a) =>
            a.textContent.includes('Certificado de Regularidade do FGTS')
          );
          if (link) link.click();
        });
        await new Promise((r) => setTimeout(r, 2500));

        await page.evaluate(() => {
          const botao = Array.from(document.querySelectorAll('a, button, input')).find(
            (el) => (el.textContent || el.value || '').trim() === 'Visualizar'
          );
          if (botao) botao.click();
        });
        await new Promise((r) => setTimeout(r, 2500));

        const textoFinal = await page.evaluate(() => document.body.innerText || '');

        if (!textoFinal.includes('Certificado de Regularidade')) {
          return {
            data: { status: 'visualizar_falhou', texto: textoFinal.slice(0, 500) },
            type: 'application/json',
          };
        }

        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        const pdfBase64 = pdfBuffer.toString('base64');

        return {
          data: { status: 'ok', pdfBase64, texto: textoFinal.slice(0, 500) },
          type: 'application/json',
        };
      } catch (err) {
        return {
          data: {
            status: 'excecao',
            erro: String((err && err.message) || err),
            tituloInicial,
            textoInicial: textoInicial.slice(0, 500),
          },
          type: 'application/json',
        };
      }
    };
  `
}

type ResultadoFuncao =
  | { status: 'ok'; pdfBase64: string; texto: string }
  | { status: 'irregular'; texto: string }
  | { status: 'nao_encontrado'; texto: string }
  | { status: 'visualizar_falhou'; texto: string }
  | { status: 'excecao'; erro: string; tituloInicial?: string; textoInicial?: string }

async function tentarBuscarFGTSCRF(cnpjLimpo: string, apiKey: string): Promise<ResultadoFuncao> {
  const code = buildFunctionCode(cnpjLimpo)

  const res = await fetch(`${BROWSERLESS_URL}/function?token=${apiKey}&timeout=60000&proxy=residential&proxyCountry=br&proxyPreset=px_gov01&proxySticky=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/javascript' },
    body: code,
    signal: AbortSignal.timeout(90000),
  })

  if (!res.ok) {
    const errorText = await res.text().catch(() => '')
    throw new Error(`Function error: ${res.status} ${errorText.slice(0, 500)}`)
  }

  const bruto = await res.json()
  const resultado = (bruto?.data ?? bruto) as ResultadoFuncao

  console.log('buscar-fgts-crf diagnóstico (bruto):', JSON.stringify(bruto).slice(0, 500))

  console.log('buscar-fgts-crf diagnóstico:', JSON.stringify({
    status: resultado.status,
    temPdf: resultado.status === 'ok' ? !!resultado.pdfBase64 : false,
    detalhe: 'texto' in resultado ? resultado.texto : ('erro' in resultado ? resultado.erro : null),
  }))

  return resultado
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // ---- Instrumentação de log (document_logs) ----
  const inicio = Date.now()
  let supabaseLog: ReturnType<typeof createClient> | null = null
  let userIdLog: string | null = null
  let clientIdLog: string | null = null

  async function registrarLog(status: 'sucesso' | 'erro', erro: string | null) {
    if (!supabaseLog || !userIdLog || !clientIdLog) return
    try {
      await supabaseLog.from('document_logs').insert({
        user_id: userIdLog,
        client_id: clientIdLog,
        // CORRIGIDO: era gravado 'fgts_caixa' aqui mas o upsert de
        // client_documents (mais abaixo) usa 'fgts' — usando o mesmo valor
        // aqui pro log bater com o tipo real do documento.
        tipo: 'fgts',
        status,
        tentativa: 1,
        duracao_ms: Date.now() - inicio,
        erro: erro ? erro.slice(0, 500) : null,
      })
    } catch (logErr) {
      console.warn('buscar-fgts-crf: falha ao gravar log:', logErr)
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

    const resultado = await tentarBuscarFGTSCRF(cnpjLimpo, apiKey)

    if (resultado.status === 'irregular') {
      await registrarLog('erro', 'Empresa irregular perante o FGTS')
      return new Response(JSON.stringify({
        error: 'Empresa IRREGULAR perante o FGTS. Regularize antes de participar da licitação.',
        irregular: true,
      }), { status: 422, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    if (resultado.status !== 'ok') {
      const detalhe = 'texto' in resultado ? resultado.texto : ('erro' in resultado ? resultado.erro : '')
      const contexto = 'tituloInicial' in resultado && resultado.tituloInicial
        ? ` [página no momento do erro: título="${resultado.tituloInicial}", texto="${(resultado.textoInicial ?? '').slice(0, 200)}"]`
        : ''
      // Não loga aqui — o catch geral no final da function já grava o log.
      throw new Error(`Não foi possível emitir o CRF do FGTS (status: ${resultado.status}). ${detalhe}${contexto}`)
    }

    const hoje = new Date()
    const validade = new Date(hoje); validade.setDate(validade.getDate() + 30)
    const dataEmissao = hoje.toISOString().split('T')[0]
    const dataValidade = validade.toISOString().split('T')[0]

    const bytes = Uint8Array.from(atob(resultado.pdfBase64), (c) => c.charCodeAt(0))
    const path = `${user.id}/${clientId}/fgts_crf/fgts_crf_${dataEmissao}.pdf`
    const { error: uploadError } = await supabase.storage.from('documents')
      .upload(path, bytes, { contentType: 'application/pdf', upsert: true })

    if (uploadError) throw new Error(`Erro ao salvar PDF: ${uploadError.message}`)

    await supabase.from('client_documents').upsert({
      user_id: user.id, client_id: clientId,
      // CORRIGIDO (10/07/2026): era 'fgts_caixa', que não bate com o
      // DocumentTipo real usado no checklist ('fgts') — o documento nunca
      // aparecia certo na tela por causa desse nome diferente.
      tipo: 'fgts',
      nome: 'CRF — Certificado de Regularidade do FGTS (Caixa)',
      storage_path: path, data_emissao: dataEmissao, data_validade: dataValidade,
      status: 'valido', auto_renovavel: true,
    }, { onConflict: 'user_id,client_id,tipo' })

    await registrarLog('sucesso', null)

    return new Response(JSON.stringify({ success: true, dataEmissao, dataValidade, temPdf: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('buscar-fgts-crf error:', err)
    await registrarLog('erro', String(err))
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
