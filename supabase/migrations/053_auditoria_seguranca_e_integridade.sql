-- ============================================================================
-- ConectaGov — Migração 053: correções da auditoria/perícia completa do sistema
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
--
-- Reúne as correções de banco de dados encontradas na auditoria de
-- segurança/RLS e na auditoria de schema/integridade pedidas pelo usuário:
--
--   1) FK real de user_id -> auth.users nas 7 tabelas do módulo Contabilidade
--      (migração 051) — eram a única exceção em toda a base sem essa FK.
--   2) FK real em bidding_checklist_items.client_document_id (hoje só
--      protegida por trigger de aplicação, sem garantia do banco).
--   3) Índices faltando em transactions.account_id e
--      notas_fiscais_emitidas.client_id.
--   4) system_settings: hoje é uma tabela global (sem user_id) com policy
--      de update/insert liberada pra QUALQUER usuário autenticado do
--      sistema — ou seja, qualquer conta pode sobrescrever a configuração
--      padrão de NFS-e de qualquer outra conta. Corrige adicionando
--      user_id e escopando por dono (mesmo padrão de owner_efetivo já
--      usado em todo o resto do sistema).
--   5) captcha_sessions: adiciona um token de acesso opaco (token_acesso) e
--      duas funções RPC (security definer) pra que o navegador remoto do
--      Browserless publique a imagem do captcha e consulte a resposta sem
--      precisar do token de sessão (JWT) completo do usuário — reduz o
--      dado exposto a um provedor terceiro a um segredo de uso único,
--      restrito a uma linha só, em vez de um token que serve pra agir
--      como o usuário em qualquer parte da API até ele expirar.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) FK de user_id nas tabelas do módulo Contabilidade (migração 051)
-- ----------------------------------------------------------------------------
-- "alter table ... add constraint" não tem uma forma nativa de "se não
-- existir" (diferente de "add column if not exists", usado no resto desta
-- migração) — por isso cada uma vai num bloco que confere em pg_constraint
-- antes de criar. Sem isso, colar este script de novo (ex: depois de uma
-- execução anterior que parou no meio por outro motivo) falha com
-- "constraint ... already exists" em vez de simplesmente não fazer nada.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'empresa_perfil_user_id_fkey') then
    alter table empresa_perfil
      add constraint empresa_perfil_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'regime_tributario_historico_user_id_fkey') then
    alter table regime_tributario_historico
      add constraint regime_tributario_historico_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'simples_nacional_faixas_user_id_fkey') then
    alter table simples_nacional_faixas
      add constraint simples_nacional_faixas_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'simples_nacional_partilha_user_id_fkey') then
    alter table simples_nacional_partilha
      add constraint simples_nacional_partilha_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'tipos_servico_user_id_fkey') then
    alter table tipos_servico
      add constraint tipos_servico_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'notas_fiscais_emitidas_user_id_fkey') then
    alter table notas_fiscais_emitidas
      add constraint notas_fiscais_emitidas_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'grupos_contabeis_user_id_fkey') then
    alter table grupos_contabeis
      add constraint grupos_contabeis_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2) FK real em bidding_checklist_items.client_document_id
-- ----------------------------------------------------------------------------
-- Mesmo comportamento que já existe hoje via trigger de aplicação
-- (trg_compliance_apos_exclusao_documento, migração 041) — "on delete set
-- null" só passa a ser garantido pelo banco também, não só pela aplicação.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bidding_checklist_items_client_document_id_fkey') then
    alter table bidding_checklist_items
      add constraint bidding_checklist_items_client_document_id_fkey
      foreign key (client_document_id) references client_documents(id) on delete set null;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3) Índices faltando
-- ----------------------------------------------------------------------------
create index if not exists idx_transactions_account_id on transactions(account_id);
create index if not exists idx_notas_fiscais_emitidas_client_id on notas_fiscais_emitidas(client_id);

-- ----------------------------------------------------------------------------
-- 4) system_settings escopado por dono da conta
-- ----------------------------------------------------------------------------
-- Adiciona user_id (nullable por enquanto: uma linha global antiga, sem
-- dono, deixa de ser visível pra qualquer conta depois da troca de policy
-- abaixo — o app já trata "sem configuração salva" caindo pros valores
-- padrão em código, então não há erro nenhum, só uma configuração que
-- volta a pedir pra ser salva de novo uma vez).
alter table system_settings add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Chave key deixa de ser suficiente sozinha pra identificar uma linha —
-- agora é (key, user_id) que precisa ser único, uma linha por conta por
-- chave de configuração.
alter table system_settings drop constraint if exists system_settings_pkey;
alter table system_settings add column if not exists id uuid not null default gen_random_uuid();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'system_settings_pkey') then
    alter table system_settings add constraint system_settings_pkey primary key (id);
  end if;
end $$;

create unique index if not exists idx_system_settings_key_user_id on system_settings(key, user_id);

-- Mesmo padrão usado em ~30 outras tabelas do sistema (migração 041): o
-- trigger sobrescreve user_id pra owner_efetivo(auth.uid()) em todo INSERT
-- feito por um usuário autenticado, então tanto o dono quanto um membro de
-- equipe (com permissão de edição) sempre gravam a configuração sob a
-- conta certa.
drop trigger if exists trg_system_settings_owner_efetivo_insert on system_settings;
create trigger trg_system_settings_owner_efetivo_insert
before insert on system_settings
for each row execute function set_owner_efetivo_on_insert();

drop trigger if exists trg_system_settings_owner_efetivo_update on system_settings;
create trigger trg_system_settings_owner_efetivo_update
before update on system_settings
for each row execute function preserve_owner_on_update();

drop policy if exists "select_system_settings" on system_settings;
drop policy if exists "update_system_settings" on system_settings;
drop policy if exists "insert_system_settings" on system_settings;

create policy "select_system_settings" on system_settings for select
  using (user_id = owner_efetivo(auth.uid()));
create policy "insert_system_settings" on system_settings for insert
  with check (user_id = owner_efetivo(auth.uid()));
create policy "update_system_settings" on system_settings for update
  using (user_id = owner_efetivo(auth.uid()))
  with check (user_id = owner_efetivo(auth.uid()));

-- ----------------------------------------------------------------------------
-- 5) captcha_sessions: token de acesso opaco pro navegador remoto usar
-- ----------------------------------------------------------------------------
alter table captcha_sessions add column if not exists token_acesso uuid not null default gen_random_uuid();

-- Publica a imagem do captcha lida da página do TST — só funciona pra uma
-- sessão que ainda está "aguardando" e com o token certo (par id+token é
-- imprevisível o suficiente pra servir de segredo de uso único: são 2 uuids
-- aleatórios, um deles nunca exposto fora do backend até este ponto).
create or replace function public.captcha_session_publicar_imagem(p_id uuid, p_token uuid, p_imagem text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update captcha_sessions
  set imagem_base64 = p_imagem
  where id = p_id and token_acesso = p_token and status = 'aguardando';
  return found;
end;
$$;

-- Consulta status/resposta da mesma sessão — usado pelo navegador remoto
-- em loop enquanto espera o usuário responder pela tela do ConectaGov.
create or replace function public.captcha_session_consultar(p_id uuid, p_token uuid)
returns table(status text, resposta text)
language sql
security definer
set search_path to 'public'
as $$
  select status, resposta from captcha_sessions
  where id = p_id and token_acesso = p_token;
$$;

-- O navegador remoto (Browserless) não está autenticado como o usuário —
-- chama essas funções só com a anon key, por isso o grant pro papel anon.
grant execute on function public.captcha_session_publicar_imagem(uuid, uuid, text) to anon, authenticated;
grant execute on function public.captcha_session_consultar(uuid, uuid) to anon, authenticated;
