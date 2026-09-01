-- ============================================================================
-- ConectaGov — Migração 051: Módulo Contabilidade (Fases 1 a 5)
-- ============================================================================
-- Cole este script inteiro no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS dos scripts 001 a 050.
--
-- CONTEXTO GERAL: cria toda a estrutura do módulo Contabilidade (separado do
-- Gerencial, que não muda em nada) — regime tributário histórico com
-- vigência por data, faixas e partilha do Simples Nacional, tipos de serviço
-- com perfil de retenção, notas fiscais emitidas (registro manual — hoje a
-- emissão acontece fora do sistema), tipo de saída do sócio (pró-labore /
-- distribuição de lucro / retirada), e grupos contábeis pra organizar a DRE.
--
-- Só schema aqui (tabelas, colunas, RLS, triggers) — nenhum dado é inserido
-- por esta migração. Os valores padrão (faixas do Anexo III, tipo de serviço
-- "Consultoria/Assessoria em Licitações" sem retenção, grupos contábeis
-- default e o reagrupamento das categorias já existentes) são semeados pelo
-- próprio app, na primeira vez que cada usuário carrega a tela — mesmo
-- padrão que `useCategories.ts` já usa pra semear as categorias padrão.
-- Isso garante que TODO usuário, inclusive quem se cadastrar daqui pra
-- frente, receba os mesmos valores, sem depender de reaplicar SQL a cada
-- conta nova.
--
-- Todas as tabelas novas entram no trigger de owner_efetivo (mesma correção
-- da migration 041) e na política de acesso de equipe via `tem_acesso`
-- (mesmo padrão da migration 040), sob a ferramenta 'financeiro' — a mesma
-- que já protege categories/payment_methods.

-- ----------------------------------------------------------------------------
-- Perfil da Empresa — usado no cabeçalho do DRE/Balanço profissional. Não
-- existe hoje em lugar nenhum do sistema (é multi-tenant, então não dá pra
-- fixar os dados de uma empresa no código — apareceria pra qualquer conta).
-- Fica em branco até o usuário preencher uma vez na tela de Contábil.
-- ----------------------------------------------------------------------------

create table if not exists empresa_perfil (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  razao_social text,
  cnpj text,
  endereco text,
  capital_social numeric(14, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_empresa_perfil_updated_at before update on empresa_perfil
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- FASE 1 — Regime tributário, RBT12, faixas e partilha do Simples Nacional
-- ----------------------------------------------------------------------------

create table if not exists regime_tributario_historico (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  regime text not null check (regime in ('mei', 'simples_nacional', 'lucro_presumido', 'lucro_real')),
  anexo_simples text check (anexo_simples in ('I', 'II', 'III', 'IV', 'V')),
  vigencia_inicio date not null,
  vigencia_fim date,
  observacao text,
  created_at timestamptz not null default now(),
  constraint regime_tributario_anexo_so_simples check (
    (regime = 'simples_nacional') or (anexo_simples is null)
  ),
  constraint regime_tributario_vigencia_valida check (
    vigencia_fim is null or vigencia_fim >= vigencia_inicio
  )
);

create index if not exists idx_regime_tributario_historico_user on regime_tributario_historico(user_id);

-- Faixas do Simples Nacional por anexo — RBT12, alíquota nominal e parcela a
-- deduzir (fórmula da alíquota efetiva: [(RBT12 × nominal) − PD] / RBT12,
-- Resolução CGSN 140/2018). `conferido = false` sinaliza que a faixa 1 do
-- Anexo III foi validada contra um DAS real da empresa, mas as demais foram
-- preenchidas de memória e precisam de conferência antes de virarem
-- definitivas — a tela de Configurações Fiscais mostra esse aviso.
create table if not exists simples_nacional_faixas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  anexo text not null check (anexo in ('III', 'V')),
  faixa integer not null check (faixa between 1 and 6),
  rbt12_min numeric(14, 2) not null,
  rbt12_max numeric(14, 2) not null,
  aliquota_nominal numeric(7, 4) not null,
  parcela_deduzir numeric(14, 2) not null default 0,
  vigencia_inicio date not null default '2018-01-01',
  vigencia_fim date,
  conferido boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, anexo, faixa, vigencia_inicio)
);

create index if not exists idx_simples_nacional_faixas_user on simples_nacional_faixas(user_id);

-- Partilha percentual do DAS por tributo, dentro de cada faixa/anexo —
-- é o que permite mostrar o detalhamento IRPJ/CSLL/COFINS/PIS/CPP/ISS que
-- aparece no documento de arrecadação real, não só o total do DAS.
create table if not exists simples_nacional_partilha (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  anexo text not null check (anexo in ('III', 'V')),
  faixa integer not null check (faixa between 1 and 6),
  tributo text not null check (tributo in ('IRPJ', 'CSLL', 'COFINS', 'PIS', 'CPP', 'ISS')),
  percentual numeric(7, 4) not null,
  vigencia_inicio date not null default '2018-01-01',
  vigencia_fim date,
  conferido boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, anexo, faixa, tributo, vigencia_inicio)
);

create index if not exists idx_simples_nacional_partilha_user on simples_nacional_partilha(user_id);

-- ----------------------------------------------------------------------------
-- FASE 2 — Tipos de serviço e retenção
-- ----------------------------------------------------------------------------

create table if not exists tipos_servico (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  nome text not null,
  retem_iss boolean not null default false,
  retem_inss boolean not null default false,
  retem_ir_pis_cofins_csll boolean not null default false,
  aliquota_iss_retido numeric(7, 4),
  aliquota_inss_retido numeric(7, 4),
  aliquota_federal_retido numeric(7, 4),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tipos_servico_user on tipos_servico(user_id);

create trigger trg_tipos_servico_updated_at before update on tipos_servico
  for each row execute function set_updated_at();

alter table transactions
  add column if not exists tipo_servico_id uuid references tipos_servico(id) on delete set null,
  add column if not exists valor_bruto numeric(14, 2),
  add column if not exists valor_iss_retido numeric(14, 2),
  add column if not exists valor_inss_retido numeric(14, 2),
  add column if not exists valor_federal_retido numeric(14, 2);

comment on column transactions.valor_bruto is
  'Valor bruto do serviço antes de retenções — só preenchido quando o tipo_servico tem alguma retenção ativa. O campo "value" (líquido) continua com o mesmo significado de sempre, usado em todos os relatórios existentes.';

-- ----------------------------------------------------------------------------
-- FASE 3 — Notas Fiscais ↔ Financeiro
-- ----------------------------------------------------------------------------
-- Registro MANUAL por enquanto — a emissão de NFS-e acontece hoje fora do
-- sistema (portal da prefeitura). Fica pronta pra, no futuro, ser
-- preenchida automaticamente quando a emissão por certificado digital sair
-- dentro do próprio ConectaGov.

create table if not exists notas_fiscais_emitidas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  numero text,
  client_id uuid references clients(id) on delete set null,
  data_emissao date not null,
  competencia text not null,
  valor numeric(14, 2) not null,
  descricao text,
  transaction_id uuid references transactions(id) on delete set null,
  status text not null default 'confirmada' check (status in ('rascunho', 'confirmada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_notas_fiscais_emitidas_user on notas_fiscais_emitidas(user_id);
create index if not exists idx_notas_fiscais_emitidas_transaction on notas_fiscais_emitidas(transaction_id);

create trigger trg_notas_fiscais_emitidas_updated_at before update on notas_fiscais_emitidas
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- FASE 4 — Pró-labore × Distribuição de Lucro × Retirada de Sócio
-- ----------------------------------------------------------------------------
-- Aditivo — nulo em todo lançamento existente e em qualquer lançamento novo
-- que não seja saída pra sócio. Quando preenchido como 'distribuicao_lucro'
-- ou 'retirada_socio', a DRE exclui o lançamento do cálculo de despesas
-- (não é despesa, é movimentação de patrimônio líquido) — a exclusão em si
-- é feita via o grupo contábil "fora da DRE" da Fase 5, não por este campo
-- diretamente; o campo aqui só registra a natureza pra fins de relatório e
-- pra bater com o recibo que a contabilidade emite por sócio.

alter table transactions
  add column if not exists natureza_saida_socio text
    check (natureza_saida_socio in ('pro_labore', 'distribuicao_lucro', 'retirada_socio'));

-- ----------------------------------------------------------------------------
-- FASE 5 — Plano de Contas Hierárquico (Grupo → Categoria)
-- ----------------------------------------------------------------------------

create table if not exists grupos_contabeis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text not null check (type in ('Pagar', 'Receber')),
  nome text not null,
  ordem integer not null default 0,
  entra_dre boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, type, nome)
);

create index if not exists idx_grupos_contabeis_user on grupos_contabeis(user_id);

alter table categories
  add column if not exists grupo_id uuid references grupos_contabeis(id) on delete set null;

-- ----------------------------------------------------------------------------
-- Owner efetivo (mesma correção da migration 041) — garante que um membro
-- de equipe consiga inserir/editar nas tabelas novas sem cair no bug de RLS
-- que a 041 já corrigiu pras ~25 tabelas anteriores.
-- ----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'empresa_perfil', 'regime_tributario_historico', 'simples_nacional_faixas', 'simples_nacional_partilha',
    'tipos_servico', 'notas_fiscais_emitidas', 'grupos_contabeis'
  ])
  loop
    execute format('drop trigger if exists trg_%1$s_owner_efetivo_insert on %1$s', t);
    execute format('
      create trigger trg_%1$s_owner_efetivo_insert
      before insert on %1$s
      for each row execute function set_owner_efetivo_on_insert();
    ', t);

    execute format('drop trigger if exists trg_%1$s_owner_efetivo_update on %1$s', t);
    execute format('
      create trigger trg_%1$s_owner_efetivo_update
      before update on %1$s
      for each row execute function preserve_owner_on_update();
    ', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- RLS com acesso de equipe (mesmo padrão da migration 040) — ferramenta
-- 'financeiro', a mesma que já protege categories e payment_methods.
-- ----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'empresa_perfil', 'regime_tributario_historico', 'simples_nacional_faixas', 'simples_nacional_partilha',
    'tipos_servico', 'notas_fiscais_emitidas', 'grupos_contabeis'
  ])
  loop
    execute format('alter table %1$s enable row level security', t);

    execute format($f$
      create policy "select_team_%1$s" on %1$s for select
      using (
        (user_id = owner_efetivo(auth.uid()))
        and (auth.uid() = user_id or tem_acesso(auth.uid(), 'financeiro', 'visualizacao'))
      );
      create policy "insert_team_%1$s" on %1$s for insert
      with check (
        (user_id = owner_efetivo(auth.uid()))
        and (auth.uid() = user_id or tem_acesso(auth.uid(), 'financeiro', 'edicao'))
      );
      create policy "update_team_%1$s" on %1$s for update
      using (
        (user_id = owner_efetivo(auth.uid()))
        and (auth.uid() = user_id or tem_acesso(auth.uid(), 'financeiro', 'edicao'))
      )
      with check (
        (user_id = owner_efetivo(auth.uid()))
        and (auth.uid() = user_id or tem_acesso(auth.uid(), 'financeiro', 'edicao'))
      );
      create policy "delete_team_%1$s" on %1$s for delete
      using (
        (user_id = owner_efetivo(auth.uid()))
        and (auth.uid() = user_id or tem_acesso(auth.uid(), 'financeiro', 'edicao'))
      );
    $f$, t);
  end loop;
end $$;
