-- ============================================================================
-- ConectaGov — Migração 040: captura completa do controle de acesso por equipe
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS dos scripts 001 a 039.
--
-- CONTEXTO: rodamos supabase/scripts/auditoria_completa.sql contra o banco
-- de produção e comparamos linha por linha com o que este repositório
-- documenta. O padrão de "dono da conta vê tudo; membro convidado só vê o
-- que a Matriz de Permissões libera" (funções owner_efetivo/tem_acesso,
-- ambas já existentes no banco e recriadas abaixo só por segurança/registro)
-- tinha sido aplicado direto pelo Dashboard, tabela por tabela, ao longo do
-- tempo — e ficou incompleto e inconsistente. Esta migração fecha as duas
-- lacunas reais que a auditoria encontrou:
--
-- (A) BUG DE SEGURANÇA JÁ ATIVO: seis tabelas (atestados_tecnicos,
--     bank_reconciliations, bidding_analysis, bidding_checklist_items,
--     contract_marcos, modelos_documentos) tinham UMA policy só cobrindo
--     todos os comandos (FOR ALL) com o mesmo limiar de acesso
--     ("visualizacao") no USING. Como o Postgres só aplica o WITH CHECK em
--     INSERT/UPDATE — nunca em DELETE — isso deixava um membro da equipe
--     com acesso de "Visualização" apagar linhas dessas tabelas, mesmo sem
--     poder editar nada. Corrigido separando cada uma em 4 policies (uma
--     por comando), no mesmo padrão já usado corretamente em `clients`,
--     `biddings`, `contracts` etc — onde Apagar/Editar exigem 'edicao'.
--
-- (B) ACESSO DE EQUIPE NUNCA ADICIONADO: quatorze tabelas + o bucket de
--     Storage 'client-documents' só tinham a policy antiga
--     "auth.uid() = user_id" — ou seja, um membro convidado com permissão
--     liberada na Matriz simplesmente não via nem conseguia editar nada
--     nelas (a tela carregava vazia ou o salvamento falhava calado, porque
--     o Postgres devolve 0 linhas em vez de erro quando RLS bloqueia).
--     Mapeamento de ferramenta confirmado lendo o código (qual
--     usePermissaoFerramenta('...') protege cada tela que usa a tabela),
--     não adivinhado.
--
-- Nada aqui remove as policies antigas "auth.uid() = user_id" das tabelas
-- do item (B) — elas continuam batendo (são um subconjunto do padrão novo,
-- então se combinam sem conflito), só não bastavam sozinhas.

-- ----------------------------------------------------------------------------
-- Funções de acesso — recriação idempotente (mesmo corpo já confirmado ao
-- vivo em produção), só por garantia/registro em migration.
-- ----------------------------------------------------------------------------

create or replace function public.owner_efetivo(usuario_id uuid)
returns uuid
language sql
stable security definer
as $$
  select coalesce(
    (select owner_id from team_members
     where member_user_id = usuario_id and status = 'ativo'
     limit 1),
    usuario_id
  )
$$;

create or replace function public.tem_acesso(usuario_id uuid, ferramenta text, nivel_minimo text)
returns boolean
language sql
stable security definer
as $$
  select exists (
    select 1
    from team_members tm
    join member_permissions mp on mp.team_member_id = tm.id
    where tm.member_user_id = usuario_id
      and tm.status = 'ativo'
      and mp.tool_key = ferramenta
      and (
        (nivel_minimo = 'visualizacao' and mp.nivel_acesso in ('visualizacao', 'edicao'))
        or
        (nivel_minimo = 'edicao' and mp.nivel_acesso = 'edicao')
      )
  )
$$;

-- ----------------------------------------------------------------------------
-- (A) Corrige o bug de "visualização pode apagar" nas 6 tabelas com policy
--     única FOR ALL.
-- ----------------------------------------------------------------------------

do $$
declare
  t record;
begin
  for t in select * from (values
    ('atestados_tecnicos', 'cadastros'),
    ('bank_reconciliations', 'financeiro'),
    ('bidding_analysis', 'licitacoes'),
    ('bidding_checklist_items', 'licitacoes'),
    ('contract_marcos', 'cadastros'),
    ('modelos_documentos', 'cadastros')
  ) as x(tabela, ferramenta)
  loop
    execute format('drop policy if exists "%1$s_all" on %1$s', t.tabela);

    execute format($f$
      create policy "select_team_%1$s" on %1$s for select
      using (
        (user_id = owner_efetivo(auth.uid()))
        and (auth.uid() = user_id or tem_acesso(auth.uid(), '%2$s', 'visualizacao'))
      );
      create policy "insert_team_%1$s" on %1$s for insert
      with check (
        (user_id = owner_efetivo(auth.uid()))
        and (auth.uid() = user_id or tem_acesso(auth.uid(), '%2$s', 'edicao'))
      );
      create policy "update_team_%1$s" on %1$s for update
      using (
        (user_id = owner_efetivo(auth.uid()))
        and (auth.uid() = user_id or tem_acesso(auth.uid(), '%2$s', 'edicao'))
      )
      with check (
        (user_id = owner_efetivo(auth.uid()))
        and (auth.uid() = user_id or tem_acesso(auth.uid(), '%2$s', 'edicao'))
      );
      create policy "delete_team_%1$s" on %1$s for delete
      using (
        (user_id = owner_efetivo(auth.uid()))
        and (auth.uid() = user_id or tem_acesso(auth.uid(), '%2$s', 'edicao'))
      );
    $f$, t.tabela, t.ferramenta);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- (B) Adiciona acesso de equipe às tabelas que só tinham "auth.uid() =
--     user_id" — aditivo, não mexe nas policies antigas.
-- ----------------------------------------------------------------------------

do $$
declare
  t record;
begin
  for t in select * from (values
    ('categories', 'financeiro'),
    ('employees', 'funcionarios'),
    ('client_platforms', 'cadastros'),
    ('client_prefeituras', 'financeiro'),
    ('bidding_analysis_juridica', 'licitacoes'),
    ('bidding_declaracao_anexos', 'licitacoes'),
    ('licitei_buscas', 'cadastros'),
    ('licitei_editais', 'cadastros'),
    ('opportunities', 'cadastros'),
    ('opportunity_analysis', 'cadastros'),
    ('opportunity_analysis_juridica', 'cadastros'),
    ('payment_methods', 'financeiro'),
    ('pricing_profiles', 'cadastros'),
    ('platforms', 'cadastros')
  ) as x(tabela, ferramenta)
  loop
    execute format('drop policy if exists "select_team_%1$s" on %1$s', t.tabela);
    execute format('drop policy if exists "insert_team_%1$s" on %1$s', t.tabela);
    execute format('drop policy if exists "update_team_%1$s" on %1$s', t.tabela);
    execute format('drop policy if exists "delete_team_%1$s" on %1$s', t.tabela);

    execute format($f$
      create policy "select_team_%1$s" on %1$s for select
      using (
        (user_id = owner_efetivo(auth.uid()))
        and (auth.uid() = user_id or tem_acesso(auth.uid(), '%2$s', 'visualizacao'))
      );
      create policy "insert_team_%1$s" on %1$s for insert
      with check (
        (user_id = owner_efetivo(auth.uid()))
        and (auth.uid() = user_id or tem_acesso(auth.uid(), '%2$s', 'edicao'))
      );
      create policy "update_team_%1$s" on %1$s for update
      using (
        (user_id = owner_efetivo(auth.uid()))
        and (auth.uid() = user_id or tem_acesso(auth.uid(), '%2$s', 'edicao'))
      )
      with check (
        (user_id = owner_efetivo(auth.uid()))
        and (auth.uid() = user_id or tem_acesso(auth.uid(), '%2$s', 'edicao'))
      );
      create policy "delete_team_%1$s" on %1$s for delete
      using (
        (user_id = owner_efetivo(auth.uid()))
        and (auth.uid() = user_id or tem_acesso(auth.uid(), '%2$s', 'edicao'))
      );
    $f$, t.tabela, t.ferramenta);
  end loop;
end $$;

-- bidding_declaracao_anexo_itens não tem user_id próprio — herda de
-- bidding_declaracao_anexos via anexo_id (mesmo padrão da policy antiga,
-- migration 023). Sem policy de update: a tabela original também não tem.
drop policy if exists "select_team_bidding_declaracao_anexo_itens" on bidding_declaracao_anexo_itens;
drop policy if exists "insert_team_bidding_declaracao_anexo_itens" on bidding_declaracao_anexo_itens;
drop policy if exists "delete_team_bidding_declaracao_anexo_itens" on bidding_declaracao_anexo_itens;

create policy "select_team_bidding_declaracao_anexo_itens" on bidding_declaracao_anexo_itens for select
using (
  exists (
    select 1 from bidding_declaracao_anexos a
    where a.id = anexo_id
      and a.user_id = owner_efetivo(auth.uid())
      and (auth.uid() = a.user_id or tem_acesso(auth.uid(), 'licitacoes', 'visualizacao'))
  )
);
create policy "insert_team_bidding_declaracao_anexo_itens" on bidding_declaracao_anexo_itens for insert
with check (
  exists (
    select 1 from bidding_declaracao_anexos a
    where a.id = anexo_id
      and a.user_id = owner_efetivo(auth.uid())
      and (auth.uid() = a.user_id or tem_acesso(auth.uid(), 'licitacoes', 'edicao'))
  )
);
create policy "delete_team_bidding_declaracao_anexo_itens" on bidding_declaracao_anexo_itens for delete
using (
  exists (
    select 1 from bidding_declaracao_anexos a
    where a.id = anexo_id
      and a.user_id = owner_efetivo(auth.uid())
      and (auth.uid() = a.user_id or tem_acesso(auth.uid(), 'licitacoes', 'edicao'))
  )
);

-- pricing_profile_lines não tem user_id próprio — herda de pricing_profiles
-- via profile_id (mesmo padrão da policy antiga, migration 022).
drop policy if exists "select_team_pricing_profile_lines" on pricing_profile_lines;
drop policy if exists "insert_team_pricing_profile_lines" on pricing_profile_lines;
drop policy if exists "update_team_pricing_profile_lines" on pricing_profile_lines;
drop policy if exists "delete_team_pricing_profile_lines" on pricing_profile_lines;

create policy "select_team_pricing_profile_lines" on pricing_profile_lines for select
using (
  exists (
    select 1 from pricing_profiles p
    where p.id = profile_id
      and p.user_id = owner_efetivo(auth.uid())
      and (auth.uid() = p.user_id or tem_acesso(auth.uid(), 'cadastros', 'visualizacao'))
  )
);
create policy "insert_team_pricing_profile_lines" on pricing_profile_lines for insert
with check (
  exists (
    select 1 from pricing_profiles p
    where p.id = profile_id
      and p.user_id = owner_efetivo(auth.uid())
      and (auth.uid() = p.user_id or tem_acesso(auth.uid(), 'cadastros', 'edicao'))
  )
);
create policy "update_team_pricing_profile_lines" on pricing_profile_lines for update
using (
  exists (
    select 1 from pricing_profiles p
    where p.id = profile_id
      and p.user_id = owner_efetivo(auth.uid())
      and (auth.uid() = p.user_id or tem_acesso(auth.uid(), 'cadastros', 'edicao'))
  )
)
with check (
  exists (
    select 1 from pricing_profiles p
    where p.id = profile_id
      and p.user_id = owner_efetivo(auth.uid())
      and (auth.uid() = p.user_id or tem_acesso(auth.uid(), 'cadastros', 'edicao'))
  )
);
create policy "delete_team_pricing_profile_lines" on pricing_profile_lines for delete
using (
  exists (
    select 1 from pricing_profiles p
    where p.id = profile_id
      and p.user_id = owner_efetivo(auth.uid())
      and (auth.uid() = p.user_id or tem_acesso(auth.uid(), 'cadastros', 'edicao'))
  )
);

-- ----------------------------------------------------------------------------
-- (C) Bucket de Storage 'client-documents': tinha só a policy antiga de
--     pasta própria (auth.uid() = primeiro segmento do caminho). Sem isso,
--     mesmo um membro já liberado em `client_documents` (a linha/metadado)
--     tomava 403 do Storage ao tentar abrir/enviar o arquivo de verdade.
-- ----------------------------------------------------------------------------

drop policy if exists "select_team_client_documents" on storage.objects;
drop policy if exists "insert_team_client_documents" on storage.objects;
drop policy if exists "update_team_client_documents" on storage.objects;
drop policy if exists "delete_team_client_documents" on storage.objects;

create policy "select_team_client_documents" on storage.objects for select
using (
  bucket_id = 'client-documents'
  and (storage.foldername(name))[1] = owner_efetivo(auth.uid())::text
  and (
    auth.uid()::text = (storage.foldername(name))[1]
    or tem_acesso(auth.uid(), 'cadastros', 'visualizacao')
  )
);
create policy "insert_team_client_documents" on storage.objects for insert
with check (
  bucket_id = 'client-documents'
  and (storage.foldername(name))[1] = owner_efetivo(auth.uid())::text
  and (
    auth.uid()::text = (storage.foldername(name))[1]
    or tem_acesso(auth.uid(), 'cadastros', 'edicao')
  )
);
create policy "update_team_client_documents" on storage.objects for update
using (
  bucket_id = 'client-documents'
  and (storage.foldername(name))[1] = owner_efetivo(auth.uid())::text
  and (
    auth.uid()::text = (storage.foldername(name))[1]
    or tem_acesso(auth.uid(), 'cadastros', 'edicao')
  )
);
create policy "delete_team_client_documents" on storage.objects for delete
using (
  bucket_id = 'client-documents'
  and (storage.foldername(name))[1] = owner_efetivo(auth.uid())::text
  and (
    auth.uid()::text = (storage.foldername(name))[1]
    or tem_acesso(auth.uid(), 'cadastros', 'edicao')
  )
);

-- ----------------------------------------------------------------------------
-- (D) Limpeza: policies duplicadas (mesmo predicado, nome diferente) criadas
--     duas vezes por engano direto no Dashboard. Zero risco — cada dupla é
--     idêntica à que sobra.
-- ----------------------------------------------------------------------------

drop policy if exists "select_own_client_documents_bucket" on storage.objects;
drop policy if exists "insert_own_client_documents_bucket" on storage.objects;
drop policy if exists "update_own_client_documents_bucket" on storage.objects;
drop policy if exists "delete_own_client_documents_bucket" on storage.objects;

drop policy if exists "select_own_client_documents_rows" on client_documents;
drop policy if exists "insert_own_client_documents_rows" on client_documents;
drop policy if exists "update_own_client_documents_rows" on client_documents;
drop policy if exists "delete_own_client_documents_rows" on client_documents;
