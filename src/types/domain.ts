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
  phone: string | null
  whatsapp: string | null
  email: string | null
  website: string | null
  isMensalista: boolean
  valorMensalidade: number | null
  periodoMeses: number | null
  diaVencimento: number | null
  dataInicioContrato: string | null
  dataCadastro: string | null
  dataInicioPagamento: string | null
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
  valorLicitado: number
  valorOfertado: number | null
  status: BiddingStatus
  dataAbertura: string
  numeroEdital: string | null
  processo: string | null
  portal: string | null
  etapa: BiddingEtapa | null
  taxaExito: number | null
  representante: string | null
  observacaoEtapa: string | null
  createdAt: string
  updatedAt: string
}

export type FinancialAccountType = 'CORRENTE' | 'POUPANCA' | 'CARTEIRA' | 'CARTAO_CREDITO'

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
  status: EmpenhoStatus
  observacao: string | null
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
  createdAt: string
  updatedAt: string
}

export type PaymentType = 'CLT' | 'PJ' | 'Autônomo' | 'Estágio'

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
