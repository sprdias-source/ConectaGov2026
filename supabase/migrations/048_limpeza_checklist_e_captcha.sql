-- ============================================================================
-- ConectaGov — Migração 048: rede de segurança no banco para 2 achados baixos
-- da segunda perícia (Raio-X ConectaGov II)
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.

-- ----------------------------------------------------------------------------
-- Achado #13: excluir um Atestado Técnico ou um anexo legado (attached_files)
-- já zera a referência em bidding_checklist_items (FK "on delete set null",
-- migração 034) — mas isso não desfaz o "atendido" do item, do mesmo jeito
-- que a exclusão de um client_documents já foi corrigida na migração 041.
-- Hoje isso nunca acontece na prática (só os hooks existentes apagam essas
-- linhas, e nenhum deles some com o arquivo sem também desmarcar o item) —
-- esta migração só adiciona a mesma rede de segurança no banco, pra
-- qualquer caminho novo que passe a excluir essas linhas direto não deixar
-- um item "atendido" órfão, sem documento nenhum por trás.
-- ----------------------------------------------------------------------------

create or replace function public.trigger_reverter_compliance_apos_exclusao_atestado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update bidding_checklist_items
  set atendido = false, atestado_id = null, updated_at = now()
  where atestado_id = old.id;
  return old;
end;
$$;

drop trigger if exists trg_compliance_apos_exclusao_atestado on atestados_tecnicos;
create trigger trg_compliance_apos_exclusao_atestado
after delete on atestados_tecnicos
for each row execute function trigger_reverter_compliance_apos_exclusao_atestado();

create or replace function public.trigger_reverter_compliance_apos_exclusao_anexo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update bidding_checklist_items
  set atendido = false, attached_file_id = null, updated_at = now()
  where attached_file_id = old.id;
  return old;
end;
$$;

drop trigger if exists trg_compliance_apos_exclusao_anexo on attached_files;
create trigger trg_compliance_apos_exclusao_anexo
after delete on attached_files
for each row execute function trigger_reverter_compliance_apos_exclusao_anexo();

-- ----------------------------------------------------------------------------
-- Achado #23: se o job do robô CNDT for morto pelo timeout do runner
-- (robo-cndt.yml, 10 minutos) durante o polling do captcha, o SIGKILL mata
-- o processo antes do "finally" que limparia a linha rodar — a linha fica
-- presa em status='aguardando' pra sempre. Não aparece pro usuário (o hook
-- já filtra por expira_em > now()), mas acumula linha órfã com imagem de
-- captcha em base64, sem nenhuma rotina de expurgo. Roda 1x/dia, bem depois
-- de qualquer captcha_sessions ter tido chance de expirar de verdade.
-- ----------------------------------------------------------------------------

select cron.schedule(
  'limpar-captcha-sessions-expiradas',
  '30 6 * * *',
  $$ delete from captcha_sessions where expira_em < now() - interval '1 day'; $$
);

-- Para remover, se precisar:
-- select cron.unschedule('limpar-captcha-sessions-expiradas');

-- ----------------------------------------------------------------------------
-- Achado #16: "Aplicar precificação" fazia um UPDATE por item, sequencial,
-- sem transação — se a rede caísse no meio, alguns itens ficavam com o
-- perfil novo e outros com o antigo, sem rollback nem aviso de quais foram
-- atualizados. Uma função no banco que faz tudo num UPDATE só (via
-- jsonb_to_recordset) é atômica de graça: ou os itens da lista são
-- atualizados todos, ou nenhum é (erro de rede na chamada RPC não deixa
-- resultado parcial). "security invoker" (padrão) mantém a RLS de
-- bidding_items valendo normalmente pra quem chama.
-- ----------------------------------------------------------------------------

create or replace function public.aplicar_precificacao_items(itens jsonb)
returns void
language plpgsql
as $$
begin
  update bidding_items bi set
    custo_unitario = v.custo_unitario,
    valor_minimo_calculado = v.valor_minimo_calculado,
    participa_precificacao = v.participa_precificacao,
    pricing_profile_id = v.pricing_profile_id,
    impostos_pct_aplicado = v.impostos_pct_aplicado,
    despesas_pct_aplicado = v.despesas_pct_aplicado,
    margem_pct_aplicada = v.margem_pct_aplicada
  from jsonb_to_recordset(itens) as v(
    id uuid,
    custo_unitario numeric,
    valor_minimo_calculado numeric,
    participa_precificacao boolean,
    pricing_profile_id uuid,
    impostos_pct_aplicado numeric,
    despesas_pct_aplicado numeric,
    margem_pct_aplicada numeric
  )
  where bi.id = v.id;
end;
$$;

grant execute on function public.aplicar_precificacao_items(jsonb) to authenticated;
