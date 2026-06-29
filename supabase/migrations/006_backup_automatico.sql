-- ============================================================================
-- ConectaGov — Migração 006: Backup automático agendado
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS dos scripts 001 a 005.
--
-- PRÉ-REQUISITOS (fazer antes de rodar este script):
-- 1. No painel do Supabase, vá em Database → Extensions e ative "pg_cron"
--    e "pg_net" (ambas gratuitas, é só clicar em "Enable")
-- 2. Faça o deploy da Edge Function "backup-semanal" (veja README da pasta
--    supabase/functions/backup-semanal)
-- 3. Configure os 3 segredos da função (RESEND_API_KEY, BACKUP_EMAIL_TO,
--    BACKUP_EMAIL_FROM) em Edge Functions → backup-semanal → Secrets
--
-- O QUE ESTE SCRIPT FAZ: agenda a função para rodar todo dia às 6h da manhã
-- (horário de Brasília). Você pode trocar a frequência editando o cron
-- abaixo (ex: '0 6 * * 1' = toda segunda-feira às 6h, para backup semanal).

-- Substitua <PROJECT_REF> pela referência do seu projeto (a parte do meio
-- da sua URL: https://<PROJECT_REF>.supabase.co) e <ANON_KEY> pela sua
-- chave anon antes de rodar este script.

select cron.schedule(
  'backup-diario-conectagov',
  '0 6 * * *',  -- todo dia às 06:00 (UTC). Ajuste se quiser outro horário/frequência.
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/backup-semanal',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Para verificar se o agendamento foi criado:
-- select * from cron.job;

-- Para remover o agendamento, se precisar:
-- select cron.unschedule('backup-diario-conectagov');
