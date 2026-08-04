-- ============================================================================
-- ConectaGov — Migração 016: Editais Licitei
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS do script 015.
--
-- O QUE FAZ: base pro fluxo "Editais Licitei" — edital encontrado numa busca
-- no Licitei (fora daqui, feita por um robô a ser adicionado depois) →
-- linkado manualmente a um cliente → vira uma Oportunidade (mesma aba já
-- existente) → só vira Licitação de verdade quando o cliente aceitar.
--
-- 1) licitei_editais — os dados crus trazidos da busca, mais o rastro de
--    status até virar (ou não) uma licitação.
-- 2) opportunities ganha licitei_edital_id — permite que a própria aba
--    Oportunidades (ação já existente de "Cliente aceitou"/"Cliente
--    recusou") atualize esta tabela de volta, sem precisar de uma tela
--    duplicada de aceite dentro de Editais Licitei.

-- ---------------------------------------------------------------------------
-- 1) licitei_editais
-- ---------------------------------------------------------------------------
create table if not exists licitei_editais (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  numero_edital text,
  orgao text,
  objeto text,
  modalidade text,
  data_sessao date,
  link_licitei text,
  status text not null default 'novo' check (status in ('novo', 'linkado', 'oportunidade', 'aceito', 'recusado')),
  -- "set null" (não cascade): remover o cliente não pode apagar o
  -- histórico do edital, só desvincular.
  client_id uuid references clients(id) on delete set null,
  bidding_id uuid references biddings(id) on delete set null,
  edital_storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_licitei_editais_status on licitei_editais(status);
create index if not exists idx_licitei_editais_client_id on licitei_editais(client_id);
create index if not exists idx_licitei_editais_bidding_id on licitei_editais(bidding_id);

alter table licitei_editais enable row level security;

drop policy if exists "select_own_licitei_editais" on licitei_editais;
drop policy if exists "insert_own_licitei_editais" on licitei_editais;
drop policy if exists "update_own_licitei_editais" on licitei_editais;
drop policy if exists "delete_own_licitei_editais" on licitei_editais;

create policy "select_own_licitei_editais" on licitei_editais for select using (auth.uid() = user_id);
create policy "insert_own_licitei_editais" on licitei_editais for insert with check (auth.uid() = user_id);
create policy "update_own_licitei_editais" on licitei_editais for update using (auth.uid() = user_id);
create policy "delete_own_licitei_editais" on licitei_editais for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2) opportunities: rastro de volta pro edital Licitei que a originou
-- ---------------------------------------------------------------------------
alter table opportunities add column if not exists licitei_edital_id uuid references licitei_editais(id) on delete set null;

-- Único (não obrigatório): um edital do Licitei vira no máximo uma
-- oportunidade — evita reenviar o mesmo edital duas vezes por engano.
-- NULL não conflita com NULL num índice único, então oportunidades sem
-- origem no Licitei (a maioria) não são afetadas.
create unique index if not exists idx_opportunities_licitei_edital_id on opportunities(licitei_edital_id);
