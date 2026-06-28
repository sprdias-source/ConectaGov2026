import { useMemo, useState } from 'react'
import { FileBarChart, Download, Printer } from 'lucide-react'
import { PageHeader, Card, StatusBadge, EmptyState } from '../components/ui/Primitives'
import { Select } from '../components/ui/FormControls'
import { formatBRL } from '../hooks/useAccountBalances'
import { useTransactions } from '../hooks/useTransactions'
import { useClients } from '../hooks/useClients'
import { useCategories } from '../hooks/useCategories'

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export default function RelatoriosPage() {
  const { transactions } = useTransactions()
  const { clients } = useClients()
  const { categoriesReceber } = useCategories()

  const [monthFilter, setMonthFilter] = useState('todos')
  const [clientFilter, setClientFilter] = useState('todos')
  const [categoryFilter, setCategoryFilter] = useState('todas')

  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name ?? '—'

  const filtered = useMemo(() => {
    return transactions
      .filter((t) => t.type === 'Receber')
      .filter((t) => monthFilter === 'todos' || t.dueDate.slice(5, 7) === monthFilter)
      .filter((t) => clientFilter === 'todos' || t.clientId === clientFilter)
      .filter((t) => categoryFilter === 'todas' || t.category === categoryFilter)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  }, [transactions, monthFilter, clientFilter, categoryFilter])

  const total = filtered.reduce((s, t) => s + t.value, 0)
  const totalQuitado = filtered.filter((t) => t.status === 'Pago').reduce((s, t) => s + t.value, 0)

  const exportCsv = () => {
    const header = 'Data Venc.,Cliente,Categoria,Descricao,Status,Valor\n'
    const rows = filtered.map((t) =>
      [t.dueDate, clientName(t.clientId), t.category, t.description, t.status, t.value]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')
    ).join('\n')
    const blob = new Blob(['\ufeff' + header + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'relatorio-faturamento.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Relatórios"
        subtitle="Vendas detalhadas e auditoria de faturamento por cliente"
        icon={FileBarChart}
        actions={
          <>
            <button onClick={() => window.print()} className="flex items-center gap-1.5 text-[12px] font-semibold text-base-300 hover:text-base-100 bg-base-850 border border-base-700 rounded-lg px-3 py-1.5 transition">
              <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
            </button>
            <button onClick={exportCsv} className="flex items-center gap-1.5 text-[12px] font-semibold text-base-950 bg-positive-500 hover:bg-positive-400 rounded-lg px-3 py-1.5 transition">
              <Download className="w-3.5 h-3.5" /> Exportar CSV
            </button>
          </>
        }
      />

      <div className="px-6 mt-4">
        <Card className="p-4 mb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-44">
              <label className="text-[10px] font-bold uppercase tracking-wider text-base-500 block mb-1">Mês</label>
              <Select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
                <option value="todos">Todos os Meses</option>
                {MONTHS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
              </Select>
            </div>
            <div className="w-56">
              <label className="text-[10px] font-bold uppercase tracking-wider text-base-500 block mb-1">Cliente</label>
              <Select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
                <option value="todos">Todos os Clientes</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div className="w-56">
              <label className="text-[10px] font-bold uppercase tracking-wider text-base-500 block mb-1">Categoria</label>
              <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="todas">Todas as Receitas</option>
                {categoriesReceber.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <div className="ml-auto bg-accent-500/10 border border-accent-500/25 rounded-lg px-4 py-2 text-right">
              <p className="text-[10px] uppercase tracking-wider text-base-400 font-bold">Consolidado Filtrado</p>
              <p className="text-lg font-extrabold font-mono text-accent-300">{formatBRL(total)}</p>
              <p className="text-[10px] text-base-500">Quitado: {formatBRL(totalQuitado)}</p>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState icon={FileBarChart} title="Nenhum registro encontrado" description="Ajuste os filtros para visualizar os lançamentos." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-base-800 text-left">
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Nº</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Data Venc.</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Cliente</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Categoria</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Descrição</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Status</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t, idx) => (
                    <tr key={t.id} className="border-b border-base-800/60 hover:bg-base-850/40 transition">
                      <td className="px-4 py-2.5 text-base-500 text-[12px]">{idx + 1}</td>
                      <td className="px-4 py-2.5 text-base-300 text-[12px] whitespace-nowrap">{new Date(t.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                      <td className="px-4 py-2.5 font-semibold text-base-200 text-[12px]">{clientName(t.clientId)}</td>
                      <td className="px-4 py-2.5 text-base-400 text-[12px]">{t.category}</td>
                      <td className="px-4 py-2.5 text-base-400 text-[12px] max-w-[220px] truncate">{t.description}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={t.status} /></td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-positive-400 text-[12px]">{formatBRL(t.value)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-base-700">
                    <td colSpan={6} className="px-4 py-3 text-right text-[12px] font-bold text-base-300">Total Geral Consolidado:</td>
                    <td className="px-4 py-3 text-right font-mono font-extrabold text-accent-300 text-[13px]">{formatBRL(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
