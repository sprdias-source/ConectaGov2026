-- ============================================================================
-- ConectaGov — Migração 067: vínculo de transações com o funcionário (folha)
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
--
-- ACHADO DA SIMULAÇÃO: o lançamento de folha/comissões de sócio
-- (FuncionariosPage.tsx, handleClosePayroll) grava o funcionário só como
-- TEXTO LIVRE dentro de `description` ("... — Nome do Funcionário (mês)")
-- — não existe nenhuma coluna ligando transactions a employees. Renomear
-- ou excluir o funcionário quebra silenciosamente a única forma de
-- rastrear o histórico financeiro dele, e não há como consultar "todos os
-- lançamentos deste colaborador" de forma confiável.
--
-- Mesmo padrão de client_id/bidding_id/empenho_id (migração 035): ON
-- DELETE SET NULL — excluir um funcionário nunca apaga os lançamentos já
-- gerados a partir dele, só desfaz o vínculo (o texto na descrição
-- continua existindo como registro histórico).
alter table transactions add column if not exists employee_id uuid references employees(id) on delete set null;

create index if not exists idx_transactions_employee_id on transactions(employee_id) where employee_id is not null;
