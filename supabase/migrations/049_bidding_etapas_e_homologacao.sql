-- Reestruturação das etapas do Kanban de Licitações:
-- 1) "Proposta Enviada" vira "Proposta Enviada para Plataforma" (mesma etapa, só
--    renomeada, mantém a posição no funil).
-- 2) "Disputa de Lances" deixa de existir como etapa — licitações que estavam
--    nela migram para "Fase Recursal" (etapa seguinte mais próxima).
-- 3) Nova etapa "Aguardando Pregoeiro", inserida depois de "Fase Recursal".
-- 4) Nova coluna data_homologacao, separada de updated_at — quando a
--    licitação já é "Ganhou" + "Adjudicada e Homologada", assume-se
--    updated_at como melhor aproximação disponível pra essas já existentes
--    (a partir de agora passa a ser preenchida no momento certo pelo app).
-- A coluna `etapa` é texto livre (sem CHECK constraint, ver 001_initial_schema.sql),
-- então a migração de dados é só um UPDATE simples.

alter table biddings add column if not exists data_homologacao date;

update biddings set etapa = 'Proposta Enviada para Plataforma' where etapa = 'Proposta Enviada';
update biddings set etapa = 'Fase Recursal' where etapa = 'Disputa de Lances';

update biddings
set data_homologacao = updated_at::date
where status = 'Ganhou' and etapa = 'Adjudicada e Homologada' and data_homologacao is null;
