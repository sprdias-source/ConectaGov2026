-- ============================================================================
-- ConectaGov — Migração 011: permite vários documentos 'manual' por cliente
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS dos scripts 001 a 010.
--
-- O QUE FAZ: a tabela client_documents tem uma constraint única em
-- (user_id, client_id, tipo). Isso é correto pras 7 certidões automáticas
-- (cndt, fgts etc — só faz sentido ter UMA por cliente), mas documentos
-- 'manual' (Contrato Social, CNPJ, Atestado, CREA/CAU...) sempre
-- compartilham tipo='manual' e são vários por cliente, de propósito — o
-- código já sabia disso (insert simples pra 'manual', upsert só nas
-- certidões), mas a constraint do banco barrava mesmo assim: o segundo
-- documento manual de qualquer cliente sempre falhava com "duplicate key
-- value violates unique constraint client_documents_user_client_tipo_key".
--
-- Troca a constraint por uma coluna gerada (tipo_dedup): NULL quando
-- tipo='manual' (Postgres trata cada NULL como distinto — múltiplos
-- 'manual' convivem sem violar unicidade) e igual a `tipo` nos outros
-- casos (onde a unicidade de um-por-cliente continua valendo de verdade).

alter table client_documents drop constraint if exists client_documents_user_client_tipo_key;

alter table client_documents add column if not exists tipo_dedup text
  generated always as (case when tipo = 'manual' then null else tipo end) stored;

alter table client_documents drop constraint if exists client_documents_user_client_tipo_dedup_key;
alter table client_documents add constraint client_documents_user_client_tipo_dedup_key
  unique (user_id, client_id, tipo_dedup);
