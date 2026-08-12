-- Lotes (agrupamento de itens dentro de uma licitação por lote) e o novo
-- campo "Valor que Vamos Participar", editável e distinto do valor total do
-- edital (valor_licitado) e do valor efetivamente ganho (valor_ofertado_real).
alter table bidding_items
  add column if not exists lote text;

alter table biddings
  add column if not exists valor_participacao numeric(14,2);

comment on column bidding_items.lote is 'Número/identificação do lote ao qual este item pertence (licitações por lote). Nulo quando a disputa é por item.';
comment on column biddings.valor_participacao is 'Valor pelo qual a empresa vai efetivamente participar/disputar (pode ser a soma dos itens selecionados ou outro valor informado manualmente).';
