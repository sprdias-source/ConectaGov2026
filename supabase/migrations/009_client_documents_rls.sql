-- ============================================================================
-- ConectaGov — Corrige permissão de upload manual de certidões
-- ============================================================================
-- Roda DEPOIS do 002_storage.sql (e depois de qualquer migration que já
-- tenha criado a tabela client_documents fora deste repositório).
--
-- COMO USAR: cole este arquivo inteiro no Supabase em "SQL Editor" -> "New
-- query" e clique em "Run". É seguro rodar mais de uma vez.
-- ============================================================================
--
-- O bucket "documents" (usado pelos robôs automáticos) já tinha política de
-- segurança desde 002_storage.sql, mas o bucket "client-documents" (usado
-- pelo upload manual de certidões em AcoesDocumentoManual.tsx / Checklist da
-- Licitação) nunca teve essa política criada — por isso ler documentos já
-- existentes funcionava (gravados pelos robôs, que usam a chave de servidor
-- e ignoram RLS), mas enviar um novo pelo navegador batia em "new row
-- violates row-level security policy".

insert into storage.buckets (id, name, public)
values ('client-documents', 'client-documents', false)
on conflict (id) do nothing;

drop policy if exists "select_own_client_documents_bucket" on storage.objects;
drop policy if exists "insert_own_client_documents_bucket" on storage.objects;
drop policy if exists "update_own_client_documents_bucket" on storage.objects;
drop policy if exists "delete_own_client_documents_bucket" on storage.objects;

create policy "select_own_client_documents_bucket"
on storage.objects for select
using (bucket_id = 'client-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "insert_own_client_documents_bucket"
on storage.objects for insert
with check (bucket_id = 'client-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "update_own_client_documents_bucket"
on storage.objects for update
using (bucket_id = 'client-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "delete_own_client_documents_bucket"
on storage.objects for delete
using (bucket_id = 'client-documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- Garante também a política padrão (dono só vê/edita os próprios registros)
-- na tabela client_documents em si — ela foi criada fora deste repositório,
-- então não dá pra saber com certeza se essa parte já existia; recriar é
-- seguro (drop if exists antes de cada create).
alter table if exists client_documents enable row level security;

drop policy if exists "select_own_client_documents" on client_documents;
drop policy if exists "insert_own_client_documents" on client_documents;
drop policy if exists "update_own_client_documents" on client_documents;
drop policy if exists "delete_own_client_documents" on client_documents;

create policy "select_own_client_documents" on client_documents for select using (auth.uid() = user_id);
create policy "insert_own_client_documents" on client_documents for insert with check (auth.uid() = user_id);
create policy "update_own_client_documents" on client_documents for update using (auth.uid() = user_id);
create policy "delete_own_client_documents" on client_documents for delete using (auth.uid() = user_id);
