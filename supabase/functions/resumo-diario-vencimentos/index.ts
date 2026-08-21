// Edge Function: resumo-diario-vencimentos
// Roda automaticamente todo dia de manhã (configurado via pg_cron, veja
// 007_resumo_diario.sql e 039_agendar_resumo_diario.sql) e envia
// para o e-mail de CADA dono de conta (via Supabase Auth Admin API) um
// resumo do que vence hoje, do que está atrasado, e do que foi
// recebido/pago no dia anterior — só com dados daquela conta.
//
// Antes esta função usava a service role key pra buscar as transações de
// TODAS as contas de uma vez só e mandar tudo junto pra um único e-mail
// fixo (RESUMO_EMAIL_TO) — se o sistema tivesse mais de uma conta
// cadastrada, o resumo financeiro de uma vazava pra outra. Corrigido
// aqui: cada conta recebe só o próprio resumo, no próprio e-mail.
//
// VARIÁVEIS DE AMBIENTE (reaproveita as mesmas do backup-diario):
// - RESEND_API_KEY
// - BACKUP_EMAIL_FROM (mesmo remetente)
// - CRON_SECRET: segredo compartilhado só com o pg_cron (veja backup-diario)

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const EMAIL_FROM = Deno.env.get('BACKUP_EMAIL_FROM') ?? 'onboarding@resend.dev'
const CRON_SECRET = Deno.env.get('CRON_SECRET')

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

// Descrição e nome de cliente são texto livre digitado pelo usuário —
// escapa antes de interpolar no HTML do e-mail (o resto das functions que
// geram documento/e-mail com dado do usuário já faz isso via escapeXml).
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

interface TxRow {
  type: string
  category: string
  description: string
  value: number
  due_date: string
  status: string
  client_id: string | null
}

async function enviarResumoDaConta(supabase: ReturnType<typeof createClient>, ownerId: string, ownerEmail: string) {
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

  const { data: clients } = await supabase.from('clients').select('id, name').eq('user_id', ownerId)
  const clientName = (id: string | null) => clients?.find((c) => c.id === id)?.name ?? '—'

  const { data: venceHoje } = await supabase
    .from('transactions')
    .select('type, category, description, value, due_date, status, client_id')
    .eq('user_id', ownerId)
    .eq('due_date', today)
    .neq('status', 'Pago')

  const { data: atrasados } = await supabase
    .from('transactions')
    .select('type, category, description, value, due_date, status, client_id')
    .eq('user_id', ownerId)
    .lt('due_date', today)
    .neq('status', 'Pago')

  const { data: liquidadoOntem } = await supabase
    .from('transactions')
    .select('type, category, description, value, due_date, status, client_id')
    .eq('user_id', ownerId)
    .eq('payment_date', yesterday)

  const rows = (list: TxRow[] | null, type: 'Receber' | 'Pagar') =>
    (list ?? []).filter((t) => t.type === type)

  const renderRows = (list: TxRow[]) =>
    list.length === 0
      ? '<tr><td colspan="3" style="color:#888;font-style:italic;padding:6px 0;">Nenhum item</td></tr>'
      : list.map((t) => `
          <tr>
            <td style="padding:4px 8px;border-bottom:1px solid #eee;">${escapeHtml(clientName(t.client_id))}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #eee;">${escapeHtml(t.description)}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;">${formatBRL(t.value)}</td>
          </tr>
        `).join('')

  const receberHoje = rows(venceHoje, 'Receber')
  const pagarHoje = rows(venceHoje, 'Pagar')
  const receberAtrasado = rows(atrasados, 'Receber')
  const pagarAtrasado = rows(atrasados, 'Pagar')
  const recebidoOntem = rows(liquidadoOntem, 'Receber')
  const pagoOntem = rows(liquidadoOntem, 'Pagar')

  const totalReceberHoje = receberHoje.reduce((s, t) => s + Number(t.value), 0)
  const totalPagarHoje = pagarHoje.reduce((s, t) => s + Number(t.value), 0)
  const totalReceberAtrasado = receberAtrasado.reduce((s, t) => s + Number(t.value), 0)
  const totalPagarAtrasado = pagarAtrasado.reduce((s, t) => s + Number(t.value), 0)

  const html = `
    <div style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:600px;">
      <h2 style="color:#0ea5b7;">Resumo Financeiro — ${formatDate(today)}</h2>
      <p style="color:#555;font-size:13px;">Acompanhamento interno automático do ConectaGov. Não é enviado a nenhum cliente.</p>

      ${totalReceberAtrasado > 0 || totalPagarAtrasado > 0 ? `
      <h3 style="color:#cc5263;margin-top:24px;">Em Atraso</h3>
      <p style="font-size:13px;">A receber em atraso: <strong>${formatBRL(totalReceberAtrasado)}</strong> · A pagar em atraso: <strong>${formatBRL(totalPagarAtrasado)}</strong></p>
      <table style="width:100%;font-size:13px;border-collapse:collapse;">${renderRows([...receberAtrasado, ...pagarAtrasado])}</table>
      ` : ''}

      <h3 style="color:#d99a1f;margin-top:24px;">Vence Hoje</h3>
      <p style="font-size:13px;">A receber hoje: <strong>${formatBRL(totalReceberHoje)}</strong> · A pagar hoje: <strong>${formatBRL(totalPagarHoje)}</strong></p>
      <table style="width:100%;font-size:13px;border-collapse:collapse;">${renderRows([...receberHoje, ...pagarHoje])}</table>

      <h3 style="color:#16a673;margin-top:24px;">Liquidado Ontem</h3>
      <table style="width:100%;font-size:13px;border-collapse:collapse;">${renderRows([...recebidoOntem, ...pagoOntem])}</table>

      <p style="color:#888;font-size:11px;margin-top:32px;">E-mail automático gerado pelo ConectaGov. Acesse o sistema para mais detalhes.</p>
    </div>
  `

  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: ownerEmail,
      subject: `ConectaGov — Resumo do dia ${formatDate(today)}${totalReceberAtrasado + totalPagarAtrasado > 0 ? ' - Ha atrasos' : ''}`,
      html,
    }),
  })

  if (!emailResponse.ok) {
    const errText = await emailResponse.text()
    throw new Error(`Falha ao enviar e-mail via Resend pra ${ownerEmail}: ${errText}`)
  }
}

Deno.serve(async (req: Request) => {
  try {
    if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) {
      return new Response(JSON.stringify({ success: false, error: 'Não autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { data: membros } = await supabase.from('team_members').select('member_user_id').eq('status', 'ativo')
    const idsDeMembros = new Set((membros ?? []).map((m) => m.member_user_id as string))

    let contas = 0
    let page = 1
    while (true) {
      const { data: pageData, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
      if (error) throw new Error(`Falha ao listar usuários: ${error.message}`)
      for (const u of pageData.users) {
        if (idsDeMembros.has(u.id) || !u.email) continue
        await enviarResumoDaConta(supabase, u.id, u.email)
        contas += 1
      }
      if (pageData.users.length < 200) break
      page += 1
    }

    return new Response(JSON.stringify({ success: true, contas }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('Erro no resumo diário:', err)
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
