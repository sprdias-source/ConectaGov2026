-- ============================================================================
-- ConectaGov — Migração 059: dados bancários editáveis na Proposta Readequada
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS dos scripts 001 a 058.
--
-- A Proposta Readequada (Word e PDF) passou a mostrar Banco/Agência/Conta
-- Corrente do cliente. Mas o cliente pode querer receber o pagamento de UMA
-- licitação específica numa conta diferente da cadastrada — sem alterar o
-- cadastro permanente do cliente (que vale pra todas as outras propostas).
--
-- Estas 3 colunas seguem exatamente o mesmo padrão de
-- proposta_texto_abertura/proposta_texto_fechamento (migração 040): nulas
-- por padrão (usa o cadastro do cliente normalmente); se alguém digitar um
-- valor aqui na tela da Proposta Readequada, vale só para esta licitação.
alter table biddings add column if not exists proposta_banco_nome text;
alter table biddings add column if not exists proposta_banco_agencia text;
alter table biddings add column if not exists proposta_banco_conta text;
