-- ============================================================================
-- ConectaGov — Migração 038: segredo no cron job real do backup diário
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
--
-- CONTEXTO: a migration 032 corrigiu e reagendou o cron do `backup-semanal`
-- — mas uma investigação direta em `select * from cron.job` revelou que o
-- cron REAL de produção não chama `backup-semanal`, chama uma Edge
-- Function separada chamada `backup-diario` (criada direto no Supabase
-- quando o backup passou a ser diário, nunca trazida pro repositório até
-- agora — ver supabase/functions/backup-diario/index.ts). Essa function
-- tinha o mesmo problema de vazamento entre contas já corrigido em
-- backup-semanal, e foi corrigida do mesmo jeito nesta rodada.
--
-- Diferente da migration 032 (que assumia autenticação via anon key), o
-- job real usa a service_role_key lida do Vault do Supabase
-- (`vault.decrypted_secrets`) — mantido como está aqui, só ACRESCENTA o
-- cabeçalho `x-cron-secret` que a function corrigida passa a exigir.
--
-- PRÉ-REQUISITOS (fazer ANTES de rodar este script — se pular a ordem, o
-- backup diário para de rodar):
-- 1. Faça o deploy da Edge Function atualizada `backup-diario` (o código já
--    está em supabase/functions/backup-diario/index.ts).
-- 2. Configure o secret CRON_SECRET na function `backup-diario` (mesmo
--    valor forte usado em backup-semanal, se já tiver configurado lá).
--
-- Substitua <CRON_SECRET> abaixo pelo valor real antes de rodar.

do $$
declare
  v_jobid bigint;
  v_schedule text;
begin
  select jobid, schedule into v_jobid, v_schedule
  from cron.job
  where command ilike '%/functions/v1/backup-diario%'
  limit 1;

  if v_jobid is null then
    raise notice 'Nenhum cron job encontrado chamando backup-diario — confira manualmente com select * from cron.job;';
  else
    perform cron.alter_job(
      job_id := v_jobid,
      command := $cmd$
        select net.http_post(
          url := 'https://pdsxigexvxosahdcnsak.supabase.co/functions/v1/backup-diario',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1),
            'x-cron-secret', '<CRON_SECRET>'
          ),
          body := '{}'::jsonb
        );
      $cmd$
    );
    raise notice 'Cron job % (backup-diario, agendado para %) atualizado com x-cron-secret.', v_jobid, v_schedule;
  end if;
end $$;

-- Pra conferir depois:
-- select jobid, schedule, command from cron.job where command ilike '%backup-diario%';
