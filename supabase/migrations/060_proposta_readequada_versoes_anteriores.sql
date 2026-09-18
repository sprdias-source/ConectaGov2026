-- ============================================================================
-- ConectaGov — Migração 060: categoria pra guardar versões anteriores da
-- Proposta Readequada
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS do script 059.
--
-- Hoje, toda vez que se gera um novo Word/PDF da Proposta Readequada (ou se
-- importa a versão assinada), o arquivo anterior é APAGADO — não sobra
-- registro de "qual proposta foi enviada antes de assumirmos um item extra
-- (ex: depois da prefeitura inabilitar outro fornecedor)".
--
-- Em vez de criar uma tabela nova, reaproveita o mesmo mecanismo de anexos
-- (attached_files) que já guarda a Proposta Readequada atual: a versão
-- anterior passa a ser RECATEGORIZADA (mesmo arquivo, mesmo Storage/Drive,
-- só muda o rótulo) em vez de excluída, então precisa deste novo valor na
-- restrição de category — mesma técnica da migração 015 (recria a
-- constraint com a lista completa de categorias que o frontend usa hoje,
-- mais a nova).
do $$
declare
  nome_constraint text;
begin
  select con.conname into nome_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
  where rel.relname = 'attached_files' and con.contype = 'c' and att.attname = 'category';
  if nome_constraint is not null then
    execute format('alter table attached_files drop constraint %I', nome_constraint);
  end if;
end $$;

alter table attached_files add constraint attached_files_category_check
  check (category in (
    'Edital', 'Termo de Referência', 'Contrato', 'Recibo', 'Certidão', 'Outro',
    'Checklist', 'Proposta', 'Proposta Readequada', 'Declaração',
    'Modelo Portal Compras', 'Empenho', 'Ata de Sessão',
    'Proposta Readequada (versão anterior)'
  ));
