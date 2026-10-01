-- ============================================================================
-- ConectaGov — Migração 063: acesso de equipe, lote 2 (perícia técnica 2026-09)
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS do script 062.
--
-- Continuação dos achados #13 (migração 058) e do item B da migração 040:
-- mais tabelas lidas/escritas por telas que já suportam membro de equipe,
-- mas que ainda só tinham a policy antiga "auth.uid() = user_id" — membro
-- convidado com permissão liberada na Matriz via tela vazia ou salvamento
-- falhando calado. Mapeamento de ferramenta confirmado lendo o código (qual
-- usePermissaoFerramenta('...') protege cada tela que usa a tabela).
--
-- (A) attached_files — caso especial: a MESMA tabela guarda anexos de
--     Licitação, Oportunidade, Cliente (pasta de Editais/TR), Contrato e
--     Recibo (coluna entity_type), cada um atrás de uma ferramenta
--     diferente — por isso a condição usa um CASE em vez do padrão fixo de
--     uma ferramenta só por tabela.
drop policy if exists "select_team_attached_files" on attached_files;
drop policy if exists "insert_team_attached_files" on attached_files;
drop policy if exists "update_team_attached_files" on attached_files;
drop policy if exists "delete_team_attached_files" on attached_files;

create policy "select_team_attached_files" on attached_files for select
using (
  (user_id = owner_efetivo(auth.uid()))
  and (
    auth.uid() = user_id
    or tem_acesso(auth.uid(), case entity_type
      when 'licitacao' then 'licitacoes'
      when 'cliente' then 'licitacoes'
      when 'oportunidade' then 'cadastros'
      when 'contrato' then 'contratos'
      when 'recibo' then 'recibos'
      when 'funcionario' then 'funcionarios'
      when 'empenho' then 'financeiro'
      else 'cadastros'
    end, 'visualizacao')
  )
);
create policy "insert_team_attached_files" on attached_files for insert
with check (
  (user_id = owner_efetivo(auth.uid()))
  and (
    auth.uid() = user_id
    or tem_acesso(auth.uid(), case entity_type
      when 'licitacao' then 'licitacoes'
      when 'cliente' then 'licitacoes'
      when 'oportunidade' then 'cadastros'
      when 'contrato' then 'contratos'
      when 'recibo' then 'recibos'
      when 'funcionario' then 'funcionarios'
      when 'empenho' then 'financeiro'
      else 'cadastros'
    end, 'edicao')
  )
);
create policy "update_team_attached_files" on attached_files for update
using (
  (user_id = owner_efetivo(auth.uid()))
  and (
    auth.uid() = user_id
    or tem_acesso(auth.uid(), case entity_type
      when 'licitacao' then 'licitacoes'
      when 'cliente' then 'licitacoes'
      when 'oportunidade' then 'cadastros'
      when 'contrato' then 'contratos'
      when 'recibo' then 'recibos'
      when 'funcionario' then 'funcionarios'
      when 'empenho' then 'financeiro'
      else 'cadastros'
    end, 'edicao')
  )
)
with check (
  (user_id = owner_efetivo(auth.uid()))
  and (
    auth.uid() = user_id
    or tem_acesso(auth.uid(), case entity_type
      when 'licitacao' then 'licitacoes'
      when 'cliente' then 'licitacoes'
      when 'oportunidade' then 'cadastros'
      when 'contrato' then 'contratos'
      when 'recibo' then 'recibos'
      when 'funcionario' then 'funcionarios'
      when 'empenho' then 'financeiro'
      else 'cadastros'
    end, 'edicao')
  )
);
create policy "delete_team_attached_files" on attached_files for delete
using (
  (user_id = owner_efetivo(auth.uid()))
  and (
    auth.uid() = user_id
    or tem_acesso(auth.uid(), case entity_type
      when 'licitacao' then 'licitacoes'
      when 'cliente' then 'licitacoes'
      when 'oportunidade' then 'cadastros'
      when 'contrato' then 'contratos'
      when 'recibo' then 'recibos'
      when 'funcionario' then 'funcionarios'
      when 'empenho' then 'financeiro'
      else 'cadastros'
    end, 'edicao')
  )
);

-- (B) Tabelas simples, uma ferramenta fixa cada — mesmo padrão exato da
--     migração 058. bidding_itens_extracao e opportunity_itens_extracao são
--     as duas tabelas novas do botão "Puxar Itens" (migração 061), que
--     nasceram só com a policy "own".
do $$
declare
  t record;
begin
  for t in select * from (values
    ('bidding_items', 'licitacoes'),
    ('bidding_items_versions', 'licitacoes'),
    ('client_documents', 'cadastros'),
    ('bidding_itens_extracao', 'licitacoes'),
    ('opportunity_itens_extracao', 'cadastros')
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

-- (C) contract_marcos: a migração 040 já tinha criado a policy de equipe,
--     mas checando a ferramenta errada ('cadastros') — a tela de verdade
--     (ExecucaoContratosPage) usa usePermissaoFerramenta('contratos'). Um
--     membro com "Contratos: Edição" liberado (e sem "Cadastros") via a
--     tela normalmente, mas a aba de marcos/etapas aparecia vazia e salvar
--     falhava. Recria as 4 policies com a ferramenta certa.
drop policy if exists "select_team_contract_marcos" on contract_marcos;
drop policy if exists "insert_team_contract_marcos" on contract_marcos;
drop policy if exists "update_team_contract_marcos" on contract_marcos;
drop policy if exists "delete_team_contract_marcos" on contract_marcos;

create policy "select_team_contract_marcos" on contract_marcos for select
using (
  (user_id = owner_efetivo(auth.uid()))
  and (auth.uid() = user_id or tem_acesso(auth.uid(), 'contratos', 'visualizacao'))
);
create policy "insert_team_contract_marcos" on contract_marcos for insert
with check (
  (user_id = owner_efetivo(auth.uid()))
  and (auth.uid() = user_id or tem_acesso(auth.uid(), 'contratos', 'edicao'))
);
create policy "update_team_contract_marcos" on contract_marcos for update
using (
  (user_id = owner_efetivo(auth.uid()))
  and (auth.uid() = user_id or tem_acesso(auth.uid(), 'contratos', 'edicao'))
)
with check (
  (user_id = owner_efetivo(auth.uid()))
  and (auth.uid() = user_id or tem_acesso(auth.uid(), 'contratos', 'edicao'))
);
create policy "delete_team_contract_marcos" on contract_marcos for delete
using (
  (user_id = owner_efetivo(auth.uid()))
  and (auth.uid() = user_id or tem_acesso(auth.uid(), 'contratos', 'edicao'))
);

-- (D) bidding_itens_extracao / opportunity_itens_extracao nunca entraram no
--     loop de triggers da migração 041 (são posteriores a ela). As Edge
--     Functions Extrair-itens-edital/oportunidade já gravam com o
--     `ownerId` correto (resolvido via owner_efetivo antes do insert, não
--     o auth.uid() de quem chamou), então isto não corrige um bug
--     observado hoje — é a mesma garantia "o banco impõe, não só o app"
--     aplicada por consistência com as outras ~29 tabelas da 041, caso
--     algum caminho futuro insira direto nestas tabelas sem passar pela
--     function. Reaproveita as mesmas 2 funções já criadas na 041
--     (set_owner_efetivo_on_insert / preserve_owner_on_update).
drop trigger if exists trg_bidding_itens_extracao_owner_efetivo_insert on bidding_itens_extracao;
create trigger trg_bidding_itens_extracao_owner_efetivo_insert
before insert on bidding_itens_extracao
for each row execute function set_owner_efetivo_on_insert();

drop trigger if exists trg_bidding_itens_extracao_owner_efetivo_update on bidding_itens_extracao;
create trigger trg_bidding_itens_extracao_owner_efetivo_update
before update on bidding_itens_extracao
for each row execute function preserve_owner_on_update();

drop trigger if exists trg_opportunity_itens_extracao_owner_efetivo_insert on opportunity_itens_extracao;
create trigger trg_opportunity_itens_extracao_owner_efetivo_insert
before insert on opportunity_itens_extracao
for each row execute function set_owner_efetivo_on_insert();

drop trigger if exists trg_opportunity_itens_extracao_owner_efetivo_update on opportunity_itens_extracao;
create trigger trg_opportunity_itens_extracao_owner_efetivo_update
before update on opportunity_itens_extracao
for each row execute function preserve_owner_on_update();
