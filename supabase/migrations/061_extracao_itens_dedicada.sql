-- ============================================================================
-- ConectaGov — Migração 061: extração de itens dedicada (botão "Puxar Itens")
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS do script 060.
--
-- Editais grandes (100+ itens) fazem a análise de IA completa (resumo +
-- checklist + habilitação + itens, tudo numa chamada só) estourar o teto de
-- tempo de execução da Edge Function (~135s), porque gerar uma resposta
-- longa o suficiente pra listar todos os itens é lento — mesmo já usando o
-- limite de tokens elevado (ver Analisar-edital/Analisar-oportunidade,
-- migração/PR anterior). Em vez de aumentar ainda mais um teto que já está
-- perto do limite real da plataforma, os itens passam a ter uma extração
-- PRÓPRIA e SEPARADA (botão "Puxar Itens"), cada uma como sua própria
-- invocação de function — com seu próprio orçamento de tempo do zero, sem
-- competir com resumo/checklist/habilitação pelo mesmo teto.
--
-- Mesmo formato de bidding_analysis/opportunity_analysis (id, user_id,
-- status, erro_mensagem, timestamps), só que o resultado ("itens") já é
-- guardado como o array pronto pra usar em mapearItensDaAnalise
-- (src/lib/analiseEdital.ts) — cada item no mesmo formato de
-- AnaliseEdital.itens (numero, idPortal, lote, descricao, unidade,
-- quantidade, valorReferencia, participando).

create table if not exists bidding_itens_extracao (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bidding_id uuid not null references biddings(id) on delete cascade,
  status text not null default 'processando' check (status in ('processando', 'concluido', 'erro')),
  itens jsonb,
  erro_mensagem text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Uma extração por licitação (reextrair sobrescreve, não acumula linha) —
-- mesmo padrão de opportunity_analysis.
create unique index if not exists idx_bidding_itens_extracao_bidding_id on bidding_itens_extracao(bidding_id);
create index if not exists idx_bidding_itens_extracao_user_id on bidding_itens_extracao(user_id);

alter table bidding_itens_extracao enable row level security;

create policy "select_own_bidding_itens_extracao" on bidding_itens_extracao for select using (auth.uid() = user_id);
create policy "insert_own_bidding_itens_extracao" on bidding_itens_extracao for insert with check (auth.uid() = user_id);
create policy "update_own_bidding_itens_extracao" on bidding_itens_extracao for update using (auth.uid() = user_id);
create policy "delete_own_bidding_itens_extracao" on bidding_itens_extracao for delete using (auth.uid() = user_id);

create table if not exists opportunity_itens_extracao (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  status text not null default 'processando' check (status in ('processando', 'concluido', 'erro')),
  itens jsonb,
  erro_mensagem text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_opportunity_itens_extracao_opportunity_id on opportunity_itens_extracao(opportunity_id);
create index if not exists idx_opportunity_itens_extracao_user_id on opportunity_itens_extracao(user_id);

alter table opportunity_itens_extracao enable row level security;

create policy "select_own_opportunity_itens_extracao" on opportunity_itens_extracao for select using (auth.uid() = user_id);
create policy "insert_own_opportunity_itens_extracao" on opportunity_itens_extracao for insert with check (auth.uid() = user_id);
create policy "update_own_opportunity_itens_extracao" on opportunity_itens_extracao for update using (auth.uid() = user_id);
create policy "delete_own_opportunity_itens_extracao" on opportunity_itens_extracao for delete using (auth.uid() = user_id);
