-- ============================================================================
-- ConectaGov — Schema inicial
-- ============================================================================
-- Este script cria toda a estrutura do banco de dados: tabelas, segurança
-- (Row Level Security), índices e gatilhos de atualização automática.
--
-- COMO USAR: cole este arquivo inteiro no Supabase em "SQL Editor" -> "New query"
-- e clique em "Run". É seguro rodar uma vez só; se precisar rodar de novo,
-- rode antes o arquivo 000_reset.sql (cuidado: ele apaga tudo).
-- ============================================================================

-- Extensão para gerar UUIDs automaticamente
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Função utilitária: atualiza "updated_at" sozinha em qualquer UPDATE
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ----------------------------------------------------------------------------
-- TABELA: clients (Clientes / Parceiros)
-- ----------------------------------------------------------------------------
create table clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  cnpj text,
  address text,
  phone text,
  whatsapp text,
  email text,
  website text,
  is_mensalista boolean not null default false,
  valor_mensalidade numeric(14,2),
  periodo_meses integer,
  dia_vencimento integer,
  data_inicio_contrato date,
  data_cadastro date,
  data_inicio_pagamento date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_clients_user_id on clients(user_id);
create trigger trg_clients_updated_at before update on clients
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- TABELA: biddings (Licitações)
-- ----------------------------------------------------------------------------
create table biddings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  modalidade text not null,
  tipo text not null,
  objeto text not null,
  orgao text not null,
  valor_licitado numeric(14,2) not null default 0,
  valor_ofertado numeric(14,2),
  status text not null default 'Em Andamento'
    check (status in ('Em Andamento','Ganhou','Perdeu','Cancelada')),
  data_abertura date not null,
  numero_edital text,
  processo text,
  portal text,
  etapa text,
  taxa_exito numeric(6,3),
  representante text,
  observacao_etapa text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_biddings_user_id on biddings(user_id);
create index idx_biddings_client_id on biddings(client_id);
create trigger trg_biddings_updated_at before update on biddings
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- TABELA: financial_accounts (Contas e Cartões)
-- ----------------------------------------------------------------------------
create table financial_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('CORRENTE','POUPANCA','CARTEIRA','CARTAO_CREDITO')),
  bank_name text,
  starting_balance numeric(14,2) not null default 0,
  credit_limit numeric(14,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_financial_accounts_user_id on financial_accounts(user_id);
create trigger trg_financial_accounts_updated_at before update on financial_accounts
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- TABELA: categories (Categorias de Pagar/Receber — substitui arrays soltos)
-- ----------------------------------------------------------------------------
create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('Pagar','Receber')),
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, type, name)
);

create index idx_categories_user_id on categories(user_id);

-- ----------------------------------------------------------------------------
-- TABELA: empenhos
-- ----------------------------------------------------------------------------
create table empenhos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  numero_empenho text not null,
  numero_nota_fiscal text,
  client_id uuid not null references clients(id) on delete cascade,
  bidding_id uuid references biddings(id) on delete set null,
  data_empenho date not null,
  valor_empenhada numeric(14,2) not null default 0,
  percentual_comissao numeric(6,3) not null default 0,
  valor_comissao_total numeric(14,2) not null default 0,
  projetar_doze_meses boolean not null default false,
  status text not null default 'Pendente'
    check (status in ('Pendente','Faturado','Cancelado')),
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_empenhos_user_id on empenhos(user_id);
create index idx_empenhos_client_id on empenhos(client_id);
create index idx_empenhos_bidding_id on empenhos(bidding_id);
create trigger trg_empenhos_updated_at before update on empenhos
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- TABELA: transactions (Lançamentos financeiros — a pagar/receber)
-- ----------------------------------------------------------------------------
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('Pagar','Receber')),
  category text not null,
  description text not null,
  client_id uuid references clients(id) on delete cascade,
  bidding_id uuid references biddings(id) on delete cascade,
  empenho_id uuid references empenhos(id) on delete cascade,
  account_id uuid references financial_accounts(id) on delete set null,
  value numeric(14,2) not null default 0,
  due_date date not null,
  payment_date date,
  payment_method text,
  status text not null default 'Pendente'
    check (status in ('Pendente','Pago','Atrasado','Vence Hoje')),
  is_projected boolean not null default false,
  projection_parent_id text,
  projection_month_number integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_transactions_user_id on transactions(user_id);
create index idx_transactions_client_id on transactions(client_id);
create index idx_transactions_bidding_id on transactions(bidding_id);
create index idx_transactions_empenho_id on transactions(empenho_id);
create index idx_transactions_due_date on transactions(due_date);
create index idx_transactions_status on transactions(status);
create trigger trg_transactions_updated_at before update on transactions
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- TABELA: employees (Funcionários / Colaboradores)
-- ----------------------------------------------------------------------------
create table employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  role text,
  payment_type text not null check (payment_type in ('CLT','PJ','Autônomo','Estágio')),
  salary_base numeric(14,2) not null default 0,
  pix_key text,
  email text,
  phone text,
  admission_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_employees_user_id on employees(user_id);
create trigger trg_employees_updated_at before update on employees
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- TABELA: contracts (Contratos gerados)
-- ----------------------------------------------------------------------------
create table contracts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  bidding_id uuid references biddings(id) on delete set null,
  retentor_fixo_mensal numeric(14,2),
  comissao_exito numeric(6,3),
  comarca_foro text,
  clausula_adicional text,
  conteudo_gerado text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_contracts_user_id on contracts(user_id);
create index idx_contracts_client_id on contracts(client_id);
create trigger trg_contracts_updated_at before update on contracts
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- TABELA: receipts (Recibos / Orçamentos emitidos)
-- ----------------------------------------------------------------------------
create table receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  kind text not null check (kind in ('Recibo','Orcamento')),
  value numeric(14,2) not null default 0,
  city text,
  issue_date date not null default current_date,
  description text,
  created_at timestamptz not null default now()
);

create index idx_receipts_user_id on receipts(user_id);

-- ----------------------------------------------------------------------------
-- TABELA: attached_files (metadados; arquivo binário vive no Storage)
-- ----------------------------------------------------------------------------
create table attached_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  size_bytes bigint,
  mime_type text,
  storage_path text not null,
  category text not null check (category in ('Edital','Contrato','Recibo','Certidão','Outro')),
  entity_type text check (entity_type in ('licitacao','contrato','recibo','cliente','funcionario','empenho')),
  entity_id uuid,
  created_at timestamptz not null default now()
);

create index idx_attached_files_user_id on attached_files(user_id);
create index idx_attached_files_entity on attached_files(entity_type, entity_id);

-- ----------------------------------------------------------------------------
-- TABELA: audit_logs (Trilha de auditoria — somente inserção, nunca editado)
-- ----------------------------------------------------------------------------
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  details text,
  created_at timestamptz not null default now()
);

create index idx_audit_logs_user_id on audit_logs(user_id);
create index idx_audit_logs_created_at on audit_logs(created_at desc);

-- ============================================================================
-- ROW LEVEL SECURITY — cada usuário só acessa os próprios dados
-- ============================================================================
alter table clients enable row level security;
alter table biddings enable row level security;
alter table financial_accounts enable row level security;
alter table categories enable row level security;
alter table empenhos enable row level security;
alter table transactions enable row level security;
alter table employees enable row level security;
alter table contracts enable row level security;
alter table receipts enable row level security;
alter table attached_files enable row level security;
alter table audit_logs enable row level security;

-- Política padrão: o usuário só vê/edita/apaga linhas onde user_id = ele mesmo
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'clients','biddings','financial_accounts','categories','empenhos',
    'transactions','employees','contracts','receipts','attached_files','audit_logs'
  ])
  loop
    execute format('
      create policy "select_own_%1$s" on %1$s for select using (auth.uid() = user_id);
      create policy "insert_own_%1$s" on %1$s for insert with check (auth.uid() = user_id);
      create policy "update_own_%1$s" on %1$s for update using (auth.uid() = user_id);
      create policy "delete_own_%1$s" on %1$s for delete using (auth.uid() = user_id);
    ', t);
  end loop;
end $$;

-- audit_logs: sem update/delete para qualquer um (trilha imutável)
drop policy if exists "update_own_audit_logs" on audit_logs;
drop policy if exists "delete_own_audit_logs" on audit_logs;
