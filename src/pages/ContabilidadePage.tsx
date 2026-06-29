import { useMemo, useState } from 'react'
import { Calculator, TrendingUp, Target, Scale, ShieldCheck, Printer, Activity, AlertTriangle, PieChart as PieIcon } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { PageHeader, Card } from '../components/ui/Primitives'
import { Field, Input, Select } from '../components/ui/FormControls'
import { useTransactions } from '../hooks/useTransactions'
import { useBiddings } from '../hooks/useBiddings'
import { useClients } from '../hooks/useClients'
import { useFinancialAccounts } from '../hooks/useFinancialAccounts'
import { useAccountBalances, formatBRL } from '../hooks/useAccountBalances'

export default function ContabilidadePage() {
  const { transactions } = useTransactions()
  const { biddings } = useBiddings()
  const { clients } = useClients()
  const { accounts } = useFinancialAccounts()
  const { patrimonioTotal } = useAccountBalances(accounts, transactions)

  const currentYear = new Date().getFullYear()
  const [dreYear, setDreYear] = useState(currentYear)

  const dre = useMemo(() => {
    const receitas = transactions.filter((t) => t.type === 'Receber' && t.status === 'Pago' && t.dueDate.startsWith(String(currentYear))).reduce((s, t) => s + t.value, 0)
    const despesas = transactions.filter((t) => t.type === 'Pagar' && t.status === 'Pago' && t.dueDate.startsWith(String(currentYear))).reduce((s, t) => s + t.value, 0)
    const lucro = receitas - despesas
    return { receitas, despesas, lucro }
  }, [transactions, currentYear])

  // DRE detalhado por categoria, para o ano selecionado no exportável —
  // formato reconhecível por um contador (receitas e despesas agrupadas
  // por categoria, com total e resultado do exercício).
  const dreDetalhado = useMemo(() => {
    const paidInYear = transactions.filter((t) => t.status === 'Pago' && t.paymentDate?.startsWith(String(dreYear)))

    const receitasPorCategoria = new Map<string, number>()
    const despesasPorCategoria = new Map<string, number>()

    for (const t of paidInYear) {
      const map = t.type === 'Receber' ? receitasPorCategoria : despesasPorCategoria
      map.set(t.category, (map.get(t.category) ?? 0) + t.value)
    }

    const receitas = Array.from(receitasPorCategoria.entries()).map(([category, value]) => ({ category, value })).sort((a, b) => b.value - a.value)
    const despesas = Array.from(despesasPorCategoria.entries()).map(([category, value]) => ({ category, value })).sort((a, b) => b.value - a.value)
    const totalReceitas = receitas.reduce((s, r) => s + r.value, 0)
    const totalDespesas = despesas.reduce((s, d) => s + d.value, 0)

    return { receitas, despesas, totalReceitas, totalDespesas, resultado: totalReceitas - totalDespesas }
  }, [transactions, dreYear])

  const availableYears = useMemo(() => {
    const years = new Set(transactions.map((t) => Number(t.dueDate.slice(0, 4))))
    years.add(currentYear)
    return Array.from(years).sort((a, b) => b - a)
  }, [transactions, currentYear])

  // --- Indicadores de Saúde Financeira -------------------------------------

  // MRR (Receita Mensal Recorrente): soma das mensalidades de clientes
  // ativos — é o "piso" de receita previsível, independente de novas vendas.
  const mrr = useMemo(
    () => clients.filter((c) => c.isActive && c.isMensalista).reduce((s, c) => s + (c.valorMensalidade ?? 0), 0),
    [clients]
  )

  // Burn rate: média de despesas pagas nos últimos 3 meses completos —
  // usado para estimar o "runway" (quantos meses o caixa atual sustenta
  // a operação, mesmo sem nenhuma receita nova entrando).
  const { burnRate, runwayMeses } = useMemo(() => {
    const now = new Date()
    let total = 0
    for (let i = 1; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      total += transactions
        .filter((t) => t.type === 'Pagar' && t.status === 'Pago' && t.paymentDate?.startsWith(prefix))
        .reduce((s, t) => s + t.value, 0)
    }
    const media = total / 3
    const runway = media > 0 ? patrimonioTotal / media : Infinity
    return { burnRate: media, runwayMeses: runway }
  }, [transactions, patrimonioTotal])

  // Concentração de receita: quanto % da receita recebida vem do maior
  // cliente — risco de dependência excessiva de um único contrato.
  const concentracaoReceita = useMemo(() => {
    const recebidoPorCliente = new Map<string, number>()
    let totalRecebido = 0
    for (const t of transactions) {
      if (t.type !== 'Receber' || t.status !== 'Pago' || !t.clientId) continue
      recebidoPorCliente.set(t.clientId, (recebidoPorCliente.get(t.clientId) ?? 0) + t.value)
      totalRecebido += t.value
    }
    if (totalRecebido === 0) return { percentual: 0, clienteNome: null as string | null }
    let maiorClienteId: string | null = null
    let maiorValor = 0
    for (const [clientId, valor] of recebidoPorCliente.entries()) {
      if (valor > maiorValor) { maiorValor = valor; maiorClienteId = clientId }
    }
    const clienteNome = clients.find((c) => c.id === maiorClienteId)?.name ?? null
    return { percentual: Math.round((maiorValor / totalRecebido) * 100), clienteNome }
  }, [transactions, clients])

  // Inadimplência: % do valor a receber (pendente) que já está atrasado
  const inadimplencia = useMemo(() => {
    const pendente = transactions.filter((t) => t.type === 'Receber' && t.status !== 'Pago')
    const totalPendente = pendente.reduce((s, t) => s + t.value, 0)
    const totalAtrasado = pendente.filter((t) => t.status === 'Atrasado').reduce((s, t) => s + t.value, 0)
    return totalPendente > 0 ? Math.round((totalAtrasado / totalPendente) * 100) : 0
  }, [transactions])

  // Ciclo médio de recebimento: dias entre vencimento e pagamento real,
  // nas transações já pagas — indica se você recebe no prazo ou atrasado
  // na média (negativo = recebe adiantado, positivo = recebe atrasado).
  const cicloMedioRecebimento = useMemo(() => {
    const pagas = transactions.filter((t) => t.type === 'Receber' && t.status === 'Pago' && t.paymentDate)
    if (pagas.length === 0) return null
    const dias = pagas.map((t) => {
      const venc = new Date(t.dueDate + 'T12:00:00').getTime()
      const pago = new Date(t.paymentDate + 'T12:00:00').getTime()
      return Math.round((pago - venc) / (1000 * 60 * 60 * 24))
    })
    return Math.round(dias.reduce((s, d) => s + d, 0) / dias.length)
  }, [transactions])

  // Tendência dos últimos 6 meses: receitas, despesas e resultado —
  // permite visualizar se a empresa está em trajetória de crescimento,
  // estável, ou em deterioração.
  const tendencia6Meses = useMemo(() => {
    const now = new Date()
    const result: { mes: string; receitas: number; despesas: number; resultado: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const receitas = transactions
        .filter((t) => t.type === 'Receber' && t.status === 'Pago' && t.paymentDate?.startsWith(prefix))
        .reduce((s, t) => s + t.value, 0)
      const despesas = transactions
        .filter((t) => t.type === 'Pagar' && t.status === 'Pago' && t.paymentDate?.startsWith(prefix))
        .reduce((s, t) => s + t.value, 0)
      result.push({
        mes: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
        receitas, despesas, resultado: receitas - despesas,
      })
    }
    return result
  }, [transactions])

  // Composição da receita pendente por categoria (visão de carteira)
  const composicaoReceitaPendente = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of transactions) {
      if (t.type !== 'Receber' || t.status === 'Pago') continue
      map.set(t.category, (map.get(t.category) ?? 0) + t.value)
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6)
  }, [transactions])

  // Simulador de liquidez — campos editáveis pelo usuário
  const [ativoCirculante, setAtivoCirculante] = useState(0)
  const [ativoNaoCirculante, setAtivoNaoCirculante] = useState(0)
  const [passivoCirculante, setPassivoCirculante] = useState(0)
  const [passivoNaoCirculante, setPassivoNaoCirculante] = useState(0)

  const liquidezCorrente = passivoCirculante > 0 ? ativoCirculante / passivoCirculante : 0
  const liquidezGeral = (passivoCirculante + passivoNaoCirculante) > 0
    ? (ativoCirculante + ativoNaoCirculante) / (passivoCirculante + passivoNaoCirculante)
    : 0
  const habilitado = liquidezCorrente >= 1 && liquidezGeral >= 1

  // Funil de licitações
  const editaisMonitorados = biddings.length
  const propostasEnviadas = biddings.filter((b) => b.status !== 'Em Andamento' || true).length
  const disputasVencidas = biddings.filter((b) => b.status === 'Ganhou').length
  const finalizadas = biddings.filter((b) => b.status === 'Ganhou' || b.status === 'Perdeu').length
  const taxaVitoria = finalizadas > 0 ? Math.round((disputasVencidas / finalizadas) * 100) : 0

  // Ticket médio
  const ticketMedio = disputasVencidas > 0
    ? biddings.filter((b) => b.status === 'Ganhou').reduce((s, b) => s + b.valorLicitado, 0) / disputasVencidas
    : 0
  const receitaMediaExito = ticketMedio * 0.025

  return (
    <div className="pb-10">
      <PageHeader
        title="Controladoria Licitatória & DRE Societário"
        subtitle="Indicadores fiduciários, funil de conversão de editais e verificação de índices de liquidez para habilitação jurídica."
        icon={Calculator}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-6 mt-4">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Margem de Contribuição</p>
          <p className="text-lg font-extrabold font-mono text-accent-300">{formatBRL(dre.lucro)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Receita Bruta ({currentYear})</p>
          <p className="text-lg font-extrabold font-mono text-positive-400">{formatBRL(dre.receitas)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Despesas Totais</p>
          <p className="text-lg font-extrabold font-mono text-negative-400">{formatBRL(dre.despesas)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Margem Líquida</p>
          <p className="text-lg font-extrabold font-mono text-base-100">
            {dre.receitas > 0 ? `${((dre.lucro / dre.receitas) * 100).toFixed(1)}%` : '—'}
          </p>
        </Card>
      </div>

      {/* Saúde Financeira da Operação */}
      <div className="px-6 mt-6">
        <div className="flex items-center gap-2 mb-1">
          <Activity className="w-4 h-4 text-accent-400" />
          <h2 className="font-display font-bold text-base text-base-100">Saúde Financeira da Operação</h2>
        </div>
        <p className="text-[12px] text-base-500 mb-3">Indicadores de sustentabilidade, previsibilidade e risco do negócio — não só o resultado contábil.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-6">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Receita Recorrente (MRR)</p>
          <p className="text-lg font-extrabold font-mono text-accent-300">{formatBRL(mrr)}</p>
          <p className="text-[10px] text-base-500 mt-1">Piso previsível por mês, vindo de mensalistas ativos</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Burn Rate Mensal</p>
          <p className="text-lg font-extrabold font-mono text-negative-300">{formatBRL(burnRate)}</p>
          <p className="text-[10px] text-base-500 mt-1">Média de despesas pagas nos últimos 3 meses</p>
        </Card>
        <Card className={`p-4 ${runwayMeses < 6 ? 'bg-base-850/80 border-warning-500/40 shadow-[0_0_0_1px_rgba(217,154,31,0.1)]' : ''}`}>
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Runway (Fôlego de Caixa)</p>
          <p className={`text-lg font-extrabold font-mono ${runwayMeses < 3 ? 'text-negative-400' : runwayMeses < 6 ? 'text-warning-400' : 'text-positive-400'}`}>
            {runwayMeses === Infinity ? '∞' : `${runwayMeses.toFixed(1)} meses`}
          </p>
          <p className="text-[10px] text-base-500 mt-1">Quanto tempo o caixa atual sustenta, sem receita nova</p>
        </Card>
        <Card className={`p-4 ${inadimplencia > 10 ? 'bg-base-850/80 border-warning-500/40 shadow-[0_0_0_1px_rgba(217,154,31,0.1)]' : ''}`}>
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Inadimplência da Carteira</p>
          <p className={`text-lg font-extrabold font-mono ${inadimplencia > 30 ? 'text-negative-400' : inadimplencia > 10 ? 'text-warning-400' : 'text-positive-400'}`}>
            {inadimplencia}%
          </p>
          <p className="text-[10px] text-base-500 mt-1">do valor a receber pendente já está atrasado</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 px-6 mt-4">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-accent-400" />
            <h3 className="text-sm font-bold text-base-100">Tendência dos Últimos 6 Meses</h3>
          </div>
          <p className="text-[12px] text-base-500 mb-3">Receitas, despesas e resultado mensal — para identificar trajetória, não só o instante atual</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={tendencia6Meses} margin={{ left: -15, right: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-base-800)" vertical={false} />
              <XAxis dataKey="mes" stroke="var(--color-base-500)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--color-base-500)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: 'var(--color-base-900)', border: '1px solid var(--color-base-700)', borderRadius: 8, fontSize: 12 }}
                formatter={(value) => formatBRL(Number(value))}
              />
              <Line type="monotone" dataKey="receitas" stroke="var(--color-positive-400)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="despesas" stroke="var(--color-negative-300)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="resultado" stroke="var(--color-accent-400)" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 text-[11px]">
            <span className="flex items-center gap-1.5 text-base-400"><span className="w-2 h-2 rounded-full bg-positive-400" />Receitas</span>
            <span className="flex items-center gap-1.5 text-base-400"><span className="w-2 h-2 rounded-full bg-negative-300" />Despesas</span>
            <span className="flex items-center gap-1.5 text-base-400"><span className="w-2 h-2 rounded-full bg-accent-400" />Resultado</span>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-accent-400" />
            <h3 className="text-sm font-bold text-base-100">Risco de Concentração</h3>
          </div>
          <p className="text-[12px] text-base-500 mb-3">Dependência de um único cliente na receita recebida</p>
          <div className="flex items-center justify-center py-4">
            <div className="relative w-24 h-24">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-base-800)" strokeWidth="10" />
                <circle
                  cx="50" cy="50" r="42" fill="none"
                  stroke={concentracaoReceita.percentual > 50 ? 'var(--color-negative-400)' : concentracaoReceita.percentual > 30 ? 'var(--color-warning-400)' : 'var(--color-positive-400)'}
                  strokeWidth="10" strokeDasharray={`${(concentracaoReceita.percentual / 100) * 264} 264`} strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-extrabold text-base-100">{concentracaoReceita.percentual}%</span>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-base-500 text-center">
            {concentracaoReceita.clienteNome
              ? <>vem de <strong className="text-base-300">{concentracaoReceita.clienteNome}</strong></>
              : 'Sem dados suficientes ainda'}
          </p>
          {concentracaoReceita.percentual > 50 && (
            <p className="text-[10px] text-negative-400 text-center mt-2">Alta dependência — considere diversificar a carteira</p>
          )}

          {cicloMedioRecebimento !== null && (
            <div className="border-t border-base-800 mt-4 pt-3 flex justify-between items-center">
              <span className="text-[11px] text-base-400">Ciclo médio de recebimento</span>
              <span className={`text-sm font-bold font-mono ${cicloMedioRecebimento > 5 ? 'text-warning-400' : 'text-positive-400'}`}>
                {cicloMedioRecebimento > 0 ? `+${cicloMedioRecebimento}` : cicloMedioRecebimento} dias
              </span>
            </div>
          )}
        </Card>
      </div>

      {composicaoReceitaPendente.length > 0 && (
        <div className="px-6 mt-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <PieIcon className="w-4 h-4 text-accent-400" />
              <h3 className="text-sm font-bold text-base-100">Composição da Carteira a Receber</h3>
            </div>
            <p className="text-[12px] text-base-500 mb-3">De onde vem o que ainda está pendente de recebimento, por categoria</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={composicaoReceitaPendente} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3} strokeWidth={0}>
                    {composicaoReceitaPendente.map((entry, idx) => (
                      <Cell key={entry.name} fill="var(--color-accent-400)" opacity={1 - idx * 0.13} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'var(--color-base-900)', border: '1px solid var(--color-base-700)', borderRadius: 8, fontSize: 12 }}
                    formatter={(value) => formatBRL(Number(value))}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-2">
                {composicaoReceitaPendente.map((c) => (
                  <div key={c.name} className="flex justify-between text-[12px]">
                    <span className="text-base-400">{c.name}</span>
                    <span className="font-mono font-semibold text-base-200">{formatBRL(c.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 px-6 mt-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-accent-400" />
            <h3 className="text-sm font-bold text-base-100">Matriz de Conversão Licitatória</h3>
          </div>
          <div className="flex flex-col gap-3">
            <FunnelStep label="1. Editais Monitorados" value={editaisMonitorados} percent={100} color="bg-accent-500" />
            <FunnelStep label="2. Propostas Enviadas" value={propostasEnviadas} percent={editaisMonitorados > 0 ? Math.round((propostasEnviadas / editaisMonitorados) * 100) : 0} color="bg-warning-500" />
            <FunnelStep label="3. Disputas Vencidas" value={disputasVencidas} percent={editaisMonitorados > 0 ? Math.round((disputasVencidas / editaisMonitorados) * 100) : 0} color="bg-positive-500" />
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4 text-accent-400" />
            <h3 className="text-sm font-bold text-base-100">Ticket Médio por Licitação Ganha</h3>
          </div>
          <p className="text-[12px] text-base-500 mb-3">Avalia a receita em potencial e permite planejar sobre as licitações que trazem maior retorno.</p>
          <div className="bg-base-850/60 rounded-lg p-3 mb-2">
            <p className="text-[10px] uppercase text-base-500 font-bold">Contratos Ganhos (Base de Dados)</p>
            <p className="text-xl font-extrabold text-base-100">{disputasVencidas} Processos</p>
          </div>
          <div className="flex justify-between text-[12px] py-1.5 border-t border-base-800">
            <span className="text-base-400">Preço do Ticket Médio Licitado</span>
            <span className="font-mono font-bold text-base-200">{formatBRL(ticketMedio)}</span>
          </div>
          <div className="flex justify-between text-[12px] py-1.5">
            <span className="text-base-400">Receita Média Êxito por Contrato (2,5%)</span>
            <span className="font-mono font-bold text-accent-300">{formatBRL(receitaMediaExito)}</span>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Scale className="w-4 h-4 text-accent-400" />
            <h3 className="text-sm font-bold text-base-100">Taxa de Êxito</h3>
          </div>
          <div className="flex items-center justify-center py-6">
            <div className="relative w-28 h-28">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-base-800)" strokeWidth="10" />
                <circle
                  cx="50" cy="50" r="42" fill="none" stroke="var(--color-positive-400)" strokeWidth="10"
                  strokeDasharray={`${(taxaVitoria / 100) * 264} 264`} strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-extrabold text-base-100">{taxaVitoria}%</span>
              </div>
            </div>
          </div>
          <p className="text-[12px] text-base-500 text-center">{disputasVencidas} vitórias em {finalizadas} disputas finalizadas</p>
        </Card>
      </div>

      <div className="px-6 mt-4">
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-accent-400" />
              <h3 className="text-sm font-bold text-base-100">Demonstrativo de Resultado do Exercício (DRE)</h3>
            </div>
            <div className="flex items-center gap-2">
              <Select value={dreYear} onChange={(e) => setDreYear(parseInt(e.target.value))} className="w-28 !py-1.5 text-[12px]">
                {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
              </Select>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-base-950 bg-accent-500 hover:bg-accent-400 rounded-lg px-3 py-1.5 transition"
              >
                <Printer className="w-3.5 h-3.5" /> Exportar / Imprimir
              </button>
            </div>
          </div>
          <p className="text-[12px] text-base-500 mb-4">
            Baseado em lançamentos efetivamente pagos/recebidos (regime de caixa), agrupados por categoria. Use "Exportar" para gerar um PDF pronto para enviar ao contador.
          </p>

          <div id="dre-printable" className="print-only bg-white text-slate-900 rounded-lg p-6">
            <h2 className="text-center font-bold text-lg uppercase mb-1">Demonstrativo de Resultado do Exercício</h2>
            <p className="text-center text-sm mb-6">Competência: Ano {dreYear} · Regime de Caixa</p>

            <table className="w-full text-[13px]">
              <tbody>
                <tr className="border-b border-slate-300">
                  <td className="py-2 font-bold">RECEITAS</td>
                  <td className="py-2 text-right font-bold">{formatBRL(dreDetalhado.totalReceitas)}</td>
                </tr>
                {dreDetalhado.receitas.length === 0 ? (
                  <tr><td className="py-1.5 pl-4 text-slate-400 italic" colSpan={2}>Nenhuma receita no período</td></tr>
                ) : (
                  dreDetalhado.receitas.map((r) => (
                    <tr key={r.category} className="border-b border-slate-100">
                      <td className="py-1.5 pl-4">{r.category}</td>
                      <td className="py-1.5 text-right">{formatBRL(r.value)}</td>
                    </tr>
                  ))
                )}

                <tr className="border-b border-slate-300">
                  <td className="py-2 pt-4 font-bold">(−) DESPESAS</td>
                  <td className="py-2 pt-4 text-right font-bold">{formatBRL(dreDetalhado.totalDespesas)}</td>
                </tr>
                {dreDetalhado.despesas.length === 0 ? (
                  <tr><td className="py-1.5 pl-4 text-slate-400 italic" colSpan={2}>Nenhuma despesa no período</td></tr>
                ) : (
                  dreDetalhado.despesas.map((d) => (
                    <tr key={d.category} className="border-b border-slate-100">
                      <td className="py-1.5 pl-4">{d.category}</td>
                      <td className="py-1.5 text-right">{formatBRL(d.value)}</td>
                    </tr>
                  ))
                )}

                <tr className="border-t-2 border-slate-800">
                  <td className="py-3 font-bold text-base">RESULTADO DO EXERCÍCIO</td>
                  <td className={`py-3 text-right font-bold text-base ${dreDetalhado.resultado >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {formatBRL(dreDetalhado.resultado)}
                  </td>
                </tr>
              </tbody>
            </table>

            <p className="text-[10px] text-slate-400 mt-6">Documento gerado automaticamente pelo sistema ConectaGov em {new Date().toLocaleDateString('pt-BR')}.</p>
          </div>
        </Card>
      </div>

      <div className="px-6 mt-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-accent-400" />
            <h3 className="text-sm font-bold text-base-100">Habilitação Econômica: Simulador de Índices de Liquidez</h3>
          </div>
          <p className="text-[12px] text-base-500 mb-4">
            Órgãos públicos federais e municipais exigem Liquidez Corrente e Geral ≥ 1,00 para adjudicar editais de compras públicas de grande escala. Insira as contas do balanço patrimonial abaixo.
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <Field label="Ativo Circulante">
              <Input type="number" value={ativoCirculante || ''} onChange={(e) => setAtivoCirculante(parseFloat(e.target.value) || 0)} />
            </Field>
            <Field label="Ativo Não Circulante">
              <Input type="number" value={ativoNaoCirculante || ''} onChange={(e) => setAtivoNaoCirculante(parseFloat(e.target.value) || 0)} />
            </Field>
            <Field label="Passivo Circulante">
              <Input type="number" value={passivoCirculante || ''} onChange={(e) => setPassivoCirculante(parseFloat(e.target.value) || 0)} />
            </Field>
            <Field label="Passivo Não Circulante">
              <Input type="number" value={passivoNaoCirculante || ''} onChange={(e) => setPassivoNaoCirculante(parseFloat(e.target.value) || 0)} />
            </Field>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-base-850/60 rounded-lg p-4 flex items-center justify-between">
              <span className="text-[12px] text-base-400 font-semibold">Liquidez Corrente (LC)</span>
              <span className={`text-xl font-extrabold font-mono ${liquidezCorrente >= 1 ? 'text-positive-400' : 'text-negative-400'}`}>{liquidezCorrente.toFixed(2)}</span>
            </div>
            <div className="bg-base-850/60 rounded-lg p-4 flex items-center justify-between">
              <span className="text-[12px] text-base-400 font-semibold">Liquidez Geral (LG)</span>
              <span className={`text-xl font-extrabold font-mono ${liquidezGeral >= 1 ? 'text-positive-400' : 'text-negative-400'}`}>{liquidezGeral.toFixed(2)}</span>
            </div>
            <div className={`rounded-lg p-4 flex items-center justify-center gap-2 border ${habilitado ? 'bg-positive-500/10 border-positive-500/30' : 'bg-negative-500/10 border-negative-500/30'}`}>
              <ShieldCheck className={`w-4 h-4 ${habilitado ? 'text-positive-400' : 'text-negative-400'}`} />
              <span className={`text-sm font-bold ${habilitado ? 'text-positive-400' : 'text-negative-400'}`}>
                {habilitado ? 'Selo de Habilitação Atingido' : 'Índices abaixo do exigido'}
              </span>
            </div>
          </div>
          <p className="text-[10px] text-base-500 mt-3">Base legal de referência: Instrução Normativa SEGES/MF e a Lei de Licitações Públicas (Lei nº 14.133/2021).</p>
        </Card>
      </div>
    </div>
  )
}

function FunnelStep({ label, value, percent, color }: { label: string; value: number; percent: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[12px] mb-1">
        <span className="text-base-300 font-medium">{label}</span>
        <span className="font-mono font-bold text-base-100">{value}</span>
      </div>
      <div className="h-2 bg-base-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      <p className="text-[10px] text-base-500 mt-0.5">{percent}% de conversão</p>
    </div>
  )
}
