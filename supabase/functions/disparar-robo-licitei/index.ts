// Edge Function: disparar-robo-licitei
//
// Dispara o robô Licitei (Playwright + GitHub Actions) via repository_dispatch
// — mesmo padrão já usado por disparar-robo-cndt (essa function roda no
// GitHub, não aqui: aqui só confirmamos que o disparo foi aceito). O
// resultado de verdade (editais gravados em licitei_editais, ou o PDF
// baixado) chega minutos depois, gravado pelo script rodando no runner do
// GitHub Actions — não é sincronizado com a resposta desta function.
//
// Recebe { modo: 'buscar', buscaId } ou { modo: 'baixar_edital', editalId }.
//
// VARIÁVEIS DE AMBIENTE NECESSÁRIAS (Supabase → Edge Functions → Secrets):
// - GITHUB_PAT: personal access token do GitHub com escopo "repo" (classic)
//   ou "Contents: read/write" + "Actions: read/write" (fine-grained) no
//   repositório sprdias-source/ConectaGov2026 — só usado pra disparar o
//   workflow, nada além disso.
// - SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm injetadas
//   automaticamente pelo Supabase em toda Edge Function.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GITHUB_PAT = Deno.env.get('GITHUB_PAT')!
const GITHUB_OWNER = 'sprdias-source'
const GITHUB_REPO = 'ConectaGov2026'

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  try {
    const { modo, buscaId, editalId } = await req.json()
    if (modo !== 'buscar' && modo !== 'baixar_edital') {
      return json({ error: 'modo deve ser "buscar" ou "baixar_edital"' }, 400)
    }

    const authHeader = req.headers.get('Authorization')
    const jwt = authHeader?.replace('Bearer ', '')
    if (!jwt) return json({ error: 'Não autenticado' }, 401)
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt)
    if (userError || !user) return json({ error: 'Não autenticado' }, 401)

    // Compara com o DONO da conta (owner_efetivo), não com quem está
    // logado — busca/edital sempre têm user_id = dono, então um membro de
    // equipe sempre bateria 403 se comparássemos direto com user.id.
    // Também é o ownerId (não o uid de quem clicou) que precisa ir no
    // client_payload do robô, já que os dados que ele vai ler/gravar
    // (licitei_buscas, licitei_editais, client_documents...) são todos
    // dessa conta, não do membro específico.
    const { data: ownerId, error: ownerError } = await supabase.rpc('owner_efetivo', { usuario_id: user.id })
    if (ownerError || !ownerId) return json({ error: 'Não foi possível identificar a conta do usuário' }, 500)

    // owner_efetivo só confirma que o usuário PERTENCE à conta — não que
    // tem permissão de edição em Cadastros (de onde vêm as buscas/editais
    // Licitei). Sem esta checagem, o botão só ficava escondido na UI, mas
    // um membro com nível "visualização" ou "sem_acesso" em Cadastros
    // conseguia disparar o robô chamando esta function direto com o
    // próprio token.
    const { data: temAcesso, error: acessoError } = await supabase.rpc('tem_acesso', {
      usuario_id: user.id,
      ferramenta: 'cadastros',
      nivel_minimo: 'edicao',
    })
    if (acessoError) return json({ error: 'Não foi possível verificar a permissão do usuário' }, 500)
    if (!temAcesso) return json({ error: 'Sem permissão de edição em Cadastros para disparar o robô' }, 403)

    let eventType: string
    let clientPayload: Record<string, unknown>

    if (modo === 'buscar') {
      if (!buscaId) return json({ error: 'buscaId é obrigatório no modo buscar' }, 400)
      const { data: busca, error: buscaError } = await supabase
        .from('licitei_buscas')
        .select('id, user_id')
        .eq('id', buscaId)
        .single()
      if (buscaError || !busca) return json({ error: 'Busca não encontrada' }, 404)
      if (busca.user_id !== ownerId) return json({ error: 'Sem permissão para esta busca' }, 403)
      eventType = 'robo-licitei-buscar'
      clientPayload = { buscaId, userId: ownerId }
    } else {
      if (!editalId) return json({ error: 'editalId é obrigatório no modo baixar_edital' }, 400)
      const { data: edital, error: editalError } = await supabase
        .from('licitei_editais')
        .select('id, user_id, client_id')
        .eq('id', editalId)
        .single()
      if (editalError || !edital) return json({ error: 'Edital não encontrado' }, 404)
      if (edital.user_id !== ownerId) return json({ error: 'Sem permissão para este edital' }, 403)
      if (!edital.client_id) return json({ error: 'Linke um cliente a este edital antes de baixar' }, 400)
      eventType = 'robo-licitei-baixar-edital'
      clientPayload = { editalId, userId: ownerId }
    }

    // Log ANTES do fetch: confirma no painel do Supabase (Edge Functions →
    // Logs) exatamente pra onde e com qual PAT (só o tamanho, nunca o
    // valor) a gente está mandando o dispatch — sem isso, uma rodada que
    // "dá certo" (200/204) mas não gera run nenhuma no Actions não deixa
    // nenhuma pista de qual parte da chamada está errada.
    console.log(
      `[disparar] Enviando dispatch: owner=${GITHUB_OWNER} repo=${GITHUB_REPO} event_type=${eventType} GITHUB_PAT.length=${GITHUB_PAT?.length ?? 'undefined'}`
    )

    const dispatchRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_PAT}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ event_type: eventType, client_payload: clientPayload }),
      }
    )
    const corpoResposta = await dispatchRes.text()
    console.log(`[disparar] GitHub respondeu: status=${dispatchRes.status} corpo="${corpoResposta}"`)

    if (!dispatchRes.ok) {
      throw new Error(`GitHub recusou o disparo (${dispatchRes.status}): ${corpoResposta}`)
    }

    return json({ started: true })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err)
    console.error('Erro ao disparar robô Licitei:', mensagem)
    return json({ success: false, error: mensagem }, 500)
  }
})
