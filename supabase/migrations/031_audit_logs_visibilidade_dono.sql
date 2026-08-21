-- ----------------------------------------------------------------------------
-- audit_logs: dono da conta passa a enxergar também as ações dos membros
-- da equipe.
--
-- A trilha de auditoria (audit_logs) grava cada evento com user_id = quem
-- de fato executou a ação (useAuditLog.ts insere user_id: user.id). Como a
-- política de RLS original só permite "auth.uid() = user_id", um membro
-- convidado só enxergava as próprias ações — as ações dele ficavam
-- invisíveis pro dono da conta, mesmo o dono tendo acesso total a todo o
-- resto dos dados. Isso escondia justamente o que a auditoria deveria
-- registrar: o que a equipe está fazendo dentro da conta.
--
-- Esta política é puramente aditiva (políticas permissivas de SELECT se
-- combinam com OR no Postgres): só adiciona visibilidade pro dono sobre os
-- próprios membros da equipe dele (tm.owner_id = auth.uid()), nunca reduz
-- nada do que já existia nem alcança contas de outros donos.
-- ----------------------------------------------------------------------------

drop policy if exists "select_team_audit_logs" on audit_logs;

create policy "select_team_audit_logs" on audit_logs for select
using (
  exists (
    select 1
    from team_members tm
    where tm.member_user_id = audit_logs.user_id
      and tm.owner_id = auth.uid()
  )
);
