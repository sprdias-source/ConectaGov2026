-- Vincula cada log de auditoria a uma entidade específica (ex: uma
-- licitação), pra dar pra filtrar o histórico por ela em vez de só ter o
-- log geral. Nullable porque os logs já existentes não têm essa informação
-- e continuam válidos, só não aparecem em nenhuma visão filtrada por
-- entidade — seguem aparecendo na visão geral.
alter table audit_logs
  add column if not exists entity_type text,
  add column if not exists entity_id uuid;

create index if not exists idx_audit_logs_entity on audit_logs(entity_type, entity_id) where entity_id is not null;

comment on column audit_logs.entity_type is 'Tipo da entidade relacionada ao evento (ex: "bidding"). Nulo em logs antigos ou eventos sem entidade específica.';
comment on column audit_logs.entity_id is 'ID da entidade relacionada ao evento (ex: o id da licitação). Nulo em logs antigos ou eventos sem entidade específica.';
