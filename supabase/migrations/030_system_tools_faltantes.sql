-- Adiciona à tabela system_tools as ferramentas que existem na tela (menu
-- lateral) mas nunca tiveram uma tool_key própria pra controle de acesso —
-- sem isso, member_permissions nunca consegue guardar um nível pra elas
-- (violaria a FK em member_permissions.tool_key -> system_tools.key), então
-- qualquer checagem no código continua caindo sempre no default
-- 'sem_acesso' até essas linhas existirem.
--
-- 'usuarios': controla quem pode entrar em /usuarios (Matriz de Permissões)
--   e em /diagnostico (log de auditoria da conta) — antes, qualquer membro
--   convidado, mesmo sem nenhum acesso configurado, chegava direto nessas
--   telas só digitando a URL.
-- 'funcionarios': controla /funcionarios (contratação, edição, remoção de
--   colaboradores e fechamento de folha) — antes não tinha controle nenhum.
-- 'modelos': controla /modelos (Banco de Modelos) — antes reaproveitava
--   por engano a permissão de 'cadastros'.
insert into system_tools (key, nome, ordem)
select v.key, v.nome, v.ordem
from (values
  ('usuarios', 'Usuários e Permissões', 100),
  ('funcionarios', 'Funcionários', 101),
  ('modelos', 'Banco de Modelos', 102)
) as v(key, nome, ordem)
where not exists (select 1 from system_tools st where st.key = v.key);
