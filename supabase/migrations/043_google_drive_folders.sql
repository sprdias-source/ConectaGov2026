-- ============================================================================
-- ConectaGov — Migração 043: cache de pastas do Google Drive
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS dos scripts 001 a 042.
--
-- O QUE FAZ: cria a tabela que a Edge Function `drive-storage` usa pra não
-- precisar buscar/criar a mesma pasta no Google Drive toda vez que alguém
-- envia um arquivo — a primeira vez que um caminho como
-- "ConectaGov Arquivos/<owner>/licitacao/<id>" é usado, a function cria a
-- cadeia de pastas no Drive e grava aqui o id de cada uma; da próxima vez
-- (outro arquivo da mesma licitação, por exemplo) ela já sabe o id direto,
-- sem gastar uma chamada de busca a mais na API do Drive.
--
-- Não tem coluna nova em nenhuma tabela existente: o jeito escolhido pra
-- saber se um arquivo está no Supabase Storage ou no Google Drive é um
-- prefixo "gdrive:" no próprio texto que já era gravado em storage_path —
-- evita mexer no schema, nos tipos do app e nos ~11 lugares que já chamam
-- getDownloadUrl(storagePath) hoje.
--
-- Só a Edge Function (service_role) mexe nessa tabela — não faz sentido
-- nenhuma policy de RLS pra usuário autenticado aqui, então RLS fica
-- ativado sem nenhuma policy (nega tudo pra quem não é service_role).
--
-- Idempotente: pode rodar de novo sem problema.

create table if not exists google_drive_folders (
  path text primary key,
  folder_id text not null,
  created_at timestamptz not null default now()
);

alter table google_drive_folders enable row level security;
