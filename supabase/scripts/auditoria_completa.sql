-- ============================================================================
-- ConectaGov — Auditoria completa do banco ao vivo
-- ============================================================================
-- NÃO é uma migration (não altera nada — só faz select). É uma ferramenta
-- permanente pra resolver, de uma vez, o problema de "ficamos achando falha
-- toda hora": em vez de eu inferir o que existe no banco lendo o código do
-- frontend (que só mostra o que o app ESPERA que exista) ou pedir print por
-- print do Dashboard, essa consulta despeja em um resultado só tudo que
-- REALMENTE está no banco agora — policies de RLS (inclusive as que foram
-- criadas direto pelo Dashboard e nunca viraram migration, como aconteceu
-- com o padrão de acesso por equipe em `clients`), funções, triggers e cron
-- jobs.
--
-- Como usar: cole no SQL Editor do Supabase, rode, e copie o resultado
-- (ou exporte como CSV pelo botão de download do resultado) — é seguro
-- rodar quantas vezes quiser, sempre que precisar conferir o estado real
-- do banco contra o que este repositório documenta.

select 'TABELAS' as secao, table_name as detalhe, null as extra
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'

union all

select 'RLS_POLICY',
       tablename || ' | ' || policyname || ' | cmd=' || cmd || ' | roles=' || roles::text,
       'USING: ' || coalesce(qual, '(nenhuma)') || '  ||  WITH CHECK: ' || coalesce(with_check, '(nenhuma)')
from pg_policies
where schemaname in ('public', 'storage')

union all

select 'FUNCTION',
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'

union all

select 'TRIGGER',
       event_object_table || ' | ' || trigger_name,
       action_timing || ' ' || event_manipulation || ' -> ' || action_statement
from information_schema.triggers
where trigger_schema = 'public'

union all

select 'CRON_JOB',
       coalesce(jobname, '(sem nome)'),
       'schedule=' || schedule || '  ||  active=' || active::text || '  ||  command=' || command
from cron.job

order by 1, 2;
