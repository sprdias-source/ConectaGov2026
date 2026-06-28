-- ============================================================================
-- ConectaGov — Storage de arquivos (PDFs de editais, contratos, etc.)
-- ============================================================================
-- Roda DEPOIS do 001_initial_schema.sql

-- Cria o "bucket" (pasta segura) onde os arquivos ficam guardados
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Política: usuário só pode ver/enviar/apagar arquivos dentro da sua própria
-- pasta (a primeira parte do caminho do arquivo é o seu user_id)
create policy "select_own_documents"
on storage.objects for select
using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "insert_own_documents"
on storage.objects for insert
with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "delete_own_documents"
on storage.objects for delete
using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
