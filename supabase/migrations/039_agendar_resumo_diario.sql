-- ============================================================================
-- ConectaGov — Migração 039: agenda o resumo diário de vencimentos
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
--
-- CONTEXTO: a Edge Function `resumo-diario-vencimentos` já existe e já foi
-- corrigida (per-conta, exige x-cron-secret), mas nunca esteve realmente
-- agendada em produção — `select * from cron.job` não mostra nenhum job
-- chamando ela. Esta migration ativa esse agendamento pela primeira vez.
--
-- Substitua <CRON_SECRET> pelo mesmo valor já configurado como secret
-- CRON_SECRET nas Edge Functions (o mesmo usado em backup-diario) antes de
-- rodar. Roda todo dia às 07:00 (UTC) — ajuste o horário no cron abaixo se
-- quiser outro.
--
-- Esta migração substitui a parte de resumo-diario-vencimentos que estava
-- na migration 032 — a 032 também agendava backup-semanal, que foi
-- descontinuada (o backup real é feito por backup-diario, já corrigido e
-- agendado separadamente na migration 038). Não rode a 032.

select cron.schedule(
  'resumo-diario-conectagov',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://pdsxigexvxosahdcnsak.supabase.co/functions/v1/resumo-diario-vencimentos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1),
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Pra conferir:
-- select jobid, schedule, command from cron.job where command ilike '%resumo-diario-vencimentos%';
