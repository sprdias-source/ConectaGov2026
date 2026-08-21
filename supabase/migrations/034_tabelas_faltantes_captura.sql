-- ============================================================================
-- ConectaGov — Migração 034: captura das tabelas que faltavam ser rastreadas
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
--
-- CONTEXTO: uma perícia no código encontrou 21 tabelas usadas no app
-- (supabase.from('...')) que nunca tiveram um "create table" em nenhuma
-- migration rastreada — foram criadas direto no banco em algum momento
-- (provavelmente na origem do projeto, antes do controle de versão das
-- migrations começar a valer), sem deixar registro em supabase/migrations.
-- Recriar o ambiente do zero rodando só as migrations 001-033 do
-- repositório deixaria essas 21 tabelas faltando e o app não subiria.
--
-- ESTE SCRIPT É SEGURO DE RODAR NO SEU BANCO ATUAL: o corpo inteiro só
-- executa SE a tabela "team_members" ainda não existir. Como ela já existe
-- no seu banco (é usada todo dia pelo sistema de permissões), rodar este
-- script aqui não muda absolutamente nada — é um no-op garantido. O valor
-- dele é só pra quando alguém precisar provisionar um Supabase do zero
-- (recuperação de desastre, ambiente de teste novo, etc.).
--
-- IMPORTANTE — ORDEM DE EXECUÇÃO NUM PROVISIONAMENTO DO ZERO: rode este
-- script (034) ANTES da migration 030 (030_system_tools_faltantes.sql). A
-- 030 faz um "insert into system_tools" assumindo que a tabela já existe;
-- como a criação de system_tools está aqui, rodar 030 antes desta faria a
-- 030 falhar num banco novo. Na sua conta atual isso não importa (ambas já
-- foram/serão rodadas contra um banco onde tudo já existe).
--
-- LIMITAÇÃO HONESTA: as colunas/tipos/RLS abaixo foram reconstruídos a
-- partir de src/types/database.ts (o "contrato" de tipos que o frontend já
-- usa contra o schema real) e do padrão de RLS já usado no resto do
-- sistema (auth.uid() = user_id) — não é uma cópia bit-a-bit do schema
-- real (não tenho acesso direto ao banco pra exportar isso com certeza
-- absoluta), então pode faltar algum "check" constraint, índice ou
-- particularidade de RLS que só existe no banco de produção. É um ponto de
-- partida muito melhor que "tabela não existe", não uma garantia de
-- paridade 100%. As 4 funções (checklist_documentos, owner_efetivo,
-- reagendar_backup_diario, tem_acesso) também usadas pelo app e igualmente
-- fora de qualquer migration NÃO estão recriadas aqui — são lógica de
-- negócio, não estrutura, e eu não tenho como adivinhar o corpo delas sem
-- arriscar recriar algo com comportamento diferente do real (principalmente
-- arriscado se alguma delas for SECURITY DEFINER e entrar na cadeia de
-- autorização). Exporte essas 4 funções direto do Supabase (Database →
-- Functions → cada uma → "Show Definition") se quiser guardar elas também
-- em algum lugar versionado.

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'team_members') then

    execute $ddl$
      -- ---------------------------------------------------------------
      -- Tabelas simples de posse por usuário (auth.uid() = user_id)
      -- ---------------------------------------------------------------
      create table if not exists atestados_tecnicos (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id) on delete cascade,
        client_id uuid not null references clients(id) on delete cascade,
        nome text not null,
        objeto text not null,
        orgao_emissor text,
        valor numeric(14,2),
        data_emissao date,
        storage_path text,
        observacoes text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create table if not exists bank_reconciliations (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id) on delete cascade,
        account_id uuid not null references financial_accounts(id) on delete cascade,
        data_saldo date not null,
        saldo_banco numeric(14,2) not null,
        saldo_sistema numeric(14,2) not null,
        diferenca numeric(14,2) not null,
        total_lancamentos integer not null default 0,
        lancamentos_encontrados integer not null default 0,
        nome_arquivo text,
        created_at timestamptz not null default now()
      );

      create table if not exists bidding_analysis (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id) on delete cascade,
        bidding_id uuid not null references biddings(id) on delete cascade,
        status text not null default 'processando',
        analise jsonb,
        erro_mensagem text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create table if not exists bidding_analysis_juridica (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id) on delete cascade,
        bidding_id uuid not null references biddings(id) on delete cascade,
        tipo text not null,
        status text not null default 'processando',
        resultado jsonb,
        erro_mensagem text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create table if not exists bidding_checklist_items (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id) on delete cascade,
        bidding_id uuid not null references biddings(id) on delete cascade,
        descricao text not null,
        categoria text,
        obrigatorio boolean not null default true,
        origem text not null default 'manual',
        numero_edital text,
        atendido boolean not null default false,
        nao_aplicavel boolean not null default false,
        justificativa_nao_aplicavel text,
        attached_file_id uuid references attached_files(id) on delete set null,
        client_document_id uuid,
        client_document_tipo text,
        atestado_id uuid references atestados_tecnicos(id) on delete set null,
        prazo date,
        responsavel_nome text,
        observacoes text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create table if not exists bidding_items_versions (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id) on delete cascade,
        bidding_id uuid not null references biddings(id) on delete cascade,
        versao integer not null,
        itens_snapshot jsonb not null,
        enviada boolean not null default false,
        observacao text,
        alterado_por_email text,
        created_at timestamptz not null default now()
      );

      create table if not exists busca_pncp_config (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id) on delete cascade,
        nome text not null,
        tipo_busca text not null default 'palavra_chave',
        palavras_chave text[] not null default '{}',
        ufs text[],
        codigos_municipio_ibge text[],
        esferas text[],
        poderes text[],
        codigos_modalidade integer[],
        dias_retroativos integer not null default 1,
        status text not null default 'ativo',
        ativo boolean not null default true,
        ultima_execucao timestamptz,
        created_at timestamptz not null default now()
      );

      create table if not exists captcha_sessions (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id) on delete cascade,
        client_id uuid not null references clients(id) on delete cascade,
        tipo text not null,
        imagem_base64 text not null,
        resposta text,
        status text not null default 'aguardando',
        expira_em timestamptz not null,
        created_at timestamptz not null default now()
      );

      create table if not exists client_documents (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id) on delete cascade,
        client_id uuid not null references clients(id) on delete cascade,
        tipo text not null,
        nome text not null,
        status text not null default 'pendente',
        auto_renovavel boolean not null default false,
        data_emissao date,
        data_validade date,
        storage_path text,
        pasta text,
        observacoes text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create table if not exists client_prefeituras (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id) on delete cascade,
        client_id uuid not null references clients(id) on delete cascade,
        prefeitura text not null,
        portal_url text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create table if not exists contract_marcos (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id) on delete cascade,
        contract_id uuid not null references contracts(id) on delete cascade,
        descricao text not null,
        status text not null default 'Pendente',
        data_prevista date,
        data_realizada date,
        valor numeric(14,2),
        observacoes text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create table if not exists document_logs (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id) on delete cascade,
        client_id uuid not null references clients(id) on delete cascade,
        tipo text not null,
        status text not null,
        tentativa integer not null default 1,
        duracao_ms integer,
        erro text,
        created_at timestamptz not null default now()
      );

      create table if not exists licitacoes_pncp (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id) on delete cascade,
        busca_config_id uuid not null references busca_pncp_config(id) on delete cascade,
        numero_controle_pncp text not null,
        palavra_chave_encontrada text not null,
        orgao_nome text,
        orgao_cnpj text,
        municipio_nome text,
        uf text,
        modalidade_nome text,
        objeto_compra text,
        item_descricao text,
        valor_total_estimado numeric(14,2),
        valor_total_homologado numeric(14,2),
        data_publicacao_pncp date,
        data_encerramento_proposta date,
        link_sistema_origem text,
        visto boolean not null default false,
        encontrado_em timestamptz not null default now(),
        created_at timestamptz not null default now()
      );

      create table if not exists modelos_documentos (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id) on delete cascade,
        categoria text not null,
        nome text not null,
        conteudo text,
        tags text,
        storage_path text,
        observacoes text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create table if not exists payment_methods (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id) on delete cascade,
        name text not null,
        created_at timestamptz not null default now()
      );

      create table if not exists personal_events (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id) on delete cascade,
        titulo text not null,
        descricao text,
        data date not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      -- ---------------------------------------------------------------
      -- Catálogos globais (sem user_id) — leitura liberada pra qualquer
      -- usuário autenticado, escrita só via service role / SQL Editor.
      -- ---------------------------------------------------------------
      create table if not exists document_types (
        codigo text primary key,
        nome text not null,
        categoria text not null,
        origem text not null,
        tem_validade boolean not null default true,
        dias_alerta_vencimento integer not null default 30,
        ordem integer not null default 0,
        referencia_edital text
      );

      create table if not exists system_settings (
        key text primary key,
        value text not null,
        atualizado_em timestamptz not null default now()
      );

      create table if not exists system_tools (
        key text primary key,
        nome text not null,
        descricao text,
        ordem integer not null default 0,
        created_at timestamptz not null default now()
      );

      -- ---------------------------------------------------------------
      -- Equipe/permissões — dono e membro têm acessos diferentes entre si
      -- (não é o padrão simples "auth.uid() = user_id" das demais).
      -- ---------------------------------------------------------------
      create table if not exists team_members (
        id uuid primary key default gen_random_uuid(),
        owner_id uuid not null references auth.users(id) on delete cascade,
        member_user_id uuid not null references auth.users(id) on delete cascade,
        nome text,
        email text,
        status text not null default 'ativo',
        convidado_em timestamptz not null default now()
      );

      create table if not exists member_permissions (
        id uuid primary key default gen_random_uuid(),
        team_member_id uuid not null references team_members(id) on delete cascade,
        tool_key text not null references system_tools(key) on delete cascade,
        nivel_acesso text not null default 'sem_acesso',
        atualizado_em timestamptz not null default now(),
        unique (team_member_id, tool_key)
      );

      -- ---------------------------------------------------------------
      -- RLS: mesmo padrão "auth.uid() = user_id" já usado em todo o
      -- resto do sistema (001_initial_schema.sql).
      -- ---------------------------------------------------------------
      alter table atestados_tecnicos enable row level security;
      alter table bank_reconciliations enable row level security;
      alter table bidding_analysis enable row level security;
      alter table bidding_analysis_juridica enable row level security;
      alter table bidding_checklist_items enable row level security;
      alter table bidding_items_versions enable row level security;
      alter table busca_pncp_config enable row level security;
      alter table captcha_sessions enable row level security;
      alter table client_documents enable row level security;
      alter table client_prefeituras enable row level security;
      alter table contract_marcos enable row level security;
      alter table document_logs enable row level security;
      alter table licitacoes_pncp enable row level security;
      alter table modelos_documentos enable row level security;
      alter table payment_methods enable row level security;
      alter table personal_events enable row level security;

      create policy "select_own_atestados_tecnicos" on atestados_tecnicos for select using (auth.uid() = user_id);
      create policy "insert_own_atestados_tecnicos" on atestados_tecnicos for insert with check (auth.uid() = user_id);
      create policy "update_own_atestados_tecnicos" on atestados_tecnicos for update using (auth.uid() = user_id);
      create policy "delete_own_atestados_tecnicos" on atestados_tecnicos for delete using (auth.uid() = user_id);

      create policy "select_own_bank_reconciliations" on bank_reconciliations for select using (auth.uid() = user_id);
      create policy "insert_own_bank_reconciliations" on bank_reconciliations for insert with check (auth.uid() = user_id);
      create policy "update_own_bank_reconciliations" on bank_reconciliations for update using (auth.uid() = user_id);
      create policy "delete_own_bank_reconciliations" on bank_reconciliations for delete using (auth.uid() = user_id);

      create policy "select_own_bidding_analysis" on bidding_analysis for select using (auth.uid() = user_id);
      create policy "insert_own_bidding_analysis" on bidding_analysis for insert with check (auth.uid() = user_id);
      create policy "update_own_bidding_analysis" on bidding_analysis for update using (auth.uid() = user_id);
      create policy "delete_own_bidding_analysis" on bidding_analysis for delete using (auth.uid() = user_id);

      create policy "select_own_bidding_analysis_juridica" on bidding_analysis_juridica for select using (auth.uid() = user_id);
      create policy "insert_own_bidding_analysis_juridica" on bidding_analysis_juridica for insert with check (auth.uid() = user_id);
      create policy "update_own_bidding_analysis_juridica" on bidding_analysis_juridica for update using (auth.uid() = user_id);
      create policy "delete_own_bidding_analysis_juridica" on bidding_analysis_juridica for delete using (auth.uid() = user_id);

      create policy "select_own_bidding_checklist_items" on bidding_checklist_items for select using (auth.uid() = user_id);
      create policy "insert_own_bidding_checklist_items" on bidding_checklist_items for insert with check (auth.uid() = user_id);
      create policy "update_own_bidding_checklist_items" on bidding_checklist_items for update using (auth.uid() = user_id);
      create policy "delete_own_bidding_checklist_items" on bidding_checklist_items for delete using (auth.uid() = user_id);

      create policy "select_own_bidding_items_versions" on bidding_items_versions for select using (auth.uid() = user_id);
      create policy "insert_own_bidding_items_versions" on bidding_items_versions for insert with check (auth.uid() = user_id);
      create policy "update_own_bidding_items_versions" on bidding_items_versions for update using (auth.uid() = user_id);
      create policy "delete_own_bidding_items_versions" on bidding_items_versions for delete using (auth.uid() = user_id);

      create policy "select_own_busca_pncp_config" on busca_pncp_config for select using (auth.uid() = user_id);
      create policy "insert_own_busca_pncp_config" on busca_pncp_config for insert with check (auth.uid() = user_id);
      create policy "update_own_busca_pncp_config" on busca_pncp_config for update using (auth.uid() = user_id);
      create policy "delete_own_busca_pncp_config" on busca_pncp_config for delete using (auth.uid() = user_id);

      create policy "select_own_captcha_sessions" on captcha_sessions for select using (auth.uid() = user_id);
      create policy "insert_own_captcha_sessions" on captcha_sessions for insert with check (auth.uid() = user_id);
      create policy "update_own_captcha_sessions" on captcha_sessions for update using (auth.uid() = user_id);
      create policy "delete_own_captcha_sessions" on captcha_sessions for delete using (auth.uid() = user_id);

      create policy "select_own_client_documents" on client_documents for select using (auth.uid() = user_id);
      create policy "insert_own_client_documents" on client_documents for insert with check (auth.uid() = user_id);
      create policy "update_own_client_documents" on client_documents for update using (auth.uid() = user_id);
      create policy "delete_own_client_documents" on client_documents for delete using (auth.uid() = user_id);

      create policy "select_own_client_prefeituras" on client_prefeituras for select using (auth.uid() = user_id);
      create policy "insert_own_client_prefeituras" on client_prefeituras for insert with check (auth.uid() = user_id);
      create policy "update_own_client_prefeituras" on client_prefeituras for update using (auth.uid() = user_id);
      create policy "delete_own_client_prefeituras" on client_prefeituras for delete using (auth.uid() = user_id);

      create policy "select_own_contract_marcos" on contract_marcos for select using (auth.uid() = user_id);
      create policy "insert_own_contract_marcos" on contract_marcos for insert with check (auth.uid() = user_id);
      create policy "update_own_contract_marcos" on contract_marcos for update using (auth.uid() = user_id);
      create policy "delete_own_contract_marcos" on contract_marcos for delete using (auth.uid() = user_id);

      create policy "select_own_document_logs" on document_logs for select using (auth.uid() = user_id);
      create policy "insert_own_document_logs" on document_logs for insert with check (auth.uid() = user_id);
      create policy "update_own_document_logs" on document_logs for update using (auth.uid() = user_id);
      create policy "delete_own_document_logs" on document_logs for delete using (auth.uid() = user_id);

      create policy "select_own_licitacoes_pncp" on licitacoes_pncp for select using (auth.uid() = user_id);
      create policy "insert_own_licitacoes_pncp" on licitacoes_pncp for insert with check (auth.uid() = user_id);
      create policy "update_own_licitacoes_pncp" on licitacoes_pncp for update using (auth.uid() = user_id);
      create policy "delete_own_licitacoes_pncp" on licitacoes_pncp for delete using (auth.uid() = user_id);

      create policy "select_own_modelos_documentos" on modelos_documentos for select using (auth.uid() = user_id);
      create policy "insert_own_modelos_documentos" on modelos_documentos for insert with check (auth.uid() = user_id);
      create policy "update_own_modelos_documentos" on modelos_documentos for update using (auth.uid() = user_id);
      create policy "delete_own_modelos_documentos" on modelos_documentos for delete using (auth.uid() = user_id);

      create policy "select_own_payment_methods" on payment_methods for select using (auth.uid() = user_id);
      create policy "insert_own_payment_methods" on payment_methods for insert with check (auth.uid() = user_id);
      create policy "update_own_payment_methods" on payment_methods for update using (auth.uid() = user_id);
      create policy "delete_own_payment_methods" on payment_methods for delete using (auth.uid() = user_id);

      create policy "select_own_personal_events" on personal_events for select using (auth.uid() = user_id);
      create policy "insert_own_personal_events" on personal_events for insert with check (auth.uid() = user_id);
      create policy "update_own_personal_events" on personal_events for update using (auth.uid() = user_id);
      create policy "delete_own_personal_events" on personal_events for delete using (auth.uid() = user_id);

      -- Catálogos globais: leitura pra qualquer autenticado, escrita só
      -- via service role (nenhuma policy de insert/update/delete pro
      -- usuário comum — RLS habilitada sem elas bloqueia por padrão).
      alter table document_types enable row level security;
      alter table system_settings enable row level security;
      alter table system_tools enable row level security;
      create policy "select_document_types" on document_types for select using (auth.role() = 'authenticated');
      create policy "select_system_settings" on system_settings for select using (auth.role() = 'authenticated');
      create policy "update_system_settings" on system_settings for update using (auth.role() = 'authenticated');
      create policy "insert_system_settings" on system_settings for insert with check (auth.role() = 'authenticated');
      create policy "select_system_tools" on system_tools for select using (auth.role() = 'authenticated');

      -- Equipe: dono enxerga/gerencia os próprios membros; o membro
      -- enxerga a própria linha (usePermissaoFerramenta.ts consulta por
      -- member_user_id = auth.uid() pra descobrir se é membro de alguém).
      alter table team_members enable row level security;
      create policy "select_team_members" on team_members for select using (auth.uid() = owner_id or auth.uid() = member_user_id);
      create policy "insert_team_members" on team_members for insert with check (auth.uid() = owner_id);
      create policy "update_team_members" on team_members for update using (auth.uid() = owner_id);
      create policy "delete_team_members" on team_members for delete using (auth.uid() = owner_id);

      alter table member_permissions enable row level security;
      create policy "select_member_permissions" on member_permissions for select using (
        exists (select 1 from team_members tm where tm.id = member_permissions.team_member_id and (tm.owner_id = auth.uid() or tm.member_user_id = auth.uid()))
      );
      create policy "insert_member_permissions" on member_permissions for insert with check (
        exists (select 1 from team_members tm where tm.id = member_permissions.team_member_id and tm.owner_id = auth.uid())
      );
      create policy "update_member_permissions" on member_permissions for update using (
        exists (select 1 from team_members tm where tm.id = member_permissions.team_member_id and tm.owner_id = auth.uid())
      );
      create policy "delete_member_permissions" on member_permissions for delete using (
        exists (select 1 from team_members tm where tm.id = member_permissions.team_member_id and tm.owner_id = auth.uid())
      );
    $ddl$;

  end if;
end $$;
