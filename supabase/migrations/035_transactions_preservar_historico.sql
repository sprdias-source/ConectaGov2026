-- ============================================================================
-- ConectaGov — Migração 035: preservar histórico financeiro na exclusão
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
--
-- CONTEXTO: a migration 005 criou o recurso de inativar cliente/licitação/
-- empenho (em vez de excluir) especificamente pra "preservar 100% do
-- histórico financeiro (transações pagas, comissões recebidas)". Só que a
-- opção de exclusão DEFINITIVA continua disponível na interface (com um
-- aviso), e as chaves estrangeiras de transactions.client_id,
-- transactions.bidding_id e transactions.empenho_id foram criadas como
-- "on delete cascade" — ou seja, excluir definitivamente um cliente, uma
-- licitação ou um empenho apaga em cascata TODAS as transações (inclusive
-- já pagas/recebidas) vinculadas a eles, o contrário exato do que a
-- migration 005 se propôs a garantir.
--
-- Esta migration troca essas 3 chaves de CASCADE pra SET NULL: excluir o
-- cliente/licitação/empenho definitivamente continua funcionando, mas as
-- transações já lançadas (principalmente as pagas) sobrevivem — só ficam
-- com o vínculo removido (client_id/bidding_id/empenho_id passam a null),
-- em vez de serem apagadas junto. As 3 colunas já eram opcionais (aceitam
-- null), então não é necessário nenhum ajuste de schema além da constraint.
--
-- Deliberadamente NÃO mexe nas outras chaves em cascata do sistema
-- (biddings.client_id, contracts.client_id, empenhos.bidding_id) — essas
-- guardam o próprio registro de negócio (a licitação, o contrato jurídico,
-- o empenho em si), não a transação financeira, e a interface já avisa
-- explicitamente sobre essa perda antes de excluir (ver ClientsTab.tsx).
-- Mudar esse comportamento também seria uma decisão de produto diferente,
-- fora do escopo desta correção pontual sobre histórico financeiro.

alter table transactions drop constraint if exists transactions_client_id_fkey;
alter table transactions add constraint transactions_client_id_fkey
  foreign key (client_id) references clients(id) on delete set null;

alter table transactions drop constraint if exists transactions_bidding_id_fkey;
alter table transactions add constraint transactions_bidding_id_fkey
  foreign key (bidding_id) references biddings(id) on delete set null;

alter table transactions drop constraint if exists transactions_empenho_id_fkey;
alter table transactions add constraint transactions_empenho_id_fkey
  foreign key (empenho_id) references empenhos(id) on delete set null;
