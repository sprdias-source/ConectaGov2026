import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromTransactionRow, fromEmpenhoRow, toTransactionInsert } from '../lib/mappers'
import { useAuth } from './useAuth'

const PERIOD_MONTHS: Record<string, number> = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 }

// Quantas parcelas futuras (pendentes, ainda não vencidas) o sistema
// mantém sempre disponíveis à frente para cada lançamento/empenho
// recorrente. Gerar de antemão (em vez de só quando a anterior vence)
// significa que a parcela já está lá esperando o usuário dar baixa na
// data real em que o dinheiro entrou, mesmo que seja antes do previsto.
const HORIZON = 3

function addMonthsKeepingDay(dateStr: string, months: number, targetDay?: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setMonth(d.getMonth() + months)
  if (targetDay) d.setDate(Math.min(targetDay, 28))
  return d.toISOString().slice(0, 10)
}

function statusForDate(dueDate: string): 'Pendente' | 'Atrasado' | 'Vence Hoje' {
  const todayStr = new Date().toISOString().slice(0, 10)
  return dueDate < todayStr ? 'Atrasado' : dueDate === todayStr ? 'Vence Hoje' : 'Pendente'
}

/**
 * Motor de recorrência: roda uma vez por sessão (ao abrir o app) e garante
 * que todo lançamento/empenho recorrente sempre tenha um HORIZONTE de
 * parcelas futuras pendentes já criadas (não só "a próxima"). Isso resolve
 * dois problemas do design anterior:
 *
 * 1. Antes, a próxima parcela só nascia depois que a anterior já tinha
 *    vencido — ou seja, dependia do usuário recarregar a página bem depois
 *    da data de vencimento. Na prática, parcelas "paravam de aparecer".
 * 2. Agora, sempre existem N parcelas futuras visíveis e prontas para
 *    receber baixa em qualquer data que o usuário quiser, mesmo
 *    adiantada — exatamente como pedido.
 *
 * Cobre dois tipos de recorrência:
 * 1. Lançamentos financeiros comuns (transactions.is_recurring)
 * 2. Empenhos no modo "recorrente" (empenhos.recorrencia_ativa)
 *
 * IMPORTANTE: todo erro de banco aqui é capturado e exposto via
 * `lastError`, em vez de ser engolido silenciosamente — isso é crítico
 * porque este motor roda em segundo plano, sem interação direta do
 * usuário, então sem isso um problema de schema passaria invisível.
 */
export function useRecurringEngine() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const hasRun = useRef(false)
  const [lastError, setLastError] = useState<string | null>(null)

  useEffect(() => {
    if (!user || hasRun.current) return
    hasRun.current = true
    const userId = user.id

    const run = async () => {
      let didCreateAny = false

      // --- 1. Lançamentos recorrentes comuns -------------------------------
      const { data: recurringTxs, error: recTxError } = await supabase
        .from('transactions')
        .select('*')
        .eq('is_recurring', true)

      if (recTxError) {
        console.error('[Motor de Recorrência] Falha ao buscar lançamentos recorrentes:', recTxError)
        setLastError(`Lançamentos recorrentes: ${recTxError.message}`)
      }

      if (recurringTxs) {
        for (const row of recurringTxs) {
          const tx = fromTransactionRow(row)

          const { data: children, error: childError } = await supabase
            .from('transactions')
            .select('due_date')
            .eq('recurring_parent_id', tx.id)
            .order('due_date', { ascending: false })

          if (childError) {
            console.error('[Motor de Recorrência] Falha ao buscar parcelas filhas:', childError)
            setLastError(`Buscar parcelas: ${childError.message}`)
            continue
          }

          const existingDueDates = new Set((children ?? []).map((c) => c.due_date))
          let lastDueDate = children && children.length > 0 ? children[0].due_date : tx.dueDate
          const day = tx.recurringDay ?? Number(tx.dueDate.slice(8, 10))

          // Conta quantas parcelas futuras (ainda pendentes) já existem
          const todayStr = new Date().toISOString().slice(0, 10)
          const futureCount = (children ?? []).filter((c) => c.due_date >= todayStr).length

          let toCreate = Math.max(0, HORIZON - futureCount)
          while (toCreate > 0) {
            const next = addMonthsKeepingDay(lastDueDate, 1, day)
            lastDueDate = next
            if (existingDueDates.has(next)) {
              toCreate--
              continue
            }

            const { error: insertError } = await supabase.from('transactions').insert(
              toTransactionInsert(
                {
                  type: tx.type,
                  category: tx.category,
                  description: tx.description,
                  clientId: tx.clientId,
                  biddingId: tx.biddingId,
                  empenhoId: null,
                  accountId: tx.accountId,
                  value: tx.value,
                  dueDate: next,
                  paymentMethod: tx.paymentMethod,
                  status: statusForDate(next),
                  isRecurring: false,
                  recurringParentId: tx.id,
                  recurringDay: day,
                },
                userId
              )
            )
            if (insertError) {
              console.error('[Motor de Recorrência] Falha ao criar parcela recorrente:', insertError)
              setLastError(`Criar parcela recorrente: ${insertError.message}`)
              break
            }
            existingDueDates.add(next)
            didCreateAny = true
            toCreate--
          }
        }
      }

      // --- 2. Empenhos recorrentes -----------------------------------------
      const { data: recurringEmpenhos, error: empError } = await supabase
        .from('empenhos')
        .select('*')
        .eq('modo_parcelamento', 'recorrente')
        .eq('recorrencia_ativa', true)

      if (empError) {
        console.error('[Motor de Recorrência] Falha ao buscar empenhos recorrentes:', empError)
        setLastError(`Empenhos recorrentes: ${empError.message}`)
      }

      if (recurringEmpenhos) {
        for (const row of recurringEmpenhos) {
          const emp = fromEmpenhoRow(row)

          const { data: children, error: childError } = await supabase
            .from('transactions')
            .select('due_date, projection_month_number')
            .eq('empenho_id', emp.id)
            .order('projection_month_number', { ascending: false })

          if (childError) {
            console.error('[Motor de Recorrência] Falha ao buscar parcelas de empenho:', childError)
            setLastError(`Buscar parcelas de empenho: ${childError.message}`)
            continue
          }
          if (!children || children.length === 0) continue

          const todayStr = new Date().toISOString().slice(0, 10)
          const futureCount = children.filter((c) => c.due_date >= todayStr).length
          const months = PERIOD_MONTHS[emp.periodicidade ?? 'mensal'] ?? 1

          let lastDueDate = children[0].due_date
          let lastNumber = children[0].projection_month_number ?? 1
          let toCreate = Math.max(0, HORIZON - futureCount)

          while (toCreate > 0) {
            const nextDueDate = addMonthsKeepingDay(lastDueDate, months)
            const nextNumber = lastNumber + 1

            const { error: insertError } = await supabase.from('transactions').insert(
              toTransactionInsert(
                {
                  type: 'Receber',
                  category: 'Comissão de Êxito (Recorrente)',
                  description: `Comissão s/ Empenho ${emp.numeroEmpenho} (${emp.percentualComissao}% de R$ ${emp.valorEmpenhada.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) - Parc. ${nextNumber}`,
                  clientId: emp.clientId,
                  biddingId: emp.biddingId,
                  empenhoId: emp.id,
                  value: emp.valorComissaoTotal,
                  dueDate: nextDueDate,
                  paymentMethod: 'Boleto',
                  status: statusForDate(nextDueDate),
                  isProjected: true,
                  projectionParentId: `proj-emp-${emp.id}`,
                  projectionMonthNumber: nextNumber,
                },
                userId
              )
            )
            if (insertError) {
              console.error('[Motor de Recorrência] Falha ao criar parcela de empenho:', insertError)
              setLastError(`Criar parcela de empenho: ${insertError.message}`)
              break
            }
            lastDueDate = nextDueDate
            lastNumber = nextNumber
            didCreateAny = true
            toCreate--
          }
        }
      }

      if (didCreateAny) {
        queryClient.invalidateQueries({ queryKey: ['transactions'] })
      }
    }

    run().catch((err) => {
      console.error('[Motor de Recorrência] Erro inesperado:', err)
      setLastError(err instanceof Error ? err.message : 'Erro desconhecido')
    })
  }, [user?.id, queryClient])

  return { lastError }
}
