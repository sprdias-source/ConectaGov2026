import { useMemo, useState } from 'react'
import { DollarSign, TrendingUp, Award, ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHeader, Card, EmptyState } from '../components/ui/Primitives'
import TopScrollTable from '../components/ui/TopScrollTable'
import { Select } from '../components/ui/FormControls'
import { SkeletonTableRows } from '../components/ui/Skeleton'
import { useTransactions } from '../hooks/useTransactions'
import { useBiddings } from '../hooks/useBiddings'
import { useClients } from '../hooks/useClients'
import { formatBRL } from '../hooks/useAccountBalances'
import { dateToLocalISO } from '../lib/dateUtils'

type FonteKey = 'comissao' | 'taxa' | 'mensalidade' | 'consultoria' | 'outras'
type Periodo = 'mes' | 'especifico' | '3m' | 'ano' | 'tudo'

const FONTES: { key: FonteKey; label: string; corDot: string; categorias: string[] }[] = [
  { key: 'comissao', label: 'Comissão de Êxito', corDot: 'bg-positive-400', categorias: ['Comissão de Êxito (Parcelada)', 'Comissão de Êxito (Recorrente)', 'Comissão de Êxito (Licitação Ganha)'] },
  { key: 'taxa', label: 'Taxa de Participação', corDot: 'bg-accent-400', categorias: ['Taxa de Participação Individual'] },
  { key: 'mensalidade', label: 'Mensalidade Assessoria', corDot: 'bg-warning-400', categorias: ['Mensalidade Assessoria'] },
  { key: 'consultoria', label: 'Consultoria Avulsa', corDot: 'bg-base-400', categorias: ['Consultoria Avulsa'] },
  { key: 'outras', label: 'Outras Receitas', corDot: 'bg-base-600', categorias: ['Outras Receitas'] },
]

const PERIODOS: { key: Periodo; label: string }[] = [
  { key: 'mes', label: 'Mês atual' },
  { key: 'especifico', label: 'Escolher mês' },
  { key: '3m', label: 'Últimos 3 meses' },
  { key: 'ano', label: 'Este ano' },
  { key: 'tudo', label: 'Tudo' },
]

function fonteDaCategoria(categoria: string): FonteKey | null {
  return FONTES.find((f) => f.categorias.includes(categoria))?.key ?? null
}

function addMonthsDate(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

function monthRange(d: Date): { start: string; end: string } {
  return {
    start: dateToLocalISO(new Date(d.getFullYear(), d.getMonth(), 1)),
    end: dateToLocalISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
  }
}

function getPeriodoRange(periodo: Periodo, mesEscolhido: Date): { start: string; end: string } | null {
  const hoje = new Date()
  if (periodo === 'mes') return monthRange(hoje)
  if (periodo === 'especifico') return monthRange(mesEscolhido)
  if (periodo === '3m') {
    return {
      start: dateToLocalISO(new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1)),
      end: dateToLocalISO(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)),
    }
  }
  if (periodo === 'ano') return { start: `${hoje.getFullYear()}-01-01`, end: `${hoje.getFullYear()}-12-31` }
  return null
}

type LinhaRentabilidade = {
  clientId: string
  cliente: string
  porFonte: Record<FonteKey, number>
  total: number
  licitacoesGanhas: number
  licitacoesGanhasPeriodo: number
  licitacoesDisputadas: number
  taxaExito: number
  ticketMedio: number
}

const FONTES_VAZIAS = (): Record<FonteKey, number> => ({ comissao: 0, taxa: 0, mensalidade: 0, consultoria: 0, outras: 0 })

export default function RentabilidadePage() {
  const { transactions, isLoading: loadingTx } = useTransactions()
  const { biddings, isLoading: loadingBiddings } = useBiddings()
  const { clients, isLoading: loadingClients } = useClients()

  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [mesEscolhido, setMesEscolhido] = useState(() => {
    const hoje = new Date()
    return new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  })
  const [clientId, setClientId] = useState('todos')
  const [fontesAtivas, setFontesAtivas] = useState<Record<FonteKey, boolean>>({
    comissao: true, taxa: true, mensalidade: true, consultoria: true, outras: true,
  })

  const range = useMemo(() => getPeriodoRange(periodo, mesEscolhido), [periodo, mesEscolhido])

  const linhas = useMemo(() => {
    const map = new Map<string, LinhaRentabilidade>()
    const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Cliente removido'

    const getOrCreate = (id: string): LinhaRentabilidade => {
      let entry = map.get(id)
      if (!entry) {
        entry = {
          clientId: id,
          cliente: clientName(id),
          porFonte: FONTES_VAZIAS(),
          total: 0,
          licitacoesGanhas: 0,
          licitacoesGanhasPeriodo: 0,
          licitacoesDisputadas: 0,
          taxaExito: 0,
          ticketMedio: 0,
        }
        map.set(id, entry)
      }
      return entry
    }

    for (const t of transactions) {
      if (t.status !== 'Pago' || !t.clientId) continue
      if (clientId !== 'todos' && t.clientId !== clientId) continue
      if (range && (!t.paymentDate || t.paymentDate < range.start || t.paymentDate > range.end)) continue
      const fonte = fonteDaCategoria(t.category)
      if (!fonte || !fontesAtivas[fonte]) continue
      const entry = getOrCreate(t.clientId)
      entry.porFonte[fonte] += t.value
      entry.total += t.value
    }

    for (const b of biddings) {
      if (b.status !== 'Ganhou' && b.status !== 'Perdeu') continue
      if (clientId !== 'todos' && b.clientId !== clientId) continue
      const entry = getOrCreate(b.clientId)
      entry.licitacoesDisputadas += 1
      if (b.status === 'Ganhou') entry.licitacoesGanhas += 1
      // Denominador do Ticket Médio: só conta como "ganha" dentro do mesmo
      // período usado para somar entry.total — senão o ticket médio mistura
      // receita filtrada por período com contagem de licitações de sempre.
      // dataAbertura é o campo de data já usado em todo o app pra licitação
      // (não existe um campo dedicado de "data em que foi ganha").
      if (b.status === 'Ganhou' && (!range || (b.dataAbertura >= range.start && b.dataAbertura <= range.end))) {
        entry.licitacoesGanhasPeriodo += 1
      }
    }

    // No modo "cliente específico" a linha aparece mesmo sem nenhum
    // histórico ainda — evita a tabela sumir e mostra o estado zerado.
    if (clientId !== 'todos') getOrCreate(clientId)

    return Array.from(map.values())
      .map((entry) => ({
        ...entry,
        taxaExito: entry.licitacoesDisputadas > 0 ? Math.round((entry.licitacoesGanhas / entry.licitacoesDisputadas) * 100) : 0,
        ticketMedio: entry.licitacoesGanhasPeriodo > 0 ? entry.total / entry.licitacoesGanhasPeriodo : 0,
      }))
      .sort((a, b) => b.total - a.total)
  }, [transactions, biddings, clients, range, fontesAtivas, clientId])

  const extrato = useMemo(() => {
    if (clientId === 'todos') return []
    return transactions
      .filter((t) => t.status === 'Pago' && t.clientId === clientId)
      .filter((t) => !range || (!!t.paymentDate && t.paymentDate >= range.start && t.paymentDate <= range.end))
      .filter((t) => {
        const fonte = fonteDaCategoria(t.category)
        return !!fonte && fontesAtivas[fonte]
      })
      .sort((a, b) => (b.paymentDate ?? '').localeCompare(a.paymentDate ?? ''))
  }, [transactions, clientId, range, fontesAtivas])

  const isLoading = loadingTx || loadingBiddings || loadingClients
  const fontesAtivasLista = FONTES.filter((f) => fontesAtivas[f.key])
  const nenhumaFonte = fontesAtivasLista.length === 0

  const fontesLabel = fontesAtivasLista.length === FONTES.length
    ? 'todas as fontes'
    : nenhumaFonte
      ? 'nenhuma fonte selecionada'
      : fontesAtivasLista.map((f) => f.label).join(' + ')

  const periodoHint = periodo === 'mes'
    ? 'no mês atual'
    : periodo === 'especifico'
      ? `em ${mesEscolhido.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`
      : periodo === '3m'
        ? 'nos últimos 3 meses'
        : periodo === 'ano'
          ? `em ${new Date().getFullYear()}`
          : 'em todo o histórico'

  const toggleFonte = (key: FonteKey) => setFontesAtivas((prev) => ({ ...prev, [key]: !prev[key] }))
  const toggleTodasFontes = () => {
    const todasLigadas = FONTES.every((f) => fontesAtivas[f.key])
    setFontesAtivas(Object.fromEntries(FONTES.map((f) => [f.key, !todasLigadas])) as Record<FonteKey, boolean>)
  }

  const clienteAtual = clientId !== 'todos' ? clients.find((c) => c.id === clientId) : null
  const linhaCliente = clientId !== 'todos' ? linhas.find((l) => l.clientId === clientId) : null

  const totalGeral = linhas.reduce((s, l) => s + l.total, 0)
  const melhorTicket = linhas.reduce((max, l) => (l.ticketMedio > max ? l.ticketMedio : max), 0)
  const clientesComRetorno = linhas.filter((l) => l.total > 0).length

  return (
    <div className="pb-10">
      <PageHeader
        title="Rentabilidade por Cliente"
        subtitle="Tudo que entrou de cada cliente — escolha o mês, o cliente e quais fontes de receita entram na conta"
        icon={DollarSign}
      />

      <div className="px-6 mt-4 flex flex-col gap-3">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-2.5">Período</p>
          <div className="flex flex-wrap gap-2">
            {PERIODOS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriodo(p.key)}
                className={`text-[12.5px] font-semibold px-3 py-1.5 rounded-lg border transition ${
                  periodo === p.key
                    ? 'bg-accent-500/15 border-accent-500/40 text-accent-300'
                    : 'bg-base-850 border-base-700 text-base-400 hover:text-base-200 hover:border-base-600'
                }`}
              >
                {p.key === 'especifico' && periodo === 'especifico'
                  ? mesEscolhido.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
                  : p.label}
              </button>
            ))}
          </div>

          {periodo === 'especifico' && (
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={() => setMesEscolhido((d) => addMonthsDate(d, -1))}
                className="w-8 h-8 rounded-lg border border-base-700 bg-base-850 text-base-400 hover:text-base-100 hover:border-base-600 flex items-center justify-center transition"
                aria-label="Mês anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-bold min-w-[130px] text-center capitalize text-base-100">
                {mesEscolhido.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
              </span>
              <button
                type="button"
                onClick={() => setMesEscolhido((d) => addMonthsDate(d, 1))}
                className="w-8 h-8 rounded-lg border border-base-700 bg-base-850 text-base-400 hover:text-base-100 hover:border-base-600 flex items-center justify-center transition"
                aria-label="Próximo mês"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <input
                type="month"
                className="bg-base-850 border border-base-700 rounded-lg px-2.5 py-1.5 text-xs text-base-200 outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400/30"
                value={`${mesEscolhido.getFullYear()}-${String(mesEscolhido.getMonth() + 1).padStart(2, '0')}`}
                onChange={(e) => {
                  const [y, m] = e.target.value.split('-').map(Number)
                  if (y && m) setMesEscolhido(new Date(y, m - 1, 1))
                }}
              />
            </div>
          )}
        </Card>

        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-2.5">Cliente</p>
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)} className="max-w-xs">
            <option value="todos">Todos os clientes</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Card>

        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-2.5">Fontes de receita consideradas</p>
          <div className="flex flex-wrap gap-2">
            {FONTES.map((f) => (
              <label
                key={f.key}
                className={`flex items-center gap-2 text-[12.5px] font-semibold px-3 py-2 rounded-lg border cursor-pointer transition ${
                  fontesAtivas[f.key]
                    ? 'bg-accent-500/10 border-accent-500/30 text-base-100'
                    : 'bg-base-850 border-base-700 text-base-500 hover:border-base-600'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${f.corDot} shrink-0`} />
                <input
                  type="checkbox"
                  className="accent-accent-400 w-3.5 h-3.5"
                  checked={fontesAtivas[f.key]}
                  onChange={() => toggleFonte(f.key)}
                />
                {f.label}
              </label>
            ))}
          </div>
          <button type="button" onClick={toggleTodasFontes} className="text-[11.5px] font-bold text-accent-400 hover:text-accent-300 underline underline-offset-2 mt-2.5">
            Marcar/desmarcar todas
          </button>
        </Card>
      </div>

      {isLoading ? (
        <div className="px-6 mt-4"><SkeletonTableRows linhas={6} colunas={7} /></div>
      ) : linhas.length === 0 ? (
        <div className="px-6 mt-4">
          <Card>
            <EmptyState icon={DollarSign} title="Sem dados ainda" description="Assim que houver receitas pagas ou licitações finalizadas, a rentabilidade por cliente aparece aqui." />
          </Card>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 px-6 mt-4">
            {clienteAtual ? (
              <>
                <Card className="p-4">
                  <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Total Recebido — {clienteAtual.name}</p>
                  <p className="text-2xl font-extrabold font-mono text-positive-400">{formatBRL(linhaCliente?.total ?? 0)}</p>
                  <p className="text-[11px] text-base-500">{fontesLabel}, {periodoHint}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Ticket Médio</p>
                  <p className="text-2xl font-extrabold font-mono text-accent-300">{linhaCliente && linhaCliente.ticketMedio > 0 ? formatBRL(linhaCliente.ticketMedio) : '—'}</p>
                  <p className="text-[11px] text-base-500">total recebido ÷ licitações ganhas</p>
                </Card>
                <Card className="p-4">
                  <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Disputas</p>
                  <p className="text-2xl font-extrabold font-mono text-base-100">{linhaCliente?.licitacoesGanhas ?? 0}/{linhaCliente?.licitacoesDisputadas ?? 0}</p>
                  <p className="text-[11px] text-base-500">licitações ganhas / disputadas (histórico completo)</p>
                </Card>
              </>
            ) : (
              <>
                <Card className="p-4">
                  <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Total Recebido (todos os clientes)</p>
                  <p className="text-2xl font-extrabold font-mono text-positive-400">{formatBRL(totalGeral)}</p>
                  <p className="text-[11px] text-base-500">{fontesLabel}, {periodoHint}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Melhor Ticket Médio</p>
                  <p className="text-2xl font-extrabold font-mono text-accent-300">{formatBRL(melhorTicket)}</p>
                  <p className="text-[11px] text-base-500">total recebido ÷ licitações ganhas, por cliente</p>
                </Card>
                <Card className="p-4">
                  <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Clientes com Retorno</p>
                  <p className="text-2xl font-extrabold font-mono text-base-100">{clientesComRetorno}</p>
                  <p className="text-[11px] text-base-500">de {linhas.length} clientes com histórico</p>
                </Card>
              </>
            )}
          </div>

          {clienteAtual ? (
            <div className="px-6 mt-4">
              <Card className="overflow-hidden">
                <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold px-4 pt-4">Extrato de {clienteAtual.name} no período</p>
                {extrato.length === 0 ? (
                  <p className="text-[12.5px] text-base-500 px-4 py-6 text-center">Nenhum pagamento de {clienteAtual.name} nas fontes/período selecionados.</p>
                ) : (
                  <div className="divide-y divide-base-800/60 mt-2">
                    {extrato.map((t) => {
                      const fonte = FONTES.find((f) => f.key === fonteDaCategoria(t.category))
                      return (
                        <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-1.5 h-1.5 rounded-full ${fonte?.corDot ?? 'bg-base-600'} shrink-0`} />
                            <div className="min-w-0">
                              <p className="text-[12.5px] text-base-200 truncate">{t.category}</p>
                              <p className="text-[11px] text-base-500">{t.paymentDate ? new Date(t.paymentDate + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) : '—'}</p>
                            </div>
                          </div>
                          <span className="font-mono font-bold text-[13px] text-positive-400 shrink-0">{formatBRL(t.value)}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            </div>
          ) : (
            <div className="px-6 mt-4">
              <Card className="overflow-hidden">
                <TopScrollTable>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-base-800 text-left">
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Cliente</th>
                        {fontesAtivasLista.map((f) => (
                          <th key={f.key} className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">{f.label}</th>
                        ))}
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right bg-base-850/40">Total</th>
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-center">Disputas</th>
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-center">Êxito</th>
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Ticket Médio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nenhumaFonte ? (
                        <tr><td colSpan={5} className="text-center text-base-500 text-[12.5px] py-8">Selecione ao menos uma fonte de receita acima</td></tr>
                      ) : (
                        linhas.map((l, idx) => (
                          <tr key={l.clientId} className="border-b border-base-800/60 hover:bg-base-850/40 transition">
                            <td className="px-4 py-3 font-semibold text-base-200 text-[13px]">
                              <div className="flex items-center gap-2">
                                {idx === 0 && l.total > 0 && <Award className="w-3.5 h-3.5 text-warning-400 shrink-0" />}
                                {l.cliente}
                              </div>
                            </td>
                            {fontesAtivasLista.map((f) => (
                              <td key={f.key} className="px-4 py-3 text-right font-mono text-[13px] text-base-300">
                                {l.porFonte[f.key] > 0 ? formatBRL(l.porFonte[f.key]) : <span className="text-base-600">—</span>}
                              </td>
                            ))}
                            <td className="px-4 py-3 text-right font-mono font-bold text-[13px] text-positive-400 bg-base-850/25">{formatBRL(l.total)}</td>
                            <td className="px-4 py-3 text-center text-[12px] text-base-400">{l.licitacoesGanhas}/{l.licitacoesDisputadas}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`text-[12px] font-bold ${l.taxaExito >= 50 ? 'text-positive-400' : 'text-warning-400'}`}>{l.taxaExito}%</span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-[13px] text-accent-300">{l.ticketMedio > 0 ? formatBRL(l.ticketMedio) : '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </TopScrollTable>
              </Card>
            </div>
          )}

          <p className="text-[11px] text-base-500 mt-2 px-6 flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3" />
            {clienteAtual
              ? `Extrato de ${clienteAtual.name} — considera apenas valores já pagos, no período e fontes selecionados acima.`
              : 'Ordenado por total recebido — considera apenas valores já pagos, no período e fontes selecionados acima.'}
          </p>
        </>
      )}
    </div>
  )
}
