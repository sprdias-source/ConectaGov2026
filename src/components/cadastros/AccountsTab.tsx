import { useState } from 'react'
import { Plus, Pencil, Trash2, Wallet, CreditCard } from 'lucide-react'
import { Button } from '../ui/FormControls'
import { EmptyState } from '../ui/Primitives'
import { useFinancialAccounts } from '../../hooks/useFinancialAccounts'
import { useTransactions } from '../../hooks/useTransactions'
import { useAccountBalances, formatBRL } from '../../hooks/useAccountBalances'
import AccountFormModal from './AccountFormModal'
import ConfirmDialog from '../ui/ConfirmDialog'
import type { FinancialAccount } from '../../types/domain'

const TYPE_LABELS: Record<string, string> = {
  CORRENTE: 'Conta Corrente',
  POUPANCA: 'Conta Poupança',
  CARTEIRA: 'Carteira (Dinheiro)',
  CARTAO_CREDITO: 'Cartão de Crédito',
}

export default function AccountsTab() {
  const { accounts, isLoading, addAccount, updateAccount, deleteAccount } = useFinancialAccounts()
  const { transactions } = useTransactions()
  const { balances } = useAccountBalances(accounts, transactions)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<FinancialAccount | null>(null)
  const [deleting, setDeleting] = useState<FinancialAccount | null>(null)

  const handleSave = (data: Partial<FinancialAccount>) => {
    if (editing) {
      updateAccount.mutate({ ...editing, ...data } as FinancialAccount, { onSuccess: () => { setModalOpen(false); setEditing(null) } })
    } else {
      addAccount.mutate(data, { onSuccess: () => setModalOpen(false) })
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display font-bold text-lg text-base-100">Contas e Cartões</h2>
          <p className="text-base-400 text-[13px]">Gerencie as contas bancárias, carteira e cartões de crédito da empresa.</p>
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true) }}>
          <Plus className="w-4 h-4" /> Nova Conta
        </Button>
      </div>

      {isLoading ? (
        <div className="text-base-500 text-sm py-10 text-center">Carregando contas...</div>
      ) : accounts.length === 0 ? (
        <EmptyState icon={Wallet} title="Nenhuma conta cadastrada" description="Cadastre suas contas bancárias e cartões para começar a controlar o financeiro." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {accounts.map((acc) => {
            const balance = balances.get(acc.id) ?? 0
            const isCard = acc.type === 'CARTAO_CREDITO'
            const isPositive = isCard ? balance <= (acc.creditLimit ?? Infinity) : balance >= 0
            return (
              <div key={acc.id} className="bg-base-900/60 border border-base-700/50 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isCard ? 'bg-negative-500/10' : 'bg-accent-500/10'}`}>
                      {isCard ? <CreditCard className="w-4 h-4 text-negative-400" /> : <Wallet className="w-4 h-4 text-accent-400" />}
                    </div>
                    <div>
                      <p className="font-semibold text-base-100 text-sm">{acc.name}</p>
                      <p className="text-[11px] text-base-500">{TYPE_LABELS[acc.type]}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditing(acc); setModalOpen(true) }} className="p-1 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleting(acc)} className="p-1 text-base-400 hover:text-negative-400 hover:bg-base-800 rounded transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold">
                    {isCard ? 'Fatura Atual' : 'Saldo Atual'}
                  </p>
                  <p className={`text-lg font-extrabold font-mono tabular-nums ${isPositive ? 'text-positive-400' : 'text-negative-400'}`}>
                    {formatBRL(isCard ? -balance : balance)}
                  </p>
                  {isCard && acc.creditLimit && (
                    <p className="text-[11px] text-base-500 mt-0.5">Disponível: {formatBRL(Math.max(0, acc.creditLimit - balance))}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <AccountFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSave={handleSave}
        initial={editing}
        isSaving={addAccount.isPending || updateAccount.isPending}
        error={addAccount.error || updateAccount.error}
      />

      <ConfirmDialog
        open={!!deleting}
        title="Excluir conta?"
        description={`Tem certeza que deseja excluir "${deleting?.name}"? Lançamentos vinculados a esta conta perderão a referência, mas não serão excluídos.`}
        confirmLabel="Excluir conta"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => { if (deleting) deleteAccount.mutate(deleting, { onSuccess: () => setDeleting(null) }) }}
        isLoading={deleteAccount.isPending}
      />
    </div>
  )
}
