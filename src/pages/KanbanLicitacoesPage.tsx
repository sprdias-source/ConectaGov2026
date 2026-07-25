import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LayoutGrid, ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react'
import { PageHeader } from '../components/ui/Primitives'
import SeloHabilitacao from '../components/ui/SeloHabilitacao'
import { useBiddings } from '../hooks/useBiddings'
import { useClients } from '../hooks/useClients'
import { usePermissaoFerramenta } from '../hooks/usePermissaoFerramenta'
import { formatBRL } from '../hooks/useAccountBalances'
import type { Bidding, BiddingEtapa } from '../types/domain'

const ETAPAS: BiddingEtapa[] = [
  'Análise de Edital',
  'Montagem de Documentação',
  'Proposta Enviada',
  'Disputa de Lances',
  'Fase Recursal',
  'Adjudicada e Homologada',
]

const CORES_COLUNA: Record<string, string> = {
  'Análise de Edital': 'border-t-base-500',
  'Montagem de Documentação': 'border-t-warning-500',
  'Proposta Enviada': 'border-t-accent-500',
  'Disputa de Lances': 'border-t-accent-400',
  'Fase Recursal': 'border-t-negative-400',
  'Adjudicada e Homologada': 'border-t-positive-500',
}

type Visualizacao = 'quadro' | 'lista'

export default function KanbanLicitacoesPage() {
  const { biddings, updateEtapa } = useBiddings()
  const { clients } = useClients()
  const { nivel: nivelLicitacoes } = usePermissaoFerramenta('licitacoes')
  const podeEditar = nivelLicitacoes === 'edicao'

  const [visualizacao, setVisualizacao] = useState<Visualizacao>(
    () => (localStorage.getItem('cg_kanban_visualizacao') as Visualizacao) || 'quadro'
  )

  const mudarVisualizacao = (v: Visualizacao) => {
    setVisualizacao(v)
    localStorage.setItem('cg_kanban_visualizacao', v)
  }

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Cliente removido'

  // Só licitações ativas e "Em Andamento" entram no funil — Ganhou/Perdeu/
  // Cancelada já saíram da disputa, não fazem sentido numa coluna de etapa.
  const ativas = useMemo(
    () => biddings.filter((b) => b.isActive && b.status === 'Em Andamento'),
    [biddings]
  )

  const colunas = useMemo(() => {
    const semEtapa = ativas.filter((b) => !b.etapa)
    const porEtapa = ETAPAS.map((etapa) => ({
      etapa,
      itens: ativas.filter((b) => b.etapa === etapa),
    }))
    return { semEtapa, porEtapa }
  }, [ativas])

  const mover = (bidding: Bidding, direcao: -1 | 1) => {
    const indiceAtual = bidding.etapa ? ETAPAS.indexOf(bidding.etapa) : -1
    const novoIndice = indiceAtual + direcao
    if (novoIndice < 0 || novoIndice >= ETAPAS.length) return
    updateEtapa.mutate({ biddingId: bidding.id, etapa: ETAPAS[novoIndice] })
  }

  const CardLicitacao = ({ b, etapaAtual }: { b: Bidding; etapaAtual: BiddingEtapa | null }) => {
    const indiceAtual = etapaAtual ? ETAPAS.indexOf(etapaAtual) : -1
    return (
      <Link
        to={`/licitacoes/${b.id}`}
        className="bg-base-900 border border-base-800 rounded-lg p-3 flex flex-col gap-1.5"
      >
        <p className="text-[12px] font-semibold text-base-100 line-clamp-2">{b.objeto}</p>
        <p className="text-[11px] text-base-500 truncate">{clientName(b.clientId)} — {b.orgao}</p>
        <SeloHabilitacao bidding={b} />
        <div className="flex items-center justify-between mt-1">
          <span className="text-[11px] font-mono font-semibold text-accent-300">{formatBRL(b.valorLicitado)}</span>
          <span className="text-[10px] text-base-500">{new Date(b.dataAbertura + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
        </div>
        {podeEditar && (
          <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-base-800">
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); mover(b, -1) }}
              disabled={indiceAtual <= 0 || updateEtapa.isPending}
              className="p-1 text-base-500 hover:text-accent-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
              title="Etapa anterior"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); mover(b, 1) }}
              disabled={indiceAtual === -1 ? false : indiceAtual >= ETAPAS.length - 1 || updateEtapa.isPending}
              className="p-1 text-base-500 hover:text-accent-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
              title="Próxima etapa"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </Link>
    )
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Kanban de Licitações"
        subtitle="Suas licitações em andamento, organizadas por etapa do funil"
        icon={LayoutGrid}
        actions={
          <div className="flex items-center gap-1 bg-base-900/60 border border-base-700/50 rounded-lg p-1">
            <button
              onClick={() => mudarVisualizacao('quadro')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-semibold transition ${
                visualizacao === 'quadro' ? 'bg-accent-500/15 text-accent-300' : 'text-base-500 hover:text-base-300'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Quadro
            </button>
            <button
              onClick={() => mudarVisualizacao('lista')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-semibold transition ${
                visualizacao === 'lista' ? 'bg-accent-500/15 text-accent-300' : 'text-base-500 hover:text-base-300'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" /> Lista
            </button>
          </div>
        }
      />

      {visualizacao === 'quadro' ? (
        <div className="px-6 mt-4 overflow-x-auto">
          <div className="flex gap-3 min-w-max pb-4">
            {colunas.semEtapa.length > 0 && (
              <div className="w-72 shrink-0 bg-base-900/40 border border-base-800 border-t-2 border-t-base-600 rounded-xl p-3">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-base-400">Sem Etapa</p>
                  <span className="text-[10px] font-bold bg-base-800 text-base-400 rounded-full px-2 py-0.5">{colunas.semEtapa.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {colunas.semEtapa.map((b) => <CardLicitacao key={b.id} b={b} etapaAtual={b.etapa} />)}
                </div>
              </div>
            )}

            {colunas.porEtapa.map(({ etapa, itens }) => (
              <div key={etapa} className={`w-72 shrink-0 bg-base-900/40 border border-base-800 border-t-2 ${CORES_COLUNA[etapa]} rounded-xl p-3`}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-base-400">{etapa}</p>
                  <span className="text-[10px] font-bold bg-base-800 text-base-400 rounded-full px-2 py-0.5">{itens.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {itens.length === 0 ? (
                    <p className="text-[11px] text-base-600 italic text-center py-6">Nenhuma licitação aqui</p>
                  ) : (
                    itens.map((b) => <CardLicitacao key={b.id} b={b} etapaAtual={b.etapa} />)
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="px-6 mt-4">
          <div className="bg-base-900/60 border border-base-700/50 rounded-xl overflow-hidden">
            {ativas.length === 0 ? (
              <div className="p-10 text-center text-base-500 text-sm">Nenhuma licitação em andamento.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-base-800 text-left">
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Objeto</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Cliente</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Órgão</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Valor Licitado</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Habilitação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ativas.map((b) => (
                      <tr key={b.id} className="border-b border-base-800/60 hover:bg-base-850/40 transition">
                        <td className="px-4 py-3 max-w-[280px]">
                          <Link to={`/licitacoes/${b.id}`} className="font-semibold text-base-100 hover:text-accent-300 transition truncate block">
                            {b.objeto}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-base-300 text-[13px]">{clientName(b.clientId)}</td>
                        <td className="px-4 py-3 text-base-400 text-[12px]">{b.orgao}</td>
                        <td className="px-4 py-3 font-mono font-semibold text-base-200 text-[13px]">{formatBRL(b.valorLicitado)}</td>
                        <td className="px-4 py-3"><SeloHabilitacao bidding={b} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
