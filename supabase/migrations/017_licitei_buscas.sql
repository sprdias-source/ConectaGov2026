-- ============================================================================
-- ConectaGov — Migração 017: Buscas Salvas do Licitei
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS do script 016.
--
-- O QUE FAZ: reproduz o painel de filtros do Licitei dentro do ConectaGov,
-- como uma busca salva e nomeada (ex: "TI — Goiás — Registro de Preço") —
-- é essa configuração que o robô (a ser adicionado numa próxima etapa) vai
-- usar pra logar no Licitei, aplicar os mesmos filtros e gravar os
-- resultados em licitei_editais.
--
-- Os filtros ficam num único jsonb (LicitaiBuscaFiltros, ver
-- src/types/domain.ts) em vez de uma coluna por campo — são ~20 campos
-- opcionais espelhando 1:1 o formulário do Licitei, e fica mais barato
-- ajustar/adicionar campo depois (ex: se o Licitei mudar um filtro) sem
-- precisar de migração nova, mesma ideia já usada em opportunity_analysis.

create table if not exists licitei_buscas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  filtros jsonb not null default '{}'::jsonb,
  ultima_execucao_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table licitei_buscas enable row level security;

drop policy if exists "select_own_licitei_buscas" on licitei_buscas;
drop policy if exists "insert_own_licitei_buscas" on licitei_buscas;
drop policy if exists "update_own_licitei_buscas" on licitei_buscas;
drop policy if exists "delete_own_licitei_buscas" on licitei_buscas;

create policy "select_own_licitei_buscas" on licitei_buscas for select using (auth.uid() = user_id);
create policy "insert_own_licitei_buscas" on licitei_buscas for insert with check (auth.uid() = user_id);
create policy "update_own_licitei_buscas" on licitei_buscas for update using (auth.uid() = user_id);
create policy "delete_own_licitei_buscas" on licitei_buscas for delete using (auth.uid() = user_id);

-- Rastro de qual busca salva trouxe qual edital — "set null" (não cascade):
-- apagar a busca não pode apagar o histórico de editais já encontrados.
alter table licitei_editais add column if not exists busca_id uuid references licitei_buscas(id) on delete set null;

create index if not exists idx_licitei_editais_busca_id on licitei_editais(busca_id);
