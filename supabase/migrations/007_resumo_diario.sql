-- ============================================================================
-- ConectaGov — Migração 007: Resumo diário de vencimentos por e-mail
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Pré-requisitos: mesmos do backup automático (pg_cron, pg_net ativos),
-- e a Edge Function "resumo-diario-vencimentos" publicada com os
-- segredos RESEND_API_KEY, BACKUP_EMAIL_FROM e RESUMO_EMAIL_TO configurados.
--
-- Roda todo dia às 07:00 (UTC) — ajuste o horário no cron abaixo se quiser.
-- Lembre de substituir <PROJECT_REF> e <ANON_KEY> antes de rodar.

select cron.schedule(
  'resumo-diario-conectagov',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/resumo-diario-vencimentos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Para remover, se precisar:
-- select cron.unschedule('resumo-diario-conectagov');
