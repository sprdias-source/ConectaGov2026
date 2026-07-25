import { calcularHabilitacao, useBiddingChecklist, type StatusHabilitacao } from '../../hooks/useBiddingChecklist'
import { useClientDocuments } from '../../hooks/useClientDocuments'
import type { Bidding } from '../../types/domain'

const COR_STATUS: Record<Exclude<StatusHabilitacao, null>, string> = {
  HABILITADO: 'text-positive-400',
  'ATENÇÃO': 'text-warning-400',
  INABILITADO: 'text-negative-400',
}

const LABEL_STATUS: Record<Exclude<StatusHabilitacao, null>, string> = {
  HABILITADO: 'Habilitado',
  'ATENÇÃO': 'Atenção',
  INABILITADO: 'Inabilitado',
}

// Selo compacto (só texto colorido, sem card) com o status de habilitação
// de uma licitação — usado nas linhas de BiddingsTab.tsx e nos cartões de
// KanbanLicitacoesPage.tsx. Busca o checklist e as certidões do cliente
// sozinho, então basta passar a licitação. Lógica de cálculo compartilhada
// com LicitacaoPage.tsx vive em hooks/useBiddingChecklist.ts.
export default function SeloHabilitacao({ bidding, className = '' }: { bidding: Bidding; className?: string }) {
  const { items } = useBiddingChecklist(bidding.id)
  const { documents } = useClientDocuments(bidding.clientId)
  const { status } = calcularHabilitacao(items, documents)

  if (!status) return null

  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider ${COR_STATUS[status]} ${className}`}>
      {LABEL_STATUS[status]}
    </span>
  )
}
