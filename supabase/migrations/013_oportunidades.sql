-- ============================================================================
-- ConectaGov — Migração 013: Oportunidades de licitação
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS dos scripts 001 a 012.
--
-- O QUE FAZ: cria o estágio "Oportunidade" — o edital encontrado numa
-- plataforma e mandado pro cliente avaliar, ANTES de virar uma Licitação de
-- verdade (que só nasce quando o cliente confirma que quer participar).
--
-- 1) opportunities — client_id, platform_id (reaproveita o catálogo da
--    migração 012), datas de envio/resposta, resposta do cliente, a
--    antecedência do aviso de prazo (editável por oportunidade) e
--    bidding_id (preenchido só depois de convertida).
-- 2) opportunity_analysis — mesmo formato de bidding_analysis (tabela essa
--    que não é versionada aqui, criada fora do repo), pra rodar a mesma IA
--    de análise de edital já na fase de oportunidade, antes da resposta do
--    cliente.
-- 3) attached_files passa a aceitar entity_type='oportunidade' — o
--    edital/TR da oportunidade usa o mesmo mecanismo genérico de anexos já
--    usado por licitação; ao converter, só muda a referência (entity_type/
--    entity_id), sem reenviar o arquivo.
-- 4) biddings ganha o status 'Desistiu' (cliente decide não participar
--    depois de já estar no Kanban) — diferente de 'Cancelada' (o ÓRGÃO
--    cancela o certame). Cada um conta separado no relatório mensal. Ganha
--    também motivo_desistencia, mesmo padrão de motivo_perda.

-- ---------------------------------------------------------------------------
-- 1) opportunities
-- ---------------------------------------------------------------------------
create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  -- "restrict" de propósito, mesmo motivo da migração 012: apagar uma
  -- plataforma do catálogo não pode sumir com o histórico de oportunidades.
  platform_id uuid not null references platforms(id) on delete restrict,
  titulo text not null,
  numero_edital text,
  data_sessao date,
  data_envio_cliente date,
  resposta text not null default 'pendente' check (resposta in ('pendente', 'aceita', 'recusada')),
  data_resposta date,
  motivo_recusa text,
  dias_aviso_prazo integer not null default 7,
  -- Preenchido só no momento da conversão — nulo enquanto a oportunidade
  -- ainda não virou uma licitação de verdade. "set null" (não cascade): se
  -- a licitação for excluída depois, o histórico da oportunidade continua.
  bidding_id uuid references biddings(id) on delete set null,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_opportunities_client_id on opportunities(client_id);
create index if not exists idx_opportunities_platform_id on opportunities(platform_id);
create index if not exists idx_opportunities_bidding_id on opportunities(bidding_id);

alter table opportunities enable row level security;

drop policy if exists "select_own_opportunities" on opportunities;
drop policy if exists "insert_own_opportunities" on opportunities;
drop policy if exists "update_own_opportunities" on opportunities;
drop policy if exists "delete_own_opportunities" on opportunities;

create policy "select_own_opportunities" on opportunities for select using (auth.uid() = user_id);
create policy "insert_own_opportunities" on opportunities for insert with check (auth.uid() = user_id);
create policy "update_own_opportunities" on opportunities for update using (auth.uid() = user_id);
create policy "delete_own_opportunities" on opportunities for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2) opportunity_analysis (mesmo formato de bidding_analysis)
-- ---------------------------------------------------------------------------
create table if not exists opportunity_analysis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  status text not null default 'processando' check (status in ('processando', 'concluido', 'erro')),
  analise jsonb,
  erro_mensagem text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Uma análise por oportunidade (reanalisar sobrescreve, não acumula linha).
create unique index if not exists idx_opportunity_analysis_opportunity_id on opportunity_analysis(opportunity_id);

alter table opportunity_analysis enable row level security;

drop policy if exists "select_own_opportunity_analysis" on opportunity_analysis;
drop policy if exists "insert_own_opportunity_analysis" on opportunity_analysis;
drop policy if exists "update_own_opportunity_analysis" on opportunity_analysis;
drop policy if exists "delete_own_opportunity_analysis" on opportunity_analysis;

create policy "select_own_opportunity_analysis" on opportunity_analysis for select using (auth.uid() = user_id);
create policy "insert_own_opportunity_analysis" on opportunity_analysis for insert with check (auth.uid() = user_id);
create policy "update_own_opportunity_analysis" on opportunity_analysis for update using (auth.uid() = user_id);
create policy "delete_own_opportunity_analysis" on opportunity_analysis for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3) attached_files: libera entity_type = 'oportunidade'
-- ---------------------------------------------------------------------------
-- Acha o nome real da constraint de CHECK em vez de assumir um nome fixo —
-- várias tabelas deste projeto foram alteradas fora das migrações
-- versionadas aqui (o mesmo motivo pelo qual a migração 011 já precisou
-- fazer isso pra client_documents), então o nome pode não ser o "padrão".
do $$
declare
  nome_constraint text;
begin
  select con.conname into nome_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
  where rel.relname = 'attached_files' and con.contype = 'c' and att.attname = 'entity_type';
  if nome_constraint is not null then
    execute format('alter table attached_files drop constraint %I', nome_constraint);
  end if;
end $$;

alter table attached_files add constraint attached_files_entity_type_check
  check (entity_type in ('licitacao', 'contrato', 'recibo', 'cliente', 'funcionario', 'empenho', 'oportunidade'));

-- ---------------------------------------------------------------------------
-- 4) biddings: status 'Desistiu' + motivo_desistencia
-- ---------------------------------------------------------------------------
alter table biddings add column if not exists motivo_desistencia text;

do $$
declare
  nome_constraint text;
begin
  select con.conname into nome_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
  where rel.relname = 'biddings' and con.contype = 'c' and att.attname = 'status';
  if nome_constraint is not null then
    execute format('alter table biddings drop constraint %I', nome_constraint);
  end if;
end $$;

alter table biddings add constraint biddings_status_check
  check (status in ('Em Andamento', 'Ganhou', 'Perdeu', 'Cancelada', 'Desistiu'));
