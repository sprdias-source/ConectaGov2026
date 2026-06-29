import { useMemo } from 'react'
import {
  TrendingUp, TrendingDown, Wallet, Gavel, Clock, ArrowUpRight, ArrowDownRight,
  Target, AlertTriangle,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts'
import { PageHeader, KpiCard, Card, StatusBadge } from '../components/ui/Primitives'
import { todayLocalISO } from '../lib/dateUtils'
import { useClients } from '../hooks/useClients'
import { useBiddings } from '../hooks/useBiddings'
import { useTransactions } from '../hooks/useTransactions'
import { useFinancialAccounts } from '../hooks/useFinancialAccounts'
import { useAccountBalances, formatBRL } from '../hooks/useAccountBalances'

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export default function DashboardPage() {
  const { clients } = useClients()
  const { biddings } = useBiddings()
  const { transactions } = useTransactions()
  const { accounts } = useFinancialAccounts()
  const { patrimonioTotal } = useAccountBalances(accounts, transactions)

  const now = new Date()
  const currentYear = now.getFullYear()
  const todayStr = todayLocalISO()

  const kpis = useMemo(() => {
    const aReceberPendente = transactions
      .filter((t) => t.type === 'Receber' && t.status !== 'Pago')
      .reduce((sum, t) => sum + t.value, 0)

    const aPagarPendente = transactions
      .filter((t) => t.type === 'Pagar' && t.status !== 'Pago')
      .reduce((sum, t) => sum + t.value, 0)

    const atrasados = transactions.filter((t) => t.status === 'Atrasado')
    const atrasadosValor = atrasados.reduce((sum, t) => sum + t.value, 0)

    const comissaoProjetada = transactions
      .filter((t) => t.category === 'Comissão de Êxito (Projetada - 12 meses)' && t.status !== 'Pago')
      .reduce((sum, t) => sum + t.value, 0)

    return { aReceberPendente, aPagarPendente, atrasados: atrasados.length, atrasadosValor, comissaoProjetada }
  }, [transactions])

  const monthlyFlow = useMemo(() => {
    const data = MONTH_LABELS.map((label, idx) => {
      const monthStr = String(idx + 1).padStart(2, '0')
      const prefix = `${currentYear}-${monthStr}`
      const entradas = transactions
        .filter((t) => t.type === 'Receber' && t.status === 'Pago' && t.paymentDate?.startsWith(prefix))
        .reduce((s, t) => s + t.value, 0)
      const saidas = transactions
        .filter((t) => t.type === 'Pagar' && t.status === 'Pago' && t.paymentDate?.startsWith(prefix))
        .reduce((s, t) => s + t.value, 0)
      const aReceber = transactions
        .filter((t) => t.type === 'Receber' && t.dueDate.startsWith(prefix))
        .reduce((s, t) => s + t.value, 0)
      return { mes: label, entradas, saidas, saldo: entradas - saidas, aReceber }
    })
    return data
  }, [transactions, currentYear])

  const biddingFunnel = useMemo(() => {
    const total = biddings.length
    const ganhou = biddings.filter((b) => b.status === 'Ganhou').length
    const andamento = biddings.filter((b) => b.status === 'Em Andamento').length
    const perdeu = biddings.filter((b) => b.status === 'Perdeu').length
    return [
      { name: 'Em Andamento', value: andamento, color: 'var(--color-accent-400)' },
      { name: 'Ganhou', value: ganhou, color: 'var(--color-positive-400)' },
      { name: 'Perdeu', value: perdeu, color: 'var(--color-negative-400)' },
    ].filter((d) => d.value > 0).map((d) => ({ ...d, total }))
  }, [biddings])

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    transactions
      .filter((t) => t.type === 'Receber' && t.status !== 'Pago')
      .forEach((t) => map.set(t.category, (map.get(t.category) ?? 0) + t.value))
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)
  }, [transactions])

  const upcoming = useMemo(() => {
    return transactions
      .filter((t) => t.status !== 'Pago' && t.dueDate >= todayStr)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 6)
  }, [transactions, todayStr])

  const winRate = biddings.length > 0
    ? Math.round((biddings.filter((b) => b.status === 'Ganhou').length / biddings.filter((b) => b.status !== 'Em Andamento').length || 0) * 100)
    : 0

  return (
    <div className="pb-10">
      <PageHeader
        title="Dashboard"
        subtitle={`Visão consolidada do negócio — ${clients.length} clientes ativos, ${biddings.length} licitações monitoradas`}
        icon={Target}
      />

      {/* KPIs principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-6 mt-4">
        <KpiCard
          label="Patrimônio Total"
          value={formatBRL(patrimonioTotal)}
          icon={Wallet}
          tone={patrimonioTotal >= 0 ? 'positive' : 'negative'}
        />
        <KpiCard
          label="A Receber (Pendente)"
          value={formatBRL(kpis.aReceberPendente)}
          icon={ArrowUpRight}
          tone="accent"
        />
        <KpiCard
          label="A Pagar (Pendente)"
          value={formatBRL(kpis.aPagarPendente)}
          icon={ArrowDownRight}
          tone="warning"
        />
        <KpiCard
          label="Em Atraso"
          value={formatBRL(kpis.atrasadosValor)}
          sublabel={`${kpis.atrasados} lançamento(s)`}
          icon={AlertTriangle}
          tone={kpis.atrasados > 0 ? 'negative' : 'neutral'}
        />
      </div>

      {/* Gráfico principal: fluxo de caixa anual */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 px-6 mt-4">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-base-100">Fluxo de Caixa — {currentYear}</h3>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1.5 text-base-400"><span className="w-2 h-2 rounded-full bg-positive-400" />Entradas</span>
              <span className="flex items-center gap-1.5 text-base-400"><span className="w-2 h-2 rounded-full bg-negative-400" />Saídas</span>
            </div>
          </div>
          <p className="text-[12px] text-base-500 mb-3">Valores efetivamente liquidados (pagos/recebidos) por mês</p>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={monthlyFlow} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="gradEntradas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-positive-400)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--color-positive-400)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradSaidas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-negative-400)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--color-negative-400)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-base-800)" vertical={false} />
              <XAxis dataKey="mes" stroke="var(--color-base-500)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--color-base-500)" fontSize={11} tickLine={false} axisLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: 'var(--color-base-900)', border: '1px solid var(--color-base-700)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: 'var(--color-base-200)' }}
                formatter={(value) => formatBRL(Number(value ?? 0))}
              />
              <Area type="monotone" dataKey="entradas" stroke="var(--color-positive-400)" fill="url(#gradEntradas)" strokeWidth={2} />
              <Area type="monotone" dataKey="saidas" stroke="var(--color-negative-400)" fill="url(#gradSaidas)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-bold text-base-100 mb-1">Funil de Licitações</h3>
          <p className="text-[12px] text-base-500 mb-3">Taxa de êxito: <span className="text-positive-400 font-semibold">{winRate}%</span></p>
          {biddingFunnel.length === 0 ? (
            <div className="flex items-center justify-center h-[200px] text-base-500 text-sm">Sem licitações cadastradas</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={biddingFunnel}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {biddingFunnel.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'var(--color-base-900)', border: '1px solid var(--color-base-700)', borderRadius: 8, fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="flex flex-col gap-1.5 mt-2">
            {biddingFunnel.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-[12px]">
                <span className="flex items-center gap-1.5 text-base-300">
                  <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                  {d.name}
                </span>
                <span className="font-mono font-semibold text-base-200">{d.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Segunda linha: categorias + próximos vencimentos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 px-6 mt-4">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-base-100">Receitas Pendentes por Categoria</h3>
            <TrendingUp className="w-4 h-4 text-accent-400" />
          </div>
          {categoryBreakdown.length === 0 ? (
            <div className="flex items-center justify-center h-[180px] text-base-500 text-sm">Sem receitas pendentes</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryBreakdown} layout="vertical" margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-base-800)" horizontal={false} />
                <XAxis type="number" stroke="var(--color-base-500)" fontSize={11} tickLine={false} axisLine={false}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="var(--color-base-400)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={170}
                  tick={{ fill: 'var(--color-base-300)' }}
                />
                <Tooltip
                  contentStyle={{ background: 'var(--color-base-900)', border: '1px solid var(--color-base-700)', borderRadius: 8, fontSize: 12 }}
                  formatter={(value) => formatBRL(Number(value ?? 0))}
                  cursor={{ fill: 'var(--color-base-800)', opacity: 0.4 }}
                />
                <Bar dataKey="value" fill="var(--color-accent-500)" radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-base-100">Próximos Vencimentos</h3>
            <Clock className="w-4 h-4 text-warning-400" />
          </div>
          {upcoming.length === 0 ? (
            <div className="text-base-500 text-sm py-6 text-center">Nenhum vencimento futuro</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {upcoming.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 pb-2.5 border-b border-base-800 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-base-200 truncate">{t.description}</p>
                    <p className="text-[10px] text-base-500 mt-0.5">
                      {new Date(t.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-[12px] font-bold font-mono ${t.type === 'Receber' ? 'text-positive-400' : 'text-negative-300'}`}>
                      {t.type === 'Receber' ? '+' : '−'}{formatBRL(t.value)}
                    </p>
                    <StatusBadge status={t.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Comissões projetadas — destaque para o modelo de negócio de êxito */}
      {kpis.comissaoProjetada > 0 && (
        <div className="px-6 mt-4">
          <Card className="p-5 bg-gradient-to-r from-accent-500/10 to-transparent border-accent-500/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-500/15 flex items-center justify-center">
                <Gavel className="w-5 h-5 text-accent-400" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-base-400 font-bold">Comissões de Êxito Projetadas (12 meses)</p>
                <p className="text-xl font-extrabold font-mono text-accent-300 tracking-tight">{formatBRL(kpis.comissaoProjetada)}</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {kpis.atrasados > 0 && (
        <div className="px-6 mt-4">
          <Card className="p-4 border-negative-500/30 bg-negative-500/5 flex items-center gap-3">
            <TrendingDown className="w-4 h-4 text-negative-400 shrink-0" />
            <p className="text-[13px] text-negative-300">
              Você tem <strong>{kpis.atrasados}</strong> lançamento(s) em atraso totalizando{' '}
              <strong>{formatBRL(kpis.atrasadosValor)}</strong>. Revise em Transações.
            </p>
          </Card>
        </div>
      )}
    </div>
  )
}
