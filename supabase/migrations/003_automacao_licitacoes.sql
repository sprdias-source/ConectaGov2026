-- ============================================================================
-- ConectaGov — Migração 003: Automação do fluxo Licitação → Empenho → Financeiro
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS dos scripts 001 e 002.

-- ----------------------------------------------------------------------------
-- 1. BIDDINGS: novos campos
-- ----------------------------------------------------------------------------
alter table biddings
  add column if not exists data_cadastro date not null default current_date,
  add column if not exists valor_ofertado_real numeric(14,2),
  add column if not exists tipo_disputa text not null default 'Item' check (tipo_disputa in ('Item','Lote')),
  add column if not exists taxa_participacao numeric(14,2),
  add column if not exists taxa_participacao_lancada boolean not null default false;

comment on column biddings.data_cadastro is 'Data em que a licitação foi cadastrada no sistema (editável)';
comment on column biddings.data_abertura is 'Data do Pregão / sessão pública';
comment on column biddings.valor_ofertado_real is 'Valor efetivamente ofertado/vencedor (preenchido quando ganha)';
comment on column biddings.taxa_participacao is 'Valor manual da taxa de participação individual (clientes não-mensalistas)';

-- ----------------------------------------------------------------------------
-- 2. BIDDING_ITEMS: itens ou lotes da licitação
-- ----------------------------------------------------------------------------
create table if not exists bidding_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bidding_id uuid not null references biddings(id) on delete cascade,
  numero_item text not null,
  descricao text not null,
  unidade text,
  quantidade numeric(14,3) not null default 1,
  valor_unitario_licitado numeric(14,4) not null default 0,
  valor_unitario_ofertado numeric(14,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bidding_items_bidding_id on bidding_items(bidding_id);
create index if not exists idx_bidding_items_user_id on bidding_items(user_id);

create trigger trg_bidding_items_updated_at before update on bidding_items
  for each row execute function set_updated_at();

alter table bidding_items enable row level security;
create policy "select_own_bidding_items" on bidding_items for select using (auth.uid() = user_id);
create policy "insert_own_bidding_items" on bidding_items for insert with check (auth.uid() = user_id);
create policy "update_own_bidding_items" on bidding_items for update using (auth.uid() = user_id);
create policy "delete_own_bidding_items" on bidding_items for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 3. EMPENHOS: recorrência (quantidade fixa OU periodicidade contínua)
-- ----------------------------------------------------------------------------
alter table empenhos
  add column if not exists modo_parcelamento text not null default 'integral'
    check (modo_parcelamento in ('integral','quantidade_fixa','recorrente')),
  add column if not exists quantidade_parcelas integer,
  add column if not exists periodicidade text check (periodicidade in ('mensal','trimestral','semestral','anual')),
  add column if not exists recorrencia_ativa boolean not null default false;

-- bidding_id deixa de ser opcional: todo empenho novo deve vir de uma licitação.
-- (Não forçamos NOT NULL aqui para não quebrar dados já existentes; a
-- obrigatoriedade é garantida pela interface a partir desta versão.)

-- ----------------------------------------------------------------------------
-- 4. TRANSACTIONS: suporte a lançamentos recorrentes (contas fixas)
-- ----------------------------------------------------------------------------
alter table transactions
  add column if not exists is_recurring boolean not null default false,
  add column if not exists recurring_parent_id uuid references transactions(id) on delete set null,
  add column if not exists recurring_day integer;

comment on column transactions.is_recurring is 'Se true, este lançamento é um "modelo" que gera a próxima parcela automaticamente ao vencer';
comment on column transactions.recurring_parent_id is 'Referência ao lançamento original que originou esta parcela recorrente';

create index if not exists idx_transactions_recurring on transactions(is_recurring) where is_recurring = true;

-- ----------------------------------------------------------------------------
-- 5. EMPLOYEES: Pró-labore e encargos
-- ----------------------------------------------------------------------------
alter table employees
  add column if not exists inss_percentual numeric(6,3) default 11,
  add column if not exists irrf_percentual numeric(6,3) default 0,
  add column if not exists outros_encargos numeric(14,2) default 0;

comment on column employees.inss_percentual is 'Percentual de INSS retido sobre o pró-labore/salário';
comment on column employees.irrf_percentual is 'Percentual de IRRF retido';

-- ----------------------------------------------------------------------------
-- 6. CLIENTS: garantir campo de CEP para autopreenchimento
-- ----------------------------------------------------------------------------
alter table clients
  add column if not exists cep text;
