// Conversores entre o formato de linha do banco (snake_case) e o formato de
// domínio usado nos componentes (camelCase). Mantemos essa camada fina e
// explícita para que qualquer mudança de schema tenha um único lugar para
// ajustar — evita o tipo de bug onde campos ficam "meio sincronizados".

import type { Database } from '../types/database'
import type {
  Client, Bidding, FinancialAccount, Empenho, Transaction,
  Employee, Contract, Receipt, AttachedFile, AuditLog, Category,
} from '../types/domain'

type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']

export const fromClientRow = (r: Row<'clients'>): Client => ({
  id: r.id,
  userId: r.user_id,
  name: r.name,
  cnpj: r.cnpj,
  address: r.address,
  phone: r.phone,
  whatsapp: r.whatsapp,
  email: r.email,
  website: r.website,
  isMensalista: r.is_mensalista,
  valorMensalidade: r.valor_mensalidade,
  periodoMeses: r.periodo_meses,
  diaVencimento: r.dia_vencimento,
  dataInicioContrato: r.data_inicio_contrato,
  dataCadastro: r.data_cadastro,
  dataInicioPagamento: r.data_inicio_pagamento,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const toClientInsert = (c: Partial<Client>, userId: string): Database['public']['Tables']['clients']['Insert'] => ({
  user_id: userId,
  name: c.name ?? '',
  cnpj: c.cnpj ?? null,
  address: c.address ?? null,
  phone: c.phone ?? null,
  whatsapp: c.whatsapp ?? null,
  email: c.email ?? null,
  website: c.website ?? null,
  is_mensalista: c.isMensalista ?? false,
  valor_mensalidade: c.valorMensalidade ?? null,
  periodo_meses: c.periodoMeses ?? null,
  dia_vencimento: c.diaVencimento ?? null,
  data_inicio_contrato: c.dataInicioContrato ?? null,
  data_cadastro: c.dataCadastro ?? null,
  data_inicio_pagamento: c.dataInicioPagamento ?? null,
})

export const fromBiddingRow = (r: Row<'biddings'>): Bidding => ({
  id: r.id,
  userId: r.user_id,
  clientId: r.client_id,
  modalidade: r.modalidade as Bidding['modalidade'],
  tipo: r.tipo as Bidding['tipo'],
  objeto: r.objeto,
  orgao: r.orgao,
  valorLicitado: Number(r.valor_licitado),
  valorOfertado: r.valor_ofertado !== null ? Number(r.valor_ofertado) : null,
  status: r.status as Bidding['status'],
  dataAbertura: r.data_abertura,
  numeroEdital: r.numero_edital,
  processo: r.processo,
  portal: r.portal,
  etapa: r.etapa as Bidding['etapa'],
  taxaExito: r.taxa_exito !== null ? Number(r.taxa_exito) : null,
  representante: r.representante,
  observacaoEtapa: r.observacao_etapa,
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
  valor_licitado: b.valorLicitado ?? 0,
  valor_ofertado: b.valorOfertado ?? null,
  status: b.status ?? 'Em Andamento',
  data_abertura: b.dataAbertura ?? new Date().toISOString().slice(0, 10),
  numero_edital: b.numeroEdital ?? null,
  processo: b.processo ?? null,
  portal: b.portal ?? null,
  etapa: b.etapa ?? null,
  taxa_exito: b.taxaExito ?? null,
  representante: b.representante ?? null,
  observacao_etapa: b.observacaoEtapa ?? null,
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
  status: r.status as Empenho['status'],
  observacao: r.observacao,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const toEmpenhoInsert = (e: Partial<Empenho>, userId: string): Database['public']['Tables']['empenhos']['Insert'] => ({
  user_id: userId,
  numero_empenho: e.numeroEmpenho ?? '',
  numero_nota_fiscal: e.numeroNotaFiscal ?? null,
  client_id: e.clientId ?? '',
  bidding_id: e.biddingId ?? null,
  data_empenho: e.dataEmpenho ?? new Date().toISOString().slice(0, 10),
  valor_empenhada: e.valorEmpenhada ?? 0,
  percentual_comissao: e.percentualComissao ?? 0,
  valor_comissao_total: e.valorComissaoTotal ?? 0,
  projetar_doze_meses: e.projetarDozeMeses ?? false,
  status: e.status ?? 'Pendente',
  observacao: e.observacao ?? null,
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
  due_date: t.dueDate ?? new Date().toISOString().slice(0, 10),
  payment_date: t.paymentDate ?? null,
  payment_method: t.paymentMethod ?? null,
  status: t.status ?? 'Pendente',
  is_projected: t.isProjected ?? false,
  projection_parent_id: t.projectionParentId ?? null,
  projection_month_number: t.projectionMonthNumber ?? null,
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
  issue_date: r.issueDate ?? new Date().toISOString().slice(0, 10),
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

export const fromAuditLogRow = (r: Row<'audit_logs'>): AuditLog => ({
  id: r.id,
  userId: r.user_id,
  action: r.action,
  details: r.details,
  createdAt: r.created_at,
})

export const fromCategoryRow = (r: Row<'categories'>): Category => ({
  id: r.id,
  userId: r.user_id,
  type: r.type as Category['type'],
  name: r.name,
  createdAt: r.created_at,
})
