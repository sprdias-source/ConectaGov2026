-- ============================================================================
-- ConectaGov — Migração 062: trava contra duplicidade no motor de recorrência
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS do script 061.
--
-- Perícia técnica 2026-09 (achado crítico): useRecurringEngine.ts (o motor
-- que garante sempre HORIZON parcelas futuras pendentes pra cada lançamento
-- "Repetir todo mês") decide o que criar checando quais due_date já existem
-- ANTES de inserir — mas essa checagem e o insert não são atômicos. Se o
-- usuário mantiver duas abas abertas (comum: uma aba do dia a dia + outra
-- aberta em segundo plano), as duas rodam o motor quase ao mesmo tempo,
-- cada uma vê "essa parcela ainda não existe" e as duas inserem a MESMA
-- parcela (mesmo lançamento-pai, mesmo vencimento) — duplicando um valor
-- financeiro real sem nenhum aviso.
--
-- Em vez de tentar sincronizar as abas (frágil), a trava de verdade fica no
-- banco: nenhuma linha filha de um mesmo lançamento recorrente pode repetir
-- o mesmo due_date. A segunda inserção concorrente passa a falhar com
-- violação de unicidade (código 23505) em vez de duplicar — e o código em
-- useRecurringEngine.ts já foi ajustado pra tratar esse erro específico como
-- "outra aba já criou, segue o jogo" (não é um erro de verdade).
--
-- Antes de criar o índice único, remove duplicatas que já possam existir
-- (o Postgres recusa criar unique index se já houver conflito). Pra cada
-- par (recurring_parent_id, due_date) duplicado, mantém UMA linha e apaga
-- as demais, escolhendo qual manter nesta ordem de prioridade:
--   1) se alguma das duplicatas já está "Pago", mantém ela (nunca apaga um
--      pagamento já registrado, mesmo que tenha sido a 2ª parcela criada);
--   2) senão, mantém a mais antiga (menor created_at/id) — a duplicata mais
--      nova, ainda pendente, é a que sobra por engano do motor.
with duplicadas as (
  select id, row_number() over (
    partition by recurring_parent_id, due_date
    order by (status = 'Pago') desc, created_at asc, id asc
  ) as posicao
  from transactions
  where recurring_parent_id is not null
)
delete from transactions
where id in (select id from duplicadas where posicao > 1);

create unique index if not exists idx_transactions_recurring_parent_due_date
  on transactions (recurring_parent_id, due_date)
  where recurring_parent_id is not null;
