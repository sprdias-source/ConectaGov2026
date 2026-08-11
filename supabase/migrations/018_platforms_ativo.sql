-- ============================================================================
-- ConectaGov — Migração 018: Inativar plataformas do catálogo
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
--
-- O QUE FAZ: como platforms.id é referenciado por opportunities e
-- client_platforms com "on delete restrict" (de propósito — não apaga em
-- cascata o histórico de vários clientes/oportunidades de uma vez), nem
-- sempre dá pra EXCLUIR uma plataforma que já tem uso — a alternativa é
-- INATIVAR: continua existindo pro histórico, mas some das opções de
-- seleção pra novas oportunidades/assinaturas.

alter table platforms add column if not exists ativo boolean not null default true;
