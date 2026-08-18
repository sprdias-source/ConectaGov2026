-- ============================================================================
-- ConectaGov — Migração 025: Item do checklist marcado como "Não Aplicável"
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
--
-- O QUE FAZ: o edital às vezes lista exigências alternativas conforme a
-- natureza jurídica do licitante (ex: "8.9.2.1 ... no caso de empresário
-- individual", "8.9.2.2 ... em se tratando de MEI") — só UMA delas se
-- aplica à empresa, o resto nunca vai ter documento pra anexar. Sem uma
-- forma de marcar isso, o item fica pendente pra sempre.
--
-- Adiciona duas colunas em bidding_checklist_items: nao_aplicavel (o
-- interruptor) e justificativa_nao_aplicavel (o motivo registrado, pra
-- explicar numa eventual diligência por que aquele item não tem anexo).
-- O item continua no checklist — nada é apagado — só sai da contagem de
-- obrigatórios pendentes (calcularHabilitacao, em useBiddingChecklist.ts).

alter table bidding_checklist_items add column if not exists nao_aplicavel boolean not null default false;
alter table bidding_checklist_items add column if not exists justificativa_nao_aplicavel text;

comment on column bidding_checklist_items.nao_aplicavel is 'Item do edital que não se aplica a esta empresa (ex: exigência alternativa por natureza jurídica) — sai da contagem de obrigatórios pendentes, mas continua visível no checklist.';
comment on column bidding_checklist_items.justificativa_nao_aplicavel is 'Motivo registrado de por que o item não se aplica — fica salvo pra explicar numa eventual diligência.';
