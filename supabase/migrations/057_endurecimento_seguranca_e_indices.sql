-- ============================================================================
-- ConectaGov — Migração 057: endurecimento de segurança + índices faltando
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS dos scripts 001 a 056.
--
-- Lote 1 da perícia técnica de 2026-09: correções que não mudam nenhum
-- comportamento visível do sistema — só fecham lacunas de segurança/
-- performance introduzidas ao longo do histórico de migrations.
--
--   1) search_path fixo nas funções SECURITY DEFINER que faltavam —
--      owner_efetivo/tem_acesso (as duas funções por trás de quase toda
--      policy de RLS do sistema) e as duas funções de diagnóstico da
--      página /diagnostico. Sem `set search_path`, uma função SECURITY
--      DEFINER resolve nomes de tabela pelo search_path da SESSÃO de quem
--      chama — um usuário autenticado (grant já existia) que conseguisse
--      manipular o próprio search_path poderia, em teoria, fazer essas
--      funções lerem de tabelas forjadas. Mesmo padrão já usado nas
--      funções do captcha (migração 053).
--   2) Constraint de bank_reconciliations (migração 045) reaplicada de
--      forma idempotente — hoje falha se colada de novo do zero.
--   3) Índices que faltavam: team_members.member_user_id/owner_id (lidas
--      em toda policy de RLS via owner_efetivo/tem_acesso — sem índice,
--      full scan a cada query autenticada do sistema inteiro), as 20
--      tabelas da migração 034 (nenhuma tinha índice em user_id nem nas
--      FKs) e as colunas de data das migrações 054/055 (Central de
--      Prazos, Repasse por Cliente).
--
-- (O item 4 original — UNIQUE em licitacoes_pncp pra nunca duplicar o
-- mesmo processo do PNCP — foi removido: a busca automática do PNCP não
-- é uma função que este sistema atende.)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) search_path fixo
-- ----------------------------------------------------------------------------
create or replace function public.owner_efetivo(usuario_id uuid)
returns uuid
language sql
stable security definer
set search_path to 'public'
as $$
  select coalesce(
    (select owner_id from team_members
     where member_user_id = usuario_id and status = 'ativo'
     limit 1),
    usuario_id
  )
$$;

create or replace function public.tem_acesso(usuario_id uuid, ferramenta text, nivel_minimo text)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from team_members tm
    join member_permissions mp on mp.team_member_id = tm.id
    where tm.member_user_id = usuario_id
      and tm.status = 'ativo'
      and mp.tool_key = ferramenta
      and (
        (nivel_minimo = 'visualizacao' and mp.nivel_acesso in ('visualizacao', 'edicao'))
        or
        (nivel_minimo = 'edicao' and mp.nivel_acesso = 'edicao')
      )
  )
$$;

create or replace function public.check_employees_payment_type_constraint()
returns boolean
language sql
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from pg_constraint
    where conname = 'employees_payment_type_check'
      and pg_get_constraintdef(oid) like '%Sócio/Pró-labore%'
  );
$$;

create or replace function public.check_empenho_bidding_cascade()
returns boolean
language sql
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from pg_constraint
    where conname = 'empenhos_bidding_id_fkey'
      and confdeltype = 'c'
  );
$$;

-- ----------------------------------------------------------------------------
-- 2) Constraint de bank_reconciliations, de forma idempotente
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bank_reconciliations_user_account_data_key') then
    alter table bank_reconciliations
      add constraint bank_reconciliations_user_account_data_key
      unique (user_id, account_id, data_saldo);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3) Índices faltando
-- ----------------------------------------------------------------------------
create index if not exists idx_team_members_member_user_id on team_members(member_user_id);
create index if not exists idx_team_members_owner_id on team_members(owner_id);

create index if not exists idx_atestados_tecnicos_user_id on atestados_tecnicos(user_id);
create index if not exists idx_atestados_tecnicos_client_id on atestados_tecnicos(client_id);

create index if not exists idx_bank_reconciliations_user_id on bank_reconciliations(user_id);
create index if not exists idx_bank_reconciliations_account_id on bank_reconciliations(account_id);

create index if not exists idx_bidding_analysis_user_id on bidding_analysis(user_id);
create index if not exists idx_bidding_analysis_bidding_id on bidding_analysis(bidding_id);

create index if not exists idx_bidding_analysis_juridica_user_id on bidding_analysis_juridica(user_id);
create index if not exists idx_bidding_analysis_juridica_bidding_id on bidding_analysis_juridica(bidding_id);

create index if not exists idx_bidding_checklist_items_user_id on bidding_checklist_items(user_id);
create index if not exists idx_bidding_checklist_items_bidding_id on bidding_checklist_items(bidding_id);
create index if not exists idx_bidding_checklist_items_client_document_id on bidding_checklist_items(client_document_id);

create index if not exists idx_bidding_items_versions_user_id on bidding_items_versions(user_id);
create index if not exists idx_bidding_items_versions_bidding_id on bidding_items_versions(bidding_id);

create index if not exists idx_busca_pncp_config_user_id on busca_pncp_config(user_id);

create index if not exists idx_captcha_sessions_user_id on captcha_sessions(user_id);
create index if not exists idx_captcha_sessions_client_id on captcha_sessions(client_id);

create index if not exists idx_client_documents_user_id on client_documents(user_id);
create index if not exists idx_client_documents_client_id on client_documents(client_id);

create index if not exists idx_client_prefeituras_user_id on client_prefeituras(user_id);
create index if not exists idx_client_prefeituras_client_id on client_prefeituras(client_id);

create index if not exists idx_contract_marcos_user_id on contract_marcos(user_id);
create index if not exists idx_contract_marcos_contract_id on contract_marcos(contract_id);

create index if not exists idx_document_logs_user_id on document_logs(user_id);
create index if not exists idx_document_logs_client_id on document_logs(client_id);

create index if not exists idx_licitacoes_pncp_user_id on licitacoes_pncp(user_id);
create index if not exists idx_licitacoes_pncp_busca_config_id on licitacoes_pncp(busca_config_id);

create index if not exists idx_modelos_documentos_user_id on modelos_documentos(user_id);
create index if not exists idx_payment_methods_user_id on payment_methods(user_id);
create index if not exists idx_personal_events_user_id on personal_events(user_id);

create index if not exists idx_empenhos_data_vencimento on empenhos(data_vencimento) where data_vencimento is not null;
create index if not exists idx_transactions_data_vencimento_prefeitura on transactions(data_vencimento_prefeitura) where data_vencimento_prefeitura is not null;
create index if not exists idx_transactions_data_liquidacao_prefeitura on transactions(data_liquidacao_prefeitura) where data_liquidacao_prefeitura is not null;

-- Item 4 da perícia original (UNIQUE em licitacoes_pncp pra nunca duplicar
-- o mesmo processo do PNCP encontrado pela mesma busca) foi removido —
-- a busca automática do PNCP não é uma função que este sistema atende,
-- então não faz sentido corrigir uma constraint pra ela.
