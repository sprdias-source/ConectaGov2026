import { useMemo, useState } from 'react'
import { TrendingUp, Target, Scale, ShieldCheck, Activity, AlertTriangle, PieChart as PieIcon } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { Card } from '../ui/Primitives'
import { Field, Input } from '../ui/FormControls'
import { useTransactions } from '../../hooks/useTransactions'
import { useBiddings } from '../../hooks/useBiddings'
import { useClients } from '../../hooks/useClients'
import { useFinancialAccounts } from '../../hooks/useFinancialAccounts'
import { useAccountBalances, formatBRL } from '../../hooks/useAccountBalances'
import type { BiddingEtapa } from '../../types/domain'

// Mesma sequência de etapas usada em LicitacaoPage.tsx/KanbanLicitacoesPage.tsx/
// BiddingFormModal.tsx — duplicada aqui de propósito (mesmo padrão dos outros
// três lugares) só pra saber se uma licitação "Em Andamento" já passou do
// estágio de Proposta Enviada para Plataforma, sem precisar importar entre páginas.
const ETAPAS_ORDEM: BiddingEtapa[] = ['Análise de Edital', 'Montagem de Documentação', 'Proposta Enviada para Plataforma', 'Fase Recursal', 'Aguardando Pregoeiro', 'Adjudicada e Homologada']

// Conteúdo original da Contabilidade, mantido sem nenhuma mudança de
// comportamento — só passou a viver como uma aba dentro do módulo, junto
// com Contábil/Fiscal/Pessoal. O DRE (que vivia aqui) mudou de aba (agora
// em AbaContabil.tsx, redesenhado e agrupado); tudo o mais é idêntico.
export default function AbaGerencial() {
  const { transactions } = useTransactions()
  const { biddings } = useBiddings()
  const { clients } = useClients()
  const { accounts } = useFinancialAccounts()
  const { patrimonioTotal } = useAccountBalances(accounts, transactions)

  const currentYear = new Date().getFullYear()

  const dre = useMemo(() => {
    const receitas = transactions.filter((t) => t.type === 'Receber' && t.status === 'Pago' && t.paymentDate?.startsWith(String(currentYear))).reduce((s, t) => s + t.value, 0)
    const despesas = transactions.filter((t) => t.type === 'Pagar' && t.status === 'Pago' && t.paymentDate?.startsWith(String(currentYear))).reduce((s, t) => s + t.value, 0)
    const lucro = receitas - despesas
    return { receitas, despesas, lucro }
  }, [transactions, currentYear])

  // --- Indicadores de Saúde Financeira -------------------------------------

  const mrr = useMemo(
    () => clients.filter((c) => c.isActive && c.isMensalista).reduce((s, c) => s + (c.valorMensalidade ?? 0), 0),
    [clients]
  )

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

  const inadimplencia = useMemo(() => {
    const pendente = transactions.filter((t) => t.type === 'Receber' && t.status !== 'Pago')
    const totalPendente = pendente.reduce((s, t) => s + t.value, 0)
    const totalAtrasado = pendente.filter((t) => t.status === 'Atrasado').reduce((s, t) => s + t.value, 0)
    return totalPendente > 0 ? Math.round((totalAtrasado / totalPendente) * 100) : 0
  }, [transactions])

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
  const propostasEnviadas = biddings.filter((b) => {
    if (b.status === 'Ganhou' || b.status === 'Perdeu') return true
    if (b.status !== 'Em Andamento') return false
    const indice = b.etapa ? ETAPAS_ORDEM.indexOf(b.etapa) : -1
    return indice >= ETAPAS_ORDEM.indexOf('Proposta Enviada para Plataforma')
  }).length
  const disputasVencidas = biddings.filter((b) => b.status === 'Ganhou').length
  const finalizadas = biddings.filter((b) => b.status === 'Ganhou' || b.status === 'Perdeu').length
  const taxaVitoria = finalizadas > 0 ? Math.round((disputasVencidas / finalizadas) * 100) : 0

  const ticketMedio = disputasVencidas > 0
    ? biddings.filter((b) => b.status === 'Ganhou').reduce((s, b) => s + (b.valorOfertadoReal ?? b.valorLicitado), 0) / disputasVencidas
    : 0
  const receitaMediaExito = ticketMedio * 0.025

  return (
    <>
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
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-accent-400" />
            <h3 className="text-sm font-bold text-base-100">Matriz de Conversão Licitatória</h3>
          </div>
          <p className="text-[11px] text-base-500 mb-3">Conversão por estágio do funil de vendas — diferente do "Funil de Licitações" do Dashboard, que mostra só a composição final (quantas fecharam vs. quantas ainda estão em disputa).</p>
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
            <span className="text-base-400">Ticket Médio Ganho de Fato</span>
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
    </>
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
