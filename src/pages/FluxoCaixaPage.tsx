import { useMemo, useState } from 'react'
import { CalendarRange, ArrowUpCircle, ArrowDownCircle } from 'lucide-react'
import { PageHeader, Card, StatusBadge } from '../components/ui/Primitives'
import { formatBRL } from '../hooks/useAccountBalances'
import { useTransactions } from '../hooks/useTransactions'
import { useClients } from '../hooks/useClients'

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export default function FluxoCaixaPage() {
  const { transactions } = useTransactions()
  const { clients } = useClients()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [activeMonth, setActiveMonth] = useState(now.getMonth())

  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name ?? '—'

  const yearly = useMemo(() => {
    return MONTHS.map((label, idx) => {
      const m = String(idx + 1).padStart(2, '0')
      const prefix = `${year}-${m}`
      const aReceber = transactions.filter((t) => t.type === 'Receber' && t.dueDate.startsWith(prefix)).reduce((s, t) => s + t.value, 0)
      const aPagar = transactions.filter((t) => t.type === 'Pagar' && t.dueDate.startsWith(prefix)).reduce((s, t) => s + t.value, 0)
      const entradas = transactions.filter((t) => t.type === 'Receber' && t.status === 'Pago' && t.paymentDate?.startsWith(prefix)).reduce((s, t) => s + t.value, 0)
      const saidas = transactions.filter((t) => t.type === 'Pagar' && t.status === 'Pago' && t.paymentDate?.startsWith(prefix)).reduce((s, t) => s + t.value, 0)
      return { label, monthIndex: idx, aReceber, aPagar, entradas, saidas, saldo: entradas - saidas }
    })
  }, [transactions, year])

  const monthStr = String(activeMonth + 1).padStart(2, '0')
  const prefix = `${year}-${monthStr}`
  const monthTxs = transactions.filter((t) => t.dueDate.startsWith(prefix) || t.paymentDate?.startsWith(prefix))
  const liquidados = monthTxs.filter((t) => t.status === 'Pago')
  const previstos = monthTxs.filter((t) => t.status !== 'Pago')

  const totalEntradas = liquidados.filter((t) => t.type === 'Receber').reduce((s, t) => s + t.value, 0)
  const totalSaidas = liquidados.filter((t) => t.type === 'Pagar').reduce((s, t) => s + t.value, 0)
  const aReceberProjetado = previstos.filter((t) => t.type === 'Receber').reduce((s, t) => s + t.value, 0)
  const aPagarAgendado = previstos.filter((t) => t.type === 'Pagar').reduce((s, t) => s + t.value, 0)

  return (
    <div className="pb-10">
      <PageHeader title="Fluxo de Caixa" subtitle={`Painel geral do exercício financeiro — ${year}`} icon={CalendarRange} />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 px-6 mt-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-base-400">Competência</span>
            <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="bg-base-850 border border-base-700 rounded-md text-xs px-2 py-1 text-base-200">
              {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {yearly.map((m) => (
              <button
                key={m.label}
                onClick={() => setActiveMonth(m.monthIndex)}
                className={`text-left px-2.5 py-2 rounded-lg text-[11px] font-semibold transition border ${
                  activeMonth === m.monthIndex
                    ? 'bg-accent-500 text-base-950 border-accent-500'
                    : 'bg-base-850 text-base-300 border-base-700 hover:border-base-600'
                }`}
              >
                {String(m.monthIndex + 1).padStart(2, '0')}. {m.label}
              </button>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-3 p-4">
          <h3 className="text-sm font-bold text-base-100 mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-400" />
            Resumo Consolidado do Exercício — {year}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-base-500 uppercase text-[10px] font-bold tracking-wider">
                  <th className="py-1.5 pr-3">Mês</th>
                  <th className="py-1.5 pr-3 text-right">A Receber</th>
                  <th className="py-1.5 pr-3 text-right">A Pagar</th>
                  <th className="py-1.5 pr-3 text-right">Entradas Reais</th>
                  <th className="py-1.5 pr-3 text-right">Saídas Reais</th>
                  <th className="py-1.5 text-right">Saldo do Mês</th>
                </tr>
              </thead>
              <tbody>
                {yearly.map((m) => (
                  <tr
                    key={m.label}
                    onClick={() => setActiveMonth(m.monthIndex)}
                    className={`cursor-pointer border-t border-base-800/60 transition ${activeMonth === m.monthIndex ? 'bg-accent-500/10' : 'hover:bg-base-850/40'}`}
                  >
                    <td className="py-2 pr-3 font-semibold text-base-200 flex items-center gap-1.5">
                      {activeMonth === m.monthIndex && <span className="w-1.5 h-1.5 rounded-full bg-accent-400" />}
                      {m.label}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-accent-300">{m.aReceber > 0 ? formatBRL(m.aReceber) : '—'}</td>
                    <td className="py-2 pr-3 text-right font-mono text-base-400">{m.aPagar > 0 ? formatBRL(m.aPagar) : '—'}</td>
                    <td className="py-2 pr-3 text-right font-mono text-positive-400">{m.entradas > 0 ? formatBRL(m.entradas) : '—'}</td>
                    <td className="py-2 pr-3 text-right font-mono text-negative-300">{m.saidas > 0 ? formatBRL(m.saidas) : '—'}</td>
                    <td className="py-2 text-right font-mono font-bold text-base-100">{formatBRL(m.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Detalhamento do mês ativo */}
      <div className="px-6 mt-4">
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-accent-400 font-bold">Lançamentos de Caixa Detalhados</p>
              <h3 className="font-display font-bold text-base text-base-100">Competência Ativa: {MONTHS[activeMonth].toUpperCase()} {year}</h3>
            </div>
            <div className="flex gap-2">
              <div className="bg-base-850 border border-base-700 rounded-lg px-3 py-1.5 text-center">
                <p className="text-[9px] uppercase text-base-500 font-bold">Entradas</p>
                <p className="text-positive-400 font-mono font-bold text-sm">{formatBRL(totalEntradas)}</p>
              </div>
              <div className="bg-base-850 border border-base-700 rounded-lg px-3 py-1.5 text-center">
                <p className="text-[9px] uppercase text-base-500 font-bold">Saídas</p>
                <p className="text-negative-300 font-mono font-bold text-sm">{formatBRL(totalSaidas)}</p>
              </div>
              <div className="bg-positive-500/10 border border-positive-500/25 rounded-lg px-3 py-1.5 text-center">
                <p className="text-[9px] uppercase text-base-500 font-bold">Saldo Mensal</p>
                <p className="text-positive-400 font-mono font-bold text-sm">{formatBRL(totalEntradas - totalSaidas)}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-positive-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-positive-400" /> Fluxos Liquidados
                </span>
                <span className="text-[10px] bg-base-850 border border-base-700 rounded-full px-2 py-0.5 text-base-400">{liquidados.length} itens pagos</span>
              </div>
              {liquidados.length === 0 ? (
                <div className="text-base-500 text-[13px] py-6 text-center border border-dashed border-base-800 rounded-lg">Nenhum item liquidado neste mês</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {liquidados.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-2 bg-base-850/60 rounded-lg px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-[12px] font-medium text-base-200 truncate">{t.description}</p>
                        <p className="text-[10px] text-base-500">{clientName(t.clientId)} · {new Date(t.paymentDate ?? t.dueDate).toLocaleDateString('pt-BR')}</p>
                      </div>
                      <span className={`font-mono font-bold text-[12px] shrink-0 ${t.type === 'Receber' ? 'text-positive-400' : 'text-negative-300'}`}>
                        {t.type === 'Receber' ? '+' : '−'}{formatBRL(t.value)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-warning-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-warning-400" /> Previsão e Agendamentos
                </span>
                <span className="text-[10px] bg-base-850 border border-base-700 rounded-full px-2 py-0.5 text-base-400">{previstos.length} aberta(s)</span>
              </div>
              {previstos.length === 0 ? (
                <div className="text-base-500 text-[13px] py-6 text-center border border-dashed border-base-800 rounded-lg">Nenhuma previsão pendente</div>
              ) : (
                <div className="flex flex-col gap-1.5 max-h-[260px] overflow-y-auto">
                  {previstos.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-2 bg-base-850/60 rounded-lg px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-[12px] font-medium text-base-200 truncate">{t.description}</p>
                        <p className="text-[10px] text-base-500">{new Date(t.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={t.status} />
                        <span className="font-mono font-bold text-[12px] text-base-300">{formatBRL(t.value)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-base-800 mt-3 pt-3 flex flex-col gap-1.5 text-[12px]">
                <div className="flex justify-between">
                  <span className="text-base-400 flex items-center gap-1.5"><ArrowUpCircle className="w-3.5 h-3.5 text-positive-400" /> A receber projetado</span>
                  <span className="font-mono font-bold text-positive-400">{formatBRL(aReceberProjetado)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-base-400 flex items-center gap-1.5"><ArrowDownCircle className="w-3.5 h-3.5 text-negative-400" /> A pagar agendado</span>
                  <span className="font-mono font-bold text-negative-300">{formatBRL(aPagarAgendado)}</span>
                </div>
                <div className="flex justify-between border-t border-base-800 pt-1.5 mt-1">
                  <span className="text-base-200 font-bold">Saldo líquido estimado mês</span>
                  <span className="font-mono font-extrabold text-accent-300">{formatBRL(totalEntradas - totalSaidas + aReceberProjetado - aPagarAgendado)}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
