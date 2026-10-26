-- ============================================================================
-- ConectaGov — Migração 065: percentual de comissão padrão por cliente
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
--
-- Hoje o "% de Comissão" de um empenho nasce sempre com 2% sugerido, sem
-- nenhuma ligação com o cliente — mesmo que a empresa sempre cobre o mesmo
-- percentual de um cliente específico, é preciso lembrar (e digitar) esse
-- número em todo empenho novo. Este campo opcional no cadastro do cliente
-- guarda esse percentual padrão, pra EmpenhoFormModal.tsx usar como sugestão
-- automática e lembrete visual ao lançar um empenho novo pra este cliente —
-- sem travar nada: o campo do empenho continua livre pra digitar qualquer
-- valor, mesmo diferente do padrão.
alter table clients
  add column if not exists percentual_comissao_padrao numeric(5,2);

comment on column clients.percentual_comissao_padrao is
  'Percentual de comissão padrão deste cliente (opcional) — usado só como sugestão/lembrete ao lançar um empenho novo, não trava o valor digitado.';
