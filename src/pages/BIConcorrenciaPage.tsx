import { useMemo } from 'react'
import {
  Target, TrendingUp, Award, Building2, Percent,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts'
import { PageHeader, Card, EmptyState } from '../components/ui/Primitives'
import { useBiddings } from '../hooks/useBiddings'
import { useClients } from '../hooks/useClients'
import { formatBRL } from '../hooks/useAccountBalances'

export default function BIConcorrenciaPage() {
  const { biddings } = useBiddings()
  const { clients } = useClients()

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? '—'

  const finalized = useMemo(() => biddings.filter((b) => b.status === 'Ganhou' || b.status === 'Perdeu'), [biddings])

  const overallWinRate = finalized.length > 0
    ? Math.round((finalized.filter((b) => b.status === 'Ganhou').length / finalized.length) * 100)
    : 0

  const byModalidade = useMemo(() => {
    const map = new Map<string, { total: number; ganhou: number }>()
    for (const b of finalized) {
      const entry = map.get(b.modalidade) ?? { total: 0, ganhou: 0 }
      entry.total++
      if (b.status === 'Ganhou') entry.ganhou++
      map.set(b.modalidade, entry)
    }
    return Array.from(map.entries())
      .map(([modalidade, v]) => ({ modalidade, taxa: Math.round((v.ganhou / v.total) * 100), total: v.total }))
      .sort((a, b) => b.total - a.total)
  }, [finalized])

  const byOrgao = useMemo(() => {
    const map = new Map<string, { total: number; ganhou: number; valorGanho: number }>()
    for (const b of finalized) {
      const entry = map.get(b.orgao) ?? { total: 0, ganhou: 0, valorGanho: 0 }
      entry.total++
      if (b.status === 'Ganhou') {
        entry.ganhou++
        entry.valorGanho += b.valorOfertadoReal ?? b.valorLicitado
      }
      map.set(b.orgao, entry)
    }
    return Array.from(map.entries())
      .map(([orgao, v]) => ({ orgao, taxa: Math.round((v.ganhou / v.total) * 100), total: v.total, valorGanho: v.valorGanho }))
      .sort((a, b) => b.valorGanho - a.valorGanho)
      .slice(0, 8)
  }, [finalized])

  const margemCompetitiva = useMemo(() => {
    const won = biddings.filter((b) => b.status === 'Ganhou' && b.valorOfertadoReal && b.valorLicitado > 0)
    if (won.length === 0) return null
    const margens = won.map((b) => ((b.valorLicitado - (b.valorOfertadoReal ?? 0)) / b.valorLicitado) * 100)
    const media = margens.reduce((s, m) => s + m, 0) / margens.length
    return { media, amostras: won.length }
  }, [biddings])

  const byEtapa = useMemo(() => {
    const emAndamento = biddings.filter((b) => b.status === 'Em Andamento')
    const map = new Map<string, number>()
    for (const b of emAndamento) {
      const etapa = b.etapa ?? 'Sem etapa definida'
      map.set(etapa, (map.get(etapa) ?? 0) + 1)
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }, [biddings])

  const byCliente = useMemo(() => {
    const map = new Map<string, { total: number; ganhou: number; valorGanho: number }>()
    for (const b of finalized) {
      const entry = map.get(b.clientId) ?? { total: 0, ganhou: 0, valorGanho: 0 }
      entry.total++
      if (b.status === 'Ganhou') {
        entry.ganhou++
        entry.valorGanho += b.valorOfertadoReal ?? b.valorLicitado
      }
      map.set(b.clientId, entry)
    }
    return Array.from(map.entries())
      .filter(([, v]) => v.total >= 1)
      .map(([clientId, v]) => ({
        cliente: clientName(clientId),
        taxa: Math.round((v.ganhou / v.total) * 100),
        total: v.total,
        valorGanho: v.valorGanho,
      }))
      .sort((a, b) => b.valorGanho - a.valorGanho)
      .slice(0, 6)
  }, [finalized, clients])

  const radarData = useMemo(() => {
    if (finalized.length === 0) return []
    const portais = new Set(biddings.map((b) => b.portal).filter(Boolean))
    return [
      { dimensao: 'Taxa de Êxito', valor: overallWinRate },
      { dimensao: 'Diversificação de Portais', valor: Math.min(100, portais.size * 20) },
      { dimensao: 'Volume de Disputas', valor: Math.min(100, finalized.length * 5) },
      { dimensao: 'Margem Competitiva', valor: margemCompetitiva ? Math.min(100, Math.round(margemCompetitiva.media * 3)) : 0 },
      { dimensao: 'Clientes Ativos', valor: Math.min(100, clients.filter((c) => c.isActive).length * 10) },
    ]
  }, [finalized, biddings, overallWinRate, margemCompetitiva, clients])

  if (biddings.length === 0) {
    return (
      <div className="pb-10">
        <PageHeader title="BI de Concorrência" subtitle="Inteligência competitiva sobre suas licitações" icon={Target} />
        <div className="px-6 mt-4">
          <Card>
            <EmptyState icon={Target} title="Sem dados ainda" description="Cadastre e finalize licitações para começar a ver as análises de concorrência aqui." />
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="BI de Concorrência"
        subtitle="Inteligência competitiva: onde você ganha mais, e como se posiciona frente aos editais"
        icon={Target}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-6 mt-4">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Taxa de Êxito Geral</p>
          <p className="text-2xl font-extrabold font-mono text-positive-400">{overallWinRate}%</p>
          <p className="text-[11px] text-base-500">{finalized.filter((b) => b.status === 'Ganhou').length} de {finalized.length} disputas</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Margem Competitiva Média</p>
          <p className="text-2xl font-extrabold font-mono text-accent-300">
            {margemCompetitiva ? `${margemCompetitiva.media.toFixed(1)}%` : '—'}
          </p>
          <p className="text-[11px] text-base-500">abaixo do valor licitado, em média</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Licitações Ativas</p>
          <p className="text-2xl font-extrabold font-mono text-warning-400">{biddings.filter((b) => b.status === 'Em Andamento').length}</p>
          <p className="text-[11px] text-base-500">em disputa neste momento</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Órgãos Diferentes</p>
          <p className="text-2xl font-extrabold font-mono text-base-100">{new Set(biddings.map((b) => b.orgao)).size}</p>
          <p className="text-[11px] text-base-500">prefeituras/entidades atendidas</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 px-6 mt-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <Percent className="w-4 h-4 text-accent-400" />
            <h3 className="text-sm font-bold text-base-100">Taxa de Êxito por Modalidade</h3>
          </div>
          <p className="text-[12px] text-base-500 mb-3">Onde sua equipe é mais competitiva na disputa</p>
          {byModalidade.length === 0 ? (
            <div className="text-base-500 text-sm py-10 text-center">Sem disputas finalizadas ainda</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byModalidade} layout="vertical" margin={{ left: 0, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-base-800)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} stroke="var(--color-base-500)" fontSize={11} tickLine={false} axisLine={false} unit="%" />
                <YAxis type="category" dataKey="modalidade" stroke="var(--color-base-400)" fontSize={10} tickLine={false} axisLine={false} width={140} />
                <Tooltip
                  contentStyle={{ background: 'var(--color-base-900)', border: '1px solid var(--color-base-700)', borderRadius: 8, fontSize: 12 }}
                  formatter={(value) => [`${value}%`, 'Taxa de êxito']}
                />
                <Bar dataKey="taxa" fill="var(--color-accent-500)" radius={[0, 4, 4, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-accent-400" />
            <h3 className="text-sm font-bold text-base-100">Performance por Órgão</h3>
          </div>
          <p className="text-[12px] text-base-500 mb-3">Top órgãos por valor efetivamente ganho</p>
          {byOrgao.length === 0 ? (
            <div className="text-base-500 text-sm py-10 text-center">Sem disputas finalizadas ainda</div>
          ) : (
            <div className="flex flex-col gap-2 max-h-[240px] overflow-y-auto">
              {byOrgao.map((o) => (
                <div key={o.orgao} className="flex items-center justify-between gap-2 bg-base-850/60 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-base-200 truncate">{o.orgao}</p>
                    <p className="text-[10px] text-base-500">{o.total} disputa(s) · {o.taxa}% de êxito</p>
                  </div>
                  <span className="font-mono font-bold text-[12px] text-positive-400 shrink-0">{formatBRL(o.valorGanho)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 px-6 mt-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <Award className="w-4 h-4 text-accent-400" />
            <h3 className="text-sm font-bold text-base-100">Ranking de Clientes (por valor ganho)</h3>
          </div>
          <p className="text-[12px] text-base-500 mb-3">Quais clientes geram mais resultado nas disputas</p>
          {byCliente.length === 0 ? (
            <div className="text-base-500 text-sm py-10 text-center">Sem disputas finalizadas ainda</div>
          ) : (
            <div className="flex flex-col gap-2">
              {byCliente.map((c, idx) => (
                <div key={c.cliente} className="flex items-center gap-3 bg-base-850/60 rounded-lg px-3 py-2.5">
                  <span className="text-[11px] font-bold text-base-500 w-4">{idx + 1}º</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-base-200 truncate">{c.cliente}</p>
                    <p className="text-[10px] text-base-500">{c.total} disputa(s) · {c.taxa}% de êxito</p>
                  </div>
                  <span className="font-mono font-bold text-[12px] text-positive-400 shrink-0">{formatBRL(c.valorGanho)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-accent-400" />
            <h3 className="text-sm font-bold text-base-100">Onde o Funil Está Parado</h3>
          </div>
          <p className="text-[12px] text-base-500 mb-3">Distribuição das licitações em andamento por etapa atual</p>
          {byEtapa.length === 0 ? (
            <div className="text-base-500 text-sm py-10 text-center">Nenhuma licitação em andamento</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={byEtapa} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3} strokeWidth={0}>
                  {byEtapa.map((entry, idx) => (
                    <Cell key={entry.name} fill="var(--color-accent-400)" opacity={1 - idx * 0.12} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--color-base-900)', border: '1px solid var(--color-base-700)', borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="flex flex-col gap-1 mt-2">
            {byEtapa.map((e) => (
              <div key={e.name} className="flex justify-between text-[11px]">
                <span className="text-base-400">{e.name}</span>
                <span className="font-mono font-semibold text-base-200">{e.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {radarData.length > 0 && (
        <div className="px-6 mt-4">
          <Card className="p-5">
            <h3 className="text-sm font-bold text-base-100 mb-1">Radar de Saúde Competitiva</h3>
            <p className="text-[12px] text-base-500 mb-3">Visão consolidada das dimensões que indicam maturidade competitiva da operação</p>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="var(--color-base-800)" />
                <PolarAngleAxis dataKey="dimensao" stroke="var(--color-base-400)" fontSize={11} />
                <PolarRadiusAxis domain={[0, 100]} stroke="var(--color-base-700)" fontSize={9} tickCount={3} />
                <Radar dataKey="valor" stroke="var(--color-accent-400)" fill="var(--color-accent-500)" fillOpacity={0.3} />
                <Tooltip contentStyle={{ background: 'var(--color-base-900)', border: '1px solid var(--color-base-700)', borderRadius: 8, fontSize: 12 }} />
              </RadarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}
    </div>
  )
}
