import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromTransactionRow, fromEmpenhoRow, toTransactionInsert } from '../lib/mappers'
import { useAuth } from './useAuth'

const PERIOD_MONTHS: Record<string, number> = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 }

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

function statusForDate(dueDate: string): 'Pendente' | 'Atrasado' | 'Vence Hoje' {
  const todayStr = new Date().toISOString().slice(0, 10)
  return dueDate < todayStr ? 'Atrasado' : dueDate === todayStr ? 'Vence Hoje' : 'Pendente'
}

/**
 * Motor de recorrência: roda uma vez por sessão (ao abrir o app) e garante
 * que toda parcela recorrente "em aberto" tenha a próxima já criada,
 * seguindo o princípio "só existe 1 parcela pendente por vez à frente" —
 * isso evita gerar dezenas de parcelas de uma vez e mantém o controle
 * manual de baixa que o usuário pediu (nada é pago automaticamente).
 *
 * Cobre dois tipos de recorrência:
 * 1. Lançamentos financeiros comuns (transactions.is_recurring)
 * 2. Empenhos no modo "recorrente" (empenhos.recorrencia_ativa)
 */
export function useRecurringEngine() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const hasRun = useRef(false)

  useEffect(() => {
    if (!user || hasRun.current) return
    hasRun.current = true

    const run = async () => {
      let didCreateAny = false
      const todayStr = new Date().toISOString().slice(0, 10)

      // --- 1. Lançamentos recorrentes comuns -------------------------------
      const { data: recurringTxs } = await supabase
        .from('transactions')
        .select('*')
        .eq('is_recurring', true)

      if (recurringTxs) {
        for (const row of recurringTxs) {
          const tx = fromTransactionRow(row)
          // Já existe uma parcela futura/pendente gerada a partir deste modelo?
          const { data: children } = await supabase
            .from('transactions')
            .select('id, due_date')
            .eq('recurring_parent_id', tx.id)
            .order('due_date', { ascending: false })
            .limit(1)

          const lastDueDate = children && children.length > 0 ? children[0].due_date : tx.dueDate
          // Só gera a próxima parcela quando a última conhecida já venceu
          // (ou é hoje) — assim nunca acumula parcelas futuras demais.
          if (lastDueDate > todayStr) continue

          const day = tx.recurringDay ?? Number(tx.dueDate.slice(8, 10))
          const next = new Date(lastDueDate + 'T12:00:00')
          next.setMonth(next.getMonth() + 1)
          next.setDate(Math.min(day, 28))
          const nextDueDate = next.toISOString().slice(0, 10)

          await supabase.from('transactions').insert(
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
                dueDate: nextDueDate,
                paymentMethod: tx.paymentMethod,
                status: statusForDate(nextDueDate),
                isRecurring: false,
                recurringParentId: tx.id,
                recurringDay: day,
              },
              user.id
            )
          )
          didCreateAny = true
        }
      }

      // --- 2. Empenhos recorrentes -----------------------------------------
      const { data: recurringEmpenhos } = await supabase
        .from('empenhos')
        .select('*')
        .eq('modo_parcelamento', 'recorrente')
        .eq('recorrencia_ativa', true)

      if (recurringEmpenhos) {
        for (const row of recurringEmpenhos) {
          const emp = fromEmpenhoRow(row)
          const { data: children } = await supabase
            .from('transactions')
            .select('id, due_date, projection_month_number')
            .eq('empenho_id', emp.id)
            .order('projection_month_number', { ascending: false })
            .limit(1)

          if (!children || children.length === 0) continue
          const last = children[0]
          if (last.due_date > todayStr) continue

          const months = PERIOD_MONTHS[emp.periodicidade ?? 'mensal'] ?? 1
          const nextDueDate = addMonths(last.due_date, months)
          const nextNumber = (last.projection_month_number ?? 1) + 1

          await supabase.from('transactions').insert(
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
              user.id
            )
          )
          didCreateAny = true
        }
      }

      if (didCreateAny) {
        queryClient.invalidateQueries({ queryKey: ['transactions'] })
      }
    }

    run().catch((err) => console.error('Erro no motor de recorrência:', err))
  }, [user, queryClient])
}
