-- ============================================================================
-- ConectaGov — Migração 012: Cadastro de Plataformas + assinatura por cliente
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS dos scripts 001 a 011.
--
-- O QUE FAZ: duas tabelas novas.
-- - platforms: catálogo reutilizável de plataformas de licitação (nome,
--   site, tipo padrão pago/gratuito) — cadastra uma vez, reaproveita em
--   quantos clientes precisar.
-- - client_platforms: a assinatura de um cliente numa plataforma do
--   catálogo — mensalidade, vencimento, e a antecedência do aviso de
--   vencimento em dias, EDITÁVEL por assinatura (cada cliente pode
--   preferir um número de dias diferente).

create table if not exists platforms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  url text,
  tipo_padrao text not null default 'paga' check (tipo_padrao in ('paga', 'gratuita')),
  valor_padrao numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists client_platforms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  -- "restrict" de propósito: apagar uma plataforma do catálogo não pode
  -- silenciosamente sumir com o histórico de assinatura de vários
  -- clientes — desvincula (ou desativa) as assinaturas primeiro.
  platform_id uuid not null references platforms(id) on delete restrict,
  tipo text not null default 'paga' check (tipo in ('paga', 'gratuita')),
  valor_mensalidade numeric,
  data_vencimento date,
  dias_aviso_vencimento integer not null default 15,
  ativo boolean not null default true,
  login text,
  senha text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_platforms_client_id on client_platforms(client_id);
create index if not exists idx_client_platforms_platform_id on client_platforms(platform_id);

alter table platforms enable row level security;
alter table client_platforms enable row level security;

drop policy if exists "select_own_platforms" on platforms;
drop policy if exists "insert_own_platforms" on platforms;
drop policy if exists "update_own_platforms" on platforms;
drop policy if exists "delete_own_platforms" on platforms;

create policy "select_own_platforms" on platforms for select using (auth.uid() = user_id);
create policy "insert_own_platforms" on platforms for insert with check (auth.uid() = user_id);
create policy "update_own_platforms" on platforms for update using (auth.uid() = user_id);
create policy "delete_own_platforms" on platforms for delete using (auth.uid() = user_id);

drop policy if exists "select_own_client_platforms" on client_platforms;
drop policy if exists "insert_own_client_platforms" on client_platforms;
drop policy if exists "update_own_client_platforms" on client_platforms;
drop policy if exists "delete_own_client_platforms" on client_platforms;

create policy "select_own_client_platforms" on client_platforms for select using (auth.uid() = user_id);
create policy "insert_own_client_platforms" on client_platforms for insert with check (auth.uid() = user_id);
create policy "update_own_client_platforms" on client_platforms for update using (auth.uid() = user_id);
create policy "delete_own_client_platforms" on client_platforms for delete using (auth.uid() = user_id);
