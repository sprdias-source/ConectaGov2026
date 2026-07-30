-- ============================================================================
-- ConectaGov — Migração 010: RLS da tabela client_documents
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS dos scripts 001 a 009.
--
-- O QUE FAZ: a tabela `client_documents` (certidões/documentos do cliente —
-- useClientDocuments.ts) existe e já é lida normalmente pelo app (é dela que
-- vem tudo que aparece no checklist), mas nunca teve as 4 policies de RLS
-- (select/insert/update/delete) versionadas neste repo, ao contrário de
-- todas as outras tabelas com dono (clients, biddings, bidding_items etc,
-- ver 001_initial_schema.sql e 003_automacao_licitacoes.sql). Sem a policy
-- de INSERT/UPDATE, o app consegue enviar o arquivo pro Storage (depois da
-- migração 009) mas trava ao salvar a linha na tabela — exatamente o "Erro
-- ao enviar documento: Arquivo enviado, mas falhou ao salvar o registro"
-- visto no celular.
--
-- Idempotente: pode rodar de novo sem problema mesmo que alguma dessas
-- policies já exista.

alter table client_documents enable row level security;

drop policy if exists "select_own_client_documents_rows" on client_documents;
drop policy if exists "insert_own_client_documents_rows" on client_documents;
drop policy if exists "update_own_client_documents_rows" on client_documents;
drop policy if exists "delete_own_client_documents_rows" on client_documents;

create policy "select_own_client_documents_rows" on client_documents for select using (auth.uid() = user_id);
create policy "insert_own_client_documents_rows" on client_documents for insert with check (auth.uid() = user_id);
create policy "update_own_client_documents_rows" on client_documents for update using (auth.uid() = user_id);
create policy "delete_own_client_documents_rows" on client_documents for delete using (auth.uid() = user_id);
