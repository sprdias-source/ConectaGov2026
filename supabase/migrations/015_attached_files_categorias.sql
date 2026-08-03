-- ============================================================================
-- ConectaGov — Migração 015: attached_files aceita todas as categorias em uso
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS do script 014.
--
-- O QUE FAZ: a restrição original de attached_files.category (migração 001)
-- só permitia 'Edital','Contrato','Recibo','Certidão','Outro' — mas o tipo
-- FileCategory do frontend (src/types/domain.ts) já usa também
-- 'Termo de Referência', 'Checklist', 'Proposta' e 'Proposta Readequada' há
-- tempos (upload de TR em Licitação/Oportunidade, proposta e checklist de
-- habilitação). Sem esses valores na restrição, o upload do arquivo em si
-- funciona (vai pro Storage), mas a gravação do registro correspondente em
-- attached_files é rejeitada pela restrição — é por isso que "Enviar" no
-- Termo de Referência não fazia nada visível.
--
-- Mesma técnica das migrações 011/013 (achar o nome real da constraint em
-- vez de assumir um nome fixo, já que esta tabela pode ter sido alterada
-- fora das migrações versionadas aqui).
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
    'Checklist', 'Proposta', 'Proposta Readequada'
  ));
