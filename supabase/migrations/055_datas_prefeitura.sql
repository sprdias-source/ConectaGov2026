-- Duas datas novas nos lançamentos de comissão gerados a partir de um
-- empenho: quando a prefeitura deveria pagar o cliente (data_vencimento_
-- prefeitura) e quando ela pagou de fato (data_liquidacao_prefeitura).
-- Ambas OPCIONAIS e preenchidas manualmente na baixa do lançamento — não
-- vêm de nenhuma integração, é o próprio usuário que acompanha e registra.
--
-- Serve de referência pra saber se o CLIENTE demora a repassar a comissão
-- depois que a prefeitura já pagou ele (ver Central de Prazos e o
-- Relatório de Repasse por Cliente, em Relatórios).

alter table transactions
  add column if not exists data_vencimento_prefeitura date,
  add column if not exists data_liquidacao_prefeitura date;

comment on column transactions.data_vencimento_prefeitura is
  'Prazo em que a prefeitura deveria pagar o cliente (referente ao empenho desta comissão) — informativo, preenchido manualmente.';
comment on column transactions.data_liquidacao_prefeitura is
  'Data em que a prefeitura efetivamente pagou o cliente — usada para medir se o cliente demora a repassar a comissão depois de já ter recebido.';
