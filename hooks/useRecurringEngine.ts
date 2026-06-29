import { useEffect, useRef, useState } from 'react'
import { todayLocalISO, dateToLocalISO } from '../lib/dateUtils'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromTransactionRow, toTransactionInsert } from '../lib/mappers'
import { useAuth } from './useAuth'

// Quantas parcelas futuras (pendentes, ainda não vencidas) o sistema
// mantém sempre disponíveis à frente para cada lançamento recorrente
// comum (contas fixas como aluguel, contabilidade, etc). Gerar de antemão
// (em vez de só quando a anterior vence) significa que a parcela já está
// lá esperando o usuário dar baixa na data real em que pagou, mesmo que
// seja antes do previsto.
//
// NOTA: empenhos recorrentes NÃO usam mais este motor — desde a correção
// que permite escolher a quantidade de parcelas diretamente no cadastro,
// todas as parcelas de um empenho nascem de uma vez (na criação ou edição),
// sem depender de processamento em segundo plano.
const HORIZON = 3

function addMonthsKeepingDay(dateStr: string, months: number, targetDay?: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setMonth(d.getMonth() + months)
  if (targetDay) d.setDate(Math.min(targetDay, 28))
  return dateToLocalISO(d)
}

function statusForDate(dueDate: string): 'Pendente' | 'Atrasado' | 'Vence Hoje' {
  const todayStr = todayLocalISO()
  return dueDate < todayStr ? 'Atrasado' : dueDate === todayStr ? 'Vence Hoje' : 'Pendente'
}

/**
 * Motor de recorrência para lançamentos financeiros comuns (contas fixas
 * marcadas como "Repetir todo mês"). Roda uma vez por sessão e garante que
 * sempre existam HORIZON parcelas futuras pendentes já criadas.
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

          const todayStr = todayLocalISO()
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
