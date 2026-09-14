-- Suporte ao Módulo de Contratos com o modelo jurídico real da empresa
-- (em vez do texto genérico anterior), com dois tipos de contrato
-- (Mensalista / Individual) e vigência/status em Execução de Contratos.

-- 1) Endereço residencial do responsável do CLIENTE — usado na cláusula de
-- qualificação das partes ("residente e domiciliado em..."), presente nos
-- 3 modelos de contrato reais analisados mas ainda sem campo próprio (só
-- existiam nome/CPF/RG/cargo/estado civil do responsável).
alter table clients
  add column if not exists responsavel_endereco text;

-- 2) Dados da CONTRATADA (a própria empresa) usados nos contratos — hoje
-- só são digitados manualmente em cada contrato; passam a viver uma vez só
-- no Perfil da Empresa (mesma tela já usada para o cabeçalho do DRE/Balanço).
alter table empresa_perfil
  add column if not exists representante_nome text,
  add column if not exists representante_cpf text,
  add column if not exists representante_estado_civil text,
  add column if not exists representante_endereco text,
  add column if not exists banco_nome text,
  add column if not exists banco_agencia text,
  add column if not exists banco_conta text,
  add column if not exists chave_pix text,
  add column if not exists comarca_foro_padrao text;

-- 3) Contrato ganha tipo (muda qual modelo de cláusulas é usado), data de
-- assinatura, vigência (só se aplica a Mensalista — Individual não tem
-- prazo em meses, o "prazo" é a própria licitação vinculada) e status.
--
-- `status` segue o mesmo padrão já usado em Empenho.status: só
-- 'rescindido' é gravado por uma ação manual do usuário; o status exibido
-- de verdade (Ativo/Vencendo/Vencido para Mensalista, ou o andamento da
-- licitação vinculada para Individual) é sempre CALCULADO no código a
-- partir de data_inicio/vigencia_meses/bidding — nunca lido daqui, pra não
-- ficar "parado no tempo" como um status gravado ficaria.
--
-- `data_termino` não existe como coluna de propósito: é sempre
-- data_inicio + vigencia_meses, calculado — duas fontes da mesma data
-- poderiam divergir se alguém editasse só uma.
alter table contracts
  add column if not exists tipo text not null default 'mensalista',
  add column if not exists data_assinatura date,
  add column if not exists data_inicio date,
  add column if not exists vigencia_meses integer,
  add column if not exists status text not null default 'ativo';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contracts_tipo_check') then
    alter table contracts add constraint contracts_tipo_check check (tipo in ('mensalista', 'individual'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contracts_status_check') then
    alter table contracts add constraint contracts_status_check check (status in ('ativo', 'rescindido'));
  end if;
end $$;
