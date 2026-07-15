// Tipos de domínio — espelham as tabelas do banco de dados (snake_case nas
// colunas do banco; aqui usamos camelCase para combinar com convenção do React,
// com mapeamento feito nos hooks de dados).

export type BiddingModalidade =
  | 'Pregão Eletrônico'
  | 'Pregão Presencial'
  | 'Concorrência Pública'
  | 'Tomada de Preços'
  | 'Convite'
  | 'Leilão'
  | 'Diálogo Competitivo'
  | 'Dispensa de Licitação'
  | 'Inexigibilidade'

export type BiddingTipo =
  | 'Menor Preço'
  | 'Maior Desconto'
  | 'Melhor Técnica'
  | 'Técnica e Preço'
  | 'Maior Retorno Econômico'

export type BiddingStatus = 'Em Andamento' | 'Ganhou' | 'Perdeu' | 'Cancelada'

export type BiddingEtapa =
  | 'Análise de Edital'
  | 'Montagem de Documentação'
  | 'Proposta Enviada'
  | 'Disputa de Lances'
  | 'Fase Recursal'
  | 'Adjudicada e Homologada'

export interface Client {
  id: string
  userId: string
  name: string
  cnpj: string | null
  address: string | null
  cep: string | null
  bairro: string | null
  cidade: string | null
  inscricaoEstadual: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  website: string | null
  bancoNome: string | null
  bancoAgencia: string | null
  bancoConta: string | null
  responsavelNome: string | null
  responsavelCpf: string | null
  responsavelCargo: string | null
  isMensalista: boolean
  valorMensalidade: number | null
  periodoMeses: number | null
  diaVencimento: number | null
  dataInicioContrato: string | null
  dataCadastro: string | null
  dataInicioPagamento: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface Bidding {
  id: string
  userId: string
  clientId: string
  modalidade: BiddingModalidade
  tipo: BiddingTipo
  objeto: string
  orgao: string
  municipio: string | null
  uf: string | null
  valorLicitado: number
  valorOfertado: number | null
  status: BiddingStatus
  dataAbertura: string
  dataCadastro: string
  valorOfertadoReal: number | null
  tipoDisputa: 'Item' | 'Lote'
  taxaParticipacao: number | null
  taxaParticipacaoLancada: boolean
  numeroEdital: string | null
  processo: string | null
  portal: string | null
  etapa: BiddingEtapa | null
  taxaExito: number | null
  representante: string | null
  observacaoEtapa: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface BiddingItem {
  id: string
  userId: string
  biddingId: string
  numeroItem: string
  descricao: string
  unidade: string | null
  quantidade: number
  marca: string | null
  referencia: string | null
  valorUnitarioLicitado: number
  valorUnitarioOfertado: number | null
  createdAt: string
  updatedAt: string
}

export type FinancialAccountType = 'CORRENTE' | 'POUPANCA' | 'CARTEIRA' | 'CARTAO_CREDITO' | 'INTERNO'

export interface FinancialAccount {
  id: string
  userId: string
  name: string
  type: FinancialAccountType
  bankName: string | null
  startingBalance: number
  creditLimit: number | null
  createdAt: string
  updatedAt: string
}

export type EmpenhoStatus = 'Pendente' | 'Faturado' | 'Cancelado'
export type ModoParcelamento = 'integral' | 'quantidade_fixa' | 'recorrente'
export type Periodicidade = 'mensal' | 'trimestral' | 'semestral' | 'anual'

export interface Empenho {
  id: string
  userId: string
  numeroEmpenho: string
  numeroNotaFiscal: string | null
  clientId: string
  biddingId: string | null
  dataEmpenho: string
  valorEmpenhada: number
  percentualComissao: number
  valorComissaoTotal: number
  projetarDozeMeses: boolean
  modoParcelamento: ModoParcelamento
  quantidadeParcelas: number | null
  periodicidade: Periodicidade | null
  status: EmpenhoStatus
  observacao: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type TransactionType = 'Pagar' | 'Receber'
export type TransactionStatus = 'Pendente' | 'Pago' | 'Atrasado' | 'Vence Hoje'

export interface Transaction {
  id: string
  userId: string
  type: TransactionType
  category: string
  description: string
  clientId: string | null
  biddingId: string | null
  empenhoId: string | null
  accountId: string | null
  value: number
  dueDate: string
  paymentDate: string | null
  paymentMethod: string | null
  status: TransactionStatus
  isProjected: boolean
  projectionParentId: string | null
  projectionMonthNumber: number | null
  isRecurring: boolean
  recurringParentId: string | null
  recurringDay: number | null
  createdAt: string
  updatedAt: string
}

export type PaymentType = 'CLT' | 'PJ' | 'Autônomo' | 'Estágio' | 'Sócio/Pró-labore'

export interface Employee {
  id: string
  userId: string
  name: string
  role: string | null
  paymentType: PaymentType
  salaryBase: number
  pixKey: string | null
  email: string | null
  phone: string | null
  admissionDate: string | null
  isActive: boolean
  inssPercentual: number
  irrfPercentual: number
  outrosEncargos: number
  createdAt: string
  updatedAt: string
}

export interface Contract {
  id: string
  userId: string
  clientId: string
  biddingId: string | null
  retentorFixoMensal: number | null
  comissaoExito: number | null
  comarcaForo: string | null
  clausulaAdicional: string | null
  conteudoGerado: string
  createdAt: string
  updatedAt: string
}

export interface Receipt {
  id: string
  userId: string
  clientId: string | null
  kind: 'Recibo' | 'Orcamento'
  value: number
  city: string | null
  issueDate: string
  description: string | null
  createdAt: string
}

export type FileCategory = 'Edital' | 'Contrato' | 'Recibo' | 'Certidão' | 'Outro'
export type FileEntityType = 'licitacao' | 'contrato' | 'recibo' | 'cliente' | 'funcionario' | 'empenho'

export interface AttachedFile {
  id: string
  userId: string
  name: string
  sizeBytes: number | null
  mimeType: string | null
  storagePath: string
  category: FileCategory
  entityType: FileEntityType | null
  entityId: string | null
  createdAt: string
}

export interface AuditLog {
  id: string
  userId: string
  action: string
  details: string | null
  createdAt: string
}

export interface Category {
  id: string
  userId: string
  type: 'Pagar' | 'Receber'
  name: string
  createdAt: string
}

export interface PaymentMethod {
  id: string
  userId: string
  name: string
  createdAt: string
}

export type DocumentTipo =
  | 'cndt'
  | 'cnd_federal'
  | 'cnd_estadual_rs'
  | 'fgts'
  | 'cnd_municipal'
  | 'certidao_falencia_rs'
  | 'cnpj_cartao'
  | 'manual'

export type DocumentStatus = 'valido' | 'vencendo' | 'vencido' | 'pendente' | 'erro'

export interface ClientDocument {
  id: string
  userId: string
  clientId: string
  tipo: DocumentTipo
  nome: string
  storagePath: string | null
  dataEmissao: string | null
  dataValidade: string | null
  status: DocumentStatus
  autoRenovavel: boolean
  observacoes: string | null
  createdAt: string
  updatedAt: string
}

// Configuração de cada tipo de certidão automática
export const CERT_CONFIG: Record<Exclude<DocumentTipo, 'manual'>, {
  label: string
  validadeDias: number
  alertaDias: number
  portal: string
}> = {
  cndt: {
    label: 'CNDT — Certidão Negativa de Débitos Trabalhistas (TST)',
    validadeDias: 180,
    alertaDias: 15,
    portal: 'cndt-certidao.tst.jus.br',
  },
  cnd_federal: {
    label: 'CND Federal — Receita Federal + PGFN',
    validadeDias: 180,
    alertaDias: 15,
    portal: 'solucoes.receita.fazenda.gov.br',
  },
  cnd_estadual_rs: {
    label: 'CND Estadual RS — SEFAZ-RS',
    validadeDias: 90,
    alertaDias: 15,
    portal: 'sefaz.rs.gov.br',
  },
  fgts: {
    label: 'CRF — Certificado de Regularidade do FGTS (Caixa)',
    validadeDias: 30,
    alertaDias: 15,
    portal: 'caixa.gov.br',
  },
  cnd_municipal: {
    label: 'CND Municipal — Prefeitura de Vacaria/RS',
    validadeDias: 90,
    alertaDias: 15,
    portal: 'webapp1-vacaria.cidade360.cloud',
  },
  certidao_falencia_rs: {
    label: 'Certidão Negativa de Falência — TJRS',
    validadeDias: 90,
    alertaDias: 15,
    portal: 'tjrs.jus.br',
  },
  cnpj_cartao: {
    label: 'Cartão CNPJ — Comprovante de Inscrição e Situação Cadastral',
    validadeDias: 60,
    alertaDias: 15,
    portal: 'solucoes.receita.fazenda.gov.br',
  },
}
