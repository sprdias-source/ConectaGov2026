// Edge Function: backup-semanal
// Roda automaticamente (configurado via pg_cron, veja 006_backup_automatico.sql
// e 032_cron_secret_e_backup_por_conta.sql) e também pode ser chamada
// manualmente para testes.
//
// O QUE FAZ:
// 1. Para CADA dono de conta do sistema (todo usuário que não é membro de
//    equipe de outra conta — team_members.member_user_id), busca só os
//    dados DAQUELA conta em todas as tabelas principais.
// 2. Monta um arquivo .json com tudo (mesmo formato do botão "Exportar
//    Backup") e envia por e-mail via Resend, anexado, pro próprio e-mail
//    de login daquele dono de conta (via Supabase Auth Admin API) — nunca
//    um destino fixo compartilhado entre contas diferentes.
//
// Antes esta função usava a service role key (que ignora RLS) pra buscar
// TODAS as linhas de TODAS as contas de uma vez só e mandar tudo junto pra
// um único e-mail fixo (BACKUP_EMAIL_TO) — ou seja, se o sistema tivesse
// mais de uma conta cadastrada, o backup de uma vazava pra outra. Corrigido
// aqui: cada conta recebe só os próprios dados, no próprio e-mail.
//
// VARIÁVEIS DE AMBIENTE NECESSÁRIAS (configurar em Supabase → Edge Functions → Secrets):
// - RESEND_API_KEY: sua chave da API do Resend
// - BACKUP_EMAIL_FROM: e-mail de origem (precisa ser um domínio verificado no Resend,
//   ou use o domínio de teste onboarding@resend.dev para começar)
// - CRON_SECRET: segredo compartilhado só com o pg_cron — sem ele, qualquer
//   pessoa de posse da anon key (pública, embutida no frontend) poderia
//   disparar esta função repetidamente.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const BACKUP_EMAIL_FROM = Deno.env.get('BACKUP_EMAIL_FROM') ?? 'onboarding@resend.dev'
const CRON_SECRET = Deno.env.get('CRON_SECRET')

const TABLES = [
  'clients', 'biddings', 'bidding_items', 'financial_accounts', 'categories',
  'empenhos', 'transactions', 'employees', 'contracts', 'receipts', 'attached_files',
] as const

async function enviarBackupDaConta(supabase: ReturnType<typeof createClient>, ownerId: string, ownerEmail: string) {
  const payload: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    version: '2.0',
    source: 'backup-automatico',
  }

  let totalRows = 0
  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select('*').eq('user_id', ownerId)
    if (error) {
      console.error(`Erro ao buscar ${table} da conta ${ownerId}:`, error.message)
      continue
    }
    payload[table] = data
    totalRows += data?.length ?? 0
  }

  const jsonContent = JSON.stringify(payload, null, 2)
  const base64Content = btoa(unescape(encodeURIComponent(jsonContent)))
  const dateStr = new Date().toISOString().slice(0, 10)

  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: BACKUP_EMAIL_FROM,
      to: ownerEmail,
      subject: `ConectaGov — Backup automático (${dateStr})`,
      html: `
        <p>Olá!</p>
        <p>Aqui está o backup automático do seu sistema ConectaGov, gerado em ${dateStr}.</p>
        <p>Total de registros incluídos: <strong>${totalRows}</strong></p>
        <p>Guarde este arquivo em um local seguro (Google Drive, computador, etc).</p>
        <p style="color:#888;font-size:12px;margin-top:24px;">Este é um e-mail automático — não é necessário responder.</p>
      `,
      attachments: [
        {
          filename: `conectagov-backup-${dateStr}.json`,
          content: base64Content,
        },
      ],
    }),
  })

  if (!emailResponse.ok) {
    const errText = await emailResponse.text()
    throw new Error(`Falha ao enviar e-mail via Resend pra ${ownerEmail}: ${errText}`)
  }

  return totalRows
}

Deno.serve(async (req: Request) => {
  try {
    if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) {
      return new Response(JSON.stringify({ success: false, error: 'Não autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Usa a service role key (acesso total) porque esta função roda em
    // segundo plano, sem um usuário logado interativamente — mas cada
    // busca de dado abaixo é explicitamente filtrada por user_id, então a
    // ausência de RLS aqui não vira vazamento entre contas.
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // "Dono de conta" = qualquer usuário autenticado que não está
    // vinculado como membro da equipe de outra conta (mesma regra usada
    // no frontend em usePermissaoFerramenta.ts).
    const { data: membros } = await supabase.from('team_members').select('member_user_id').eq('status', 'ativo')
    const idsDeMembros = new Set((membros ?? []).map((m) => m.member_user_id as string))

    const resultados: { email: string; totalRows: number }[] = []
    let page = 1
    while (true) {
      const { data: pageData, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
      if (error) throw new Error(`Falha ao listar usuários: ${error.message}`)
      for (const u of pageData.users) {
        if (idsDeMembros.has(u.id) || !u.email) continue
        const totalRows = await enviarBackupDaConta(supabase, u.id, u.email)
        resultados.push({ email: u.email, totalRows })
      }
      if (pageData.users.length < 200) break
      page += 1
    }

    return new Response(
      JSON.stringify({ success: true, contas: resultados.length, resultados }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Erro no backup automático:', err)
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
