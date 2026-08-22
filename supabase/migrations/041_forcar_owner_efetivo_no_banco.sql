-- ============================================================================
-- ConectaGov — Migração 041: garante user_id correto via trigger, não no app
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS dos scripts 001 a 040.
--
-- CONTEXTO: rodamos uma simulação de código (3 investigações em paralelo)
-- depois da migration 040 e achamos um bug universal e crítico: TODO hook do
-- app grava `user_id: user.id` (o uid de QUEM ESTÁ LOGADO) ao criar um
-- registro novo — clients, biddings, transactions, categories, platforms,
-- opportunities, client_documents, etc, mais de 25 pontos de código
-- diferentes. Isso é correto pro DONO da conta (user.id = owner_efetivo),
-- mas quebra pra um MEMBRO DE EQUIPE: a policy de INSERT (tanto a de antes
-- da 040 quanto a que a 040 acabou de adicionar) exige
-- `user_id = owner_efetivo(auth.uid())`, e owner_efetivo de um membro é o
-- UID DO DONO, não o dele — então o INSERT sempre falhava com erro de RLS,
-- pra qualquer membro convidado, em qualquer uma das ~25 telas, mesmo com
-- "Edição" liberada na Matriz de Permissões. Achamos também que alguns
-- hooks reescrevem `user_id` de novo em todo UPDATE, o que quebrava (ou,
-- pior, teria corrompido a posse do registro) uma edição feita por um
-- membro num registro do dono.
--
-- CORREÇÃO: em vez de caçar e corrigir >25 pontos de código no app (o
-- padrão exato de "achamos mais um lugar errado" que estamos tentando
-- encerrar de vez), a regra passa a ser garantida DENTRO DO BANCO, por
-- trigger, pra toda tabela "com dono": antes de gravar, o próprio banco
-- SEMPRE grava/mantém o `user_id` certo, não importa o que o app mandou.
-- Isso vale pro app de hoje e pra qualquer código futuro que crie/edite
-- linhas nessas tabelas.
--
-- Duas funções:
--   set_owner_efetivo_on_insert() — antes de um INSERT feito por um usuário
--     autenticado (auth.uid() não nulo), sobrescreve user_id pra
--     owner_efetivo(auth.uid()). Quando auth.uid() é nulo (chamada via
--     service_role, ex: edge function), não mexe em nada — preserva
--     exatamente o que foi explicitamente passado.
--   preserve_owner_on_update() — em todo UPDATE, força user_id a continuar
--     igual ao que já era antes (old.user_id) — editar outros campos nunca
--     pode, de tabela nenhuma, mudar de quem é o registro.
--
-- Adicionalmente: como a policy de Storage do bucket 'client-documents'
-- (migration 040) também exige owner_efetivo no caminho do arquivo, e isso
-- é montado como string no app (não dá pra corrigir só com trigger de
-- tabela), os pontos onde o app monta esse caminho (useClientDocuments.ts,
-- useAttachedFiles.ts) foram corrigidos separadamente pra resolver
-- owner_efetivo via `supabase.rpc('owner_efetivo', ...)` antes de montar o
-- caminho — por isso o grant de execução abaixo.

grant execute on function public.owner_efetivo(uuid) to authenticated;
grant execute on function public.tem_acesso(uuid, text, text) to authenticated;

create or replace function public.set_owner_efetivo_on_insert()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    new.user_id := owner_efetivo(auth.uid());
  end if;
  return new;
end;
$$;

create or replace function public.preserve_owner_on_update()
returns trigger
language plpgsql
as $$
begin
  new.user_id := old.user_id;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'atestados_tecnicos', 'attached_files', 'bank_reconciliations',
    'bidding_analysis', 'bidding_analysis_juridica', 'bidding_checklist_items',
    'bidding_declaracao_anexos', 'bidding_items', 'bidding_items_versions',
    'biddings', 'categories', 'client_documents', 'client_platforms',
    'client_prefeituras', 'clients', 'contract_marcos', 'contracts',
    'empenhos', 'employees', 'financial_accounts', 'licitei_buscas',
    'licitei_editais', 'modelos_documentos', 'opportunities',
    'opportunity_analysis', 'opportunity_analysis_juridica',
    'payment_methods', 'platforms', 'pricing_profiles', 'receipts',
    'transactions'
  ])
  loop
    execute format('drop trigger if exists trg_%1$s_owner_efetivo_insert on %1$s', t);
    execute format('
      create trigger trg_%1$s_owner_efetivo_insert
      before insert on %1$s
      for each row execute function set_owner_efetivo_on_insert();
    ', t);

    -- bidding_items_versions não tem (nem pode ter) policy de update —
    -- são versões imutáveis da proposta enviada. Trigger de update nela
    -- nunca dispararia mesmo, mas evitamos criar o que não faz sentido.
    if t <> 'bidding_items_versions' then
      execute format('drop trigger if exists trg_%1$s_owner_efetivo_update on %1$s', t);
      execute format('
        create trigger trg_%1$s_owner_efetivo_update
        before update on %1$s
        for each row execute function preserve_owner_on_update();
      ', t);
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Achado extra da simulação: excluir uma certidão do repositório do cliente
-- (client_documents) não desfazia o "atendido" de itens de checklist que
-- apontavam pra ela (client_document_id) — o trigger de compliance
-- existente (036) só reage a INSERT/UPDATE, nunca a DELETE. Resultado: um
-- item ficava marcado "atendido"/"HABILITADO" pra sempre mesmo depois do
-- arquivo real ser apagado do repositório.
-- ----------------------------------------------------------------------------

create or replace function public.trigger_reverter_compliance_apos_exclusao_documento()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update bidding_checklist_items
  set atendido = false, client_document_id = null, updated_at = now()
  where client_document_id = old.id;
  return old;
end;
$$;

drop trigger if exists trg_compliance_apos_exclusao_documento on client_documents;
create trigger trg_compliance_apos_exclusao_documento
after delete on client_documents
for each row execute function trigger_reverter_compliance_apos_exclusao_documento();
