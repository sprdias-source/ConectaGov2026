-- ============================================================================
-- ConectaGov — Migração 023: Anexos de Declaração (extraídos e preenchidos pela IA)
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
--
-- O QUE FAZ: adiciona "Anexos de Declaração" — a IA lê os anexos-modelo do
-- próprio edital (Anexo II, III etc. — "MODELO DE DECLARAÇÃO...") e devolve
-- o texto já preenchido com os dados do cliente, pronto pra revisão. Como a
-- empresa representa outras empresas nas licitações, a declaração precisa
-- da assinatura do responsável legal DO CLIENTE — por isso cada anexo tem um
-- fluxo de 3 passos (rascunho -> enviado ao cliente -> assinado e anexado),
-- e só no último passo, quando o arquivo assinado é anexado de volta, os
-- itens do checklist que aquele anexo resolve marcam como atendidos.
--
-- Um mesmo anexo pode resolver VÁRIOS itens do checklist de uma vez (ex: um
-- único "Anexo II" do edital cobrindo as alíneas 10.7.5 a) até e)) — daí a
-- tabela de junção bidding_declaracao_anexo_itens, em vez de um campo único.

create table if not exists bidding_declaracao_anexos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bidding_id uuid not null references biddings(id) on delete cascade,
  fonte text not null,
  titulo text not null,
  texto text not null,
  status text not null default 'rascunho' check (status in ('rascunho', 'enviado', 'assinado')),
  enviado_em timestamptz,
  -- Arquivo assinado devolvido pelo cliente, já em attached_files (mesmo
  -- bucket/tabela usada pros outros documentos da licitação). Nulo até o
  -- passo 3. "set null" (não cascade): apagar o arquivo não pode arrastar
  -- o histórico do anexo junto.
  attached_file_id uuid references attached_files(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists bidding_declaracao_anexo_itens (
  id uuid primary key default gen_random_uuid(),
  anexo_id uuid not null references bidding_declaracao_anexos(id) on delete cascade,
  checklist_item_id uuid not null references bidding_checklist_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (anexo_id, checklist_item_id)
);

create index if not exists idx_bidding_declaracao_anexos_bidding_id on bidding_declaracao_anexos(bidding_id);
create index if not exists idx_bidding_declaracao_anexo_itens_anexo_id on bidding_declaracao_anexo_itens(anexo_id);
create index if not exists idx_bidding_declaracao_anexo_itens_checklist_item_id on bidding_declaracao_anexo_itens(checklist_item_id);

alter table bidding_declaracao_anexos enable row level security;
alter table bidding_declaracao_anexo_itens enable row level security;

drop policy if exists "select_own_bidding_declaracao_anexos" on bidding_declaracao_anexos;
drop policy if exists "insert_own_bidding_declaracao_anexos" on bidding_declaracao_anexos;
drop policy if exists "update_own_bidding_declaracao_anexos" on bidding_declaracao_anexos;
drop policy if exists "delete_own_bidding_declaracao_anexos" on bidding_declaracao_anexos;

create policy "select_own_bidding_declaracao_anexos" on bidding_declaracao_anexos for select using (auth.uid() = user_id);
create policy "insert_own_bidding_declaracao_anexos" on bidding_declaracao_anexos for insert with check (auth.uid() = user_id);
create policy "update_own_bidding_declaracao_anexos" on bidding_declaracao_anexos for update using (auth.uid() = user_id);
create policy "delete_own_bidding_declaracao_anexos" on bidding_declaracao_anexos for delete using (auth.uid() = user_id);

drop policy if exists "select_own_bidding_declaracao_anexo_itens" on bidding_declaracao_anexo_itens;
drop policy if exists "insert_own_bidding_declaracao_anexo_itens" on bidding_declaracao_anexo_itens;
drop policy if exists "delete_own_bidding_declaracao_anexo_itens" on bidding_declaracao_anexo_itens;

create policy "select_own_bidding_declaracao_anexo_itens" on bidding_declaracao_anexo_itens for select using (
  exists (select 1 from bidding_declaracao_anexos a where a.id = anexo_id and a.user_id = auth.uid())
);
create policy "insert_own_bidding_declaracao_anexo_itens" on bidding_declaracao_anexo_itens for insert with check (
  exists (select 1 from bidding_declaracao_anexos a where a.id = anexo_id and a.user_id = auth.uid())
);
create policy "delete_own_bidding_declaracao_anexo_itens" on bidding_declaracao_anexo_itens for delete using (
  exists (select 1 from bidding_declaracao_anexos a where a.id = anexo_id and a.user_id = auth.uid())
);

comment on table bidding_declaracao_anexos is 'Anexos-modelo de declaração extraídos do edital pela IA e preenchidos com os dados do cliente. Fluxo: rascunho -> enviado ao cliente -> assinado e anexado (só aí resolve os itens do checklist ligados).';
comment on table bidding_declaracao_anexo_itens is 'Quais itens do checklist um anexo de declaração resolve — um anexo pode resolver vários itens de uma vez.';
comment on column bidding_declaracao_anexos.attached_file_id is 'Arquivo assinado devolvido pelo cliente (em attached_files) — preenchido só no passo 3 do fluxo.';
