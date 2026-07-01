import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { todayLocalISO } from '../lib/dateUtils'
import { supabase } from '../lib/supabase'
import { fromClientRow, toClientInsert, toTransactionInsert } from '../lib/mappers'
import type { Client, Transaction } from '../types/domain'
import { useAuth } from './useAuth'
import { useAuditLog } from './useAuditLog'

const QUERY_KEY = ['clients']

function statusForDate(dueDate: string): Transaction['status'] {
  const todayStr = todayLocalISO()
  return dueDate < todayStr ? 'Atrasado' : dueDate === todayStr ? 'Vence Hoje' : 'Pendente'
}

// Gera as parcelas de "Mensalidade Assessoria" para um cliente mensalista,
// a partir da data de início de pagamento (ou início de contrato, ou hoje),
// respeitando o dia de vencimento e o período contratado em meses.
function buildMensalidadeTransactions(client: Client): Partial<Transaction>[] {
  if (!client.isMensalista || !client.valorMensalidade || !client.periodoMeses) return []

  const dia = client.diaVencimento ?? 10
  const startDateStr = client.dataInicioPagamento || client.dataInicioContrato || client.dataCadastro || todayLocalISO()
  const [startYear, startMonth] = startDateStr.split('-').map(Number)

  const result: Partial<Transaction>[] = []
  for (let m = 0; m < client.periodoMeses; m++) {
    let year = startYear
    let month = startMonth - 1 + m // 0-based
    if (month > 11) {
      year += Math.floor(month / 12)
      month = month % 12
    }
    const dueDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(dia, 28)).padStart(2, '0')}`

    result.push({
      type: 'Receber',
      category: 'Mensalidade Assessoria',
      description: `Mensalidade Assessoria - Parcela ${m + 1}/${client.periodoMeses} - ${client.name}`,
      clientId: client.id,
      value: client.valorMensalidade,
      dueDate,
      paymentMethod: 'Boleto',
      status: statusForDate(dueDate),
      isProjected: true,
      projectionParentId: `proj-mensalidade-${client.id}`,
      projectionMonthNumber: m + 1,
    })
  }
  return result
}

// Substitui por completo as parcelas projetadas (ainda não pagas) de
// mensalidade de um cliente. Parcelas já pagas nunca são tocadas — isso
// preserva o histórico financeiro real mesmo se o usuário editar valor,
// período ou data de início depois de já existirem pagamentos.
async function syncMensalidadeTransactions(userId: string, client: Client) {
  // Descobre quais números de parcela já foram pagos, para não duplicar
  // numeração nem perder a referência deles ao reconstruir as pendentes.
  const { data: paidRows } = await supabase
    .from('transactions')
    .select('projection_month_number')
    .eq('client_id', client.id)
    .eq('category', 'Mensalidade Assessoria')
    .eq('status', 'Pago')
  const paidNumbers = new Set((paidRows ?? []).map((p) => p.projection_month_number))

  await supabase
    .from('transactions')
    .delete()
    .eq('client_id', client.id)
    .eq('category', 'Mensalidade Assessoria')
    .neq('status', 'Pago')

  const allTxs = buildMensalidadeTransactions(client)
  const txs = allTxs.filter((t) => !paidNumbers.has(t.projectionMonthNumber ?? null))
  if (txs.length === 0) return 0

  const { error } = await supabase
    .from('transactions')
    .insert(txs.map((t) => toTransactionInsert(t, userId)))
  if (error) throw error
  return txs.length
}

export function useClients() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { logEvent } = useAuditLog()

  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      return data.map(fromClientRow)
    },
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    queryClient.invalidateQueries({ queryKey: ['transactions'] })
  }

  const addClient = useMutation({
    mutationFn: async (client: Partial<Client>) => {
      if (!user) throw new Error('Usuário não autenticado')
      const { data, error } = await supabase
        .from('clients')
        .insert(toClientInsert(client, user.id))
        .select()
        .single()
      if (error) throw error
      const created = fromClientRow(data)
      const parcelas = await syncMensalidadeTransactions(user.id, created)
      return { created, parcelas }
    },
    onSuccess: ({ created, parcelas }) => {
      invalidate()
      logEvent('Adicionou Cliente', `Cadastrou o cliente/órgão "${created.name}"${created.isMensalista ? ' como Mensalista' : ''}`)
      if (parcelas > 0) {
        logEvent('Projetou Mensalidades', `Gerou ${parcelas} parcela(s) de mensalidade a receber para "${created.name}"`)
      }
    },
  })

  const updateClient = useMutation({
    mutationFn: async (client: Client) => {
      if (!user) throw new Error('Usuário não autenticado')
      const { data, error } = await supabase
        .from('clients')
        .update(toClientInsert(client, client.userId))
        .eq('id', client.id)
        .select()
        .single()
      if (error) throw error
      const updated = fromClientRow(data)
      const parcelas = await syncMensalidadeTransactions(user.id, updated)
      return { updated, parcelas }
    },
    onSuccess: ({ updated, parcelas }) => {
      invalidate()
      logEvent('Editou Cliente', `Atualizou dados do cliente "${updated.name}"`)
      if (parcelas > 0) {
        logEvent('Reprojetou Mensalidades', `Atualizou as parcelas de mensalidade pendentes de "${updated.name}" (${parcelas} parcela(s))`)
      }
    },
  })

  const deleteClient = useMutation({
    mutationFn: async (client: Client) => {
      const { error } = await supabase.from('clients').delete().eq('id', client.id)
      if (error) throw error
      return client
    },
    onSuccess: (deleted) => {
      // Cascata de licitações/transações/empenhos é feita pelo próprio banco
      // (ON DELETE CASCADE), então só precisamos invalidar tudo que depende disso.
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['biddings'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['empenhos'] })
      logEvent('Excluiu Cliente', `Removeu o cadastro do cliente/órgão "${deleted.name}". Licitações, empenhos e lançamentos vinculados foram removidos automaticamente.`)
    },
  })

  // Inativa (ou reativa) o cliente sem apagar nada — preserva 100% do
  // histórico financeiro. É a alternativa segura à exclusão definitiva.
  const toggleClientActive = useMutation({
    mutationFn: async ({ client, isActive }: { client: Client; isActive: boolean }) => {
      const { data, error } = await supabase
        .from('clients')
        .update({ is_active: isActive })
        .eq('id', client.id)
        .select()
        .single()
      if (error) throw error
      return fromClientRow(data)
    },
    onSuccess: (updated) => {
      invalidate()
      logEvent(
        updated.isActive ? 'Reativou Cliente' : 'Inativou Cliente',
        `${updated.isActive ? 'Reativou' : 'Inativou'} o cliente/órgão "${updated.name}"`
      )
    },
  })

  // Verifica se o cliente tem histórico financeiro real (qualquer
  // transação já paga, em qualquer momento) — usado para decidir se o
  // alerta de exclusão precisa do aviso mais forte sobre perda de dados.
  const checkClientHasFinancialHistory = async (clientId: string): Promise<boolean> => {
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('status', 'Pago')
    return (count ?? 0) > 0
  }

  return {
    clients: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    addClient,
    updateClient,
    deleteClient,
    toggleClientActive,
    checkClientHasFinancialHistory,
  }
}
