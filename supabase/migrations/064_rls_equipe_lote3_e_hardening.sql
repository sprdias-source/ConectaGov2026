-- ============================================================================
-- ConectaGov — Migração 064: achados médios/baixos da perícia técnica 2026-09
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS do script 063.

-- ----------------------------------------------------------------------------
-- (A) system_settings: permissiva demais dentro da própria conta. As
--     policies (migração 053) só checam "user_id = owner_efetivo(auth.uid())"
--     — ou seja, qualquer membro de equipe ATIVO lê/sobrescreve a config
--     padrão de NFS-e, mesmo sem nenhuma permissão de "Financeiro" liberada
--     na Matriz (a tela usa usePermissaoFerramenta('financeiro')).
-- ----------------------------------------------------------------------------
drop policy if exists "select_system_settings" on system_settings;
drop policy if exists "insert_system_settings" on system_settings;
drop policy if exists "update_system_settings" on system_settings;

create policy "select_system_settings" on system_settings for select
using (
  (user_id = owner_efetivo(auth.uid()))
  and (auth.uid() = user_id or tem_acesso(auth.uid(), 'financeiro', 'visualizacao'))
);
create policy "insert_system_settings" on system_settings for insert
with check (
  (user_id = owner_efetivo(auth.uid()))
  and (auth.uid() = user_id or tem_acesso(auth.uid(), 'financeiro', 'edicao'))
);
create policy "update_system_settings" on system_settings for update
using (
  (user_id = owner_efetivo(auth.uid()))
  and (auth.uid() = user_id or tem_acesso(auth.uid(), 'financeiro', 'edicao'))
)
with check (
  (user_id = owner_efetivo(auth.uid()))
  and (auth.uid() = user_id or tem_acesso(auth.uid(), 'financeiro', 'edicao'))
);

-- ----------------------------------------------------------------------------
-- (B) owner_efetivo/tem_acesso aceitavam UUID arbitrário como parâmetro —
--     qualquer usuário autenticado podia chamar
--     supabase.rpc('owner_efetivo', { usuario_id: '<uuid de outra pessoa>' })
--     e descobrir se aquele UUID é membro ativo de alguma equipe (e o nível
--     de acesso dele). Vazamento de metadado (quem pertence a qual equipe),
--     não de dado de negócio — mas gratuito de fechar: TODO uso legítimo no
--     sistema inteiro (toda policy de RLS, e as poucas chamadas diretas do
--     frontend em useAttachedFiles.ts/useClientDocuments.ts) sempre passa
--     auth.uid() como usuario_id, nunca o UUID de outra pessoa. Adiciona
--     essa trava sem mudar nenhum comportamento legítimo existente.
create or replace function public.owner_efetivo(usuario_id uuid)
returns uuid
language sql
stable security definer
set search_path to 'public'
as $$
  select case when usuario_id = auth.uid() then coalesce(
    (select owner_id from team_members
     where member_user_id = usuario_id and status = 'ativo'
     limit 1),
    usuario_id
  ) end
$$;

create or replace function public.tem_acesso(usuario_id uuid, ferramenta text, nivel_minimo text)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select usuario_id = auth.uid() and exists (
    select 1
    from team_members tm
    join member_permissions mp on mp.team_member_id = tm.id
    where tm.member_user_id = usuario_id
      and tm.status = 'ativo'
      and mp.tool_key = ferramenta
      and (
        (nivel_minimo = 'visualizacao' and mp.nivel_acesso in ('visualizacao', 'edicao'))
        or
        (nivel_minimo = 'edicao' and mp.nivel_acesso = 'edicao')
      )
  )
$$;

-- ----------------------------------------------------------------------------
-- (C) verificar_compliance_checklist() varre a base inteira (todas as
--     contas) sem filtro nenhum — pensada só pra rodar via pg_cron, nunca
--     deveria ter EXECUTE liberado pra usuários comuns (se tivesse, por
--     grant feito direto pelo Dashboard fora de qualquer migração, qualquer
--     autenticado poderia disparar uma rotina que atualiza
--     bidding_checklist_items de TODAS as contas ao mesmo tempo). Revoga
--     por garantia — idempotente mesmo que o grant nunca tenha existido.
revoke execute on function public.verificar_compliance_checklist() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- (D) team_members: convidar-membro checava duplicidade (dono já convidou
--     este e-mail?) com um SELECT antes do INSERT, sem trava nenhuma no
--     banco — dois cliques rápidos em "Convidar" podiam inserir dois
--     vínculos pro mesmo par (owner_id, member_user_id). Com a constraint,
--     o segundo INSERT concorrente passa a falhar (em vez de duplicar) —
--     cosmético (o dono veria um erro genérico nesse clique duplo em vez de
--     silenciosamente duplicar), não corrigimos a function pra tratar esse
--     erro com uma mensagem amigável porque isso exigiria reimplantar
--     convidar-membro só por essa causa rara.
--
-- Protegido com exception handler: se já existir duplicata de verdade na
-- base (nunca confirmado, só suspeitado pela perícia), a constraint não é
-- criada e a migração segue pros itens acima sem falhar — avisa via notice
-- em vez de travar o script inteiro.
do $$
begin
  alter table team_members add constraint team_members_owner_member_unique
    unique (owner_id, member_user_id);
exception
  when unique_violation then
    raise notice 'team_members já tem duplicatas de (owner_id, member_user_id) — resolva manualmente (apague o vínculo mais novo de cada duplicata) antes de rodar esta constraint de novo.';
  when duplicate_object then
    null; -- constraint já existe, migração idempotente
end $$;
