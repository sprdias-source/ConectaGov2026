-- ============================================================================
-- ConectaGov — Migração 036: captura de verificar_compliance_checklist
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
--
-- CONTEXTO: a migration 034 já tinha avisado que 4 funções usadas pelo app
-- estavam fora de qualquer migration rastreada e não seriam recriadas às
-- cegas (checklist_documentos, owner_efetivo, reagendar_backup_diario,
-- tem_acesso). Depois disso, uma inspeção direta em Database → Functions
-- do Supabase encontrou mais DUAS funções nessa mesma situação, que nem
-- essas 4 tinham sido notadas: `verificar_compliance_checklist()` e o
-- trigger `trigger_verificar_compliance_apos_documento()` (anexado como
-- `trg_compliance_apos_documento` em `client_documents`, AFTER INSERT OR
-- UPDATE).
--
-- O QUE ELAS FAZEM (confirmado lendo o corpo real, exportado direto do
-- banco via pg_get_functiondef — não é uma reconstrução por tipos, é uma
-- cópia exata): sempre que uma certidão (client_documents) é enviada ou
-- tem a validade atualizada, reconciliam automaticamente os itens do
-- checklist de habilitação (bidding_checklist_items) vinculados àquele
-- tipo de documento — marcam como atendido quando a certidão está válida
-- com mais de 15 dias de folga, e sincronizam o campo `prazo` quando está
-- vencendo/vencida, pra aparecer como pendência urgente no Painel de
-- Pendências. `verificar_compliance_checklist()` é a versão em lote
-- (varre a tabela inteira, sem argumento) — provavelmente pensada pra
-- rodar periodicamente via pg_cron (não encontramos nenhum agendamento
-- pra ela em nenhuma migration rastreada; se você tiver um, é outra peça
-- que vale capturar separadamente). `trigger_verificar_compliance_apos_
-- documento()` é a versão reativa, que dispara na hora certa por causa do
-- trigger.
--
-- SEGURO DE RODAR NO SEU BANCO ATUAL: como o corpo abaixo é cópia exata do
-- que já está rodando (não uma reconstrução aproximada, diferente da
-- migration 034), o `CREATE OR REPLACE FUNCTION` não muda nenhum
-- comportamento — só passa a deixar essa lógica versionada no repositório.

create or replace function public.verificar_compliance_checklist()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  -- Auto-resolve itens cuja certidão vinculada está válida (folga de mais
  -- de 15 dias até vencer).
  update bidding_checklist_items bci
  set atendido = true, updated_at = now()
  from biddings b
  join client_documents cd
    on cd.client_id = b.client_id
    and cd.tipo = bci.client_document_tipo
    and cd.user_id = bci.user_id
  where bci.bidding_id = b.id
    and bci.client_document_tipo is not null
    and bci.atendido = false
    and bci.attached_file_id is null
    and cd.storage_path is not null
    and cd.data_validade > (current_date + interval '15 days')
    and b.status = 'Em Andamento';

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
  set atendido = true, updated_at = now()
  from biddings b
  where bci.bidding_id = b.id
    and b.client_id = new.client_id
    and bci.client_document_tipo = new.tipo
    and bci.atendido = false
    and bci.attached_file_id is null
    and new.storage_path is not null
    and new.data_validade > (current_date + interval '15 days')
    and b.status = 'Em Andamento';

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

drop trigger if exists trg_compliance_apos_documento on client_documents;
create trigger trg_compliance_apos_documento
  after insert or update on client_documents
  for each row execute function trigger_verificar_compliance_apos_documento();
