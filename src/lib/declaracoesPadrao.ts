import type { CategoriaModeloDocumento } from '../types/domain'

export interface DeclaracaoPadrao {
  nome: string
  categoria: CategoriaModeloDocumento
  tags: string
  conteudo: string
}

// Textos-base das declarações mais comuns em licitações, já com os
// placeholders {{}} usados no resto do sistema (mesmas chaves de
// gerar-proposta/gerar-declaracoes). A base legal citada é da Lei
// 14.133/2021 (Nova Lei de Licitações) onde a referência é bem
// estabelecida — nos itens mais genéricos, evitei citar artigo específico
// pra não arriscar citação errada. IMPORTANTE: confira a base legal com
// seu jurídico antes de usar oficialmente — isso é um ponto de partida,
// não parecer jurídico.
export const DECLARACOES_PADRAO: DeclaracaoPadrao[] = [
  {
    nome: 'Declaração de Cumprimento dos Requisitos de Habilitação',
    categoria: 'Declaração',
    tags: 'habilitação, obrigatória, art. 63',
    conteudo: `DECLARAÇÃO DE CUMPRIMENTO DOS REQUISITOS DE HABILITAÇÃO

Referente: {{modalidade}} nº {{numero_edital}}, promovida por {{orgao}}.

A empresa {{cliente_nome}}, inscrita no CNPJ sob o nº {{cliente_cnpj}}, por intermédio de seu representante legal infra-assinado, DECLARA, para fins do disposto no art. 63, inciso I, da Lei nº 14.133/2021, que cumpre plenamente os requisitos de habilitação exigidos para participação no certame licitatório em epígrafe.

{{cidade_emissao}}, {{data_emissao}}.

_______________________________________
{{responsavel_nome}}
CPF: {{responsavel_cpf}} — {{responsavel_cargo}}
{{cliente_nome}} — CNPJ: {{cliente_cnpj}}`,
  },
  {
    nome: 'Declaração de Inexistência de Fato Impeditivo e Idoneidade',
    categoria: 'Declaração',
    tags: 'habilitação, obrigatória, art. 14',
    conteudo: `DECLARAÇÃO DE INEXISTÊNCIA DE FATO IMPEDITIVO E IDONEIDADE

Referente: {{modalidade}} nº {{numero_edital}}, promovida por {{orgao}}.

A empresa {{cliente_nome}}, inscrita no CNPJ sob o nº {{cliente_cnpj}}, por intermédio de seu representante legal infra-assinado, DECLARA, sob as penas da lei, que não incorre em nenhuma das vedações previstas no art. 14 da Lei nº 14.133/2021, não tendo sido declarada inidônea nem estando suspensa de licitar ou contratar com a Administração Pública, comprometendo-se a informar a ocorrência de fatos supervenientes impeditivos, caso venham a ocorrer.

{{cidade_emissao}}, {{data_emissao}}.

_______________________________________
{{responsavel_nome}}
CPF: {{responsavel_cpf}} — {{responsavel_cargo}}
{{cliente_nome}} — CNPJ: {{cliente_cnpj}}`,
  },
  {
    nome: 'Declaração de Não Emprego de Menor',
    categoria: 'Declaração',
    tags: 'obrigatória, trabalho infantil',
    conteudo: `DECLARAÇÃO DE NÃO EMPREGO DE MENOR

Referente: {{modalidade}} nº {{numero_edital}}, promovida por {{orgao}}.

A empresa {{cliente_nome}}, inscrita no CNPJ sob o nº {{cliente_cnpj}}, por intermédio de seu representante legal infra-assinado, DECLARA, para fins do disposto no inciso XXXIII do art. 7º da Constituição Federal, que não emprega menor de dezoito anos em trabalho noturno, perigoso ou insalubre, e não emprega menor de dezesseis anos, salvo na condição de aprendiz, a partir de quatorze anos.

{{cidade_emissao}}, {{data_emissao}}.

_______________________________________
{{responsavel_nome}}
CPF: {{responsavel_cpf}} — {{responsavel_cargo}}
{{cliente_nome}} — CNPJ: {{cliente_cnpj}}`,
  },
  {
    nome: 'Declaração de Elaboração Independente de Proposta',
    categoria: 'Declaração',
    tags: 'proposta, concorrência',
    conteudo: `DECLARAÇÃO DE ELABORAÇÃO INDEPENDENTE DE PROPOSTA

Referente: {{modalidade}} nº {{numero_edital}}, promovida por {{orgao}}.

A empresa {{cliente_nome}}, inscrita no CNPJ sob o nº {{cliente_cnpj}}, por intermédio de seu representante legal infra-assinado, DECLARA, sob as penas da lei, que a proposta apresentada foi elaborada de maneira independente, e que seu conteúdo não foi, no todo ou em parte, direta ou indiretamente, informado, discutido ou recebido de qualquer outro participante potencial ou de fato do certame, por qualquer meio ou por qualquer pessoa.

{{cidade_emissao}}, {{data_emissao}}.

_______________________________________
{{responsavel_nome}}
CPF: {{responsavel_cpf}} — {{responsavel_cargo}}
{{cliente_nome}} — CNPJ: {{cliente_cnpj}}`,
  },
  {
    nome: 'Declaração de Inexistência de Vínculo com Agente Público',
    categoria: 'Declaração',
    tags: 'art. 9, impedimentos',
    conteudo: `DECLARAÇÃO DE INEXISTÊNCIA DE VÍNCULO COM AGENTE PÚBLICO

Referente: {{modalidade}} nº {{numero_edital}}, promovida por {{orgao}}.

A empresa {{cliente_nome}}, inscrita no CNPJ sob o nº {{cliente_cnpj}}, por intermédio de seu representante legal infra-assinado, DECLARA, para fins do disposto no art. 9º da Lei nº 14.133/2021, que não possui em seu quadro societário ou de administração agente público do órgão ou entidade licitante, nem cônjuge, companheiro ou parente em linha reta, colateral ou por afinidade até o terceiro grau, que possa configurar impedimento à contratação.

{{cidade_emissao}}, {{data_emissao}}.

_______________________________________
{{responsavel_nome}}
CPF: {{responsavel_cpf}} — {{responsavel_cargo}}
{{cliente_nome}} — CNPJ: {{cliente_cnpj}}`,
  },
  {
    nome: 'Declaração de Reserva de Cargos PCD/Aprendiz',
    categoria: 'Declaração',
    tags: 'quando aplicável, art. 63',
    conteudo: `DECLARAÇÃO DE CUMPRIMENTO DA RESERVA DE CARGOS (PESSOA COM DEFICIÊNCIA E APRENDIZ)

Referente: {{modalidade}} nº {{numero_edital}}, promovida por {{orgao}}.

A empresa {{cliente_nome}}, inscrita no CNPJ sob o nº {{cliente_cnpj}}, por intermédio de seu representante legal infra-assinado, DECLARA que cumpre, quando aplicável em razão do número de empregados, as normas relativas à reserva de cargos prevista em lei para pessoa com deficiência e para aprendiz.

{{cidade_emissao}}, {{data_emissao}}.

_______________________________________
{{responsavel_nome}}
CPF: {{responsavel_cpf}} — {{responsavel_cargo}}
{{cliente_nome}} — CNPJ: {{cliente_cnpj}}`,
  },
  {
    nome: 'Declaração de Concordância com os Termos do Edital',
    categoria: 'Declaração',
    tags: 'edital, ciência',
    conteudo: `DECLARAÇÃO DE CONCORDÂNCIA COM OS TERMOS DO EDITAL

Referente: {{modalidade}} nº {{numero_edital}}, promovida por {{orgao}}.

A empresa {{cliente_nome}}, inscrita no CNPJ sob o nº {{cliente_cnpj}}, por intermédio de seu representante legal infra-assinado, DECLARA ter pleno conhecimento e concordância com todos os termos, condições e exigências constantes do edital e de seus anexos.

{{cidade_emissao}}, {{data_emissao}}.

_______________________________________
{{responsavel_nome}}
CPF: {{responsavel_cpf}} — {{responsavel_cargo}}
{{cliente_nome}} — CNPJ: {{cliente_cnpj}}`,
  },
  {
    nome: 'Declaração de Conformidade com Normas Técnicas',
    categoria: 'Declaração',
    tags: 'quando aplicável, ABNT, INMETRO',
    conteudo: `DECLARAÇÃO DE CONFORMIDADE COM NORMAS TÉCNICAS

Referente: {{modalidade}} nº {{numero_edital}}, promovida por {{orgao}}.

A empresa {{cliente_nome}}, inscrita no CNPJ sob o nº {{cliente_cnpj}}, por intermédio de seu representante legal infra-assinado, DECLARA que os produtos/serviços ofertados atendem às normas técnicas aplicáveis (ABNT, INMETRO ou correlatas), quando exigidas pelo objeto desta licitação.

{{cidade_emissao}}, {{data_emissao}}.

_______________________________________
{{responsavel_nome}}
CPF: {{responsavel_cpf}} — {{responsavel_cargo}}
{{cliente_nome}} — CNPJ: {{cliente_cnpj}}`,
  },
  {
    nome: 'Declaração de Vistoria / Dispensa de Vistoria',
    categoria: 'Declaração',
    tags: 'quando aplicável, visita técnica',
    conteudo: `DECLARAÇÃO DE VISTORIA / DISPENSA DE VISTORIA

Referente: {{modalidade}} nº {{numero_edital}}, promovida por {{orgao}}.

A empresa {{cliente_nome}}, inscrita no CNPJ sob o nº {{cliente_cnpj}}, por intermédio de seu representante legal infra-assinado, DECLARA [ ] ter realizado vistoria no local de execução do objeto, tomando conhecimento de todas as informações e condições necessárias ao cumprimento das obrigações, OU [ ] optar por não realizar a vistoria, assumindo a responsabilidade por essa decisão e não podendo alegar desconhecimento das condições locais como justificativa para eventual inexecução contratual.

{{cidade_emissao}}, {{data_emissao}}.

_______________________________________
{{responsavel_nome}}
CPF: {{responsavel_cpf}} — {{responsavel_cargo}}
{{cliente_nome}} — CNPJ: {{cliente_cnpj}}`,
  },
  {
    nome: 'Declaração de Inexistência de Parentesco (Nepotismo)',
    categoria: 'Declaração',
    tags: 'nepotismo, súmula 13 STF',
    conteudo: `DECLARAÇÃO DE INEXISTÊNCIA DE RELAÇÃO DE PARENTESCO (NEPOTISMO)

Referente: {{modalidade}} nº {{numero_edital}}, promovida por {{orgao}}.

A empresa {{cliente_nome}}, inscrita no CNPJ sob o nº {{cliente_cnpj}}, por intermédio de seu representante legal infra-assinado, DECLARA, nos termos do Decreto nº 7.203/2010 e da Súmula Vinculante nº 13 do STF, que não possui, em seu quadro societário ou de administração, cônjuge, companheiro ou parente em linha reta, colateral ou por afinidade, até o terceiro grau, de ocupante de cargo de direção, chefia ou assessoramento do órgão licitante.

{{cidade_emissao}}, {{data_emissao}}.

_______________________________________
{{responsavel_nome}}
CPF: {{responsavel_cpf}} — {{responsavel_cargo}}
{{cliente_nome}} — CNPJ: {{cliente_cnpj}}`,
  },
  {
    nome: 'Declaração de Enquadramento como ME/EPP',
    categoria: 'Declaração',
    tags: 'apenas ME/EPP, LC 123/2006',
    conteudo: `DECLARAÇÃO DE ENQUADRAMENTO COMO MICROEMPRESA OU EMPRESA DE PEQUENO PORTE

(usar apenas se o cliente se enquadrar como ME/EPP)

Referente: {{modalidade}} nº {{numero_edital}}, promovida por {{orgao}}.

A empresa {{cliente_nome}}, inscrita no CNPJ sob o nº {{cliente_cnpj}}, por intermédio de seu representante legal infra-assinado, DECLARA, sob as penas da lei, que se enquadra na condição de Microempresa (ME) ou Empresa de Pequeno Porte (EPP), nos termos do art. 3º da Lei Complementar nº 123/2006, e que não incide em nenhuma das vedações previstas no §4º do referido artigo.

{{cidade_emissao}}, {{data_emissao}}.

_______________________________________
{{responsavel_nome}}
CPF: {{responsavel_cpf}} — {{responsavel_cargo}}
{{cliente_nome}} — CNPJ: {{cliente_cnpj}}`,
  },
  {
    nome: 'Declaração de Dados Bancários para Pagamento',
    categoria: 'Declaração',
    tags: 'quando solicitado, pagamento',
    conteudo: `DECLARAÇÃO DE DADOS BANCÁRIOS PARA PAGAMENTO

Referente: {{modalidade}} nº {{numero_edital}}, promovida por {{orgao}}.

A empresa {{cliente_nome}}, inscrita no CNPJ sob o nº {{cliente_cnpj}}, DECLARA, para fins de recebimento dos valores devidos em razão desta contratação, os seguintes dados bancários: Banco: __________; Agência: __________; Conta: __________.

{{cidade_emissao}}, {{data_emissao}}.

_______________________________________
{{responsavel_nome}}
CPF: {{responsavel_cpf}} — {{responsavel_cargo}}
{{cliente_nome}} — CNPJ: {{cliente_cnpj}}`,
  },
  {
    nome: 'Declaração de Não Utilização de Trabalho Forçado ou Degradante',
    categoria: 'Declaração',
    tags: 'direitos humanos',
    conteudo: `DECLARAÇÃO DE NÃO UTILIZAÇÃO DE TRABALHO FORÇADO OU DEGRADANTE

Referente: {{modalidade}} nº {{numero_edital}}, promovida por {{orgao}}.

A empresa {{cliente_nome}}, inscrita no CNPJ sob o nº {{cliente_cnpj}}, por intermédio de seu representante legal infra-assinado, DECLARA que não utiliza, em sua cadeia produtiva, mão de obra em condição análoga à de escravo, forçada ou degradante, comprometendo-se a observar a legislação relativa à saúde e segurança do trabalho.

{{cidade_emissao}}, {{data_emissao}}.

_______________________________________
{{responsavel_nome}}
CPF: {{responsavel_cpf}} — {{responsavel_cargo}}
{{cliente_nome}} — CNPJ: {{cliente_cnpj}}`,
  },
  {
    nome: 'Declaração de Responsabilidade Ambiental e Sustentabilidade',
    categoria: 'Declaração',
    tags: 'quando aplicável, sustentabilidade',
    conteudo: `DECLARAÇÃO DE RESPONSABILIDADE AMBIENTAL E SUSTENTABILIDADE

Referente: {{modalidade}} nº {{numero_edital}}, promovida por {{orgao}}.

A empresa {{cliente_nome}}, inscrita no CNPJ sob o nº {{cliente_cnpj}}, por intermédio de seu representante legal infra-assinado, DECLARA que observa práticas de responsabilidade socioambiental na execução de suas atividades, comprometendo-se a cumprir a legislação ambiental aplicável durante a execução do objeto desta licitação.

{{cidade_emissao}}, {{data_emissao}}.

_______________________________________
{{responsavel_nome}}
CPF: {{responsavel_cpf}} — {{responsavel_cargo}}
{{cliente_nome}} — CNPJ: {{cliente_cnpj}}`,
  },
  {
    nome: 'Declaração de Ausência de Sanções (CEIS/CNEP/TCU)',
    categoria: 'Declaração',
    tags: 'obrigatória, cadastros de impedidos',
    conteudo: `DECLARAÇÃO DE AUSÊNCIA DE SANÇÕES (CEIS/CNEP/TCU)

Referente: {{modalidade}} nº {{numero_edital}}, promovida por {{orgao}}.

A empresa {{cliente_nome}}, inscrita no CNPJ sob o nº {{cliente_cnpj}}, por intermédio de seu representante legal infra-assinado, DECLARA que não consta nos cadastros de empresas inidôneas ou impedidas de licitar — Cadastro Nacional de Empresas Inidôneas e Suspensas (CEIS), Cadastro Nacional de Empresas Punidas (CNEP) e cadastros de contas julgadas irregulares do Tribunal de Contas da União (TCU) —, nos termos da Lei nº 14.133/2021.

{{cidade_emissao}}, {{data_emissao}}.

_______________________________________
{{responsavel_nome}}
CPF: {{responsavel_cpf}} — {{responsavel_cargo}}
{{cliente_nome}} — CNPJ: {{cliente_cnpj}}`,
  },
  {
    nome: 'Declaração de Ciência e Aceitação do Edital e Anexos',
    categoria: 'Declaração',
    tags: 'edital, ciência',
    conteudo: `DECLARAÇÃO DE CIÊNCIA E ACEITAÇÃO DO EDITAL E ANEXOS

Referente: {{modalidade}} nº {{numero_edital}}, promovida por {{orgao}}.

A empresa {{cliente_nome}}, inscrita no CNPJ sob o nº {{cliente_cnpj}}, por intermédio de seu representante legal infra-assinado, DECLARA ter pleno conhecimento de todas as condições estabelecidas no edital e em seus anexos, aceitando-as integralmente, e que o objeto ofertado atende às especificações nele contidas.

{{cidade_emissao}}, {{data_emissao}}.

_______________________________________
{{responsavel_nome}}
CPF: {{responsavel_cpf}} — {{responsavel_cargo}}
{{cliente_nome}} — CNPJ: {{cliente_cnpj}}`,
  },
]
