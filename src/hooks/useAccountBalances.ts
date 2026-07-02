import { useMemo } from 'react'
import type { FinancialAccount, Transaction } from '../types/domain'

// Converte para centavos (inteiro) antes de somar/subtrair, evitando o
// acúmulo de erro de arredondamento de ponto flutuante do JavaScript
// (ex: 0.1 + 0.2 !== 0.3 em float). Com centenas de transações somadas
// uma a uma, esse erro pode se tornar visível (poucos centavos de
// diferença no patrimônio total) — inaceitável em um sistema financeiro.
const toCents = (value: number): number => Math.round(value * 100)
const fromCents = (cents: number): number => cents / 100

export function useAccountBalances(accounts: FinancialAccount[], transactions: Transaction[]) {
  return useMemo(() => {
    // Transações vinculadas a contas INTERNO também ficam fora do cálculo
    const internalAccountIds = new Set(accounts.filter((a) => a.type === 'INTERNO').map((a) => a.id))
    const paidTxs = transactions.filter((t) => t.status === 'Pago' && !internalAccountIds.has(t.accountId ?? ''))

    // CORREÇÃO DE BUG: o sistema antigo (mockData) usava IDs fixos como
    // 'acc-3' e 'card-1' para contas padrão. No banco atual, toda conta
    // tem um UUID real gerado pelo Supabase — esses IDs fixos nunca
    // existem de verdade. Usá-los como fallback fazia transações sem
    // conta vinculada "desaparecerem" silenciosamente do cálculo de
    // saldo (a transação aparecia normal em Transações/Fluxo de Caixa,
    // mas não impactava nenhuma conta na sidebar). Agora, sem conta
    // vinculada, a transação simplesmente não afeta saldo de conta
    // nenhuma — o que é o comportamento correto e previsível.
    const resolveAccountId = (t: Transaction): string | null => t.accountId ?? null

    const balanceFor = (acc: FinancialAccount) => {
      let balanceCents = toCents(acc.startingBalance)
      for (const t of paidTxs) {
        if (resolveAccountId(t) !== acc.id) continue
        balanceCents += t.type === 'Receber' ? toCents(t.value) : -toCents(t.value)
      }
      return fromCents(balanceCents)
    }

    const faturaFor = (acc: FinancialAccount) => {
      let faturaCents = toCents(acc.startingBalance)
      for (const t of paidTxs) {
        if (t.type !== 'Pagar') continue
        if (resolveAccountId(t) !== acc.id) continue
        faturaCents += toCents(t.value)
      }
      return fromCents(faturaCents)
    }

    // Contas do tipo INTERNO são usadas só para controle pessoal do usuário
    // e não participam de nenhum cálculo financeiro — patrimônio, saldo,
    // dashboard, saúde financeira, fluxo de caixa, nada.
    const financialAccounts = accounts.filter((a) => a.type !== 'INTERNO')
    const standardAccounts = financialAccounts.filter((a) => a.type !== 'CARTAO_CREDITO')
    const creditCards = financialAccounts.filter((a) => a.type === 'CARTAO_CREDITO')

    const balances = new Map<string, number>()
    standardAccounts.forEach((a) => balances.set(a.id, balanceFor(a)))
    creditCards.forEach((a) => balances.set(a.id, faturaFor(a)))

    const standardTotalCents = standardAccounts.reduce((sum, a) => sum + toCents(balances.get(a.id) ?? 0), 0)
    const creditTotalCents = creditCards.reduce((sum, a) => sum + toCents(balances.get(a.id) ?? 0), 0)
    const standardTotal = fromCents(standardTotalCents)
    const creditTotal = fromCents(creditTotalCents)
    const patrimonioTotal = fromCents(standardTotalCents - creditTotalCents)

    // Transações já pagas mas sem conta vinculada não entram no cálculo
    // de saldo de nenhuma conta — contamos para poder avisar o usuário.
    const unlinkedPaidCount = paidTxs.filter((t) => !t.accountId).length

    return { balances, standardTotal, creditTotal, patrimonioTotal, standardAccounts, creditCards, unlinkedPaidCount }
  }, [accounts, transactions])
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}
