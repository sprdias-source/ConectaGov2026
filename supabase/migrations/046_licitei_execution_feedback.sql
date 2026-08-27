-- ============================================================================
-- ConectaGov — Migração 046: feedback de execução dos robôs Licitei
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
-- Roda DEPOIS dos scripts 001 a 045.
--
-- Hoje o robô Licitei (buscar-licitei.cjs / baixar-edital-licitei.cjs, ambos
-- rodando no GitHub Actions) grava resultado só quando dá tudo certo:
-- licitei_buscas.ultima_execucao_em só é atualizado no caminho de sucesso, e
-- licitei_editais não tem NENHUM campo de status de tentativa. Isso cria dois
-- problemas que a perícia encontrou:
--
-- 1) Se os filtros de pesquisa falharem TODOS ao aplicar na tela do Licitei
--    (cada campo tem seu próprio try/catch, ver licitei-filtros.cjs), o robô
--    ainda assim "conclui com sucesso" — atualiza ultima_execucao_em como se
--    a busca tivesse rodado filtrada de verdade, sem deixar rastro nenhum de
--    que os filtros não pegaram.
-- 2) Quando qualquer robô FALHA de verdade (erro de rede, seletor quebrado,
--    timeout), nada é gravado — nem em licitei_buscas nem em licitei_editais
--    — então a falha só aparece no log do GitHub Actions, que o usuário do
--    ConectaGov nunca abre.
--
-- Estas colunas guardam o resultado da ÚLTIMA tentativa (sucesso, erro, ou
-- erro_parcial quando os filtros não aplicaram todos mas o robô não travou),
-- pra UI poder mostrar isso pro usuário em vez de fingir que sempre dá certo.

alter table licitei_buscas
  add column if not exists ultimo_status text,
  add column if not exists ultimo_erro text;

alter table licitei_editais
  add column if not exists ultima_tentativa_status text,
  add column if not exists ultima_tentativa_erro text;
