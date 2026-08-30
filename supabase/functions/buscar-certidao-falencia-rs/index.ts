import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BROWSERLESS_URL = 'https://production-sfo.browserless.io'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function buildFunctionCode(cnpjLimpo: string, nome: string, endereco: string): string {
  return `
    export default async ({ page }) => {
      const cnpj = ${JSON.stringify(cnpjLimpo)};
      const nome = ${JSON.stringify(nome)};
      const endereco = ${JSON.stringify(endereco)};

      try {
        await page.goto('https://www.tjrs.jus.br/novo/processos-e-servicos/servicos-processuais/emissao-de-antecedentes-e-certidoes/', {
          waitUntil: 'domcontentloaded',
          timeout: 52000,
        });
        await new Promise((r) => setTimeout(r, 1500));

        await page.waitForSelector("input[name='nome']", { timeout: 20000 });
        await page.type("input[name='nome']", nome, { delay: 10 });
        await page.type("input[name='cnpj']", cnpj, { delay: 10 });
        await page.type("input[name='endereco']", endereco, { delay: 10 });
        await new Promise((r) => setTimeout(r, 500));

        const [response] = await Promise.all([
          page.waitForResponse(
            (res) => res.url().includes('/proc/alvara/alvara.php'),
            { timeout: 20000 }
          ),
          page.click("input[name='gerarDocumento']"),
        ]);

        const contentType = response.headers()['content-type'] || '';
        if (!contentType.includes('pdf')) {
          const texto = await response.text().catch(() => '');
          return {
            data: { status: 'nao_e_pdf', contentType, texto: texto.slice(0, 500) },
            type: 'application/json',
          };
        }

        const pdfBuffer = await response.buffer();
        const pdfBase64 = pdfBuffer.toString('base64');

        return {
          data: { status: 'ok', pdfBase64 },
          type: 'application/json',
        };
      } catch (err) {
        return {
          data: { status: 'excecao', erro: String((err && err.message) || err) },
          type: 'application/json',
        };
      }
    };
  `
}

type ResultadoFuncao =
  | { status: 'ok'; pdfBase64: string }
  | { status: 'nao_e_pdf'; contentType: string; texto: string }
  | { status: 'excecao'; erro: string }

async function tentarBuscarCertidaoFalencia(
  cnpjLimpo: string, nome: string, endereco: string, apiKey: string
): Promise<ResultadoFuncao> {
  const code = buildFunctionCode(cnpjLimpo, nome, endereco)

  const res = await fetch(`${BROWSERLESS_URL}/function?token=${apiKey}&timeout=60000&proxy=residential&proxyCountry=br&proxyPreset=px_gov01&proxySticky=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/javascript' },
    body: code,
    signal: AbortSignal.timeout(75000),
  })

  if (!res.ok) {
    const errorText = await res.text().catch(() => '')
    throw new Error(`Function error: ${res.status} ${errorText.slice(0, 500)}`)
  }

  const bruto = await res.json()
  const resultado = (bruto?.data ?? bruto) as ResultadoFuncao

  console.log('buscar-certidao-falencia-rs diagnóstico:', JSON.stringify({
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
        // CORRIGIDO: era gravado 'certidao_negativa_falencia' aqui mas o
        // upsert de client_documents (mais abaixo) usa 'certidao_falencia_rs'
        // (o mesmo nome usado no DocumentTipo/checklist).
        tipo: 'certidao_falencia_rs',
        status,
        tentativa: 1,
        duracao_ms: Date.now() - inicio,
        erro: erro ? erro.slice(0, 500) : null,
      })
    } catch (logErr) {
      console.warn('buscar-certidao-falencia-rs: falha ao gravar log:', logErr)
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

    // Compara com o DONO da conta (owner_efetivo), não com quem está
    // logado — client_documents.user_id (e o caminho no Storage) sempre
    // usam o dono, já que clients.user_id também é sempre o dono.
    const { data: ownerId, error: ownerError } = await supabase.rpc('owner_efetivo', { usuario_id: user.id })
    if (ownerError || !ownerId) throw new Error('Não foi possível identificar a conta do usuário')
    userIdLog = ownerId as string

    // Esse portal exige nome e endereço além do CNPJ — busca da própria
    // tabela clients, em vez de pedir pro frontend mandar de novo. A busca
    // usa o token de quem chamou (respeita RLS), então também serve pra
    // confirmar que o cliente pertence à conta antes de gastar uma sessão
    // paga do Browserless.
    const { data: cliente, error: clienteError } = await supabase
      .from('clients')
      .select('name, address')
      .eq('id', clientId)
      .single()

    if (clienteError || !cliente) throw new Error('Cliente não encontrado')
    if (!cliente.address || !cliente.address.trim()) {
      throw new Error('Esse cliente não tem endereço cadastrado — o portal do TJRS exige endereço pra emitir a certidão. Cadastre o endereço do cliente antes de tentar de novo.')
    }

    const resultado = await tentarBuscarCertidaoFalencia(cnpjLimpo, cliente.name, cliente.address, apiKey)

    if (resultado.status !== 'ok') {
      const detalhe = 'texto' in resultado ? resultado.texto : ('erro' in resultado ? resultado.erro : '')
      // Não loga aqui — o catch geral no final da function já grava o log.
      throw new Error(`Não foi possível emitir a certidão de falência (status: ${resultado.status}). ${detalhe}`)
    }

    const hoje = new Date()
    const validade = new Date(hoje); validade.setDate(validade.getDate() + 90)
    const dataEmissao = hoje.toISOString().split('T')[0]
    const dataValidade = validade.toISOString().split('T')[0]

    const bytes = Uint8Array.from(atob(resultado.pdfBase64), (c) => c.charCodeAt(0))
    const path = `${ownerId}/${clientId}/certidao_falencia/certidao_falencia_${dataEmissao}.pdf`
    const { error: uploadError } = await supabase.storage.from('documents')
      .upload(path, bytes, { contentType: 'application/pdf', upsert: true })

    if (uploadError) throw new Error(`Erro ao salvar PDF: ${uploadError.message}`)

    await supabase.from('client_documents').upsert({
      user_id: ownerId, client_id: clientId,
      // CORRIGIDO (10/07/2026): era 'certidao_negativa_falencia', que não
      // bate com o DocumentTipo real ('certidao_falencia_rs') — o
      // documento nunca apareceria certo no checklist com esse nome antigo.
      tipo: 'certidao_falencia_rs',
      nome: 'Certidão Judicial Cível Negativa (Falência) — TJRS',
      storage_path: path, data_emissao: dataEmissao, data_validade: dataValidade,
      status: 'valido', auto_renovavel: true,
    }, { onConflict: 'user_id,client_id,tipo' })

    await registrarLog('sucesso', null)

    return new Response(JSON.stringify({ success: true, dataEmissao, dataValidade, temPdf: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('buscar-certidao-falencia-rs error:', err)
    await registrarLog('erro', String(err))
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
