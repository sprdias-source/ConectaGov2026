import { useMemo } from 'react'
import type { FinancialAccount, Transaction } from '../types/domain'

export function useAccountBalances(accounts: FinancialAccount[], transactions: Transaction[]) {
  return useMemo(() => {
    const paidTxs = transactions.filter((t) => t.status === 'Pago')

    const resolveAccountId = (t: Transaction): string => {
      if (t.accountId) return t.accountId
      if (t.paymentMethod === 'Cartão') return 'card-1'
      if (t.paymentMethod === 'Dinheiro') return 'acc-2'
      return 'acc-3'
    }

    const balanceFor = (acc: FinancialAccount) => {
      let balance = acc.startingBalance
      for (const t of paidTxs) {
        if (resolveAccountId(t) !== acc.id) continue
        balance += t.type === 'Receber' ? t.value : -t.value
      }
      return balance
    }

    const faturaFor = (acc: FinancialAccount) => {
      let fatura = acc.startingBalance
      for (const t of paidTxs) {
        if (t.type !== 'Pagar') continue
        const targetId = t.accountId ?? (t.paymentMethod === 'Cartão' ? 'card-1' : null)
        if (targetId !== acc.id) continue
        fatura += t.value
      }
      return fatura
    }

    const standardAccounts = accounts.filter((a) => a.type !== 'CARTAO_CREDITO')
    const creditCards = accounts.filter((a) => a.type === 'CARTAO_CREDITO')

    const balances = new Map<string, number>()
    standardAccounts.forEach((a) => balances.set(a.id, balanceFor(a)))
    creditCards.forEach((a) => balances.set(a.id, faturaFor(a)))

    const standardTotal = standardAccounts.reduce((sum, a) => sum + (balances.get(a.id) ?? 0), 0)
    const creditTotal = creditCards.reduce((sum, a) => sum + (balances.get(a.id) ?? 0), 0)
    const patrimonioTotal = standardTotal - creditTotal

    return { balances, standardTotal, creditTotal, patrimonioTotal, standardAccounts, creditCards }
  }, [accounts, transactions])
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}
