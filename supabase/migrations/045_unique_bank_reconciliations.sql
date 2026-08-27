-- ============================================================================
-- ConectaGov — Migração 045: constraint que faltava em bank_reconciliations
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS dos scripts 001 a 044.
--
-- CONTEXTO: a tela de Conciliação Bancária (Extrato OFX) salva com
-- `upsert(..., { onConflict: 'user_id,account_id,data_saldo' })`, contando
-- com uma constraint UNIQUE nessas 3 colunas pra decidir se cria uma linha
-- nova ou atualiza a conciliação já salva daquele mês/conta. Essa
-- constraint nunca foi criada em nenhuma migração anterior — a tabela
-- bank_reconciliations (migração 034) só tem a chave primária. Sem a
-- constraint, o Postgres rejeita o ON CONFLICT (erro 42P10) e a
-- conciliação NUNCA é salva, silenciosamente (a tela não tinha tratamento
-- de erro nessa falha específica — isso também foi corrigido no código).
--
-- Antes de criar a constraint, remove possíveis duplicatas que possam ter
-- se acumulado por outro caminho (pouco provável, já que o insert direto
-- sempre falhava, mas roda por segurança) — mantém sempre a mais recente.
delete from bank_reconciliations a
using bank_reconciliations b
where a.user_id = b.user_id
  and a.account_id = b.account_id
  and a.data_saldo = b.data_saldo
  and a.created_at < b.created_at;

alter table bank_reconciliations
  add constraint bank_reconciliations_user_account_data_key
  unique (user_id, account_id, data_saldo);
