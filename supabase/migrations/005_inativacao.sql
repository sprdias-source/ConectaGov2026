-- ============================================================================
-- ConectaGov — Migração 005: Inativação reversível (em vez de exclusão)
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS dos scripts 001 a 004.
--
-- O QUE FAZ: adiciona a opção de "inativar" Clientes, Licitações e
-- Empenhos em vez de excluir — preserva 100% do histórico financeiro
-- (transações pagas, comissões recebidas) mesmo quando o cadastro não é
-- mais usado no dia a dia. A exclusão definitiva continua disponível,
-- mas passa a ser uma ação separada e protegida por confirmação de senha.

alter table clients add column if not exists is_active boolean not null default true;
alter table biddings add column if not exists is_active boolean not null default true;
alter table empenhos add column if not exists is_active boolean not null default true;

create index if not exists idx_clients_is_active on clients(is_active);
create index if not exists idx_biddings_is_active on biddings(is_active);
create index if not exists idx_empenhos_is_active on empenhos(is_active);
