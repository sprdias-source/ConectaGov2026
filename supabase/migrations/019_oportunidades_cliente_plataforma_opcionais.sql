-- ============================================================================
-- ConectaGov — Migração 019: Cliente e plataforma opcionais em Oportunidades
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
--
-- O QUE FAZ: até aqui, criar uma oportunidade exigia escolher cliente E
-- plataforma antes de qualquer coisa — inclusive antes de só enviar um
-- edital pra analisar por IA. Isso deixa os dois campos opcionais: dá pra
-- criar a oportunidade vazia, subir o edital e rodar a análise, e
-- preencher cliente/plataforma depois, na própria linha.
--
-- "Converter em licitação" continua exigindo cliente (a licitação de
-- verdade sempre pertence a um cliente) — isso é validado no código, não
-- aqui no banco.

alter table opportunities alter column client_id drop not null;
alter table opportunities alter column platform_id drop not null;
