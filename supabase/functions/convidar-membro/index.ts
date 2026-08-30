import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Só o dono (owner) da conta pode convidar membros novos — quem já é membro
// de uma equipe não pode convidar outros (evita hierarquias confusas por
// enquanto; se precisar disso no futuro, dá pra rever essa regra).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { email, nome } = await req.json()
    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'E-mail válido é obrigatório' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Cliente "normal", com o token de quem está chamando — só pra
    // descobrir quem é o owner que está convidando.
    const authHeader = req.headers.get('Authorization')!
    const supabaseComoUsuario = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const { data: { user: owner } } = await supabaseComoUsuario.auth.getUser(token)
    if (!owner) throw new Error('Não autenticado')

    // Se quem está chamando já é membro de outra equipe, ele não pode
    // convidar mais ninguém (só o owner de verdade pode).
    const { data: vinculoExistente } = await supabaseComoUsuario
      .from('team_members')
      .select('id')
      .eq('member_user_id', owner.id)
      .eq('status', 'ativo')
      .maybeSingle()

    if (vinculoExistente) {
      return new Response(JSON.stringify({ error: 'Só o dono da conta pode convidar novos membros' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Cliente com service role — só esse tem permissão de criar usuários
    // via Auth Admin API.
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    // inviteUserByEmail cria o usuário E manda um e-mail com link mágico
    // pra ele definir a própria senha — mais simples que criar senha
    // temporária e ter que comunicar ela por fora.
    let usuarioId: string

    const { data: novoUsuario, error: erroConvite } = await supabaseAdmin.auth.admin.inviteUserByEmail(email)

    if (erroConvite || !novoUsuario?.user) {
      // Se o e-mail já existe como usuário (comum: alguém que já tinha
      // conta própria, ou testes antigos), não falha — busca o usuário
      // existente e vincula ele como membro, em vez de exigir um e-mail
      // novo.
      const mensagemErro = erroConvite?.message ?? ''
      if (mensagemErro.toLowerCase().includes('already been registered') ||
          mensagemErro.toLowerCase().includes('already registered')) {
        const { data: listaUsuarios, error: erroBusca } = await supabaseAdmin.auth.admin.listUsers()
        const usuarioExistente = listaUsuarios?.users.find(
          (u) => u.email?.toLowerCase() === email.toLowerCase()
        )
        if (erroBusca || !usuarioExistente) {
          throw new Error('E-mail já cadastrado, mas não foi possível localizar o usuário pra vincular')
        }
        usuarioId = usuarioExistente.id
      } else {
        throw new Error(mensagemErro || 'Não foi possível convidar esse e-mail')
      }
    } else {
      usuarioId = novoUsuario.user.id
    }

    const { data: vinculo, error: erroVinculo } = await supabaseAdmin
      .from('team_members')
      .insert({
        owner_id: owner.id,
        member_user_id: usuarioId,
        nome: nome ?? null,
        email,
        status: 'ativo',
      })
      .select('id')
      .single()

    if (erroVinculo || !vinculo) throw new Error('Usuário convidado, mas não foi possível vincular à equipe')

    // Permissões iniciais: 'sem_acesso' em todas as ferramentas — o owner
    // ajusta depois na tela de admin.
    const { data: ferramentas } = await supabaseAdmin.from('system_tools').select('key')
    if (ferramentas?.length) {
      await supabaseAdmin.from('member_permissions').insert(
        ferramentas.map((f) => ({
          team_member_id: vinculo.id,
          tool_key: f.key,
          nivel_acesso: 'sem_acesso',
        }))
      )
    }

    return new Response(JSON.stringify({ success: true, teamMemberId: vinculo.id }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('convidar-membro error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
