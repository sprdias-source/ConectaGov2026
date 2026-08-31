-- "Tipo de Lançamento: Recorrente" no cadastro de Empenhos — passa a gerar
-- vários empenhos DE VERDADE (um por mês), cada um com seu próprio número e
-- nota fiscal, em vez de um único empenho com a comissão repetida em N
-- parcelas (isso já existia via modo_parcelamento = 'recorrente' e continua
-- existindo sem nenhuma mudança aqui, inclusive pra editar empenhos antigos
-- criados daquele jeito). Resolve o caso real de contrato mensal onde a
-- prefeitura emite um empenho NOVO todo mês, com numeração e nota fiscal
-- próprias — o app não tinha como representar isso, só comissão repetida
-- sobre o MESMO empenho.
--
-- numero_empenho vira opcional: a prefeitura normalmente só emite o número
-- oficial dos meses futuros mais perto da data, então os empenhos seguintes
-- de uma série nascem sem número ("a definir") e são completados depois,
-- editando aquele empenho específico.
--
-- grupo_recorrencia_id agrupa os empenhos gerados numa mesma "leva" (todos
-- os N meses de uma série, gerados de uma vez quando "Recorrente" é salvo)
-- — não é uma FK pra outra tabela, só uma chave de agrupamento compartilhada
-- entre eles. numero_ordem_recorrencia é a posição (1, 2, 3...) dentro dessa
-- série, usada pra mostrar "🔁 i/N" na lista sem precisar guardar o N total
-- (que é só a contagem de linhas com o mesmo grupo).

alter table empenhos
  alter column numero_empenho drop not null,
  add column if not exists grupo_recorrencia_id uuid,
  add column if not exists numero_ordem_recorrencia integer;

create index if not exists idx_empenhos_grupo_recorrencia
  on empenhos(grupo_recorrencia_id)
  where grupo_recorrencia_id is not null;
