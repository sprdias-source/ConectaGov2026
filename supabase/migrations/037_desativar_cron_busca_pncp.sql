-- ============================================================================
-- ConectaGov — Migração 037: desativa o cron job de busca PNCP
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
--
-- CONTEXTO: a Edge Function `buscar-licitacoes-pncp` (nunca versionada
-- neste repositório) estava agendada via pg_cron, rodando diariamente com
-- a service_role_key (acesso total ao banco), alimentando as tabelas
-- `busca_pncp_config`/`licitacoes_pncp` — recurso confirmado pelo usuário
-- como uma ideia que não vingou e não tem mais uso. Sem frontend nenhum
-- consumindo essas tabelas, deixar o cron rodando é gasto à toa (tempo de
-- execução + uma function com privilégio total sendo invocada todo dia
-- sem propósito).
--
-- Este script só remove o AGENDAMENTO — não apaga a Edge Function, nem as
-- tabelas, nem qualquer dado que já tenha sido coletado. Se um dia quiser
-- reativar, basta reagendar com cron.schedule(...) de novo.
--
-- Não sabemos o "jobname" exato desse agendamento (só vimos o jobid na
-- consulta anterior) — por segurança, em vez de arriscar um nome errado
-- (que poderia cancelar o job errado, como o do backup), a busca abaixo
-- localiza o job pelo CONTEÚDO real do comando (a URL da function, que já
-- foi confirmada) e cancela só esse, usando cron.unschedule(jobid), que é
-- a forma aceita em qualquer versão do pg_cron.

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where command ilike '%buscar-licitacoes-pncp%'
  limit 1;

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
    raise notice 'Cron job % (buscar-licitacoes-pncp) desativado.', v_jobid;
  else
    raise notice 'Nenhum cron job encontrado com "buscar-licitacoes-pncp" no comando — nada a desativar (talvez já tenha sido removido).';
  end if;
end $$;
