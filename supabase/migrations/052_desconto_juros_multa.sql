-- ============================================================================
-- ConectaGov — Migração 052: Desconto, Juros e Multa em Lançamentos
-- ============================================================================
-- Cole este script inteiro no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS dos scripts 001 a 052.
--
-- CONTEXTO: nenhum lançamento (a receber ou a pagar) tinha como registrar
-- desconto, juros ou multa aplicados no momento do recebimento/pagamento —
-- só existia um único campo "value", usado tanto pro valor cobrado quanto
-- pro valor efetivamente movimentado.
--
-- `valor_original` guarda o valor cobrado (nunca muda depois de criado).
-- `value` (coluna já existente, usada em TODO o resto do sistema — Fluxo de
-- Caixa, Relatórios, Dashboard, Balanço, RBT12/DAS) passa a ser sempre "o
-- que realmente entrou/saiu": quando o lançamento é marcado como pago/
-- recebido com desconto/juros/multa, value é recalculado automaticamente
-- (valor_original − desconto + juros + multa). Isso significa que nenhum
-- outro lugar do sistema que já soma `value` precisa de nenhuma mudança —
-- eles já vão refletir o valor certo automaticamente.
--
-- Duas exceções que SÃO ajustadas nesta entrega (fora desta migração, no
-- código): RBT12/Conferência do DAS (juros e multa são receita financeira,
-- não integram a base do Simples Nacional) e a DRE (ganha uma seção de
-- Resultado Financeiro separada da Receita/Despesa Operacional).

alter table transactions
  add column if not exists valor_original numeric(14, 2),
  add column if not exists desconto numeric(14, 2),
  add column if not exists juros numeric(14, 2),
  add column if not exists multa numeric(14, 2);

comment on column transactions.valor_original is
  'Valor originalmente cobrado/lançado, antes de qualquer desconto/juros/multa. Nunca muda depois de criado. Nulo em lançamentos criados antes desta migração — nesse caso o valor original é o próprio "value" atual.';

-- Backfill: lançamentos já existentes não têm desconto/juros/multa
-- aplicados (o conceito não existia), então o valor original é o próprio
-- valor atual — sem isso, editar um lançamento antigo pela primeira vez
-- depois desta migração mostraria "Valor Original" em branco.
update transactions set valor_original = value where valor_original is null;
