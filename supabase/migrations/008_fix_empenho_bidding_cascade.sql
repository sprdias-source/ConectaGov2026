-- ============================================================================
-- ConectaGov — Migração 008: Correção de integridade Empenho <-> Licitação
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
--
-- O QUE CORRIGE: a tabela empenhos foi criada com "on delete set null"
-- na referência à licitação — isso permitia que, ao excluir uma
-- licitação, os empenhos vinculados ficassem "órfãos" (sem licitação
-- nenhuma), o que não tem sentido no modelo de negócio: todo empenho
-- SEMPRE se origina de uma licitação ganha. Agora, excluir a licitação
-- exclui em cascata os empenhos vinculados também - consistente com o
-- aviso que já aparece na tela ("será perdido junto").

alter table empenhos drop constraint if exists empenhos_bidding_id_fkey;

alter table empenhos
  add constraint empenhos_bidding_id_fkey
  foreign key (bidding_id) references biddings(id) on delete cascade;

-- ----------------------------------------------------------------------------
-- Função de diagnóstico: permite que o app verifique se a cascata já foi
-- corrigida, sem precisar excluir nada de teste.
-- ----------------------------------------------------------------------------
create or replace function check_empenho_bidding_cascade()
returns boolean
language sql
security definer
as $$
  select exists (
    select 1
    from pg_constraint
    where conname = 'empenhos_bidding_id_fkey'
      and confdeltype = 'c'  -- 'c' = cascade
  );
$$;

grant execute on function check_empenho_bidding_cascade() to authenticated;
