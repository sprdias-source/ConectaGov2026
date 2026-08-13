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

// 'Desistiu' é diferente de 'Cancelada': Desistiu é quando o CLIENTE decide
// não participar mais (mesmo já com a licitação em andamento no Kanban);
// Cancelada continua sendo quando o próprio ÓRGÃO cancela o certame. Contam
// separado no relatório mensal — por isso são dois status, não um só com
// motivo em texto livre.
export type BiddingStatus = 'Em Andamento' | 'Ganhou' | 'Perdeu' | 'Cancelada' | 'Desistiu'

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

// Um cliente pode ter empenhos em várias prefeituras — cada uma com seu
// próprio portal de consulta.
export interface ClientPrefeitura {
  id: string
  userId: string
  clientId: string
  prefeitura: string
  portalUrl: string | null
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
  valorParticipacao: number | null
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
  diasValidadeProposta: string | null
  modeloCustomizadoPath: string | null
  motivoPerda: string | null
  motivoDesistencia: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface BiddingItem {
  id: string
  userId: string
  biddingId: string
  numeroItem: string
  lote: string | null
  descricao: string
  unidade: string | null
  quantidade: number
  marca: string | null
  referencia: string | null
  valorUnitarioLicitado: number
  valorUnitarioOfertado: number | null
  ganhou: boolean
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

export type FileCategory = 'Edital' | 'Termo de Referência' | 'Contrato' | 'Recibo' | 'Certidão' | 'Outro' | 'Checklist' | 'Proposta' | 'Proposta Readequada'
export type FileEntityType = 'licitacao' | 'contrato' | 'recibo' | 'cliente' | 'funcionario' | 'empenho' | 'oportunidade'

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

// Checklist de documentação exigida por uma licitação específica —
// diferente do checklist de Habilitação (que é por cliente). Cada item
// pode ser satisfeito por uma certidão já existente do cliente
// (clientDocumentTipo aponta pro DocumentTipo correspondente) ou por um
// arquivo específico anexado a esta licitação (attachedFileId).
export type ChecklistItemOrigem = 'manual' | 'ia'

export interface BiddingChecklistItem {
  id: string
  userId: string
  biddingId: string
  numeroEdital: string | null
  descricao: string
  categoria: string | null
  obrigatorio: boolean
  atendido: boolean
  clientDocumentTipo: Exclude<DocumentTipo, 'manual'> | null
  attachedFileId: string | null
  // Vínculo com um documento específico do repositório do cliente — usado
  // quando o item não é uma das 7 certidões padrão (essas já casam sozinhas
  // via clientDocumentTipo) mas ainda assim é algo reaproveitável em outra
  // licitação (ex: um documento manual qualquer salvo na pasta do cliente).
  clientDocumentId: string | null
  // Vínculo com um Atestado de Capacidade Técnica do cliente — mesma ideia,
  // pra itens do tipo "atestado" resolvidos direto pelo checklist.
  atestadoId: string | null
  origem: ChecklistItemOrigem
  observacoes: string | null
  prazo: string | null
  responsavelNome: string | null
  createdAt: string
  updatedAt: string
}

// Atestado de Capacidade Técnica — cadastro do CLIENTE (não da licitação),
// reutilizável em qualquer edital futuro. O campo `objeto` é comparado
// contra o objeto de cada licitação pra gerar o ranking de compatibilidade.
export interface AtestadoTecnico {
  id: string
  userId: string
  clientId: string
  nome: string
  objeto: string
  orgaoEmissor: string | null
  valor: number | null
  dataEmissao: string | null
  storagePath: string | null
  observacoes: string | null
  createdAt: string
  updatedAt: string
}

export type CategoriaModeloDocumento =
  | 'Impugnação'
  | 'Recurso'
  | 'Contrarrazão'
  | 'Declaração'
  | 'Proposta'
  | 'Memorial'
  | 'Planilha'
  | 'Outro'

// Biblioteca de modelos reutilizáveis — pode ter texto colado direto
// (pra copiar rápido) e/ou um arquivo anexado.
export interface ModeloDocumento {
  id: string
  userId: string
  nome: string
  categoria: CategoriaModeloDocumento
  tags: string | null
  conteudo: string | null
  storagePath: string | null
  observacoes: string | null
  createdAt: string
  updatedAt: string
}

export type ContractMarcoStatus = 'Pendente' | 'Concluído' | 'Atrasado'

// Marco de execução de um contrato (entrega, medição, etapa do
// cronograma) — cobre o "controla contrato/execução" do fluxo.
export interface ContractMarco {
  id: string
  userId: string
  contractId: string
  descricao: string
  dataPrevista: string | null
  dataRealizada: string | null
  valor: number | null
  status: ContractMarcoStatus
  observacoes: string | null
  createdAt: string
  updatedAt: string
}

// Compromisso pessoal do usuário (reunião, viagem, lembrete) — aparece na
// Agenda junto com pregões, prazos de checklist e financeiro, mas é criado
// e editado livremente (os outros tipos vêm de outras telas).
export interface PersonalEvent {
  id: string
  userId: string
  titulo: string
  descricao: string | null
  data: string
  createdAt: string
  updatedAt: string
}

export interface AuditLog {
  id: string
  userId: string
  action: string
  details: string | null
  entityType: string | null
  entityId: string | null
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
  pasta: string | null
  createdAt: string
  updatedAt: string
}

export type PlatformTipo = 'paga' | 'gratuita'

// Catálogo de plataformas de licitação (Portal de Compras Públicas, BLL,
// ComprasNet etc.) — cadastrado uma vez, reaproveitado em quantas
// assinaturas de cliente precisar (ver ClientPlatform).
export interface Platform {
  id: string
  userId: string
  nome: string
  url: string | null
  tipoPadrao: PlatformTipo
  valorPadrao: number | null
  ativo: boolean
  createdAt: string
  updatedAt: string
}

// Assinatura de um cliente numa plataforma do catálogo — mensalidade,
// vencimento e a antecedência do aviso (diasAvisoVencimento), editável por
// assinatura porque cada cliente prefere ser avisado com um número de dias
// diferente.
export interface ClientPlatform {
  id: string
  userId: string
  clientId: string
  platformId: string
  tipo: PlatformTipo
  valorMensalidade: number | null
  dataVencimento: string | null
  diasAvisoVencimento: number
  ativo: boolean
  login: string | null
  senha: string | null
  observacoes: string | null
  createdAt: string
  updatedAt: string
}

// 'sem_vencimento' cobre tanto plataformas gratuitas sem prazo (ex:
// ComprasNet) quanto qualquer assinatura ainda sem data de vencimento
// preenchida — não é sobre ser paga ou não, é sobre ter ou não uma data
// pra vencer.
export type PlatformStatus = 'ativa' | 'vencendo' | 'vencida' | 'sem_vencimento'

export type OpportunityResposta = 'pendente' | 'aceita' | 'recusada'

// O estágio antes de uma Licitação existir de verdade: edital encontrado
// numa plataforma, mandado pro cliente avaliar. Só vira uma Bidding (e só
// aí entra no Kanban) quando o cliente confirma que quer participar — ver
// biddingId, preenchido no momento da conversão.
export interface Opportunity {
  id: string
  userId: string
  // Opcionais na criação: dá pra abrir a oportunidade e já analisar o
  // edital antes de saber pra qual cliente/plataforma isso vai — só
  // "converter em licitação" exige clientId preenchido (ver useOpportunities).
  clientId: string | null
  platformId: string | null
  titulo: string
  numeroEdital: string | null
  dataSessao: string | null
  dataEnvioCliente: string | null
  resposta: OpportunityResposta
  dataResposta: string | null
  motivoRecusa: string | null
  diasAvisoPrazo: number
  biddingId: string | null
  observacoes: string | null
  // Preenchido só quando esta oportunidade nasceu de um edital do fluxo
  // Editais Licitei (ver LicitaiEdital) — permite que aceitar/recusar aqui
  // reflita de volta no status daquele edital, sem tela duplicada.
  licitaiEditalId: string | null
  createdAt: string
  updatedAt: string
}

export type LicitaiEditalStatus = 'novo' | 'linkado' | 'oportunidade' | 'aceito' | 'recusado'

// Edital trazido de uma busca no Licitei (robô externo, fora deste app) —
// dados crus até ser linkado manualmente a um cliente e, dali, virar uma
// Oportunidade. Só vira uma Bidding de verdade quando o cliente aceitar
// (ver biddingId, preenchido só nesse momento, mesmo padrão de Opportunity).
export interface LicitaiEdital {
  id: string
  userId: string
  numeroEdital: string | null
  orgao: string | null
  objeto: string | null
  modalidade: string | null
  dataSessao: string | null
  linkLicitei: string | null
  status: LicitaiEditalStatus
  clientId: string | null
  biddingId: string | null
  // Preenchido depois que o robô baixa o PDF e sobe pro bucket
  // client-documents, na pasta do cliente linkado.
  editalStoragePath: string | null
  // Qual busca salva trouxe este edital — nulo pros cadastrados manualmente.
  buscaId: string | null
  createdAt: string
  updatedAt: string
}

// Espelha 1:1 o painel "Filtros de Pesquisa" do Licitei (app.liciei.com.br)
// — cada campo aqui existe pra virar, depois, um preenchimento automático
// daquele formulário pelo robô. Tudo opcional: uma busca salva pode usar só
// uma parte dos filtros, igual no próprio Licitei.
export interface LicitaiBuscaFiltros {
  palavraChave?: string | null
  tipoData?: 'abertura' | 'publicacao' | 'encerramento' | null
  periodo?: 'hoje' | '7_dias' | '30_dias' | '6_meses' | 'personalizado' | null
  periodoInicio?: string | null
  periodoFim?: string | null
  somenteRecebendoProposta?: boolean
  modalidade?: string | null
  localizacaoModo?: 'estados_cidades' | 'raio_distancia'
  estado?: string | null
  cidade?: string | null
  // No modo raio_distancia, "cidade" é o centro do raio — mesmo campo
  // usado no modo estados_cidades, só que sem o "estado" junto.
  raioKm?: number | null
  portal?: string | null
  registroPreco?: 'sim' | 'nao' | null
  tipo?: ('material' | 'servico')[]
  palavrasIndesejadas?: string | null
  codigoUasg?: string | null
  numeroCompra?: string | null
  valorCompraMin?: number | null
  valorCompraMax?: number | null
  valorItemMin?: number | null
  valorItemMax?: number | null
  modoDisputa?: string | null
  esfera?: 'federal' | 'estadual' | 'municipal' | null
  orgao?: string | null
}

// Uma busca salva e nomeada no Licitei — o robô (próxima etapa) loga,
// aplica estes filtros e grava o que encontrar em LicitaiEdital.
export interface LicitaiBusca {
  id: string
  userId: string
  nome: string
  ativo: boolean
  filtros: LicitaiBuscaFiltros
  ultimaExecucaoEm: string | null
  createdAt: string
  updatedAt: string
}

// 'resolvida' cobre tanto aceita quanto recusada — já saiu da fila de
// "esperando resposta", não precisa mais de alerta de prazo.
export type OpportunityStatus = 'aguardando' | 'urgente' | 'vencida' | 'resolvida'

// Resultado da análise de edital por IA — usado tanto pela function
// Analisar-edital (bidding_analysis, licitação já cadastrada) quanto pela
// Analisar-oportunidade (opportunity_analysis, ainda no estágio de
// oportunidade) — o schema/prompt das duas é o mesmo, só muda onde grava.
export interface AnaliseEdital {
  municipio?: string
  orgao?: string
  objeto?: string
  numeroEdital?: string
  numeroProcesso?: string
  modalidade?: string
  srp?: boolean
  data?: string
  horario?: string
  portal?: string
  intervaloLances?: string
  modoDisputa?: {
    tipo?: string
    duracaoFaseAberta?: string
    duracaoFaseFechada?: string
    prorrogacaoAutomatica?: string
    tempoAleatorio?: string
    criterioEncerramento?: string
    observacoes?: string
  }
  resumoTecnico?: string
  // Valor total do edital tal como declarado no próprio documento (cláusula
  // de valor estimado/máximo da licitação) — nunca calculado somando itens,
  // porque o sistema pode se perder (itens não selecionados, lotes, etc).
  valorTotalEstimado?: number
  // Ausente (undefined) conta como participando — opt-out, não opt-in, pra
  // não mudar o comportamento de nenhuma análise já feita antes deste campo
  // existir. Só marca false quem o usuário desmarcou de propósito na tela
  // (ver AnaliseEditalResumo) porque não vai disputar aquele item/lote.
  itens?: { numero?: string | number; idPortal?: string | number; lote?: string | number; descricao: string; unidade?: string; quantidade?: number; valorReferencia?: number; participando?: boolean }[]
  validadeProposta?: string
  catalogo?: string
  garantias?: string
  amostras?: string
  marcasPreAprovadas?: string[] | string
  habilitacao?: {
    habilitacaoJuridica?: string
    regularidadeFiscalTrabalhista?: string
    qualificacaoEconomicoFinanceira?: string
    qualificacaoTecnica?: string
    proposta?: string
  }
  prazos?: string
  formaEntrega?: string
  localEntrega?: string
  condicoesPagamento?: string
  clausulasRestritivas?: string
  conclusaoTecnica?: string
  checklistDocumentacao?: { descricao: string; categoria?: string | null; obrigatorio?: boolean }[]
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
    // O FGTS só vale 30 dias no total (bem mais curto que as outras
    // certidões, de 60-180 dias) — um alerta de 15 dias dispararia já na
    // metade da validade. 10 dias dá um aviso proporcional ao prazo curto,
    // sem soar falso alarme cedo demais.
    alertaDias: 10,
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
