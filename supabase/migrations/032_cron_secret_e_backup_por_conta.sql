-- ============================================================================
-- ConectaGov — Migração 032: segredo no agendamento do backup/resumo diário
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
--
-- CONTEXTO: as Edge Functions "backup-semanal" e "resumo-diario-vencimentos"
-- foram corrigidas pra não vazar dado entre contas diferentes (antes
-- buscavam tudo com a service role key sem filtrar por dono da conta) e
-- agora exigem um cabeçalho secreto (x-cron-secret) pra rodar — sem isso,
-- qualquer pessoa de posse da anon key (pública, embutida no frontend)
-- podia disparar essas funções repetidamente.
--
-- PRÉ-REQUISITOS (fazer antes de rodar este script):
-- 1. Faça o deploy das duas Edge Functions atualizadas (backup-semanal e
--    resumo-diario-vencimentos).
-- 2. Escolha um segredo forte qualquer (ex: gere uma string aleatória) e
--    configure ele como CRON_SECRET nos Secrets de AMBAS as Edge Functions
--    (Supabase → Edge Functions → backup-semanal → Secrets, e o mesmo em
--    resumo-diario-vencimentos → Secrets).
--
-- Substitua <PROJECT_REF>, <ANON_KEY> e <CRON_SECRET> abaixo antes de
-- rodar (o mesmo <CRON_SECRET> que você configurou no passo 2).

-- Re-agendar com o mesmo nome de job ATUALIZA o agendamento existente
-- (não cria duplicado).
select cron.schedule(
  'backup-diario-conectagov',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/backup-semanal',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'resumo-diario-conectagov',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/resumo-diario-vencimentos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Pra conferir se os agendamentos foram atualizados:
-- select * from cron.job where jobname in ('backup-diario-conectagov', 'resumo-diario-conectagov');
