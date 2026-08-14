-- ============================================================================
-- ConectaGov — Migração 022: Perfis de Precificação
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
--
-- O QUE FAZ: adiciona "Perfis de Precificação" (inspirado na Precificação
-- Avançada da Licitei) — perfis reutilizáveis de Margem + linhas de
-- Impostos/Despesas, aplicáveis em lote aos itens de qualquer licitação
-- pra calcular o Valor Mínimo pela mesma fórmula de markup divisor já usada
-- na Calculadora de Formação de Preço:
--   Valor Mínimo = Custo Unitário ÷ ((100% − Impostos% − Despesas% − Margem%) ÷ 100)
--
-- Os impostos/despesas ficam em tabela própria (não um jsonb) porque cada
-- linha precisa de nome + percentual individuais, editáveis e ordenáveis —
-- diferente de LicitaiBuscaFiltros (que é um formulário fixo de ~20 campos).

create table if not exists pricing_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  descricao text,
  margem_pct numeric(6,3) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pricing_profile_lines (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references pricing_profiles(id) on delete cascade,
  tipo text not null check (tipo in ('imposto', 'despesa')),
  nome text not null,
  percentual numeric(6,3) not null default 0,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_pricing_profile_lines_profile_id on pricing_profile_lines(profile_id);

-- Campos novos em bidding_items: o custo unitário é o que falta pra fazer a
-- conta (hoje só guardamos o valor licitado/ofertado ao órgão, não o que se
-- paga ao fornecedor); os demais guardam o resultado da última aplicação de
-- um perfil, "fotografado" no item — assim, se o perfil for editado ou
-- excluído depois, o valor já calculado continua ali (mesmo comportamento
-- descrito no fluxo da Licitei: excluir perfil não apaga valores aplicados).
alter table bidding_items
  add column if not exists custo_unitario numeric(14,2),
  add column if not exists valor_minimo_calculado numeric(14,2),
  add column if not exists participa_precificacao boolean not null default true,
  add column if not exists pricing_profile_id uuid references pricing_profiles(id) on delete set null,
  add column if not exists impostos_pct_aplicado numeric(6,3),
  add column if not exists despesas_pct_aplicado numeric(6,3),
  add column if not exists margem_pct_aplicada numeric(6,3);

alter table pricing_profiles enable row level security;
alter table pricing_profile_lines enable row level security;

drop policy if exists "select_own_pricing_profiles" on pricing_profiles;
drop policy if exists "insert_own_pricing_profiles" on pricing_profiles;
drop policy if exists "update_own_pricing_profiles" on pricing_profiles;
drop policy if exists "delete_own_pricing_profiles" on pricing_profiles;

create policy "select_own_pricing_profiles" on pricing_profiles for select using (auth.uid() = user_id);
create policy "insert_own_pricing_profiles" on pricing_profiles for insert with check (auth.uid() = user_id);
create policy "update_own_pricing_profiles" on pricing_profiles for update using (auth.uid() = user_id);
create policy "delete_own_pricing_profiles" on pricing_profiles for delete using (auth.uid() = user_id);

drop policy if exists "select_own_pricing_profile_lines" on pricing_profile_lines;
drop policy if exists "insert_own_pricing_profile_lines" on pricing_profile_lines;
drop policy if exists "update_own_pricing_profile_lines" on pricing_profile_lines;
drop policy if exists "delete_own_pricing_profile_lines" on pricing_profile_lines;

create policy "select_own_pricing_profile_lines" on pricing_profile_lines for select using (
  exists (select 1 from pricing_profiles p where p.id = profile_id and p.user_id = auth.uid())
);
create policy "insert_own_pricing_profile_lines" on pricing_profile_lines for insert with check (
  exists (select 1 from pricing_profiles p where p.id = profile_id and p.user_id = auth.uid())
);
create policy "update_own_pricing_profile_lines" on pricing_profile_lines for update using (
  exists (select 1 from pricing_profiles p where p.id = profile_id and p.user_id = auth.uid())
);
create policy "delete_own_pricing_profile_lines" on pricing_profile_lines for delete using (
  exists (select 1 from pricing_profiles p where p.id = profile_id and p.user_id = auth.uid())
);

comment on table pricing_profiles is 'Perfis de precificação reutilizáveis (margem + linhas de impostos/despesas), aplicáveis em lote aos itens de qualquer licitação.';
comment on table pricing_profile_lines is 'Linhas de imposto ou despesa de um perfil de precificação, cada uma com nome e percentual próprios.';
comment on column bidding_items.custo_unitario is 'Quanto se paga ao fornecedor por unidade — distinto de valor_unitario_licitado (o que se cobra do órgão).';
comment on column bidding_items.valor_minimo_calculado is 'Valor mínimo calculado a partir do custo unitário e do perfil de precificação aplicado. Fica salvo mesmo se o perfil for editado ou excluído depois.';
comment on column bidding_items.participa_precificacao is 'Se o item entra na aplicação em lote da precificação (não remove o item da licitação, só da conta).';
