import { useMemo, useState } from 'react'
import { Calculator, TrendingUp, Target, Scale, ShieldCheck } from 'lucide-react'
import { PageHeader, Card } from '../components/ui/Primitives'
import { Field, Input } from '../components/ui/FormControls'
import { useTransactions } from '../hooks/useTransactions'
import { useBiddings } from '../hooks/useBiddings'
import { formatBRL } from '../hooks/useAccountBalances'

export default function ContabilidadePage() {
  const { transactions } = useTransactions()
  const { biddings } = useBiddings()

  const currentYear = new Date().getFullYear()

  const dre = useMemo(() => {
    const receitas = transactions.filter((t) => t.type === 'Receber' && t.status === 'Pago' && t.dueDate.startsWith(String(currentYear))).reduce((s, t) => s + t.value, 0)
    const despesas = transactions.filter((t) => t.type === 'Pagar' && t.status === 'Pago' && t.dueDate.startsWith(String(currentYear))).reduce((s, t) => s + t.value, 0)
    const lucro = receitas - despesas
    return { receitas, despesas, lucro }
  }, [transactions, currentYear])

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
