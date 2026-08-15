-- ============================================================================
-- ConectaGov — Migração 024: Dados do cliente pra Anexos de Declaração
-- ============================================================================
-- Cole este script no SQL Editor do Supabase e clique em Run.
--
-- O QUE FAZ: complementa a feature de Anexos de Declaração (migração 023)
-- com 3 campos no cadastro do cliente, confirmados comparando um edital real
-- (Novo Hamburgo/RS, Pregão 67/2026) com a declaração real que o cliente
-- assinou pra ele:
--
-- - responsavel_rg: as declarações exigem "Carteira de Identidade n.º" do
--   representante legal, além do CPF que já era salvo.
-- - porte_empresa: alguns anexos-modelo do edital (ex: "MODELO DE
--   DECLARAÇÃO DO PORTE DA EMPRESA") pedem a classificação ME/EPP/Demais.
-- - cabecalho_declaracao: no PDF real assinado, cada declaração começa com
--   um cabeçalho fixo (nome da empresa em destaque, CNPJ, porte, endereço,
--   telefone/e-mail) que não muda de uma declaração pra outra do mesmo
--   cliente — salvamos uma vez aqui e o backend gruda no texto de cada
--   anexo gerado, sem depender da IA reproduzir a formatação certinho toda
--   vez.

alter table clients add column if not exists responsavel_rg text;
alter table clients add column if not exists porte_empresa text;
alter table clients add column if not exists cabecalho_declaracao text;

comment on column clients.responsavel_rg is 'RG (Carteira de Identidade) do representante legal — usado nas declarações de habilitação.';
comment on column clients.porte_empresa is 'Classificação de porte da empresa (ex: Microempresa (ME), Empresa de Pequeno Porte (EPP), Demais) — usada em declarações de porte exigidas pelo edital.';
comment on column clients.cabecalho_declaracao is 'Cabeçalho/letterhead fixo do cliente (nome em destaque, CNPJ, porte, endereço, contato), preenchido uma vez e reaproveitado no início de todo anexo de declaração gerado pela IA.';
