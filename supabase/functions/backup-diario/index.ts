// Edge Function: backup-diario
//
// Esta function nunca tinha sido versionada neste repositório — foi criada
// direto no Supabase quando o backup passou de semanal (ver backup-semanal/)
// para diário, e o cron real ficou apontando pra ela, não pra backup-semanal.
// Trazida pro repositório e corrigida numa perícia técnica: o código
// original buscava TODAS as tabelas de TODOS os usuários de uma vez (com a
// service role key, que ignora RLS) e mandava tudo junto num único e-mail
// fixo — exatamente o mesmo problema já corrigido em backup-semanal. Agora
// segue o mesmo padrão: um e-mail por conta, só com os dados daquela conta,
// pro próprio e-mail de login do dono da conta.
//
// VARIÁVEIS DE AMBIENTE NECESSÁRIAS (Supabase → Edge Functions → Secrets):
// - RESEND_API_KEY: sua chave da API do Resend
// - CRON_SECRET: segredo compartilhado só com o pg_cron (mesmo usado em
//   backup-semanal) — sem ele, qualquer pessoa de posse da anon key
//   (pública, embutida no frontend) podia disparar esta função repetidamente.

import { createClient } from 'jsr:@supabase/supabase-js@2'

type Supa = ReturnType<typeof createClient>

// Tabelas incluídas no backup — dados que o usuário digita e que não dá
// pra recriar sozinho se perder (diferente dos PDFs de certidão, que ficam
// de fora por enquanto: no pior caso, dá pra buscar de novo nos robôs).
// team_members/member_permissions não têm user_id direto (são filtradas à
// parte, ver buscarEquipeDaConta abaixo).
const TABELAS_COM_USER_ID = [
  'clients',
  'biddings',
  'bidding_items',
  'financial_accounts',
  'transactions',
  'client_documents',
] as const

async function buscarEquipeDaConta(supabase: Supa, ownerId: string) {
  const { data: membros } = await supabase.from('team_members').select('*').eq('owner_id', ownerId)
  const idsDosMembros = (membros ?? []).map((m) => m.id as string)
  const { data: permissoes } = idsDosMembros.length
    ? await supabase.from('member_permissions').select('*').in('team_member_id', idsDosMembros)
    : { data: [] }
  return { membros: membros ?? [], permissoes: permissoes ?? [] }
}

async function enviarBackupDaConta(supabase: Supa, resendApiKey: string, ownerId: string, ownerEmail: string) {
  const backup: Record<string, unknown> = {
    gerado_em: new Date().toISOString(),
  }
  const erros: string[] = []

  for (const tabela of TABELAS_COM_USER_ID) {
    const { data, error } = await supabase.from(tabela).select('*').eq('user_id', ownerId)
    if (error) {
      erros.push(`${tabela}: ${error.message}`)
      backup[tabela] = null
    } else {
      backup[tabela] = data
    }
  }

  const { membros, permissoes } = await buscarEquipeDaConta(supabase, ownerId)
  backup.team_members = membros
  backup.member_permissions = permissoes

  const jsonString = JSON.stringify(backup, null, 2)
  const jsonBase64 = btoa(unescape(encodeURIComponent(jsonString)))

  const hoje = new Date().toISOString().split('T')[0]
  const nomeArquivo = `conectagov-backup-${hoje}.json`

  const totalRegistros = TABELAS_COM_USER_ID.reduce((soma, t) => {
    const linhas = backup[t]
    return soma + (Array.isArray(linhas) ? linhas.length : 0)
  }, membros.length + permissoes.length)

  const resumoHtml = `
    <p>Backup diário do ConectaGov gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.</p>
    <p><strong>Total de registros:</strong> ${totalRegistros}</p>
    ${erros.length > 0
      ? `<p style="color:#c0392b"><strong>Atenção — algumas tabelas falharam:</strong><br>${erros.join('<br>')}</p>`
      : '<p>Todas as tabelas foram exportadas com sucesso.</p>'}
    <p>O arquivo anexo (.json) contém os dados completos. Guarde em local seguro (ex: Google Drive/OneDrive) como cópia extra fora do sistema.</p>
  `

  const resEmail = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'ConectaGov Backup <onboarding@resend.dev>',
      to: [ownerEmail],
      subject: `Backup ConectaGov — ${hoje}`,
      html: resumoHtml,
      attachments: [
        {
          filename: nomeArquivo,
          content: jsonBase64,
        },
      ],
    }),
  })

  if (!resEmail.ok) {
    const textoErro = await resEmail.text()
    throw new Error(`Falha ao enviar e-mail via Resend pra ${ownerEmail}: ${resEmail.status} ${textoErro}`)
  }

  return { totalRegistros, erros }
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Não autorizado' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!

    // Service role — ignora RLS de propósito, o backup precisa acessar os
    // dados de cada conta pra montar o backup dela — mas cada busca abaixo
    // é explicitamente filtrada por dono da conta, então a ausência de RLS
    // aqui não vira vazamento entre contas.
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { data: membrosDeEquipe } = await supabase.from('team_members').select('member_user_id').eq('status', 'ativo')
    const idsDeMembros = new Set((membrosDeEquipe ?? []).map((m) => m.member_user_id as string))

    const resultados: { email: string; totalRegistros: number; erros: string[] }[] = []
    let page = 1
    while (true) {
      const { data: pageData, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
      if (error) throw new Error(`Falha ao listar usuários: ${error.message}`)
      for (const u of pageData.users) {
        if (idsDeMembros.has(u.id) || !u.email) continue
        const { totalRegistros, erros } = await enviarBackupDaConta(supabase, resendApiKey, u.id, u.email)
        resultados.push({ email: u.email, totalRegistros, erros })
      }
      if (pageData.users.length < 200) break
      page += 1
    }

    return new Response(JSON.stringify({
      success: true,
      contas: resultados.length,
      resultados,
    }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('backup-diario error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
})
