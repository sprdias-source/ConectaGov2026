-- ============================================================================
-- ConectaGov — Migração 014: Análise jurídica (Esclarecimentos/Impugnações)
-- já na fase de Oportunidade
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS do script 013.
--
-- O QUE FAZ: a licitação (tabela `biddings`) já tem 3 análises jurídicas de
-- IA sobre o edital — Esclarecimentos, Impugnações e Raio-X — guardadas em
-- `bidding_analysis_juridica` (tabela criada fora deste repo). Esta
-- migração cria a mesma tabela pro estágio de Oportunidade, permitindo
-- rodar as 3 análises antes mesmo de existir uma licitação de verdade —
-- mesmo padrão já usado por opportunity_analysis (migração 013) espelhando
-- bidding_analysis.

create table if not exists opportunity_analysis_juridica (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  tipo text not null check (tipo in ('esclarecimento', 'impugnacao', 'raio_x')),
  status text not null default 'processando' check (status in ('processando', 'concluido', 'erro')),
  resultado jsonb,
  erro_mensagem text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Uma linha por (oportunidade, tipo) — reanalisar sobrescreve, não acumula.
create unique index if not exists idx_opportunity_analysis_juridica_opportunity_tipo
  on opportunity_analysis_juridica(opportunity_id, tipo);

alter table opportunity_analysis_juridica enable row level security;

drop policy if exists "select_own_opportunity_analysis_juridica" on opportunity_analysis_juridica;
drop policy if exists "insert_own_opportunity_analysis_juridica" on opportunity_analysis_juridica;
drop policy if exists "update_own_opportunity_analysis_juridica" on opportunity_analysis_juridica;
drop policy if exists "delete_own_opportunity_analysis_juridica" on opportunity_analysis_juridica;

create policy "select_own_opportunity_analysis_juridica" on opportunity_analysis_juridica for select using (auth.uid() = user_id);
create policy "insert_own_opportunity_analysis_juridica" on opportunity_analysis_juridica for insert with check (auth.uid() = user_id);
create policy "update_own_opportunity_analysis_juridica" on opportunity_analysis_juridica for update using (auth.uid() = user_id);
create policy "delete_own_opportunity_analysis_juridica" on opportunity_analysis_juridica for delete using (auth.uid() = user_id);
