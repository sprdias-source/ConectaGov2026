import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { LayoutGrid, ChevronLeft, ChevronRight, ClipboardList, Pencil, GripVertical, Ban, Filter, ChevronDown, CalendarCheck } from 'lucide-react'
import { PageHeader } from '../components/ui/Primitives'
import TopScrollTable from '../components/ui/TopScrollTable'
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
import { useBiddingItemsPorLicitacoes } from '../hooks/useBiddingItems'
import { somarValorGanho } from '../lib/analiseEdital'
import { todayLocalISO } from '../lib/dateUtils'
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
      {
        biddingId: bidding.id,
        status: status as BiddingStatus,
        motivoPerda: null,
        motivoDesistencia: status === 'Desistiu' ? motivo : null,
        motivoCancelamento: status === 'Cancelada' ? motivo : null,
      },
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

// Sempre que a etapa "Adjudicada e Homologada" é ativada — entrando nela
// vindo de outra etapa, ou pelo botão de corrigir num card que já está
// parado aqui (ver CardLicitacao/onCorrigirHomologacao) — abre esse
// diálogo, pré-preenchido com a data que já estiver gravada (ou hoje, se
// ainda não tiver nenhuma). Substitui o preenchimento automático "hoje" de
// antes (ver tentarPreencherValorGanhoAutomatico em useBiddings.ts), que
// nunca batia com o dia real da homologação e não dava nenhum jeito de
// corrigir depois — importante pra quem está lançando ou arrumando
// licitações antigas.
function HomologacaoDialog({ bidding, onClose }: { bidding: Bidding | null; onClose: () => void }) {
  const { updateEtapa } = useBiddings()
  const { showToast } = useToast()
  const [data, setData] = useState(() => bidding?.dataHomologacao ?? todayLocalISO())

  if (!bidding) return null

  const jaTinhaData = bidding.dataHomologacao != null

  const salvar = () => {
    updateEtapa.mutate(
      { biddingId: bidding.id, etapa: 'Adjudicada e Homologada', dataHomologacao: data },
      {
        onSuccess: () => { showToast('Data de Homologação salva.'); onClose() },
        onError: (err) => showToast(`Erro ao salvar a data: ${err instanceof Error ? err.message : String(err)}`, 'error'),
      }
    )
  }

  return (
    <Modal open onClose={onClose} title="Data de Homologação" maxWidth="max-w-sm">
      <div className="flex flex-col gap-4">
        <p className="text-[12px] text-base-400">{bidding.objeto}</p>
        {jaTinhaData && (
          <p className="text-[11px] text-warning-400 font-semibold">⚠ Essa licitação já tinha uma data registrada — corrija se estiver errada.</p>
        )}
        <Field label="Data em que o órgão homologou o resultado" required>
          <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={!data || updateEtapa.isPending}>
            {updateEtapa.isPending ? 'Salvando...' : 'Confirmar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

const ETAPAS: BiddingEtapa[] = [
  'Análise de Edital',
  'Montagem de Documentação',
  'Proposta Enviada para Plataforma',
  'Fase Recursal',
  'Aguardando Pregoeiro',
  'Adjudicada e Homologada',
]

const CORES_COLUNA: Record<string, string> = {
  'Análise de Edital': 'border-t-base-500',
  'Montagem de Documentação': 'border-t-warning-500',
  'Proposta Enviada para Plataforma': 'border-t-accent-500',
  'Fase Recursal': 'border-t-negative-400',
  'Aguardando Pregoeiro': 'border-t-accent-400',
  'Adjudicada e Homologada': 'border-t-positive-500',
}

const CORES_COLUNA_RESULTADO: Record<'Perdeu' | 'Cancelada' | 'Desistiu', string> = {
  Perdeu: 'border-t-base-600',
  Cancelada: 'border-t-warning-500',
  Desistiu: 'border-t-negative-400',
}

// Segmentos que o filtro de etapas do quadro pode esconder — cobre as
// colunas de etapa do funil e as colunas de resultado final, que agora são
// continuação do mesmo quadro (ver "Concluídas" antiga, removida como aba
// separada). A ordem aqui é a ordem em que as colunas aparecem no quadro.
type SegmentoQuadro = 'sem-etapa' | BiddingEtapa | 'ganhas-pendencia' | 'ganhas-sem-pendencia' | 'Perdeu' | 'Cancelada' | 'Desistiu'

const SEGMENTOS_QUADRO: { id: SegmentoQuadro; label: string }[] = [
  { id: 'sem-etapa', label: 'Sem Etapa' },
  ...ETAPAS.map((etapa) => ({ id: etapa as SegmentoQuadro, label: etapa })),
  { id: 'ganhas-pendencia', label: 'Ganha — Pendência' },
  { id: 'ganhas-sem-pendencia', label: 'Ganha — Sem Pendência' },
  { id: 'Perdeu', label: 'Perdeu' },
  { id: 'Cancelada', label: 'Cancelada' },
  { id: 'Desistiu', label: 'Desistiu' },
]

type Visualizacao = 'quadro' | 'lista'

const mesCompetencia = (b: Bidding) => b.dataAbertura.slice(0, 7) // "YYYY-MM"

// Filtro de mês (competência = data do pregão) + cliente, aplicado ao
// quadro inteiro — não só às colunas de resultado final como antes.
// Função de módulo (não fechada sobre estado do componente) pra poder ser
// usada dentro de vários useMemo sem precisar entrar como dependência.
const passaFiltroMesCliente = (b: Bidding, mesFiltro: string, clienteFiltroId: string) =>
  (mesFiltro === 'todos' || mesCompetencia(b) === mesFiltro) && (!clienteFiltroId || b.clientId === clienteFiltroId)

// Quando o edital não declara um valor total explícito, valorLicitado fica
// 0 (a IA nunca inventa esse número somando os itens) — cai pra
// valorParticipacao (soma do que decidimos participar) como aproximação,
// em vez de mostrar "R$ 0,00" (mesmo ajuste já feito na Visão Geral da
// licitação).
const valorExibicaoEdital = (b: Bidding) => (b.valorLicitado > 0 ? b.valorLicitado : b.valorParticipacao ?? 0)

// Hoisted fora do componente principal (não recriado a cada render) — importa
// porque agora usa useDraggable, um hook: se ficasse redeclarado dentro do
// componente pai a cada render, o dnd-kit perderia a referência do nó
// arrastável e o drag ficaria instável.
function CardLicitacao({
  b, clienteNome, podeEditar, podeRetroceder, podeAvancar, desabilitado, statusHabilitacao,
  onMoverAnterior, onMoverProxima, onEditar, onEncerrar, onCorrigirHomologacao,
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
  onCorrigirHomologacao: () => void
}) {
  // Na última etapa do funil, "próxima etapa" não existe mais — o espaço da
  // seta vira o botão de corrigir a Data de Homologação, já que é exatamente
  // ali que faz falta um jeito de reabrir aquele diálogo sem precisar
  // arrastar o card pra lugar nenhum (comum ao arrumar licitações antigas).
  const naUltimaEtapa = b.etapa === 'Adjudicada e Homologada'
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
        <span className="text-[11px] font-mono font-semibold text-accent-300" title={b.valorLicitado > 0 ? undefined : 'Edital não declara um total explícito — aproximado pela soma dos itens'}>
          {formatBRL(valorExibicaoEdital(b))}
        </span>
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
          {naUltimaEtapa ? (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCorrigirHomologacao() }}
              disabled={desabilitado}
              className="p-1 text-warning-400 hover:text-warning-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
              title="Corrigir Data de Homologação"
            >
              <CalendarCheck className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMoverProxima() }}
              disabled={!podeAvancar || desabilitado}
              className="p-1 text-base-500 hover:text-accent-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
              title="Próxima etapa"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
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

function CardLicitacaoGanha({
  b, clienteNome, badges, valorGanhoCalculado, onCorrigirHomologacao,
}: {
  b: Bidding
  clienteNome: string
  badges: BadgePendencia[]
  valorGanhoCalculado?: number
  onCorrigirHomologacao?: () => void
}) {
  // "Ganhou" nunca cai mais pro valor total do edital (valorExibicaoEdital) —
  // o fallback correto aqui é o valor de participação, já que é o que de
  // fato descreve o que ganhamos quando ainda não tem Valor Ganho de Fato
  // nem itens marcados "Ganhou" preenchidos.
  const valorExibido = b.valorOfertadoReal ?? valorGanhoCalculado ?? (b.valorParticipacao ?? 0)
  // Só quando o valor não veio nem do campo manual nem dos itens (aí sim é
  // o valor de participação, uma aproximação mais fraca) mostra o aviso —
  // sem isso, um valor já correto (calculado pelos itens) ficava com a
  // mesma ressalva de "aproximado" que não se aplicava mais a ele.
  const ehAproximado = b.valorOfertadoReal == null && valorGanhoCalculado == null
  return (
    <Link
      to={`/licitacoes/${b.id}`}
      className="relative bg-base-900 border border-positive-500/25 rounded-lg p-3 flex flex-col gap-1.5 transition hover:border-positive-500/50"
    >
      <p className="text-[12px] font-semibold text-base-100">{b.objeto}</p>
      <p className="text-[11px] text-base-500">{clienteNome} — {b.orgao}</p>
      <div className="flex items-center justify-between mt-1">
        <span
          className="text-[11px] font-mono font-semibold text-positive-400"
          title={ehAproximado ? 'Nem o Valor Ganho de Fato nem os itens desta licitação foram preenchidos ainda — mostrando o valor de participação como aproximação' : undefined}
        >
          {formatBRL(valorExibido)}{ehAproximado && '*'}
        </span>
        <span className="text-[10px] text-base-500">Pregão em {new Date(b.dataAbertura + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
      </div>
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
      <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-positive-500/15">
        {b.dataHomologacao ? (
          <span className="text-[10px] text-base-500">Homologada em {new Date(b.dataHomologacao + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
        ) : (
          <span className="text-[10px] text-warning-400 font-semibold">Homologação pendente</span>
        )}
        {onCorrigirHomologacao && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCorrigirHomologacao() }}
            className="p-1 text-warning-400 hover:text-warning-300 transition"
            title="Corrigir Data de Homologação"
          >
            <CalendarCheck className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </Link>
  )
}

// Card de uma licitação já encerrada — só leitura, sem arrastar nem botões
// de mudar etapa, já que o processo terminou. Mostra até qual etapa ela
// chegou (congelada desde então, ver marcarResultado em useBiddings.ts, que
// nunca mexe em `etapa`) como registro de análise. Pra "Ganhou", mostra
// sempre a Data de Homologação (mesmo quando ainda não preenchida, com o
// botão de corrigir) em vez de depender do card já ter passado por ela —
// importante pra quem está lançando ou arrumando licitações antigas.
function CardLicitacaoConcluida({
  b, clienteNome, valorGanhoCalculado, onCorrigirHomologacao,
}: {
  b: Bidding
  clienteNome: string
  valorGanhoCalculado?: number
  onCorrigirHomologacao?: () => void
}) {
  const ganhou = b.status === 'Ganhou'
  // "Ganhou" nunca cai mais pro valor total do edital — mesmo fallback pro
  // valor de participação usado em CardLicitacaoGanha (ver comentário lá).
  const valorExibido = ganhou ? (b.valorOfertadoReal ?? valorGanhoCalculado ?? (b.valorParticipacao ?? 0)) : valorExibicaoEdital(b)
  const ehAproximado = ganhou && b.valorOfertadoReal == null && valorGanhoCalculado == null
  const corValor = ganhou ? 'text-positive-400' : 'text-base-500'
  return (
    <Link
      to={`/licitacoes/${b.id}`}
      className="bg-base-900 border border-base-800 rounded-lg p-3 flex flex-col gap-1.5 transition hover:border-base-700"
    >
      <p className="text-[12px] font-semibold text-base-100">{b.objeto}</p>
      <p className="text-[11px] text-base-500">{clienteNome} — {b.orgao}</p>
      <span className="self-start text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-base-700/40 text-base-500">
        Chegou até: {b.etapa ?? 'Sem Etapa'}
      </span>
      <div className="flex items-center justify-between mt-1">
        <span
          className={`text-[11px] font-mono font-semibold ${corValor}`}
          title={ehAproximado ? 'Nem o Valor Ganho de Fato nem os itens desta licitação foram preenchidos ainda — mostrando o valor de participação como aproximação' : undefined}
        >
          {formatBRL(valorExibido)}{ehAproximado && '*'}
        </span>
        <span className="text-[10px] text-base-500">Pregão em {new Date(b.dataAbertura + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
      </div>
      {ganhou && (
        <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-base-800">
          {b.dataHomologacao ? (
            <span className="text-[10px] text-base-500">Homologada em {new Date(b.dataHomologacao + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
          ) : (
            <span className="text-[10px] text-warning-400 font-semibold">Homologação pendente</span>
          )}
          {onCorrigirHomologacao && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCorrigirHomologacao() }}
              className="p-1 text-warning-400 hover:text-warning-300 transition"
              title="Corrigir Data de Homologação"
            >
              <CalendarCheck className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
      <span className="text-[9px] text-base-600">Atualizada em {new Date(b.updatedAt).toLocaleDateString('pt-BR')}</span>
    </Link>
  )
}

function ColunaKanban({ id, titulo, cor, itens, droppable = true, children }: { id: string; titulo: string; cor?: string; itens: number; droppable?: boolean; children: React.ReactNode }) {
  // droppable=false pras colunas que só mostram informação (ex: "Ganha —
  // Pendência", colunas de resultado final) — sem isso, a coluna acendia
  // como "pode soltar aqui" durante o arraste mesmo não fazendo nada ao
  // soltar de verdade.
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !droppable })
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
  const { nivel: nivelLicitacoes, carregando: carregandoPermissao } = usePermissaoFerramenta('licitacoes')
  // Enquanto a permissão real ainda está carregando, o hook devolve 'edicao'
  // por padrão (só pra não travar o dono da conta, que é o caso comum) — só
  // que isso deixa os controles de editar/arrastar/encerrar aparecerem por
  // um instante pra quem, na verdade, é só leitura. Aqui a gente trava isso
  // localmente: só libera edição depois que a permissão real for confirmada.
  const podeEditar = nivelLicitacoes === 'edicao' && !carregandoPermissao
  const { showToast } = useToast()

  const [visualizacao, setVisualizacao] = useState<Visualizacao>(() => {
    try {
      const salvo = localStorage.getItem('cg_kanban_visualizacao')
      // A aba "concluidas" não existe mais (virou continuação do próprio
      // quadro) — quem tinha essa preferência salva de uma versão anterior
      // cai pra "quadro" em vez de ficar numa visualização inexistente.
      return salvo === 'lista' ? 'lista' : 'quadro'
    } catch {
      return 'quadro'
    }
  })
  const [editando, setEditando] = useState<Bidding | null>(null)
  const [encerrando, setEncerrando] = useState<Bidding | null>(null)
  const [arrastando, setArrastando] = useState<Bidding | null>(null)
  const [pendenteHomologacao, setPendenteHomologacao] = useState<Bidding | null>(null)

  const sensors = useSensors(
    // distance mínima antes de virar drag — sem isso, qualquer clique no
    // card (pra abrir a licitação) seria interpretado como arraste.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // delay no touch — sem isso, tentar rolar a tela num celular já dispara
    // um arraste sem querer.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  )

  const isMensalista = (id: string) => clients.find((c) => c.id === id)?.isMensalista ?? false

  const handleSalvarEdicao = (data: Partial<Bidding>, items: Partial<BiddingItem>[] | null) => {
    if (!editando) return
    updateBidding.mutate({ bidding: { ...editando, ...data } as Bidding, items }, {
      onSuccess: () => { setEditando(null); showToast('Licitação atualizada com sucesso.') },
      onError: (err) => showToast(`Erro ao atualizar a licitação: ${err instanceof Error ? err.message : String(err)}`, 'error'),
    })
  }

  const mudarVisualizacao = (v: Visualizacao) => {
    setVisualizacao(v)
    try {
      localStorage.setItem('cg_kanban_visualizacao', v)
    } catch {
      // Navegação privada, cota estourada, etc. — a troca de visualização
      // continua funcionando na sessão atual, só não persiste pra próxima.
    }
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
  // gerada e Contrato assinado anexado TRAVAM a saída da coluna "Ganha —
  // Pendência" — Empenho não é regra (nem toda prefeitura empenha de fato,
  // ou pode levar meses), então aparece só como aviso informativo, nunca
  // segurando o card aqui pra sempre esperando algo que talvez nunca
  // aconteça.
  const biddingIdsComEmpenho = useMemo(() => new Set(empenhos.map((e) => e.biddingId)), [empenhos])
  const ganhasComBadges = useMemo(() => {
    return biddings
      .filter((b) => b.isActive && b.status === 'Ganhou')
      .map((b) => {
        const badges: BadgePendencia[] = []
        if (!biddingIdsComPropostaReadequada.has(b.id)) badges.push({ label: 'Proposta Readequada', bloqueante: true })
        if (!biddingIdsComContrato.has(b.id)) badges.push({ label: 'Contrato', bloqueante: true })
        if (!biddingIdsComEmpenho.has(b.id)) badges.push({ label: 'Empenho', bloqueante: false })
        return { bidding: b, badges }
      })
  }, [biddings, biddingIdsComPropostaReadequada, biddingIdsComEmpenho, biddingIdsComContrato])
  const ganhasComPendencia = useMemo(
    () => ganhasComBadges.filter((x) => x.badges.some((bd) => bd.bloqueante)),
    [ganhasComBadges]
  )
  // Ganhou, mas já resolveu tudo que travava a saída de "Ganha — Pendência"
  // (Proposta Readequada + Contrato) — vira parte da coluna "Ganha — Sem
  // Pendência", a última etapa antes do card sair de vista de vez.
  const ganhasResolvidas = useMemo(
    () => ganhasComBadges.filter((x) => !x.badges.some((bd) => bd.bloqueante)).map((x) => x.bidding),
    [ganhasComBadges]
  )

  // "Valor Ganho de Fato" é um campo digitado manualmente (ver
  // BiddingFormModal) — quando ainda não foi preenchido, calcula uma
  // aproximação a partir dos itens desta licitação, em vez de cair direto
  // pro valor de participação (que é só o que decidimos disputar, não o
  // que de fato foi adjudicado). Busca em lote (uma query só) os itens de
  // TODAS as licitações "Ganhas" ativas (pendentes e já concluídas), pra
  // servir tanto a coluna "Ganha — Pendência" quanto "Ganha — Sem Pendência".
  const idsTodasGanhas = useMemo(() => ganhasComBadges.map((x) => x.bidding.id), [ganhasComBadges])
  const { items: itensDasGanhas } = useBiddingItemsPorLicitacoes(idsTodasGanhas)
  const valorGanhoPorLicitacao = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const id of idsTodasGanhas) {
      const itens = itensDasGanhas.filter((i) => i.biddingId === id)
      if (itens.length > 0) mapa.set(id, somarValorGanho(itens))
    }
    return mapa
  }, [idsTodasGanhas, itensDasGanhas])

  // Filtro de mês (competência) + cliente + etapas visíveis — vale pro
  // quadro inteiro, do "Sem Etapa" até o resultado final, não só pra parte
  // de resultado como antes (que era uma aba própria "Concluídas").
  const mesAtual = useMemo(() => todayLocalISO().slice(0, 7), [])
  const [mesFiltro, setMesFiltro] = useState<string>('todos')
  const [clienteFiltroId, setClienteFiltroId] = useState<string>('')
  const [segmentosOcultos, setSegmentosOcultos] = useState<Set<SegmentoQuadro>>(new Set())
  const [gavetaAberta, setGavetaAberta] = useState(false)

  const universoQuadro = useMemo(() => biddings.filter((b) => b.isActive), [biddings])

  // Meses com pelo menos uma licitação no quadro, mais recente primeiro — o
  // mês atual sempre aparece na lista mesmo vazio, pra sempre dar pra voltar
  // pra ele explicitamente.
  const mesesDisponiveis = useMemo(() => {
    const meses = new Set(universoQuadro.map(mesCompetencia))
    meses.add(mesAtual)
    return Array.from(meses).sort((a, b) => b.localeCompare(a))
  }, [universoQuadro, mesAtual])

  const clientesDoQuadro = useMemo(() => {
    const ids = new Set(universoQuadro.map((b) => b.clientId))
    return clients.filter((c) => ids.has(c.id)).sort((a, b) => a.name.localeCompare(b.name))
  }, [universoQuadro, clients])

  const formatarMesLabel = (mes: string) => {
    if (mes === 'todos') return 'Todos os meses'
    const [ano, mesNum] = mes.split('-')
    const nome = new Date(Number(ano), Number(mesNum) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    return (mes === mesAtual ? `${nome} (atual)` : nome).replace(/^\w/, (c) => c.toUpperCase())
  }

  const alternarSegmento = (id: SegmentoQuadro) => {
    setSegmentosOcultos((prev) => {
      const novo = new Set(prev)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  const colunas = useMemo(() => {
    const ativasFiltradas = ativas.filter((b) => passaFiltroMesCliente(b, mesFiltro, clienteFiltroId))
    const semEtapa = ativasFiltradas.filter((b) => !b.etapa)
    const porEtapa = ETAPAS.map((etapa) => ({
      etapa,
      itens: ativasFiltradas.filter((b) => b.etapa === etapa),
    }))
    return { semEtapa, porEtapa }
  }, [ativas, mesFiltro, clienteFiltroId])

  const ganhasComPendenciaFiltradas = useMemo(
    () => ganhasComPendencia.filter((x) => passaFiltroMesCliente(x.bidding, mesFiltro, clienteFiltroId)),
    [ganhasComPendencia, mesFiltro, clienteFiltroId]
  )
  const ganhasSemPendenciaFiltradas = useMemo(
    () => ganhasResolvidas.filter((b) => passaFiltroMesCliente(b, mesFiltro, clienteFiltroId)),
    [ganhasResolvidas, mesFiltro, clienteFiltroId]
  )
  const perdeuFiltradas = useMemo(
    () => biddings.filter((b) => b.isActive && b.status === 'Perdeu' && passaFiltroMesCliente(b, mesFiltro, clienteFiltroId)),
    [biddings, mesFiltro, clienteFiltroId]
  )
  const canceladaFiltradas = useMemo(
    () => biddings.filter((b) => b.isActive && b.status === 'Cancelada' && passaFiltroMesCliente(b, mesFiltro, clienteFiltroId)),
    [biddings, mesFiltro, clienteFiltroId]
  )
  const desistiuFiltradas = useMemo(
    () => biddings.filter((b) => b.isActive && b.status === 'Desistiu' && passaFiltroMesCliente(b, mesFiltro, clienteFiltroId)),
    [biddings, mesFiltro, clienteFiltroId]
  )

  const totalVisivel =
    colunas.semEtapa.length +
    colunas.porEtapa.reduce((acc, x) => acc + x.itens.length, 0) +
    ganhasComPendenciaFiltradas.length +
    ganhasSemPendenciaFiltradas.length +
    perdeuFiltradas.length +
    canceladaFiltradas.length +
    desistiuFiltradas.length

  const irParaEtapa = (bidding: Bidding, etapa: BiddingEtapa | null) => {
    // "Adjudicada e Homologada" sempre abre o diálogo da Data de
    // Homologação — mesmo se a licitação já estiver nessa etapa (botão de
    // corrigir do próprio card) ou já tiver uma data gravada (pra corrigir
    // uma data errada/antiga, comum ao lançar licitações antigas). Quem
    // confirma o diálogo é que efetivamente chama updateEtapa (ver
    // HomologacaoDialog acima) — por isso sai daqui antes de checar se a
    // etapa já é a mesma.
    if (etapa === 'Adjudicada e Homologada') {
      setPendenteHomologacao(bidding)
      return
    }
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
    if (!bidding) return
    if (over.id === 'sem-etapa') {
      irParaEtapa(bidding, null)
      return
    }
    const etapaDestino = ETAPAS.find((e) => e === over.id)
    if (!etapaDestino) return
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
        onCorrigirHomologacao={() => irParaEtapa(b, 'Adjudicada e Homologada')}
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

      {visualizacao === 'quadro' && (
        <div className="px-6 mt-4 flex flex-col gap-4">
          <div className="flex items-center gap-3 flex-wrap bg-base-900/60 border border-base-700/50 rounded-xl p-3">
            <button
              onClick={() => setGavetaAberta((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-bold bg-accent-500/12 border border-accent-500/30 text-accent-300 hover:bg-accent-500/20 transition"
            >
              <Filter className="w-3.5 h-3.5" /> Filtros
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${gavetaAberta ? 'rotate-180' : ''}`} />
            </button>
            <span className="text-[12px] text-base-500">
              Mostrando <strong className="text-base-200 font-semibold">{formatarMesLabel(mesFiltro)}</strong>
              {clienteFiltroId && <> · <strong className="text-base-200 font-semibold">{clientName(clienteFiltroId)}</strong></>}
              {segmentosOcultos.size > 0 && (
                <> · <strong className="text-base-200 font-semibold">{SEGMENTOS_QUADRO.length - segmentosOcultos.size}</strong> de {SEGMENTOS_QUADRO.length} etapas</>
              )}
              {' '}· <strong className="text-base-200 font-semibold">{totalVisivel}</strong> licitaç{totalVisivel === 1 ? 'ão' : 'ões'}
            </span>
          </div>

          {gavetaAberta && (
            <div className="flex flex-col gap-4 bg-base-900/60 border border-base-700/50 rounded-xl p-4">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] uppercase tracking-wider text-base-500 font-bold">Mês de competência (data do pregão)</span>
                <div className="flex flex-wrap gap-1.5">
                  {mesesDisponiveis.map((mes) => (
                    <button
                      key={mes}
                      onClick={() => setMesFiltro(mes)}
                      className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition ${
                        mesFiltro === mes ? 'bg-accent-500 text-base-950' : 'bg-base-850 border border-base-700 text-base-500 hover:text-base-300'
                      }`}
                    >
                      {formatarMesLabel(mes)}
                    </button>
                  ))}
                  <button
                    onClick={() => setMesFiltro('todos')}
                    className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition ${
                      mesFiltro === 'todos' ? 'bg-accent-500 text-base-950' : 'bg-base-850 border border-base-700 text-base-500 hover:text-base-300'
                    }`}
                  >
                    Todos os meses
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-2 w-full sm:w-64">
                <span className="text-[10px] uppercase tracking-wider text-base-500 font-bold">Cliente</span>
                <Select value={clienteFiltroId} onChange={(e) => setClienteFiltroId(e.target.value)}>
                  <option value="">Todos os clientes</option>
                  {clientesDoQuadro.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-base-500 font-bold">Etapas visíveis no quadro</span>
                  {segmentosOcultos.size > 0 && (
                    <button onClick={() => setSegmentosOcultos(new Set())} className="text-[11px] font-semibold text-accent-300 hover:underline">
                      Mostrar todas
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SEGMENTOS_QUADRO.map((seg) => {
                    const visivel = !segmentosOcultos.has(seg.id)
                    return (
                      <button
                        key={seg.id}
                        onClick={() => alternarSegmento(seg.id)}
                        className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition ${
                          visivel ? 'bg-accent-500 text-base-950' : 'bg-base-850 border border-base-700 text-base-500 hover:text-base-300'
                        }`}
                      >
                        {seg.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {visualizacao === 'quadro' && (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setArrastando(null)}>
          <div className="px-6 mt-2">
            <TopScrollTable>
              <div className="flex gap-3 min-w-max pb-4">
                {!segmentosOcultos.has('sem-etapa') && (
                  <ColunaKanban id="sem-etapa" titulo="Sem Etapa" itens={colunas.semEtapa.length}>
                    {colunas.semEtapa.length === 0 ? (
                      <p className="text-[11px] text-base-600 italic text-center py-6">Arraste um card aqui pra tirar a etapa</p>
                    ) : (
                      colunas.semEtapa.map(renderCard)
                    )}
                  </ColunaKanban>
                )}

                {colunas.porEtapa
                  .filter(({ etapa }) => !segmentosOcultos.has(etapa))
                  .map(({ etapa, itens }) => (
                    <ColunaKanban key={etapa} id={etapa} titulo={etapa} cor={CORES_COLUNA[etapa]} itens={itens.length}>
                      {itens.length === 0 ? (
                        <p className="text-[11px] text-base-600 italic text-center py-6">Nenhuma licitação aqui</p>
                      ) : (
                        itens.map(renderCard)
                      )}
                    </ColunaKanban>
                  ))}

                {!segmentosOcultos.has('ganhas-pendencia') && (
                  <ColunaKanban id="ganhas-pendencia" titulo="Ganha — Pendência" cor="border-t-positive-500" itens={ganhasComPendenciaFiltradas.length} droppable={false}>
                    {ganhasComPendenciaFiltradas.length === 0 ? (
                      <p className="text-[11px] text-base-600 italic text-center py-6">Nenhuma licitação aqui</p>
                    ) : (
                      ganhasComPendenciaFiltradas.map(({ bidding, badges }) => (
                        <CardLicitacaoGanha
                          key={bidding.id}
                          b={bidding}
                          clienteNome={clientName(bidding.clientId)}
                          badges={badges}
                          valorGanhoCalculado={valorGanhoPorLicitacao.get(bidding.id)}
                          onCorrigirHomologacao={podeEditar ? () => setPendenteHomologacao(bidding) : undefined}
                        />
                      ))
                    )}
                  </ColunaKanban>
                )}

                {!segmentosOcultos.has('ganhas-sem-pendencia') && (
                  <ColunaKanban id="ganhas-sem-pendencia" titulo="Ganha — Sem Pendência" cor="border-t-positive-500" itens={ganhasSemPendenciaFiltradas.length} droppable={false}>
                    {ganhasSemPendenciaFiltradas.length === 0 ? (
                      <p className="text-[11px] text-base-600 italic text-center py-6">Nenhuma licitação aqui</p>
                    ) : (
                      ganhasSemPendenciaFiltradas.map((b) => (
                        <CardLicitacaoConcluida
                          key={b.id}
                          b={b}
                          clienteNome={clientName(b.clientId)}
                          valorGanhoCalculado={valorGanhoPorLicitacao.get(b.id)}
                          onCorrigirHomologacao={podeEditar ? () => setPendenteHomologacao(b) : undefined}
                        />
                      ))
                    )}
                  </ColunaKanban>
                )}

                {!segmentosOcultos.has('Perdeu') && (
                  <ColunaKanban id="perdeu" titulo="Perdeu" cor={CORES_COLUNA_RESULTADO.Perdeu} itens={perdeuFiltradas.length} droppable={false}>
                    {perdeuFiltradas.length === 0 ? (
                      <p className="text-[11px] text-base-600 italic text-center py-6">Nenhuma licitação aqui</p>
                    ) : (
                      perdeuFiltradas.map((b) => <CardLicitacaoConcluida key={b.id} b={b} clienteNome={clientName(b.clientId)} />)
                    )}
                  </ColunaKanban>
                )}

                {!segmentosOcultos.has('Cancelada') && (
                  <ColunaKanban id="cancelada" titulo="Cancelada" cor={CORES_COLUNA_RESULTADO.Cancelada} itens={canceladaFiltradas.length} droppable={false}>
                    {canceladaFiltradas.length === 0 ? (
                      <p className="text-[11px] text-base-600 italic text-center py-6">Nenhuma licitação aqui</p>
                    ) : (
                      canceladaFiltradas.map((b) => <CardLicitacaoConcluida key={b.id} b={b} clienteNome={clientName(b.clientId)} />)
                    )}
                  </ColunaKanban>
                )}

                {!segmentosOcultos.has('Desistiu') && (
                  <ColunaKanban id="desistiu" titulo="Desistiu" cor={CORES_COLUNA_RESULTADO.Desistiu} itens={desistiuFiltradas.length} droppable={false}>
                    {desistiuFiltradas.length === 0 ? (
                      <p className="text-[11px] text-base-600 italic text-center py-6">Nenhuma licitação aqui</p>
                    ) : (
                      desistiuFiltradas.map((b) => <CardLicitacaoConcluida key={b.id} b={b} clienteNome={clientName(b.clientId)} />)
                    )}
                  </ColunaKanban>
                )}
              </div>
            </TopScrollTable>
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
      )}
      {visualizacao === 'lista' && (
        <div className="px-6 mt-4">
          <div className="bg-base-900/60 border border-base-700/50 rounded-xl overflow-hidden">
            {ativas.length === 0 ? (
              <div className="p-10 text-center text-base-500 text-sm">Nenhuma licitação em andamento.</div>
            ) : (
              <TopScrollTable>
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
                        <td className="px-4 py-3 font-mono font-semibold text-base-200 text-[13px]" title={b.valorLicitado > 0 ? undefined : 'Edital não declara um total explícito — aproximado pela soma dos itens'}>
                          {formatBRL(valorExibicaoEdital(b))}
                        </td>
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
              </TopScrollTable>
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
      {/* key troca a cada licitação — remonta o diálogo do zero (pré-preenche
          com a data já gravada daquela licitação, se houver) em vez de
          sincronizar o estado via useEffect */}
      {podeEditar && (
        <HomologacaoDialog key={pendenteHomologacao?.id ?? 'none'} bidding={pendenteHomologacao} onClose={() => setPendenteHomologacao(null)} />
      )}
    </div>
  )
}
