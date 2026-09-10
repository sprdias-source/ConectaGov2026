import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Complemento de convidar-membro: quando o e-mail convidado já pertence a
// um usuário existente, o vínculo em team_members nasce com
// status = 'pendente' (nunca 'ativo' direto) — exatamente pra evitar que
// alguém vincule a conta de outra pessoa como "membro" sem ela nunca ter
// concordado (owner_efetivo só passa a resolver pro dono quando o vínculo
// está 'ativo', então até aqui a conta convidada continua 100% dela).
// Esta function é o único lugar que vira esse status pra 'ativo' — sempre
// autenticado como o PRÓPRIO convidado, nunca pelo dono que convidou.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { teamMemberId, aceitar } = await req.json()
    if (!teamMemberId || typeof aceitar !== 'boolean') {
      return new Response(JSON.stringify({ error: 'teamMemberId e aceitar são obrigatórios' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authHeader = req.headers.get('Authorization')!
    const supabaseComoUsuario = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const { data: { user } } = await supabaseComoUsuario.auth.getUser(token)
    if (!user) throw new Error('Não autenticado')

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    // Confere posse do convite ANTES de mexer em qualquer coisa: só quem
    // foi convidado (member_user_id) pode aceitar ou recusar o próprio
    // convite, e só se ele ainda estiver mesmo pendente (evita reprocessar
    // um convite já aceito/recusado, ou um convite de outra pessoa).
    const { data: convite, error: erroConvite } = await supabaseAdmin
      .from('team_members')
      .select('id, member_user_id, status')
      .eq('id', teamMemberId)
      .single()

    if (erroConvite || !convite) throw new Error('Convite não encontrado')
    if (convite.member_user_id !== user.id) throw new Error('Este convite não é seu')
    if (convite.status !== 'pendente') throw new Error('Este convite já foi respondido')

    if (aceitar) {
      const { error } = await supabaseAdmin
        .from('team_members')
        .update({ status: 'ativo' })
        .eq('id', teamMemberId)
      if (error) throw error
    } else {
      // Recusar apaga o vínculo (e em cascata as permissões associadas) —
      // não faz sentido manter um convite recusado por perto.
      const { error } = await supabaseAdmin
        .from('team_members')
        .delete()
        .eq('id', teamMemberId)
      if (error) throw error
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('responder-convite error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
