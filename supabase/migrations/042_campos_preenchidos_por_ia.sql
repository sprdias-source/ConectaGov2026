-- ============================================================================
-- ConectaGov — Migração 042: Rastreio de campos preenchidos por IA
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
--
-- O QUE FAZ: guarda quais campos de uma licitação foram preenchidos pela
-- última vez pelo botão "Preencher Licitação com estes Dados" (extração de
-- IA a partir do edital) e ainda não foram editados manualmente depois —
-- usado só pra mostrar um selo "IA" ao lado desses campos na tela, deixando
-- claro o que foi digitado por alguém e o que veio da análise automática.
-- Nunca é lido por nenhuma regra de negócio, é só indicação visual.

alter table biddings
  add column if not exists campos_preenchidos_por_ia text[] not null default '{}';

comment on column biddings.campos_preenchidos_por_ia is
  'Chaves do tipo Bidding (ex: "objeto", "orgao") preenchidas pela última vez via "Preencher Licitação com estes Dados", ainda não sobrescritas manualmente. Só pra exibir o selo "IA" na tela.';
