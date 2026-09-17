-- ============================================================================
-- ConectaGov — Migração 058: acesso de equipe nas 7 tabelas centrais
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS dos scripts 001 a 057.
--
-- Lote 6 da perícia técnica de 2026-09 (achado #13): clients, biddings,
-- financial_accounts, empenhos, transactions, contracts e receipts —
-- exatamente as 7 tabelas mais centrais do sistema — nunca receberam o
-- mesmo tratamento de acesso de equipe que a migração 040 já aplicou em
-- mais de 20 outras tabelas (categories, employees, client_platforms
-- etc). Continuavam só com a policy original "auth.uid() = user_id"
-- (migração 001) — ou seja, um membro de equipe convidado, mesmo com
-- permissão de Visualização/Edição liberada na Matriz de Permissões pro
-- dono da conta, nunca via nem conseguia editar Clientes, Licitações,
-- Contas, Empenhos, Lançamentos, Contratos ou Recibos: a tela carregava
-- vazia ou o salvamento falhava calado (o Postgres devolve 0 linhas em
-- vez de erro quando RLS bloqueia).
--
-- Igual à migração 040 (B): ADITIVO — não remove nenhuma policy antiga
-- ("select_own_X" etc. continuam batendo pro próprio dono), só some mais
-- uma policy permissiva que o Postgres OR com as demais. Mapeamento de
-- ferramenta confirmado lendo o código (qual usePermissaoFerramenta('...')
-- protege cada tela que usa a tabela — ClientsTab: 'clientes',
-- KanbanLicitacoesPage: 'licitacoes', ContasLancamentosTab/EmpenhosTab:
-- 'financeiro', ContratosPage: 'contratos', RecibosPage: 'recibos').
do $$
declare
  t record;
begin
  for t in select * from (values
    ('clients', 'clientes'),
    ('biddings', 'licitacoes'),
    ('financial_accounts', 'financeiro'),
    ('empenhos', 'financeiro'),
    ('transactions', 'financeiro'),
    ('contracts', 'contratos'),
    ('receipts', 'recibos')
  ) as x(tabela, ferramenta)
  loop
    execute format('drop policy if exists "select_team_%1$s" on %1$s', t.tabela);
    execute format('drop policy if exists "insert_team_%1$s" on %1$s', t.tabela);
    execute format('drop policy if exists "update_team_%1$s" on %1$s', t.tabela);
    execute format('drop policy if exists "delete_team_%1$s" on %1$s', t.tabela);

    execute format($f$
      create policy "select_team_%1$s" on %1$s for select
      using (
        (user_id = owner_efetivo(auth.uid()))
        and (auth.uid() = user_id or tem_acesso(auth.uid(), '%2$s', 'visualizacao'))
      );
      create policy "insert_team_%1$s" on %1$s for insert
      with check (
        (user_id = owner_efetivo(auth.uid()))
        and (auth.uid() = user_id or tem_acesso(auth.uid(), '%2$s', 'edicao'))
      );
      create policy "update_team_%1$s" on %1$s for update
      using (
        (user_id = owner_efetivo(auth.uid()))
        and (auth.uid() = user_id or tem_acesso(auth.uid(), '%2$s', 'edicao'))
      )
      with check (
        (user_id = owner_efetivo(auth.uid()))
        and (auth.uid() = user_id or tem_acesso(auth.uid(), '%2$s', 'edicao'))
      );
      create policy "delete_team_%1$s" on %1$s for delete
      using (
        (user_id = owner_efetivo(auth.uid()))
        and (auth.uid() = user_id or tem_acesso(auth.uid(), '%2$s', 'edicao'))
      );
    $f$, t.tabela, t.ferramenta);
  end loop;
end $$;
