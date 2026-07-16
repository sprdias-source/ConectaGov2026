import { useMemo } from 'react'
import { DollarSign, TrendingUp, Award } from 'lucide-react'
import { PageHeader, Card, EmptyState } from '../components/ui/Primitives'
import { useTransactions } from '../hooks/useTransactions'
import { useBiddings } from '../hooks/useBiddings'
import { useClients } from '../hooks/useClients'
import { formatBRL } from '../hooks/useAccountBalances'

type LinhaRentabilidade = {
  clientId: string
  cliente: string
  comissaoRecebida: number
  taxaParticipacaoRecebida: number
  totalRecebido: number
  licitacoesGanhas: number
  licitacoesDisputadas: number
  taxaExito: number
  ticketMedio: number
}

const CATEGORIAS_COMISSAO = [
  'Comissão de Êxito (Parcelada)',
  'Comissão de Êxito (Recorrente)',
  'Comissão de Êxito (Licitação Ganha)',
]

export default function RentabilidadePage() {
  const { transactions, isLoading: loadingTx } = useTransactions()
  const { biddings, isLoading: loadingBiddings } = useBiddings()
  const { clients, isLoading: loadingClients } = useClients()

  const linhas = useMemo(() => {
    const map = new Map<string, LinhaRentabilidade>()

    const getOrCreate = (clientId: string, nomeCliente: string): LinhaRentabilidade => {
      let entry = map.get(clientId)
      if (!entry) {
        entry = {
          clientId,
          cliente: nomeCliente,
          comissaoRecebida: 0,
          taxaParticipacaoRecebida: 0,
          totalRecebido: 0,
          licitacoesGanhas: 0,
          licitacoesDisputadas: 0,
          taxaExito: 0,
          ticketMedio: 0,
        }
        map.set(clientId, entry)
      }
      return entry
    }

    const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Cliente removido'

    for (const t of transactions) {
      if (t.status !== 'Pago' || !t.clientId) continue
      if (CATEGORIAS_COMISSAO.includes(t.category)) {
        const entry = getOrCreate(t.clientId, clientName(t.clientId))
        entry.comissaoRecebida += t.value
      } else if (t.category === 'Taxa de Participação Individual') {
        const entry = getOrCreate(t.clientId, clientName(t.clientId))
        entry.taxaParticipacaoRecebida += t.value
      }
    }

    for (const b of biddings) {
      if (b.status !== 'Ganhou' && b.status !== 'Perdeu') continue
      const entry = getOrCreate(b.clientId, clientName(b.clientId))
      entry.licitacoesDisputadas += 1
      if (b.status === 'Ganhou') entry.licitacoesGanhas += 1
    }

    return Array.from(map.values())
      .map((entry) => ({
        ...entry,
        totalRecebido: entry.comissaoRecebida + entry.taxaParticipacaoRecebida,
        taxaExito: entry.licitacoesDisputadas > 0 ? Math.round((entry.licitacoesGanhas / entry.licitacoesDisputadas) * 100) : 0,
        ticketMedio: entry.licitacoesGanhas > 0 ? entry.comissaoRecebida / entry.licitacoesGanhas : 0,
      }))
      .sort((a, b) => b.totalRecebido - a.totalRecebido)
  }, [transactions, biddings, clients])

  const isLoading = loadingTx || loadingBiddings || loadingClients

  const totalGeral = linhas.reduce((s, l) => s + l.totalRecebido, 0)
  const melhorTicket = linhas.reduce((max, l) => (l.ticketMedio > max ? l.ticketMedio : max), 0)

  return (
    <div className="pb-10">
      <PageHeader
        title="Rentabilidade por Cliente"
        subtitle="Quanto cada cliente já rendeu de fato (comissões e taxas pagas) frente ao esforço de disputa"
        icon={DollarSign}
      />

      {isLoading ? (
        <div className="p-10 text-center text-base-500 text-sm">Carregando...</div>
      ) : linhas.length === 0 ? (
        <div className="px-6 mt-4">
          <Card>
            <EmptyState icon={DollarSign} title="Sem dados ainda" description="Assim que houver comissões pagas ou licitações finalizadas, a rentabilidade por cliente aparece aqui." />
          </Card>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 px-6 mt-4">
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Total Recebido (todos os clientes)</p>
              <p className="text-2xl font-extrabold font-mono text-positive-400">{formatBRL(totalGeral)}</p>
              <p className="text-[11px] text-base-500">comissões + taxas de participação já pagas</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Melhor Ticket Médio</p>
              <p className="text-2xl font-extrabold font-mono text-accent-300">{formatBRL(melhorTicket)}</p>
              <p className="text-[11px] text-base-500">comissão média por licitação ganha</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Clientes com Retorno</p>
              <p className="text-2xl font-extrabold font-mono text-base-100">{linhas.filter((l) => l.totalRecebido > 0).length}</p>
              <p className="text-[11px] text-base-500">de {linhas.length} clientes com histórico de disputa</p>
            </Card>
          </div>

          <div className="px-6 mt-4">
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-base-800 text-left">
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Cliente</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Comissão Recebida</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Taxa de Participação</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right bg-base-850/40">Total</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-center">Disputas</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-center">Êxito</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Ticket Médio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l, idx) => (
                      <tr key={l.clientId} className="border-b border-base-800/60 hover:bg-base-850/40 transition">
                        <td className="px-4 py-3 font-semibold text-base-200 text-[13px]">
                          <div className="flex items-center gap-2">
                            {idx === 0 && l.totalRecebido > 0 && <Award className="w-3.5 h-3.5 text-warning-400 shrink-0" />}
                            {l.cliente}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[13px] text-base-300">{formatBRL(l.comissaoRecebida)}</td>
                        <td className="px-4 py-3 text-right font-mono text-[13px] text-base-300">{formatBRL(l.taxaParticipacaoRecebida)}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-[13px] text-positive-400 bg-base-850/25">{formatBRL(l.totalRecebido)}</td>
                        <td className="px-4 py-3 text-center text-[12px] text-base-400">{l.licitacoesGanhas}/{l.licitacoesDisputadas}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-[12px] font-bold ${l.taxaExito >= 50 ? 'text-positive-400' : 'text-warning-400'}`}>{l.taxaExito}%</span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[13px] text-accent-300">{l.ticketMedio > 0 ? formatBRL(l.ticketMedio) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <p className="text-[11px] text-base-500 mt-2 flex items-center gap-1.5">
              <TrendingUp className="w-3 h-3" />
              Ordenado por total recebido — considera apenas valores já pagos (não projetados) e licitações com resultado definido (Ganhou/Perdeu).
            </p>
          </div>
        </>
      )}
    </div>
  )
}
