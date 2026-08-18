-- ============================================================================
-- ConectaGov — Migração 026: Ciclo de assinatura da Proposta Readequada
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
--
-- O QUE FAZ: registra em que ponto do ciclo (Word gerado → PDF gerado →
-- enviada pro cliente → assinada) a Proposta Readequada de cada licitação
-- está — mesma lógica de rascunho/enviado/assinado já usada em
-- bidding_declaracao_anexos, só que aqui é UM documento por licitação (não
-- vale a pena criar uma tabela nova só pra isso), então os dois carimbos de
-- data/hora ficam direto em biddings. O arquivo em si continua guardado em
-- attached_files (categoria 'Proposta Readequada', igual já é hoje) — essas
-- colunas só marcam o status, não o arquivo.

alter table biddings add column if not exists proposta_readequada_enviada_em timestamptz;
alter table biddings add column if not exists proposta_readequada_assinada_em timestamptz;

comment on column biddings.proposta_readequada_enviada_em is 'Quando a Proposta Readequada foi marcada como enviada pro cliente assinar. Nulo = ainda em rascunho.';
comment on column biddings.proposta_readequada_assinada_em is 'Quando a versão assinada da Proposta Readequada foi anexada de volta. Nulo = ainda aguardando ou não enviada.';
