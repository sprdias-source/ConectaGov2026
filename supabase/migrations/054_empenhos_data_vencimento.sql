-- Data de Vencimento do Empenho — prazo em que o pagamento daquele empenho
-- é esperado da prefeitura. É OPCIONAL de propósito: a grande maioria dos
-- empenhos já cadastrados não tem esse dado, e muitos empenhos novos são
-- registrados antes da prefeitura informar o prazo. Empenho sem vencimento
-- simplesmente não gera alerta na Central de Prazos (nunca vira "vencido"
-- por omissão).
--
-- Não existe coluna "dias para vencimento" de propósito: no formulário o
-- usuário pode digitar "N dias após a data do empenho", mas isso é só uma
-- calculadora de conveniência — o que se grava é sempre a DATA resultante.
-- Guardar o N à parte criaria duas fontes de verdade que poderiam divergir
-- (e a data do empenho é fato histórico da prefeitura: não muda depois de
-- registrada, então não há o que recalcular).
--
-- Sem mudança de RLS: as políticas de `empenhos` já são por linha
-- (user_id/equipe), e uma coluna nova nullable não introduz nova superfície.

alter table empenhos
  add column if not exists data_vencimento date;
