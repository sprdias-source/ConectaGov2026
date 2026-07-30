-- ============================================================================
-- ConectaGov — Migração 009: bucket "client-documents" + políticas de RLS
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS dos scripts 001 a 008.
--
-- O QUE FAZ: o código do app (useClientDocuments, useAttachedFiles,
-- AcoesDocumentoManual, a função Analisar-edital-juridico etc.) sempre
-- gravou os arquivos no bucket 'client-documents' — mas só o bucket legado
-- 'documents' (do 002_storage.sql) tinha sido criado com policy de RLS
-- versionada aqui. Sem bucket e/ou sem policy pro usuário autenticado,
-- todo envio feito diretamente do navegador (não via função server-side
-- com service_role) falha — muitas vezes aparecendo só como "Failed to
-- fetch" no console, porque a resposta de erro do Storage não chega com
-- os cabeçalhos de CORS quando é bloqueada nesse nível.
--
-- Idempotente: pode rodar de novo sem problema mesmo se o bucket/policies
-- já existirem (ex: se alguém criou o bucket manualmente pelo Dashboard
-- antes desta migração existir).

insert into storage.buckets (id, name, public)
values ('client-documents', 'client-documents', false)
on conflict (id) do nothing;

drop policy if exists "select_own_client_documents" on storage.objects;
drop policy if exists "insert_own_client_documents" on storage.objects;
drop policy if exists "update_own_client_documents" on storage.objects;
drop policy if exists "delete_own_client_documents" on storage.objects;

-- Mesmo padrão de 002_storage.sql: o primeiro segmento do caminho do
-- arquivo é o user_id do dono (ver paths montados em uploadResumivel /
-- useClientDocuments / useAttachedFiles: sempre "{user.id}/...").
create policy "select_own_client_documents"
on storage.objects for select
using (bucket_id = 'client-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "insert_own_client_documents"
on storage.objects for insert
with check (bucket_id = 'client-documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- Sem essa policy de UPDATE, renovar uma certidão (upsert: true, mesmo
-- caminho de antes) falha mesmo com a policy de INSERT correta — o
-- Storage trata sobrescrever um arquivo existente como UPDATE, não INSERT.
create policy "update_own_client_documents"
on storage.objects for update
using (bucket_id = 'client-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "delete_own_client_documents"
on storage.objects for delete
using (bucket_id = 'client-documents' and (storage.foldername(name))[1] = auth.uid()::text);
