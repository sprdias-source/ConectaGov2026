-- ============================================================================
-- ConectaGov — Migração 044: checklist não resolve item sozinho por certidão
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS dos scripts 001 a 043.
--
-- CONTEXTO: hoje, sempre que uma certidão (client_documents) é enviada ou
-- tem a validade atualizada — inclusive pela busca automática por robô —
-- um trigger (trg_compliance_apos_documento, ver migração 036) marca
-- sozinho como "atendido" qualquer item de checklist (de QUALQUER
-- licitação do cliente) que peça aquele mesmo tipo de certidão, contanto
-- que o campo storage_path esteja preenchido e a validade tenha mais de 15
-- dias de folga. Isso só confere o CAMPO do banco, nunca se o arquivo
-- realmente existe — foi assim que 4 certidões com arquivo perdido (nunca
-- salvo direito por uma falha da busca automática) ficaram marcadas como
-- "atendidas" sem ninguém perceber.
--
-- Combinado com o usuário: o sistema deve continuar avisando que existe uma
-- certidão válida disponível pro tipo pedido, mas não deve mais marcar o
-- item como atendido sozinho — ele quer decidir/confirmar (ou importar um
-- documento novo, mesmo com o antigo ainda dentro da validade) pra cada
-- licitação. Essa parte de "avisar sem resolver sozinho" já é feita do lado
-- do app (ver certidaoDisponivelParaItem em useBiddingChecklist.ts).
--
-- O QUE ESTE SCRIPT FAZ: remove só o trecho que marcava atendido=true
-- automaticamente, tanto da versão reativa (trigger, dispara a cada
-- envio/atualização de certidão) quanto da versão em lote
-- (verificar_compliance_checklist, pensada pra rodar periodicamente). O
-- trecho que sincroniza o campo `prazo` (pra aparecer no Painel de
-- Pendências quando uma certidão estiver vencendo) continua exatamente
-- igual — isso é só informativo, não resolve nada sozinho.
--
-- NÃO mexe em nenhuma linha já marcada como atendida no passado (não
-- reverte item nenhum) — só muda o comportamento daqui pra frente.

create or replace function public.verificar_compliance_checklist()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  -- Preenche/atualiza o prazo dos itens cuja certidão vinculada está
  -- vencendo, vencida, ou ainda não foi buscada — pra virar tarefa urgente
  -- visível no Painel de Pendências sem precisar abrir a licitação.
  update bidding_checklist_items bci
  set prazo = cd.data_validade, updated_at = now()
  from biddings b
  join client_documents cd
    on cd.client_id = b.client_id
    and cd.tipo = bci.client_document_tipo
    and cd.user_id = bci.user_id
  where bci.bidding_id = b.id
    and bci.client_document_tipo is not null
    and bci.atendido = false
    and bci.attached_file_id is null
    and cd.data_validade is not null
    and (bci.prazo is distinct from cd.data_validade)
    and b.status = 'Em Andamento';
end;
$function$;

create or replace function public.trigger_verificar_compliance_apos_documento()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  update bidding_checklist_items bci
  set prazo = new.data_validade, updated_at = now()
  from biddings b
  where bci.bidding_id = b.id
    and b.client_id = new.client_id
    and bci.client_document_tipo = new.tipo
    and bci.atendido = false
    and bci.attached_file_id is null
    and new.data_validade is not null
    and (bci.prazo is distinct from new.data_validade)
    and b.status = 'Em Andamento';

  return new;
end;
$function$;
