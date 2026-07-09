-- Continuação da aplicação do sistema multiusuário (migration 022) — dessa
-- vez em Licitações e Contas & Cartões, depois que o usuário testou de
-- verdade e percebeu que essas telas ainda não respeitavam permissão
-- nenhuma.
--
-- Descoberta importante ao revisar a semente original (migration 013): a
-- ferramenta 'cadastros' é SÓ sobre documentos de habilitação/certidões —
-- não cobre Licitações nem Contas. Por isso:
--   - Licitações ganha uma ferramenta NOVA: 'licitacoes'
--   - Contas & Cartões entra em 'financeiro' (é dinheiro/saldo/cartão)

-- ----------------------------------------------------------------------------
-- Ferramenta nova: licitacoes
-- ----------------------------------------------------------------------------
insert into system_tools (key, nome, descricao, ordem) values
  ('licitacoes', 'Licitações', 'Licitações monitoradas e itens', 5)
on conflict (key) do nothing;

-- Backfill: qualquer membro de equipe que já existia antes dessa ferramenta
-- ser criada precisa ganhar uma linha 'sem_acesso' pra ela (senão a tela de
-- admin mostra uma coluna vazia, sem opção de ajustar).
insert into member_permissions (team_member_id, tool_key, nivel_acesso)
select tm.id, 'licitacoes', 'sem_acesso'
from team_members tm
where not exists (
  select 1 from member_permissions mp
  where mp.team_member_id = tm.id and mp.tool_key = 'licitacoes'
);

-- ----------------------------------------------------------------------------
-- Remove políticas antigas de biddings, bidding_items e financial_accounts
-- (mesma técnica da migration 022 — não sabemos os nomes exatos usados
-- originalmente, então removemos tudo dinamicamente antes de recriar).
-- ----------------------------------------------------------------------------
do $$
declare
  pol record;
begin
  for pol in select policyname from pg_policies where tablename = 'biddings' loop
    execute format('drop policy %I on biddings', pol.policyname);
  end loop;

  for pol in select policyname from pg_policies where tablename = 'bidding_items' loop
    execute format('drop policy %I on bidding_items', pol.policyname);
  end loop;

  for pol in select policyname from pg_policies where tablename = 'financial_accounts' loop
    execute format('drop policy %I on financial_accounts', pol.policyname);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- biddings — ferramenta 'licitacoes'
-- ----------------------------------------------------------------------------
create policy "Ver licitações (owner ou membro com acesso)"
  on biddings for select
  using (
    user_id = owner_efetivo(auth.uid())
    and (auth.uid() = user_id or tem_acesso(auth.uid(), 'licitacoes', 'visualizacao'))
  );

create policy "Criar licitações (owner ou membro com edição)"
  on biddings for insert
  with check (
    user_id = owner_efetivo(auth.uid())
    and (auth.uid() = user_id or tem_acesso(auth.uid(), 'licitacoes', 'edicao'))
  );

create policy "Editar licitações (owner ou membro com edição)"
  on biddings for update
  using (
    user_id = owner_efetivo(auth.uid())
    and (auth.uid() = user_id or tem_acesso(auth.uid(), 'licitacoes', 'edicao'))
  )
  with check (
    user_id = owner_efetivo(auth.uid())
    and (auth.uid() = user_id or tem_acesso(auth.uid(), 'licitacoes', 'edicao'))
  );

create policy "Apagar licitações (owner ou membro com edição)"
  on biddings for delete
  using (
    user_id = owner_efetivo(auth.uid())
    and (auth.uid() = user_id or tem_acesso(auth.uid(), 'licitacoes', 'edicao'))
  );

-- ----------------------------------------------------------------------------
-- bidding_items — mesma ferramenta 'licitacoes' (itens pertencem a uma
-- licitação, então a checagem usa o user_id gravado no próprio item —
-- assumindo que toBiddingItemInsert grava o mesmo user_id do owner efetivo,
-- igual é feito em toBiddingInsert)
-- ----------------------------------------------------------------------------
create policy "Ver itens de licitação (owner ou membro com acesso)"
  on bidding_items for select
  using (
    user_id = owner_efetivo(auth.uid())
    and (auth.uid() = user_id or tem_acesso(auth.uid(), 'licitacoes', 'visualizacao'))
  );

create policy "Criar itens de licitação (owner ou membro com edição)"
  on bidding_items for insert
  with check (
    user_id = owner_efetivo(auth.uid())
    and (auth.uid() = user_id or tem_acesso(auth.uid(), 'licitacoes', 'edicao'))
  );

create policy "Editar itens de licitação (owner ou membro com edição)"
  on bidding_items for update
  using (
    user_id = owner_efetivo(auth.uid())
    and (auth.uid() = user_id or tem_acesso(auth.uid(), 'licitacoes', 'edicao'))
  )
  with check (
    user_id = owner_efetivo(auth.uid())
    and (auth.uid() = user_id or tem_acesso(auth.uid(), 'licitacoes', 'edicao'))
  );

create policy "Apagar itens de licitação (owner ou membro com edição)"
  on bidding_items for delete
  using (
    user_id = owner_efetivo(auth.uid())
    and (auth.uid() = user_id or tem_acesso(auth.uid(), 'licitacoes', 'edicao'))
  );

-- ----------------------------------------------------------------------------
-- financial_accounts — ferramenta 'financeiro'
-- ----------------------------------------------------------------------------
create policy "Ver contas (owner ou membro com acesso)"
  on financial_accounts for select
  using (
    user_id = owner_efetivo(auth.uid())
    and (auth.uid() = user_id or tem_acesso(auth.uid(), 'financeiro', 'visualizacao'))
  );

create policy "Criar contas (owner ou membro com edição)"
  on financial_accounts for insert
  with check (
    user_id = owner_efetivo(auth.uid())
    and (auth.uid() = user_id or tem_acesso(auth.uid(), 'financeiro', 'edicao'))
  );

create policy "Editar contas (owner ou membro com edição)"
  on financial_accounts for update
  using (
    user_id = owner_efetivo(auth.uid())
    and (auth.uid() = user_id or tem_acesso(auth.uid(), 'financeiro', 'edicao'))
  )
  with check (
    user_id = owner_efetivo(auth.uid())
    and (auth.uid() = user_id or tem_acesso(auth.uid(), 'financeiro', 'edicao'))
  );

create policy "Apagar contas (owner ou membro com edição)"
  on financial_accounts for delete
  using (
    user_id = owner_efetivo(auth.uid())
    and (auth.uid() = user_id or tem_acesso(auth.uid(), 'financeiro', 'edicao'))
  );

-- NOTA: se ao rodar essa migration der erro "column user_id does not exist"
-- em bidding_items, é porque esse item na verdade NÃO tem seu próprio
-- user_id (pode só ter bidding_id, herdando o dono via join com biddings).
-- Nesse caso, avisar o Claude pra trocar a política de bidding_items por
-- uma que faça EXISTS contra biddings em vez de comparar user_id direto.
