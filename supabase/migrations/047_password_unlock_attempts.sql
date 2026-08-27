-- ============================================================================
-- ConectaGov — Migração 047: lockout de senha persistido no banco
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS dos scripts 001 a 046.
--
-- CONTEXTO: o "bloqueio após 5 tentativas de senha erradas" (usado tanto
-- pra desbloquear edição de licitação já Ganhou+Homologada quanto pra
-- excluir cliente/licitação/empenho) hoje vive só no sessionStorage do
-- navegador, numa chave montada com TEXTO livre e mutável (ex: o "objeto"
-- da licitação). Isso torna o bloqueio cosmético de duas formas:
-- 1) fechar a aba/janela já reseta o contador (sessionStorage não
--    sobrevive a isso);
-- 2) editar o texto usado na chave (ex: corrigir um typo no objeto da
--    licitação) muda a chave e também reseta o contador — sem nem
--    precisar fechar nada.
-- A autenticação de verdade sempre foi validada no servidor (Supabase Auth
-- via signInWithPassword, que tem seu próprio rate-limit), então isso nunca
-- foi uma falha de autenticação — mas a proteção extra de "avisar e travar
-- a tentativa após 5 erros" não se sustentava.
--
-- Esta tabela move esse contador pro banco, associado ao ID real da
-- entidade (não a um texto que pode mudar) e ao usuário autenticado — só
-- reseta quando a senha é aceita ou depois do próprio timeout de alguns
-- minutos (controlado pelo app via updated_at), nunca só por fechar a aba
-- ou editar um campo de texto.

create table if not exists password_unlock_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  failed_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, entity_type, entity_id)
);

alter table password_unlock_attempts enable row level security;

create policy "password_unlock_attempts_select_own" on password_unlock_attempts
  for select using (auth.uid() = user_id);

create policy "password_unlock_attempts_insert_own" on password_unlock_attempts
  for insert with check (auth.uid() = user_id);

create policy "password_unlock_attempts_update_own" on password_unlock_attempts
  for update using (auth.uid() = user_id);

create policy "password_unlock_attempts_delete_own" on password_unlock_attempts
  for delete using (auth.uid() = user_id);
