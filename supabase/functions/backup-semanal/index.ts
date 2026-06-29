// Edge Function: backup-semanal
// Roda automaticamente (configurado via pg_cron, veja 006_backup_automatico.sql)
// e também pode ser chamada manualmente para testes.
//
// O QUE FAZ:
// 1. Busca todos os dados do usuário em todas as tabelas principais
// 2. Monta um arquivo .json com tudo (mesmo formato do botão "Exportar Backup")
// 3. Envia esse arquivo por e-mail via Resend, anexado
//
// VARIÁVEIS DE AMBIENTE NECESSÁRIAS (configurar em Supabase → Edge Functions → Secrets):
// - RESEND_API_KEY: sua chave da API do Resend
// - BACKUP_EMAIL_TO: e-mail de destino do backup
// - BACKUP_EMAIL_FROM: e-mail de origem (precisa ser um domínio verificado no Resend,
//   ou use o domínio de teste onboarding@resend.dev para começar)

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const BACKUP_EMAIL_TO = Deno.env.get('BACKUP_EMAIL_TO')!
const BACKUP_EMAIL_FROM = Deno.env.get('BACKUP_EMAIL_FROM') ?? 'onboarding@resend.dev'

const TABLES = [
  'clients', 'biddings', 'bidding_items', 'financial_accounts', 'categories',
  'empenhos', 'transactions', 'employees', 'contracts', 'receipts', 'attached_files',
] as const

Deno.serve(async (_req: Request) => {
  try {
    // Usa a service role key (acesso total) porque esta função roda em
    // segundo plano, sem um usuário logado interativamente.
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const payload: Record<string, unknown> = {
      exportedAt: new Date().toISOString(),
      version: '2.0',
      source: 'backup-automatico',
    }

    let totalRows = 0
    for (const table of TABLES) {
      const { data, error } = await supabase.from(table).select('*')
      if (error) {
        console.error(`Erro ao buscar ${table}:`, error.message)
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
        to: BACKUP_EMAIL_TO,
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
      throw new Error(`Falha ao enviar e-mail via Resend: ${errText}`)
    }

    return new Response(
      JSON.stringify({ success: true, totalRows, sentTo: BACKUP_EMAIL_TO }),
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
