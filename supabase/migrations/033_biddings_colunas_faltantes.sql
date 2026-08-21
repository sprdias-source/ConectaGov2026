-- ============================================================================
-- ConectaGov — Migração 033: colunas de biddings que faltavam ser rastreadas
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
--
-- CONTEXTO: uma perícia no código encontrou 5 colunas de "biddings" usadas
-- em types/domain.ts e lib/mappers.ts (municipio, uf, dias_validade_proposta,
-- modelo_customizado_path, motivo_perda) que nunca tiveram um
-- "alter table" correspondente em nenhuma migration rastreada — foram
-- adicionadas direto no banco em algum momento, fora do controle de
-- versão. Recriar o ambiente do zero rodando só as migrations do
-- repositório deixaria essas colunas faltando e o app quebraria.
--
-- Este script é seguro de rodar mesmo que as colunas já existam (idempotente,
-- "if not exists") — no seu banco atual ele não deve alterar nada, é só pra
-- fechar essa lacuna no histórico de migrations.

alter table biddings add column if not exists municipio text;
alter table biddings add column if not exists uf text;
alter table biddings add column if not exists dias_validade_proposta text;
alter table biddings add column if not exists modelo_customizado_path text;
alter table biddings add column if not exists motivo_perda text;

comment on column biddings.municipio is 'Município do órgão licitante, quando informado.';
comment on column biddings.uf is 'UF do órgão licitante, quando informada.';
comment on column biddings.dias_validade_proposta is 'Prazo de validade da proposta declarado no edital (texto livre, ex: "60 (sessenta)").';
comment on column biddings.modelo_customizado_path is 'Caminho no Storage de um modelo de proposta próprio desta licitação, quando enviado (em vez do modelo padrão do sistema).';
comment on column biddings.motivo_perda is 'Motivo registrado quando a licitação é perdida (status = Perdeu) — análogo a motivo_desistencia (status Desistiu) e motivo_cancelamento (status Cancelada).';
