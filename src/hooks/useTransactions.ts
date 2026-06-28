import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromTransactionRow, toTransactionInsert } from '../lib/mappers'
import type { Transaction } from '../types/domain'
import { useAuth } from './useAuth'
import { useAuditLog } from './useAuditLog'

const QUERY_KEY = ['transactions']

export function useTransactions() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { logEvent } = useAuditLog()

  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('due_date', { ascending: true })
      if (error) throw error
      return data.map(fromTransactionRow)
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })

  const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })

  const addTransactions = useMutation({
    mutationFn: async (txs: Partial<Transaction>[]) => {
      if (!user) throw new Error('Usuário não autenticado')

      // Para cada lançamento marcado como recorrente, geramos de imediato
      // as próximas parcelas do horizonte (não só a primeira) — assim elas
      // já aparecem disponíveis para baixa em qualquer data, sem depender
      // do motor de recorrência rodar depois.
      const HORIZON = 3
      const expanded: Partial<Transaction>[] = []
      for (const t of txs) {
        expanded.push(t)
        if (t.isRecurring && t.dueDate) {
          const day = t.recurringDay ?? Number(t.dueDate.slice(8, 10))
          let parentDueDate = t.dueDate
          for (let i = 1; i < HORIZON; i++) {
            const next = new Date(parentDueDate + 'T12:00:00')
            next.setMonth(next.getMonth() + 1)
            next.setDate(Math.min(day, 28))
            const nextDueDate = next.toISOString().slice(0, 10)
            expanded.push({
              ...t,
              dueDate: nextDueDate,
              isRecurring: false,
              status: 'Pendente',
              paymentDate: null,
            })
            parentDueDate = nextDueDate
          }
        }
      }

      const { data, error } = await supabase
        .from('transactions')
        .insert(expanded.map((t) => toTransactionInsert(t, user.id)))
        .select()
      if (error) throw error
      const createdRows = data.map(fromTransactionRow)

      // A primeira linha criada que for recorrente é o "modelo" — as
      // demais geradas a partir dela apontam recurringParentId para ela.
      const parent = createdRows.find((c) => c.isRecurring)
      if (parent) {
        const childrenIds = createdRows.filter((c) => !c.isRecurring && c.dueDate > parent.dueDate).map((c) => c.id)
        if (childrenIds.length > 0) {
          await supabase.from('transactions').update({ recurring_parent_id: parent.id }).in('id', childrenIds)
        }
      }

      return createdRows
    },
    onSuccess: (created) => {
      invalidate()
      let details = created
        .map((t) => `${t.type === 'Receber' ? 'Receita' : 'Despesa'} "${t.category}": R$ ${formatCurrency(t.value)}`)
        .join('; ')
      if (details.length > 120) details = details.substring(0, 120) + '...'
      logEvent('Criou Financeiro', `Lançamento(s): ${details}`)
    },
  })

  const updateTransaction = useMutation({
    mutationFn: async (tx: Transaction) => {
      const { data, error } = await supabase
        .from('transactions')
        .update(toTransactionInsert(tx, tx.userId))
        .eq('id', tx.id)
        .select()
        .single()
      if (error) throw error
      return fromTransactionRow(data)
    },
    onSuccess: (updated) => {
      invalidate()
      logEvent('Alterou Financeiro', `Atualizou dados do lançamento "${updated.description}"`)
    },
  })

  const updateTransactionStatus = useMutation({
    mutationFn: async ({ tx, newStatus, paymentDate }: { tx: Transaction; newStatus: 'Pendente' | 'Pago'; paymentDate?: string }) => {
      const { data, error } = await supabase
        .from('transactions')
        .update({
          status: newStatus,
          payment_date: newStatus === 'Pago' ? paymentDate ?? new Date().toISOString().slice(0, 10) : null,
        })
        .eq('id', tx.id)
        .select()
        .single()
      if (error) throw error
      return fromTransactionRow(data)
    },
    onSuccess: (updated) => {
      invalidate()
      logEvent('Baixa de Lançamento', `Lançamento "${updated.description}" foi marcado como ${updated.status === 'Pago' ? 'PAGO' : 'PENDENTE'}`)
    },
  })

  const deleteTransaction = useMutation({
    mutationFn: async (tx: Transaction) => {
      const { error } = await supabase.from('transactions').delete().eq('id', tx.id)
      if (error) throw error
      return tx
    },
    onSuccess: (deleted) => {
      invalidate()
      logEvent('Excluiu Financeiro', `Removeu o lançamento "${deleted.description}" de R$ ${formatCurrency(deleted.value)}`)
    },
  })

  return {
    transactions: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    addTransactions,
    updateTransaction,
    updateTransactionStatus,
    deleteTransaction,
  }
}
