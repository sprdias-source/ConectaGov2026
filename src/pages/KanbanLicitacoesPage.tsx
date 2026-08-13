import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { LayoutGrid, ChevronLeft, ChevronRight, ClipboardList, Pencil, GripVertical, Ban } from 'lucide-react'
import { PageHeader } from '../components/ui/Primitives'
import { SeloHabilitacaoBadge } from '../components/ui/SeloHabilitacao'
import BiddingFormModal from '../components/cadastros/BiddingFormModal'
import Modal from '../components/ui/Modal'
import { Field, Select, Input, Button } from '../components/ui/FormControls'
import { useBiddings } from '../hooks/useBiddings'
import { useClients } from '../hooks/useClients'
import { usePermissaoFerramenta } from '../hooks/usePermissaoFerramenta'
import { useToast } from '../hooks/useToast'
import { formatBRL } from '../hooks/useAccountBalances'
import { useEmpenhos } from '../hooks/useEmpenhos'
import { useBiddingIdsComDocumentosFinais } from '../hooks/useAttachedFiles'
import { useHabilitacaoPorLicitacao, type StatusHabilitacao } from '../hooks/useBiddingChecklist'
import type { Bidding, BiddingEtapa, BiddingItem, BiddingStatus } from '../types/domain'

// Encerrar direto do Kanban, sem abrir o cadastro completo — pro caso comum
// de "o cliente desistiu" ou "o órgão cancelou o edital", que não precisa
// editar mais nada da licitação.
function EncerrarDialog({ bidding, onClose }: { bidding: Bidding | null; onClose: () => void }) {
  const { marcarResultado } = useBiddings()
  const { showToast } = useToast()
  const [status, setStatus] = useState<'Cancelada' | 'Desistiu'>('Desistiu')
  const [motivo, setMotivo] = useState('')

  if (!bidding) return null

  const salvar = () => {
    marcarResultado.mutate(
      { biddingId: bidding.id, status: status as BiddingStatus, motivoPerda: null, motivoDesistencia: motivo },
      {
        onSuccess: () => {
          showToast('Licitação encerrada.')
          onClose()
          setMotivo('')
        },
        onError: (err) => showToast(`Erro ao encerrar: ${err instanceof Error ? err.message : String(err)}`, 'error'),
      }
    )
  }

  return (
    <Modal open onClose={onClose} title="Encerrar Licitação" maxWidth="max-w-md">
      <div className="flex flex-col gap-4">
        <p className="text-[12px] text-base-400">{bidding.objeto}</p>
        <Field label="Motivo do encerramento" required>
          <Select value={status} onChange={(e) => setStatus(e.target.value as 'Cancelada' | 'Desistiu')}>
            <option value="Desistiu">Cliente desistiu</option>
            <option value="Cancelada">Órgão cancelou o edital</option>
          </Select>
        </Field>
        <Field label={status === 'Desistiu' ? 'Motivo da desistência (opcional)' : 'Motivo do cancelamento (opcional)'}>
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Detalhe rapidamente, se quiser" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="danger" onClick={salvar} disabled={marcarResultado.isPending}>
            {marcarResultado.isPending ? 'Salvando...' : 'Encerrar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

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

// Hoisted fora do componente principal (não recriado a cada render) — importa
// porque agora usa useDraggable, um hook: se ficasse redeclarado dentro do
// componente pai a cada render, o dnd-kit perderia a referência do nó
// arrastável e o drag ficaria instável.
function CardLicitacao({
  b, clienteNome, podeEditar, podeRetroceder, podeAvancar, desabilitado, statusHabilitacao,
  onMoverAnterior, onMoverProxima, onEditar, onEncerrar,
}: {
  b: Bidding
  clienteNome: string
  podeEditar: boolean
  podeRetroceder: boolean
  podeAvancar: boolean
  desabilitado: boolean
  statusHabilitacao: StatusHabilitacao
  onMoverAnterior: () => void
  onMoverProxima: () => void
  onEditar: () => void
  onEncerrar: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: b.id, disabled: !podeEditar || desabilitado })
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 } : undefined

  return (
    <Link
      ref={setNodeRef}
      style={style}
      to={`/licitacoes/${b.id}`}
      className={`relative bg-base-900 border border-base-800 rounded-lg p-3 flex flex-col gap-1.5 transition ${isDragging ? 'opacity-30' : ''}`}
    >
      {podeEditar && (
        <span
          {...attributes}
          {...listeners}
          onClick={(e) => e.preventDefault()}
          title="Arraste pra mudar de etapa"
          className="absolute top-2 right-2 p-0.5 text-base-600 hover:text-base-400 cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </span>
      )}
      <p className="text-[12px] font-semibold text-base-100 line-clamp-2 pr-4">{b.objeto}</p>
      <p className="text-[11px] text-base-500 truncate">{clienteNome} — {b.orgao}</p>
      <SeloHabilitacaoBadge status={statusHabilitacao} />
      <div className="flex items-center justify-between mt-1">
        <span className="text-[11px] font-mono font-semibold text-accent-300">{formatBRL(b.valorLicitado)}</span>
        <span className="text-[10px] text-base-500">{new Date(b.dataAbertura + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
      </div>
      {b.valorParticipacao != null && (
        <p className="text-[10px] text-base-500 -mt-1">Participando: <span className="font-mono text-base-400">{formatBRL(b.valorParticipacao)}</span></p>
      )}
      {podeEditar && (
        <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-base-800">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMoverAnterior() }}
            disabled={!podeRetroceder || desabilitado}
            className="p-1 text-base-500 hover:text-accent-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
            title="Etapa anterior"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEditar() }}
            className="p-1 text-base-500 hover:text-accent-300 transition"
            title="Editar dados completos (mesmo cadastro da aba Licitações)"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMoverProxima() }}
            disabled={!podeAvancar || desabilitado}
            className="p-1 text-base-500 hover:text-accent-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
            title="Próxima etapa"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEncerrar() }}
            className="p-1 text-base-500 hover:text-negative-400 transition"
            title="Encerrar (cliente desistiu ou órgão cancelou)"
          >
            <Ban className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </Link>
  )
}

// Card das licitações "Ganhou" que ainda têm pendência — sem arrastar (não
// faz sentido mover etapa de algo que já saiu da disputa), só mostrando o
// que falta fechar pra ela sumir de vista de vez.
type BadgePendencia = { label: string; bloqueante: boolean }

function CardLicitacaoGanha({ b, clienteNome, badges }: { b: Bidding; clienteNome: string; badges: BadgePendencia[] }) {
  return (
    <Link
      to={`/licitacoes/${b.id}`}
      className="relative bg-base-900 border border-positive-500/25 rounded-lg p-3 flex flex-col gap-1.5 transition hover:border-positive-500/50"
    >
      <p className="text-[12px] font-semibold text-base-100 line-clamp-2">{b.objeto}</p>
      <p className="text-[11px] text-base-500 truncate">{clienteNome} — {b.orgao}</p>
      <span className="text-[11px] font-mono font-semibold text-positive-400 mt-1">{formatBRL(b.valorOfertadoReal ?? b.valorLicitado)}</span>
      <div className="flex flex-wrap gap-1 mt-1">
        {badges.map((bd) => (
          <span
            key={bd.label}
            title={bd.bloqueante ? undefined : 'Informativo — nem toda licitação chega a ter empenho, ou pode demorar meses. Não impede a licitação de sair desta coluna.'}
            className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded-full ${bd.bloqueante ? 'bg-warning-500/15 text-warning-400' : 'bg-base-700/40 text-base-500'}`}
          >
            {bd.bloqueante ? `Falta: ${bd.label}` : `${bd.label} pendente`}
          </span>
        ))}
      </div>
    </Link>
  )
}

function ColunaKanban({ id, titulo, cor, itens, children }: { id: string; titulo: string; cor?: string; itens: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`w-72 shrink-0 bg-base-900/40 border rounded-xl p-3 transition ${
        isOver ? 'border-accent-400 ring-1 ring-accent-400/40' : `border-base-800 border-t-2 ${cor ?? 'border-t-base-600'}`
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-base-400">{titulo}</p>
        <span className="text-[10px] font-bold bg-base-800 text-base-400 rounded-full px-2 py-0.5">{itens}</span>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}

export default function KanbanLicitacoesPage() {
  const { biddings, updateEtapa, updateBidding } = useBiddings()
  const { clients } = useClients()
  const { empenhos } = useEmpenhos()
  const { habilitacaoPorId } = useHabilitacaoPorLicitacao(biddings)
  const { biddingIdsComPropostaReadequada, biddingIdsComContrato } = useBiddingIdsComDocumentosFinais()
  const { nivel: nivelLicitacoes } = usePermissaoFerramenta('licitacoes')
  const podeEditar = nivelLicitacoes === 'edicao'
  const { showToast } = useToast()

  const [visualizacao, setVisualizacao] = useState<Visualizacao>(
    () => (localStorage.getItem('cg_kanban_visualizacao') as Visualizacao) || 'quadro'
  )
  const [editando, setEditando] = useState<Bidding | null>(null)
  const [encerrando, setEncerrando] = useState<Bidding | null>(null)
  const [arrastando, setArrastando] = useState<Bidding | null>(null)

  const sensors = useSensors(
    // distance mínima antes de virar drag — sem isso, qualquer clique no
    // card (pra abrir a licitação) seria interpretado como arraste.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // delay no touch — sem isso, tentar rolar a tela num celular já dispara
    // um arraste sem querer.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  )

  const isMensalista = (id: string) => clients.find((c) => c.id === id)?.isMensalista ?? false

  const handleSalvarEdicao = (data: Partial<Bidding>, items: Partial<BiddingItem>[]) => {
    if (!editando) return
    updateBidding.mutate({ bidding: { ...editando, ...data } as Bidding, items }, {
      onSuccess: () => { setEditando(null); showToast('Licitação atualizada com sucesso.') },
      onError: (err) => showToast(`Erro ao atualizar a licitação: ${err instanceof Error ? err.message : String(err)}`, 'error'),
    })
  }

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

  // Licitações "Ganhou" continuam fora do funil de etapas, mas não somem
  // de vista enquanto ainda falta fechar o ciclo. Só Proposta Readequada
  // gerada e Contrato assinado anexado TRAVAM a saída do Kanban — Empenho
  // não é regra (nem toda prefeitura empenha de fato, ou pode levar meses),
  // então aparece só como aviso informativo, nunca segurando o card aqui
  // pra sempre esperando algo que talvez nunca aconteça.
  const biddingIdsComEmpenho = useMemo(() => new Set(empenhos.map((e) => e.biddingId)), [empenhos])
  const ganhasComPendencia = useMemo(() => {
    return biddings
      .filter((b) => b.isActive && b.status === 'Ganhou')
      .map((b) => {
        const badges: BadgePendencia[] = []
        if (!biddingIdsComPropostaReadequada.has(b.id)) badges.push({ label: 'Proposta Readequada', bloqueante: true })
        if (!biddingIdsComContrato.has(b.id)) badges.push({ label: 'Contrato', bloqueante: true })
        if (!biddingIdsComEmpenho.has(b.id)) badges.push({ label: 'Empenho', bloqueante: false })
        return { bidding: b, badges }
      })
      .filter((x) => x.badges.some((bd) => bd.bloqueante))
  }, [biddings, biddingIdsComPropostaReadequada, biddingIdsComEmpenho, biddingIdsComContrato])

  const colunas = useMemo(() => {
    const semEtapa = ativas.filter((b) => !b.etapa)
    const porEtapa = ETAPAS.map((etapa) => ({
      etapa,
      itens: ativas.filter((b) => b.etapa === etapa),
    }))
    return { semEtapa, porEtapa }
  }, [ativas])

  const irParaEtapa = (bidding: Bidding, etapa: BiddingEtapa) => {
    if (bidding.etapa === etapa) return
    updateEtapa.mutate({ biddingId: bidding.id, etapa }, {
      onError: (err) => showToast(`Erro ao mudar a etapa: ${err instanceof Error ? err.message : String(err)}`, 'error'),
    })
  }

  const mover = (bidding: Bidding, direcao: -1 | 1) => {
    const indiceAtual = bidding.etapa ? ETAPAS.indexOf(bidding.etapa) : -1
    const novoIndice = indiceAtual + direcao
    if (novoIndice < 0 || novoIndice >= ETAPAS.length) return
    irParaEtapa(bidding, ETAPAS[novoIndice])
  }

  const handleDragStart = (event: DragStartEvent) => {
    const bidding = ativas.find((b) => b.id === event.active.id)
    setArrastando(bidding ?? null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setArrastando(null)
    const { active, over } = event
    if (!over) return
    const bidding = ativas.find((b) => b.id === active.id)
    const etapaDestino = ETAPAS.find((e) => e === over.id)
    if (!bidding || !etapaDestino) return
    irParaEtapa(bidding, etapaDestino)
  }

  const renderCard = (b: Bidding) => {
    const indiceAtual = b.etapa ? ETAPAS.indexOf(b.etapa) : -1
    return (
      <CardLicitacao
        key={b.id}
        b={b}
        clienteNome={clientName(b.clientId)}
        podeEditar={podeEditar}
        podeRetroceder={indiceAtual > 0}
        podeAvancar={indiceAtual === -1 ? true : indiceAtual < ETAPAS.length - 1}
        desabilitado={updateEtapa.isPending}
        statusHabilitacao={habilitacaoPorId.get(b.id)?.status ?? null}
        onMoverAnterior={() => mover(b, -1)}
        onMoverProxima={() => mover(b, 1)}
        onEditar={() => setEditando(b)}
        onEncerrar={() => setEncerrando(b)}
      />
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
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setArrastando(null)}>
          <div className="px-6 mt-4 overflow-x-auto">
            <div className="flex gap-3 min-w-max pb-4">
              {colunas.semEtapa.length > 0 && (
                <div className="w-72 shrink-0 bg-base-900/40 border border-base-800 border-t-2 border-t-base-600 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-base-400">Sem Etapa</p>
                    <span className="text-[10px] font-bold bg-base-800 text-base-400 rounded-full px-2 py-0.5">{colunas.semEtapa.length}</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {colunas.semEtapa.map(renderCard)}
                  </div>
                </div>
              )}

              {colunas.porEtapa.map(({ etapa, itens }) => (
                <ColunaKanban key={etapa} id={etapa} titulo={etapa} cor={CORES_COLUNA[etapa]} itens={itens.length}>
                  {itens.length === 0 ? (
                    <p className="text-[11px] text-base-600 italic text-center py-6">Nenhuma licitação aqui</p>
                  ) : (
                    itens.map(renderCard)
                  )}
                </ColunaKanban>
              ))}

              {ganhasComPendencia.length > 0 && (
                <ColunaKanban id="ganhas-pendencia" titulo="Ganhas — Pendência" cor="border-t-positive-500" itens={ganhasComPendencia.length}>
                  {ganhasComPendencia.map(({ bidding, badges }) => (
                    <CardLicitacaoGanha key={bidding.id} b={bidding} clienteNome={clientName(bidding.clientId)} badges={badges} />
                  ))}
                </ColunaKanban>
              )}
            </div>
          </div>

          <DragOverlay>
            {arrastando ? (
              <div className="w-72 bg-base-900 border border-accent-400 rounded-lg p-3 shadow-2xl rotate-2 opacity-95">
                <p className="text-[12px] font-semibold text-base-100 line-clamp-2">{arrastando.objeto}</p>
                <p className="text-[11px] text-base-500 truncate mt-0.5">{clientName(arrastando.clientId)}</p>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
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
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Valor Total do Edital</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Habilitação</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Etapa</th>
                      {podeEditar && <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Ações</th>}
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
                        <td className="px-4 py-3"><SeloHabilitacaoBadge status={habilitacaoPorId.get(b.id)?.status ?? null} /></td>
                        <td className="px-4 py-3 text-base-400 text-[12px]">{b.etapa ?? '—'}</td>
                        {podeEditar && (
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => setEditando(b)}
                              title="Editar dados completos (mesmo cadastro da aba Licitações)"
                              className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEncerrando(b)}
                              title="Encerrar (cliente desistiu ou órgão cancelou)"
                              className="p-1.5 text-base-400 hover:text-negative-400 hover:bg-base-800 rounded transition"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {podeEditar && (
        <BiddingFormModal
          open={!!editando}
          onClose={() => setEditando(null)}
          onSave={handleSalvarEdicao}
          initial={editando}
          clients={clients}
          clientIsMensalista={isMensalista}
          isSaving={updateBidding.isPending}
          error={updateBidding.error}
        />
      )}

      {podeEditar && <EncerrarDialog bidding={encerrando} onClose={() => setEncerrando(null)} />}
    </div>
  )
}
