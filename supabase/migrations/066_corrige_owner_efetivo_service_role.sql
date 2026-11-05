-- ============================================================================
-- ConectaGov — Migração 066: corrige owner_efetivo/tem_acesso quebrados
-- pra chamadas via service role (achado do usuário: erro "Não foi possível
-- identificar a conta do usuário" ao enviar Contrato Final/Empenho/etc.)
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
--
-- REGRESSÃO da migração 064(B): a trava "usuario_id = auth.uid()" (pra
-- impedir um usuário autenticado de sondar o UUID de OUTRA pessoa via
-- supabase.rpc('owner_efetivo', { usuario_id: '<uuid alheio>' })) também
-- bloqueou, sem querer, TODA chamada feita por uma Edge Function com a
-- SERVICE ROLE KEY — que é como quase toda Edge Function deste sistema
-- funciona (drive-storage, buscar-fgts, buscar-cnd-*, Analisar-*,
-- gerar-anexo-declaracao*, Extrair-itens-*, migrar-arquivos-para-drive...):
-- elas MESMAS já verificam o usuário com supabase.auth.getUser(jwt) e só
-- DEPOIS chamam owner_efetivo(user.id) nesse mesmo cliente service role —
-- client que não tem JWT de usuário nenhum anexado, então dentro do
-- Postgres auth.uid() é NULL ali. "usuario_id = NULL" nunca é verdadeiro em
-- SQL, então a function sempre devolvia NULL pra essas chamadas —
-- confirmado rodando de verdade contra um Postgres local, reproduzindo os
-- dois lados (service role vs. usuário autenticado).
--
-- Correção: a trava "usuario_id = auth.uid()" só faz sentido (e só é
-- necessária) quando auth.uid() não é NULL, ou seja, quando quem está
-- chamando é de fato um usuário final autenticado direto via anon key — aí
-- sim ele só pode perguntar sobre o PRÓPRIO uid. Quando auth.uid() é NULL
-- (chamada via service role, dentro de uma Edge Function que já validou o
-- usuário por fora), a function volta a funcionar como antes da 064 — sem
-- reabrir a vulnerabilidade original: a SERVICE_ROLE_KEY é um segredo que
-- nunca chega ao navegador, só código nosso (as próprias Edge Functions)
-- consegue chamar deste jeito.
create or replace function public.owner_efetivo(usuario_id uuid)
returns uuid
language sql
stable security definer
set search_path to 'public'
as $$
  select case when auth.uid() is null or usuario_id = auth.uid() then coalesce(
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
  select (auth.uid() is null or usuario_id = auth.uid()) and exists (
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
