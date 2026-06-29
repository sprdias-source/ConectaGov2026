import { useMemo, useState, useEffect } from 'react'
import { Plus, Search, Pencil, Trash2, ArrowDownCircle, ArrowUpCircle, Check, Receipt, Repeat } from 'lucide-react'
import { Button, Input } from '../ui/FormControls'
import { EmptyState, StatusBadge } from '../ui/Primitives'
import { formatBRL } from '../../hooks/useAccountBalances'
import { useTransactions } from '../../hooks/useTransactions'
import { useClients } from '../../hooks/useClients'
import { useFinancialAccounts } from '../../hooks/useFinancialAccounts'
import { useCategories } from '../../hooks/useCategories'
import TransactionFormModal from './TransactionFormModal'
import QuickPaymentModal from './QuickPaymentModal'
import ConfirmDialog from '../ui/ConfirmDialog'
import ErrorAlert from '../ui/ErrorAlert'
import MonthHorizontalPicker from '../ui/MonthHorizontalPicker'
import { usePagination, PaginationControls } from '../../hooks/usePagination'
import type { Transaction } from '../../types/domain'

export default function ContasLancamentosTab() {
  const { transactions, isLoading, addTransactions, updateTransaction, updateTransactionStatus, deleteTransaction } = useTransactions()
  const { clients } = useClients()
  const { accounts } = useFinancialAccounts()
  const { categoriesPagar, categoriesReceber } = useCategories()

  const now = new Date()
  const [month, setMonth] = useState(now.getMonth())
  const [year, setYear] = useState(now.getFullYear())
  const [filter, setFilter] = useState<'todos' | 'atrasados' | 'vence_hoje'>('todos')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [deleting, setDeleting] = useState<Transaction | null>(null)
  const [payingTx, setPayingTx] = useState<Transaction | null>(null)

  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name ?? '—'

  const monthStr = String(month + 1).padStart(2, '0')
  const periodTxs = useMemo(
    () => transactions.filter((t) => t.dueDate.startsWith(`${year}-${monthStr}`)),
    [transactions, year, monthStr]
  )

  const filtered = useMemo(() => {
    return periodTxs.filter((t) => {
      if (filter === 'atrasados' && t.status !== 'Atrasado') return false
      if (filter === 'vence_hoje' && t.status !== 'Vence Hoje') return false
      if (search) {
        const q = search.toLowerCase()
        return t.description.toLowerCase().includes(q) || clientName(t.clientId).toLowerCase().includes(q)
      }
      return true
    })
  }, [periodTxs, filter, search])

  const { paginated, page, setPage, totalPages, totalItems, pageSize } = usePagination(filtered)

  useEffect(() => {
    setPage(1)
  }, [month, year, filter, search, setPage])

  const summary = useMemo(() => {
    const aPagar = periodTxs.filter((t) => t.type === 'Pagar' && t.status !== 'Pago').reduce((s, t) => s + t.value, 0)
    const pagoPagar = periodTxs.filter((t) => t.type === 'Pagar' && t.status === 'Pago').reduce((s, t) => s + t.value, 0)
    const aReceber = periodTxs.filter((t) => t.type === 'Receber' && t.status !== 'Pago').reduce((s, t) => s + t.value, 0)
    const recebido = periodTxs.filter((t) => t.type === 'Receber' && t.status === 'Pago').reduce((s, t) => s + t.value, 0)
    return { aPagar, pagoPagar, aReceber, recebido }
  }, [periodTxs])

  const handleSave = (data: Partial<Transaction>) => {
    if (editing) {
      updateTransaction.mutate({ ...editing, ...data } as Transaction, { onSuccess: () => { setModalOpen(false); setEditing(null) } })
    } else {
      addTransactions.mutate([data], { onSuccess: () => setModalOpen(false) })
    }
  }

  const handleStatusClick = (t: Transaction) => {
    if (t.status === 'Pago') {
      updateTransactionStatus.mutate({ tx: t, newStatus: 'Pendente' })
    } else {
      setPayingTx(t)
    }
  }

  const confirmPayment = (paymentDate: string) => {
    if (!payingTx) return
    updateTransactionStatus.mutate(
      { tx: payingTx, newStatus: 'Pago', paymentDate },
      { onSuccess: () => setPayingTx(null) }
    )
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 w-full">
        <MonthHorizontalPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y) }} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
        <div className="bg-base-900/60 border border-base-700/50 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-negative-500/10 flex items-center justify-center shrink-0">
            <ArrowDownCircle className="w-5 h-5 text-negative-400" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-base-500">A Pagar do Mês</p>
            <p className="text-xl font-extrabold font-mono text-negative-300">{formatBRL(summary.aPagar)}</p>
            <p className="text-[11px] text-base-500">Pago: {formatBRL(summary.pagoPagar)}</p>
          </div>
        </div>
        <div className="bg-base-900/60 border border-base-700/50 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-positive-500/10 flex items-center justify-center shrink-0">
            <ArrowUpCircle className="w-5 h-5 text-positive-400" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-base-500">A Receber do Mês</p>
            <p className="text-xl font-extrabold font-mono text-positive-400">{formatBRL(summary.aReceber)}</p>
            <p className="text-[11px] text-base-500">Recebido: {formatBRL(summary.recebido)}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="flex bg-base-850 border border-base-700 rounded-lg p-0.5 text-[12px] font-semibold">
            <button onClick={() => setFilter('todos')} className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${filter === 'todos' ? 'bg-base-700 text-accent-300' : 'text-base-400'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-accent-400" /> Mostrar Tudo
            </button>
            <button onClick={() => setFilter('atrasados')} className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${filter === 'atrasados' ? 'bg-base-700 text-negative-400' : 'text-base-400'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-negative-400" /> Atrasados
            </button>
            <button onClick={() => setFilter('vence_hoje')} className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${filter === 'vence_hoje' ? 'bg-base-700 text-warning-400' : 'text-base-400'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-warning-400" /> Vence Hoje
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-base-500" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar lançamentos..." className="pl-8 w-52" />
          </div>
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true) }}>
          <Plus className="w-4 h-4" /> Novo Lançamento
        </Button>
      </div>

      <ErrorAlert error={updateTransactionStatus.error || deleteTransaction.error} />

      <div className="bg-base-900/60 border border-base-700/50 rounded-xl overflow-hidden mt-3">
        {isLoading ? (
          <div className="p-10 text-center text-base-500 text-sm">Carregando lançamentos...</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Receipt} title="Nenhum lançamento neste período" description="Crie um novo lançamento ou ajuste o mês/filtro selecionado." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-base-800 text-left">
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Vencimento</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Categoria</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Descrição</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Cliente</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right bg-base-850/40">Valor</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Status</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((t) => (
                  <tr key={t.id} className="border-b border-base-800/60 hover:bg-base-850/40 transition">
                    <td className="px-4 py-3 text-base-300 text-[13px] whitespace-nowrap">
                      {new Date(t.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-base-300 text-[12px] max-w-[160px] truncate">{t.category}</td>
                    <td className="px-4 py-3 text-base-200 text-[13px] max-w-[220px] truncate">
                      <span className="flex items-center gap-1.5">
                        {t.isRecurring && <Repeat className="w-3 h-3 text-accent-400 shrink-0" />}
                        {t.description}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-base-400 text-[12px] max-w-[140px] truncate">{clientName(t.clientId)}</td>
                    <td className={`px-4 py-3 text-right font-mono font-bold text-[13px] bg-base-850/25 ${t.type === 'Receber' ? 'text-positive-400' : 'text-negative-300'}`}>
                      {t.type === 'Receber' ? '+' : '−'}{formatBRL(t.value)}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleStatusClick(t)}
                          title={t.status === 'Pago' ? 'Marcar como pendente' : 'Confirmar pagamento/recebimento'}
                          className={`p-1.5 rounded transition ${t.status === 'Pago' ? 'text-positive-400 hover:bg-base-800' : 'text-base-400 hover:text-positive-400 hover:bg-base-800'}`}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { setEditing(t); setModalOpen(true) }} className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleting(t)} className="p-1.5 text-base-400 hover:text-negative-400 hover:bg-base-800 rounded transition">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationControls page={page} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} />
      </div>

      <TransactionFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSave={handleSave}
        initial={editing}
        clients={clients}
        accounts={accounts}
        categoriesPagar={categoriesPagar}
        categoriesReceber={categoriesReceber}
        isSaving={addTransactions.isPending || updateTransaction.isPending}
        error={addTransactions.error || updateTransaction.error}
      />

      <QuickPaymentModal
        open={!!payingTx}
        onClose={() => setPayingTx(null)}
        transaction={payingTx}
        onConfirm={confirmPayment}
        isSaving={updateTransactionStatus.isPending}
        error={updateTransactionStatus.error}
      />

      <ConfirmDialog
        open={!!deleting}
        title="Excluir lançamento?"
        description={`Tem certeza que deseja excluir "${deleting?.description}"?`}
        confirmLabel="Excluir"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => { if (deleting) deleteTransaction.mutate(deleting, { onSuccess: () => setDeleting(null) }) }}
        isLoading={deleteTransaction.isPending}
      />
    </div>
  )
}
