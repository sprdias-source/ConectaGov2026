import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GITHUB_REPO = 'sprdias-source/ConectaGov2026'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { clientId } = await req.json()
    if (!clientId) {
      return new Response(JSON.stringify({ error: 'clientId é obrigatório' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const authHeader = req.headers.get('Authorization')!
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) throw new Error('Não autenticado')

    // Busca com o token do próprio usuário (respeita RLS) — se não achar,
    // ou não existe o cliente ou ele não tem permissão de acesso.
    const { data: cliente, error } = await supabase
      .from('clients').select('cnpj').eq('id', clientId).single()
    if (error || !cliente) throw new Error('Cliente não encontrado ou sem permissão de acesso')
    if (!cliente.cnpj) throw new Error('Este cliente não tem CNPJ cadastrado')

    const githubPat = Deno.env.get('GITHUB_PAT')
    if (!githubPat) throw new Error('GITHUB_PAT não configurado nos secrets da Edge Function')

    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${githubPat}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: 'robo-cndt',
        client_payload: {
          clientId,
          cnpj: cliente.cnpj,
          userId: user.id,
        },
      }),
    })

    if (!res.ok) {
      const texto = await res.text()
      console.error('disparar-robo-cndt: GitHub respondeu com erro:', texto)
      throw new Error(`Erro ao disparar o robô no GitHub Actions (status ${res.status})`)
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('disparar-robo-cndt error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
