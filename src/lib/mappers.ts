// Conversores entre o formato de linha do banco (snake_case) e o formato de
// domínio usado nos componentes (camelCase). Mantemos essa camada fina e
// explícita para que qualquer mudança de schema tenha um único lugar para
// ajustar — evita o tipo de bug onde campos ficam "meio sincronizados".

import type { Database, Json } from '../types/database'
import type {
  Client, ClientPrefeitura, Bidding, BiddingItem, FinancialAccount, Empenho, Transaction,
  Employee, Contract, Receipt, AttachedFile, AuditLog, Category, PaymentMethod, ClientDocument, BiddingChecklistItem, AtestadoTecnico, ModeloDocumento, ContractMarco, PersonalEvent,
  Platform, ClientPlatform, Opportunity, LicitaiEdital, LicitaiEditalStatus, LicitaiBusca, LicitaiBuscaFiltros,
  PricingProfile, PricingProfileLine, DeclaracaoAnexo,
} from '../types/domain'
import { todayLocalISO } from './dateUtils'

type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']

export const fromClientRow = (r: Row<'clients'>): Client => ({
  id: r.id,
  userId: r.user_id,
  name: r.name,
  cnpj: r.cnpj,
  address: r.address,
  cep: r.cep,
  bairro: r.bairro,
  cidade: r.cidade,
  inscricaoEstadual: r.inscricao_estadual,
  phone: r.phone,
  whatsapp: r.whatsapp,
  email: r.email,
  website: r.website,
  bancoNome: r.banco_nome,
  bancoAgencia: r.banco_agencia,
  bancoConta: r.banco_conta,
  responsavelNome: r.responsavel_nome,
  responsavelCpf: r.responsavel_cpf,
  responsavelCargo: r.responsavel_cargo,
  isMensalista: r.is_mensalista,
  valorMensalidade: r.valor_mensalidade,
  periodoMeses: r.periodo_meses,
  diaVencimento: r.dia_vencimento,
  dataInicioContrato: r.data_inicio_contrato,
  dataCadastro: r.data_cadastro,
  dataInicioPagamento: r.data_inicio_pagamento,
  isActive: r.is_active,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const toClientInsert = (c: Partial<Client>, userId: string): Database['public']['Tables']['clients']['Insert'] => ({
  user_id: userId,
  name: c.name ?? '',
  cnpj: c.cnpj ?? null,
  address: c.address ?? null,
  cep: c.cep ?? null,
  bairro: c.bairro ?? null,
  cidade: c.cidade ?? null,
  inscricao_estadual: c.inscricaoEstadual ?? null,
  phone: c.phone ?? null,
  whatsapp: c.whatsapp ?? null,
  email: c.email ?? null,
  website: c.website ?? null,
  banco_nome: c.bancoNome ?? null,
  banco_agencia: c.bancoAgencia ?? null,
  banco_conta: c.bancoConta ?? null,
  responsavel_nome: c.responsavelNome ?? null,
  responsavel_cpf: c.responsavelCpf ?? null,
  responsavel_cargo: c.responsavelCargo ?? null,
  is_mensalista: c.isMensalista ?? false,
  valor_mensalidade: c.valorMensalidade ?? null,
  periodo_meses: c.periodoMeses ?? null,
  dia_vencimento: c.diaVencimento ?? null,
  data_inicio_contrato: c.dataInicioContrato ?? null,
  data_cadastro: c.dataCadastro ?? null,
  data_inicio_pagamento: c.dataInicioPagamento ?? null,
  is_active: c.isActive ?? true,
})

export const fromClientPrefeituraRow = (r: Row<'client_prefeituras'>): ClientPrefeitura => ({
  id: r.id,
  userId: r.user_id,
  clientId: r.client_id,
  prefeitura: r.prefeitura,
  portalUrl: r.portal_url,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const toClientPrefeituraInsert = (
  p: Partial<ClientPrefeitura>, userId: string
): Database['public']['Tables']['client_prefeituras']['Insert'] => ({
  user_id: userId,
  client_id: p.clientId ?? '',
  prefeitura: p.prefeitura ?? '',
  portal_url: p.portalUrl ?? null,
})

export const fromBiddingRow = (r: Row<'biddings'>): Bidding => ({
  id: r.id,
  userId: r.user_id,
  clientId: r.client_id,
  modalidade: r.modalidade as Bidding['modalidade'],
  tipo: r.tipo as Bidding['tipo'],
  objeto: r.objeto,
  orgao: r.orgao,
  municipio: r.municipio,
  uf: r.uf,
  valorLicitado: Number(r.valor_licitado),
  valorOfertado: r.valor_ofertado !== null ? Number(r.valor_ofertado) : null,
  status: r.status as Bidding['status'],
  dataAbertura: r.data_abertura,
  dataCadastro: r.data_cadastro,
  valorOfertadoReal: r.valor_ofertado_real !== null ? Number(r.valor_ofertado_real) : null,
  valorParticipacao: r.valor_participacao !== null ? Number(r.valor_participacao) : null,
  tipoDisputa: r.tipo_disputa as Bidding['tipoDisputa'],
  taxaParticipacao: r.taxa_participacao !== null ? Number(r.taxa_participacao) : null,
  taxaParticipacaoLancada: r.taxa_participacao_lancada,
  numeroEdital: r.numero_edital,
  processo: r.processo,
  portal: r.portal,
  etapa: r.etapa as Bidding['etapa'],
  taxaExito: r.taxa_exito !== null ? Number(r.taxa_exito) : null,
  representante: r.representante,
  observacaoEtapa: r.observacao_etapa,
  diasValidadeProposta: r.dias_validade_proposta,
  modeloCustomizadoPath: r.modelo_customizado_path,
  motivoPerda: r.motivo_perda,
  motivoDesistencia: r.motivo_desistencia,
  isActive: r.is_active,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const toBiddingInsert = (b: Partial<Bidding>, userId: string): Database['public']['Tables']['biddings']['Insert'] => ({
  user_id: userId,
  client_id: b.clientId ?? '',
  modalidade: b.modalidade ?? 'Pregão Eletrônico',
  tipo: b.tipo ?? 'Menor Preço',
  objeto: b.objeto ?? '',
  orgao: b.orgao ?? '',
  municipio: b.municipio ?? null,
  uf: b.uf ?? null,
  valor_licitado: b.valorLicitado ?? 0,
  valor_ofertado: b.valorOfertado ?? null,
  status: b.status ?? 'Em Andamento',
  data_abertura: b.dataAbertura ?? todayLocalISO(),
  data_cadastro: b.dataCadastro ?? todayLocalISO(),
  valor_ofertado_real: b.valorOfertadoReal ?? null,
  valor_participacao: b.valorParticipacao ?? null,
  tipo_disputa: b.tipoDisputa ?? 'Item',
  taxa_participacao: b.taxaParticipacao ?? null,
  taxa_participacao_lancada: b.taxaParticipacaoLancada ?? false,
  numero_edital: b.numeroEdital ?? null,
  processo: b.processo ?? null,
  portal: b.portal ?? null,
  etapa: b.etapa ?? null,
  taxa_exito: b.taxaExito ?? null,
  representante: b.representante ?? null,
  observacao_etapa: b.observacaoEtapa ?? null,
  dias_validade_proposta: b.diasValidadeProposta ?? '60 (sessenta)',
  modelo_customizado_path: b.modeloCustomizadoPath ?? null,
  motivo_perda: b.motivoPerda ?? null,
  motivo_desistencia: b.motivoDesistencia ?? null,
  is_active: b.isActive ?? true,
})

export const fromBiddingItemRow = (r: Row<'bidding_items'>): BiddingItem => ({
  id: r.id,
  userId: r.user_id,
  biddingId: r.bidding_id,
  numeroItem: r.numero_item,
  lote: r.lote,
  descricao: r.descricao,
  unidade: r.unidade,
  quantidade: Number(r.quantidade),
  marca: r.marca,
  referencia: r.referencia,
  valorUnitarioLicitado: Number(r.valor_unitario_licitado),
  valorUnitarioOfertado: r.valor_unitario_ofertado !== null ? Number(r.valor_unitario_ofertado) : null,
  ganhou: r.ganhou,
  custoUnitario: r.custo_unitario !== null ? Number(r.custo_unitario) : null,
  valorMinimoCalculado: r.valor_minimo_calculado !== null ? Number(r.valor_minimo_calculado) : null,
  participaPrecificacao: r.participa_precificacao,
  pricingProfileId: r.pricing_profile_id,
  impostosPctAplicado: r.impostos_pct_aplicado !== null ? Number(r.impostos_pct_aplicado) : null,
  despesasPctAplicado: r.despesas_pct_aplicado !== null ? Number(r.despesas_pct_aplicado) : null,
  margemPctAplicada: r.margem_pct_aplicada !== null ? Number(r.margem_pct_aplicada) : null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const toBiddingItemInsert = (i: Partial<BiddingItem>, userId: string): Database['public']['Tables']['bidding_items']['Insert'] => ({
  user_id: userId,
  bidding_id: i.biddingId ?? '',
  numero_item: i.numeroItem ?? '',
  lote: i.lote ?? null,
  descricao: i.descricao ?? '',
  unidade: i.unidade ?? null,
  quantidade: i.quantidade ?? 1,
  marca: i.marca ?? null,
  referencia: i.referencia ?? null,
  valor_unitario_licitado: i.valorUnitarioLicitado ?? 0,
  valor_unitario_ofertado: i.valorUnitarioOfertado ?? null,
  ganhou: i.ganhou ?? false,
  custo_unitario: i.custoUnitario ?? null,
  valor_minimo_calculado: i.valorMinimoCalculado ?? null,
  participa_precificacao: i.participaPrecificacao ?? true,
  pricing_profile_id: i.pricingProfileId ?? null,
  impostos_pct_aplicado: i.impostosPctAplicado ?? null,
  despesas_pct_aplicado: i.despesasPctAplicado ?? null,
  margem_pct_aplicada: i.margemPctAplicada ?? null,
})

export const fromAccountRow = (r: Row<'financial_accounts'>): FinancialAccount => ({
  id: r.id,
  userId: r.user_id,
  name: r.name,
  type: r.type as FinancialAccount['type'],
  bankName: r.bank_name,
  startingBalance: Number(r.starting_balance),
  creditLimit: r.credit_limit !== null ? Number(r.credit_limit) : null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const toAccountInsert = (a: Partial<FinancialAccount>, userId: string): Database['public']['Tables']['financial_accounts']['Insert'] => ({
  user_id: userId,
  name: a.name ?? '',
  type: a.type ?? 'CORRENTE',
  bank_name: a.bankName ?? null,
  starting_balance: a.startingBalance ?? 0,
  credit_limit: a.creditLimit ?? null,
})

export const fromEmpenhoRow = (r: Row<'empenhos'>): Empenho => ({
  id: r.id,
  userId: r.user_id,
  numeroEmpenho: r.numero_empenho,
  numeroNotaFiscal: r.numero_nota_fiscal,
  clientId: r.client_id,
  biddingId: r.bidding_id,
  dataEmpenho: r.data_empenho,
  valorEmpenhada: Number(r.valor_empenhada),
  percentualComissao: Number(r.percentual_comissao),
  valorComissaoTotal: Number(r.valor_comissao_total),
  projetarDozeMeses: r.projetar_doze_meses,
  modoParcelamento: r.modo_parcelamento as Empenho['modoParcelamento'],
  quantidadeParcelas: r.quantidade_parcelas,
  periodicidade: r.periodicidade as Empenho['periodicidade'],
  status: r.status as Empenho['status'],
  observacao: r.observacao,
  isActive: r.is_active,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const toEmpenhoInsert = (e: Partial<Empenho>, userId: string): Database['public']['Tables']['empenhos']['Insert'] => ({
  user_id: userId,
  numero_empenho: e.numeroEmpenho ?? '',
  numero_nota_fiscal: e.numeroNotaFiscal ?? null,
  client_id: e.clientId ?? '',
  bidding_id: e.biddingId ?? null,
  data_empenho: e.dataEmpenho ?? todayLocalISO(),
  valor_empenhada: e.valorEmpenhada ?? 0,
  percentual_comissao: e.percentualComissao ?? 0,
  valor_comissao_total: e.valorComissaoTotal ?? 0,
  projetar_doze_meses: e.projetarDozeMeses ?? false,
  modo_parcelamento: e.modoParcelamento ?? 'integral',
  quantidade_parcelas: e.quantidadeParcelas ?? null,
  periodicidade: e.periodicidade ?? null,
  status: e.status ?? 'Pendente',
  observacao: e.observacao ?? null,
  is_active: e.isActive ?? true,
})

export const fromTransactionRow = (r: Row<'transactions'>): Transaction => ({
  id: r.id,
  userId: r.user_id,
  type: r.type as Transaction['type'],
  category: r.category,
  description: r.description,
  clientId: r.client_id,
  biddingId: r.bidding_id,
  empenhoId: r.empenho_id,
  accountId: r.account_id,
  value: Number(r.value),
  dueDate: r.due_date,
  paymentDate: r.payment_date,
  paymentMethod: r.payment_method,
  status: r.status as Transaction['status'],
  isProjected: r.is_projected,
  projectionParentId: r.projection_parent_id,
  projectionMonthNumber: r.projection_month_number,
  isRecurring: r.is_recurring,
  recurringParentId: r.recurring_parent_id,
  recurringDay: r.recurring_day,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const toTransactionInsert = (t: Partial<Transaction>, userId: string): Database['public']['Tables']['transactions']['Insert'] => ({
  user_id: userId,
  type: t.type ?? 'Receber',
  category: t.category ?? '',
  description: t.description ?? '',
  client_id: t.clientId ?? null,
  bidding_id: t.biddingId ?? null,
  empenho_id: t.empenhoId ?? null,
  account_id: t.accountId ?? null,
  value: t.value ?? 0,
  due_date: t.dueDate ?? todayLocalISO(),
  payment_date: t.paymentDate ?? null,
  payment_method: t.paymentMethod ?? null,
  status: t.status ?? 'Pendente',
  is_projected: t.isProjected ?? false,
  projection_parent_id: t.projectionParentId ?? null,
  projection_month_number: t.projectionMonthNumber ?? null,
  is_recurring: t.isRecurring ?? false,
  recurring_parent_id: t.recurringParentId ?? null,
  recurring_day: t.recurringDay ?? null,
})

export const fromEmployeeRow = (r: Row<'employees'>): Employee => ({
  id: r.id,
  userId: r.user_id,
  name: r.name,
  role: r.role,
  paymentType: r.payment_type as Employee['paymentType'],
  salaryBase: Number(r.salary_base),
  pixKey: r.pix_key,
  email: r.email,
  phone: r.phone,
  admissionDate: r.admission_date,
  isActive: r.is_active,
  inssPercentual: Number(r.inss_percentual ?? 0),
  irrfPercentual: Number(r.irrf_percentual ?? 0),
  outrosEncargos: Number(r.outros_encargos ?? 0),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const toEmployeeInsert = (e: Partial<Employee>, userId: string): Database['public']['Tables']['employees']['Insert'] => ({
  user_id: userId,
  name: e.name ?? '',
  role: e.role ?? null,
  payment_type: e.paymentType ?? 'PJ',
  salary_base: e.salaryBase ?? 0,
  pix_key: e.pixKey ?? null,
  email: e.email ?? null,
  phone: e.phone ?? null,
  admission_date: e.admissionDate ?? null,
  is_active: e.isActive ?? true,
  inss_percentual: e.inssPercentual ?? 11,
  irrf_percentual: e.irrfPercentual ?? 0,
  outros_encargos: e.outrosEncargos ?? 0,
})

export const fromContractRow = (r: Row<'contracts'>): Contract => ({
  id: r.id,
  userId: r.user_id,
  clientId: r.client_id,
  biddingId: r.bidding_id,
  retentorFixoMensal: r.retentor_fixo_mensal !== null ? Number(r.retentor_fixo_mensal) : null,
  comissaoExito: r.comissao_exito !== null ? Number(r.comissao_exito) : null,
  comarcaForo: r.comarca_foro,
  clausulaAdicional: r.clausula_adicional,
  conteudoGerado: r.conteudo_gerado,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const toContractInsert = (c: Partial<Contract>, userId: string): Database['public']['Tables']['contracts']['Insert'] => ({
  user_id: userId,
  client_id: c.clientId ?? '',
  bidding_id: c.biddingId ?? null,
  retentor_fixo_mensal: c.retentorFixoMensal ?? null,
  comissao_exito: c.comissaoExito ?? null,
  comarca_foro: c.comarcaForo ?? null,
  clausula_adicional: c.clausulaAdicional ?? null,
  conteudo_gerado: c.conteudoGerado ?? '',
})

export const fromReceiptRow = (r: Row<'receipts'>): Receipt => ({
  id: r.id,
  userId: r.user_id,
  clientId: r.client_id,
  kind: r.kind as Receipt['kind'],
  value: Number(r.value),
  city: r.city,
  issueDate: r.issue_date,
  description: r.description,
  createdAt: r.created_at,
})

export const toReceiptInsert = (r: Partial<Receipt>, userId: string): Database['public']['Tables']['receipts']['Insert'] => ({
  user_id: userId,
  client_id: r.clientId ?? null,
  kind: r.kind ?? 'Recibo',
  value: r.value ?? 0,
  city: r.city ?? null,
  issue_date: r.issueDate ?? todayLocalISO(),
  description: r.description ?? null,
})

export const fromFileRow = (r: Row<'attached_files'>): AttachedFile => ({
  id: r.id,
  userId: r.user_id,
  name: r.name,
  sizeBytes: r.size_bytes,
  mimeType: r.mime_type,
  storagePath: r.storage_path,
  category: r.category as AttachedFile['category'],
  entityType: r.entity_type as AttachedFile['entityType'],
  entityId: r.entity_id,
  createdAt: r.created_at,
})

export const toFileInsert = (f: Partial<AttachedFile>, userId: string): Database['public']['Tables']['attached_files']['Insert'] => ({
  user_id: userId,
  name: f.name ?? '',
  size_bytes: f.sizeBytes ?? null,
  mime_type: f.mimeType ?? null,
  storage_path: f.storagePath ?? '',
  category: f.category ?? 'Outro',
  entity_type: f.entityType ?? null,
  entity_id: f.entityId ?? null,
})

export const fromBiddingChecklistItemRow = (r: Row<'bidding_checklist_items'>): BiddingChecklistItem => ({
  id: r.id,
  userId: r.user_id,
  biddingId: r.bidding_id,
  numeroEdital: r.numero_edital,
  descricao: r.descricao,
  categoria: r.categoria,
  obrigatorio: r.obrigatorio,
  atendido: r.atendido,
  clientDocumentTipo: r.client_document_tipo as BiddingChecklistItem['clientDocumentTipo'],
  attachedFileId: r.attached_file_id,
  clientDocumentId: r.client_document_id,
  atestadoId: r.atestado_id,
  origem: r.origem as BiddingChecklistItem['origem'],
  observacoes: r.observacoes,
  prazo: r.prazo,
  responsavelNome: r.responsavel_nome,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const toBiddingChecklistItemInsert = (
  i: Partial<BiddingChecklistItem>, userId: string
): Database['public']['Tables']['bidding_checklist_items']['Insert'] => ({
  user_id: userId,
  bidding_id: i.biddingId ?? '',
  numero_edital: i.numeroEdital ?? null,
  descricao: i.descricao ?? '',
  categoria: i.categoria ?? null,
  obrigatorio: i.obrigatorio ?? true,
  atendido: i.atendido ?? false,
  client_document_tipo: i.clientDocumentTipo ?? null,
  attached_file_id: i.attachedFileId ?? null,
  client_document_id: i.clientDocumentId ?? null,
  atestado_id: i.atestadoId ?? null,
  origem: i.origem ?? 'manual',
  observacoes: i.observacoes ?? null,
  prazo: i.prazo ?? null,
  responsavel_nome: i.responsavelNome ?? null,
})

// itensChecklistIds vem de bidding_declaracao_anexo_itens (join à parte) —
// este mapper já recebe a lista pronta, mesma ideia do fromPricingProfileRow
// com as linhas do perfil.
export const fromDeclaracaoAnexoRow = (r: Row<'bidding_declaracao_anexos'>, itensChecklistIds: string[]): DeclaracaoAnexo => ({
  id: r.id,
  userId: r.user_id,
  biddingId: r.bidding_id,
  fonte: r.fonte,
  titulo: r.titulo,
  texto: r.texto,
  status: r.status as DeclaracaoAnexo['status'],
  enviadoEm: r.enviado_em,
  attachedFileId: r.attached_file_id,
  itensChecklistIds,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const toDeclaracaoAnexoInsert = (
  a: Partial<DeclaracaoAnexo>, userId: string
): Database['public']['Tables']['bidding_declaracao_anexos']['Insert'] => ({
  user_id: userId,
  bidding_id: a.biddingId ?? '',
  fonte: a.fonte ?? '',
  titulo: a.titulo ?? '',
  texto: a.texto ?? '',
  status: a.status ?? 'rascunho',
  enviado_em: a.enviadoEm ?? null,
  attached_file_id: a.attachedFileId ?? null,
})

export const fromPersonalEventRow = (r: Row<'personal_events'>): PersonalEvent => ({
  id: r.id,
  userId: r.user_id,
  titulo: r.titulo,
  descricao: r.descricao,
  data: r.data,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const toPersonalEventInsert = (
  e: Partial<PersonalEvent>, userId: string
): Database['public']['Tables']['personal_events']['Insert'] => ({
  user_id: userId,
  titulo: e.titulo ?? '',
  descricao: e.descricao ?? null,
  data: e.data ?? todayLocalISO(),
})

export const fromAuditLogRow = (r: Row<'audit_logs'>): AuditLog => ({
  id: r.id,
  userId: r.user_id,
  action: r.action,
  details: r.details,
  entityType: r.entity_type,
  entityId: r.entity_id,
  createdAt: r.created_at,
})

export const fromCategoryRow = (r: Row<'categories'>): Category => ({
  id: r.id,
  userId: r.user_id,
  type: r.type as Category['type'],
  name: r.name,
  createdAt: r.created_at,
})

export const fromPaymentMethodRow = (r: Row<'payment_methods'>): PaymentMethod => ({
  id: r.id,
  userId: r.user_id,
  name: r.name,
  createdAt: r.created_at,
})

export const fromClientDocumentRow = (r: Row<'client_documents'>): ClientDocument => ({
  id: r.id,
  userId: r.user_id,
  clientId: r.client_id,
  tipo: r.tipo as ClientDocument['tipo'],
  nome: r.nome,
  storagePath: r.storage_path,
  dataEmissao: r.data_emissao,
  dataValidade: r.data_validade,
  status: r.status as ClientDocument['status'],
  autoRenovavel: r.auto_renovavel,
  observacoes: r.observacoes,
  pasta: r.pasta,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const fromAtestadoRow = (r: Row<'atestados_tecnicos'>): AtestadoTecnico => ({
  id: r.id,
  userId: r.user_id,
  clientId: r.client_id,
  nome: r.nome,
  objeto: r.objeto,
  orgaoEmissor: r.orgao_emissor,
  valor: r.valor !== null ? Number(r.valor) : null,
  dataEmissao: r.data_emissao,
  storagePath: r.storage_path,
  observacoes: r.observacoes,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const toAtestadoInsert = (
  a: Partial<AtestadoTecnico>, userId: string
): Database['public']['Tables']['atestados_tecnicos']['Insert'] => ({
  user_id: userId,
  client_id: a.clientId ?? '',
  nome: a.nome ?? '',
  objeto: a.objeto ?? '',
  orgao_emissor: a.orgaoEmissor ?? null,
  valor: a.valor ?? null,
  data_emissao: a.dataEmissao ?? null,
  storage_path: a.storagePath ?? null,
  observacoes: a.observacoes ?? null,
})

export const fromPlatformRow = (r: Row<'platforms'>): Platform => ({
  id: r.id,
  userId: r.user_id,
  nome: r.nome,
  url: r.url,
  tipoPadrao: r.tipo_padrao as Platform['tipoPadrao'],
  valorPadrao: r.valor_padrao !== null ? Number(r.valor_padrao) : null,
  ativo: r.ativo,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const toPlatformInsert = (
  p: Partial<Platform>, userId: string
): Database['public']['Tables']['platforms']['Insert'] => ({
  user_id: userId,
  nome: p.nome ?? '',
  url: p.url ?? null,
  tipo_padrao: p.tipoPadrao ?? 'paga',
  valor_padrao: p.valorPadrao ?? null,
  ativo: p.ativo ?? true,
})

export const fromClientPlatformRow = (r: Row<'client_platforms'>): ClientPlatform => ({
  id: r.id,
  userId: r.user_id,
  clientId: r.client_id,
  platformId: r.platform_id,
  tipo: r.tipo as ClientPlatform['tipo'],
  valorMensalidade: r.valor_mensalidade !== null ? Number(r.valor_mensalidade) : null,
  dataVencimento: r.data_vencimento,
  diasAvisoVencimento: r.dias_aviso_vencimento,
  ativo: r.ativo,
  login: r.login,
  senha: r.senha,
  observacoes: r.observacoes,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const toClientPlatformInsert = (
  cp: Partial<ClientPlatform>, userId: string
): Database['public']['Tables']['client_platforms']['Insert'] => ({
  user_id: userId,
  client_id: cp.clientId ?? '',
  platform_id: cp.platformId ?? '',
  tipo: cp.tipo ?? 'paga',
  valor_mensalidade: cp.valorMensalidade ?? null,
  data_vencimento: cp.dataVencimento ?? null,
  dias_aviso_vencimento: cp.diasAvisoVencimento ?? 15,
  ativo: cp.ativo ?? true,
  login: cp.login ?? null,
  senha: cp.senha ?? null,
  observacoes: cp.observacoes ?? null,
})

export const fromOpportunityRow = (r: Row<'opportunities'>): Opportunity => ({
  id: r.id,
  userId: r.user_id,
  clientId: r.client_id,
  platformId: r.platform_id,
  titulo: r.titulo,
  numeroEdital: r.numero_edital,
  dataSessao: r.data_sessao,
  dataEnvioCliente: r.data_envio_cliente,
  resposta: r.resposta as Opportunity['resposta'],
  dataResposta: r.data_resposta,
  motivoRecusa: r.motivo_recusa,
  diasAvisoPrazo: r.dias_aviso_prazo,
  biddingId: r.bidding_id,
  observacoes: r.observacoes,
  licitaiEditalId: r.licitei_edital_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const toOpportunityInsert = (
  o: Partial<Opportunity>, userId: string
): Database['public']['Tables']['opportunities']['Insert'] => ({
  user_id: userId,
  client_id: o.clientId ?? null,
  platform_id: o.platformId ?? null,
  titulo: o.titulo ?? '',
  numero_edital: o.numeroEdital ?? null,
  data_sessao: o.dataSessao ?? null,
  data_envio_cliente: o.dataEnvioCliente ?? null,
  resposta: o.resposta ?? 'pendente',
  data_resposta: o.dataResposta ?? null,
  motivo_recusa: o.motivoRecusa ?? null,
  dias_aviso_prazo: o.diasAvisoPrazo ?? 7,
  bidding_id: o.biddingId ?? null,
  observacoes: o.observacoes ?? null,
  licitei_edital_id: o.licitaiEditalId ?? null,
})

export const fromLicitaiEditalRow = (r: Row<'licitei_editais'>): LicitaiEdital => ({
  id: r.id,
  userId: r.user_id,
  numeroEdital: r.numero_edital,
  orgao: r.orgao,
  objeto: r.objeto,
  modalidade: r.modalidade,
  dataSessao: r.data_sessao,
  linkLicitei: r.link_licitei,
  status: r.status as LicitaiEditalStatus,
  clientId: r.client_id,
  biddingId: r.bidding_id,
  editalStoragePath: r.edital_storage_path,
  buscaId: r.busca_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const toLicitaiEditalInsert = (
  e: Partial<LicitaiEdital>, userId: string
): Database['public']['Tables']['licitei_editais']['Insert'] => ({
  user_id: userId,
  numero_edital: e.numeroEdital ?? null,
  orgao: e.orgao ?? null,
  objeto: e.objeto ?? null,
  modalidade: e.modalidade ?? null,
  data_sessao: e.dataSessao ?? null,
  link_licitei: e.linkLicitei ?? null,
  status: e.status ?? 'novo',
  client_id: e.clientId ?? null,
  bidding_id: e.biddingId ?? null,
  edital_storage_path: e.editalStoragePath ?? null,
  busca_id: e.buscaId ?? null,
})

export const fromLicitaiBuscaRow = (r: Row<'licitei_buscas'>): LicitaiBusca => ({
  id: r.id,
  userId: r.user_id,
  nome: r.nome,
  ativo: r.ativo,
  filtros: (r.filtros as LicitaiBuscaFiltros | null) ?? {},
  ultimaExecucaoEm: r.ultima_execucao_em,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const toLicitaiBuscaInsert = (
  b: Partial<LicitaiBusca>, userId: string
): Database['public']['Tables']['licitei_buscas']['Insert'] => ({
  user_id: userId,
  nome: b.nome ?? '',
  ativo: b.ativo ?? true,
  filtros: (b.filtros ?? {}) as Json,
  ultima_execucao_em: b.ultimaExecucaoEm ?? null,
})

export const fromPricingProfileLineRow = (r: Row<'pricing_profile_lines'>): PricingProfileLine => ({
  id: r.id,
  profileId: r.profile_id,
  tipo: r.tipo as PricingProfileLine['tipo'],
  nome: r.nome,
  percentual: Number(r.percentual),
  ordem: r.ordem,
})

export const toPricingProfileLineInsert = (
  l: Partial<PricingProfileLine>, profileId: string
): Database['public']['Tables']['pricing_profile_lines']['Insert'] => ({
  profile_id: profileId,
  tipo: l.tipo ?? 'imposto',
  nome: l.nome ?? '',
  percentual: l.percentual ?? 0,
  ordem: l.ordem ?? 0,
})

// O perfil vem do banco em duas tabelas (pricing_profiles + suas linhas em
// pricing_profile_lines) — este mapper já recebe as linhas prontas (a query
// busca as duas juntas com um join, ver usePricingProfiles.ts) pra devolver
// um único PricingProfile com a lista embutida.
export const fromPricingProfileRow = (r: Row<'pricing_profiles'>, linhas: PricingProfileLine[]): PricingProfile => ({
  id: r.id,
  userId: r.user_id,
  nome: r.nome,
  descricao: r.descricao,
  margemPct: Number(r.margem_pct),
  linhas,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const toPricingProfileInsert = (
  p: Partial<PricingProfile>, userId: string
): Database['public']['Tables']['pricing_profiles']['Insert'] => ({
  user_id: userId,
  nome: p.nome ?? '',
  descricao: p.descricao ?? null,
  margem_pct: p.margemPct ?? 0,
})

export const fromModeloDocumentoRow = (r: Row<'modelos_documentos'>): ModeloDocumento => ({
  id: r.id,
  userId: r.user_id,
  nome: r.nome,
  categoria: r.categoria as ModeloDocumento['categoria'],
  tags: r.tags,
  conteudo: r.conteudo,
  storagePath: r.storage_path,
  observacoes: r.observacoes,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const toModeloDocumentoInsert = (
  m: Partial<ModeloDocumento>, userId: string
): Database['public']['Tables']['modelos_documentos']['Insert'] => ({
  user_id: userId,
  nome: m.nome ?? '',
  categoria: m.categoria ?? 'Outro',
  tags: m.tags ?? null,
  conteudo: m.conteudo ?? null,
  storage_path: m.storagePath ?? null,
  observacoes: m.observacoes ?? null,
})

export const fromContractMarcoRow = (r: Row<'contract_marcos'>): ContractMarco => ({
  id: r.id,
  userId: r.user_id,
  contractId: r.contract_id,
  descricao: r.descricao,
  dataPrevista: r.data_prevista,
  dataRealizada: r.data_realizada,
  valor: r.valor !== null ? Number(r.valor) : null,
  status: r.status as ContractMarco['status'],
  observacoes: r.observacoes,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const toContractMarcoInsert = (
  m: Partial<ContractMarco>, userId: string
): Database['public']['Tables']['contract_marcos']['Insert'] => ({
  user_id: userId,
  contract_id: m.contractId ?? '',
  descricao: m.descricao ?? '',
  data_prevista: m.dataPrevista ?? null,
  data_realizada: m.dataRealizada ?? null,
  valor: m.valor ?? null,
  status: m.status ?? 'Pendente',
  observacoes: m.observacoes ?? null,
})
