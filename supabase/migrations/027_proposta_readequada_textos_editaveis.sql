-- ============================================================================
-- ConectaGov — Migração 027: Textos editáveis da Proposta Readequada
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
--
-- O QUE FAZ: guarda o texto de abertura (parágrafo antes da tabela de itens)
-- e o texto de fechamento (validade + declarações depois da tabela) da
-- Proposta Readequada, pra o usuário poder editar esses trechos direto na
-- tela — igual já acontece com os Anexos de Declaração. A tabela de
-- Lote/Item/valores continua sendo montada automaticamente a partir de
-- bidding_items (não fica editável aqui), pra não correr o risco de os
-- números do PDF ficarem diferentes do que está cadastrado na licitação.
-- Nulo = ainda não foi customizado, a function usa o texto padrão.

alter table biddings add column if not exists proposta_texto_abertura text;
alter table biddings add column if not exists proposta_texto_fechamento text;

comment on column biddings.proposta_texto_abertura is 'Texto editável exibido antes da tabela de itens no PDF da Proposta Readequada. Nulo = usa o texto padrão gerado a partir do órgão/modalidade/edital.';
comment on column biddings.proposta_texto_fechamento is 'Texto editável exibido depois da tabela de itens (validade, declarações) no PDF da Proposta Readequada. Nulo = usa o texto padrão. Parágrafos separados por linha em branco.';
