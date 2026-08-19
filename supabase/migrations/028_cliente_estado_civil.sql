-- ============================================================================
-- ConectaGov — Migração 028: Estado civil do responsável no cadastro do cliente
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
--
-- O QUE FAZ: várias declarações-modelo do próprio edital pedem o estado
-- civil do representante legal na qualificação ("Sr. Fulano, brasileiro,
-- [estado civil], inscrito no CPF...") — como esse dado nunca foi
-- capturado em lugar nenhum do sistema, a IA sempre deixava
-- "[estado civil]" sem preencher nas declarações geradas. Agora fica salvo
-- uma vez no cadastro do cliente, junto dos outros dados do representante
-- legal (RG, CPF, cargo), e o backend usa ele ao montar o texto.

alter table clients add column if not exists estado_civil text;

comment on column clients.estado_civil is 'Estado civil do representante legal (ex: Solteiro(a), Casado(a), Divorciado(a), Viúvo(a), União Estável) — usado nas declarações de habilitação exigidas pelo edital.';
