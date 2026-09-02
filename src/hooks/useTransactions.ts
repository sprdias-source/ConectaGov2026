import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { todayLocalISO, dateToLocalISO } from '../lib/dateUtils'
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
            next.setDate(1)
            next.setMonth(next.getMonth() + 1)
            // Usa o último dia real do mês de destino (não um "28" fixo) —
            // mesma lógica de addMonthsKeepingDay em useRecurringEngine.ts,
            // que corrigiu esse mesmo truncamento ali; faltava replicar
            // aqui na pré-geração das parcelas seguintes de um lançamento
            // recorrente novo.
            const ultimoDiaDoMes = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
            next.setDate(Math.min(day, ultimoDiaDoMes))
            const nextDueDate = dateToLocalISO(next)
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
    mutationFn: async ({ tx, newStatus, paymentDate, desconto, juros, multa }: {
      tx: Transaction; newStatus: 'Pendente' | 'Pago'; paymentDate?: string
      desconto?: number; juros?: number; multa?: number
    }) => {
      // valorOriginal é o valor cobrado, nunca muda. Ao dar baixa com
      // desconto/juros/multa, `value` (o campo usado em todo o resto do
      // sistema — Fluxo de Caixa, Relatórios, DRE, RBT12) é recalculado pra
      // já refletir o valor realmente movimentado, sem precisar tocar em
      // nenhum outro lugar que soma esse campo. Desfazer a baixa (voltar
      // pra Pendente) restaura value = valorOriginal e limpa os ajustes.
      const valorOriginal = tx.valorOriginal ?? tx.value
      const valorFinal = newStatus === 'Pago'
        ? valorOriginal - (desconto ?? 0) + (juros ?? 0) + (multa ?? 0)
        : valorOriginal

      const { data, error } = await supabase
        .from('transactions')
        .update({
          status: newStatus,
          payment_date: newStatus === 'Pago' ? paymentDate ?? todayLocalISO() : null,
          valor_original: valorOriginal,
          value: valorFinal,
          desconto: newStatus === 'Pago' ? (desconto ?? 0) : null,
          juros: newStatus === 'Pago' ? (juros ?? 0) : null,
          multa: newStatus === 'Pago' ? (multa ?? 0) : null,
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
