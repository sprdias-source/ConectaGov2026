import { useMemo } from 'react'
import { Trello, ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHeader } from '../components/ui/Primitives'
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

export default function KanbanLicitacoesPage() {
  const { biddings, updateEtapa } = useBiddings()
  const { clients } = useClients()
  const { nivel: nivelLicitacoes } = usePermissaoFerramenta('licitacoes')
  const podeEditar = nivelLicitacoes === 'edicao'

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
      <div className="bg-base-900 border border-base-800 rounded-lg p-3 flex flex-col gap-1.5">
        <p className="text-[12px] font-semibold text-base-100 line-clamp-2">{b.objeto}</p>
        <p className="text-[11px] text-base-500 truncate">{clientName(b.clientId)} — {b.orgao}</p>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[11px] font-mono font-semibold text-accent-300">{formatBRL(b.valorLicitado)}</span>
          <span className="text-[10px] text-base-500">{new Date(b.dataAbertura + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
        </div>
        {podeEditar && (
          <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-base-800">
            <button
              onClick={() => mover(b, -1)}
              disabled={indiceAtual <= 0 || updateEtapa.isPending}
              className="p-1 text-base-500 hover:text-accent-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
              title="Etapa anterior"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => mover(b, 1)}
              disabled={indiceAtual === -1 ? false : indiceAtual >= ETAPAS.length - 1 || updateEtapa.isPending}
              className="p-1 text-base-500 hover:text-accent-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
              title="Próxima etapa"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Kanban de Licitações"
        subtitle="Suas licitações em andamento, organizadas por etapa do funil"
        icon={Trello}
      />

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
    </div>
  )
}
