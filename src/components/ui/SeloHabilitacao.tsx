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

// Renderização pura do selo, a partir de um status já calculado — pra usar
// em telas com várias licitações ao mesmo tempo (Kanban, lista de
// Cadastros), onde calcular o status individualmente por card/linha (a
// versão abaixo, que busca sozinha) significava uma consulta de checklist +
// uma de certidões por card. Nesses casos, combine com
// useHabilitacaoPorLicitacao (hooks/useBiddingChecklist.ts), que busca tudo
// de uma vez só e devolve um mapa biddingId → status.
export function SeloHabilitacaoBadge({ status, className = '' }: { status: StatusHabilitacao; className?: string }) {
  if (!status) return null
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider ${COR_STATUS[status]} ${className}`}>
      {LABEL_STATUS[status]}
    </span>
  )
}

// Selo compacto (só texto colorido, sem card) com o status de habilitação
// de UMA licitação — busca o checklist e as certidões do cliente sozinho,
// então basta passar a licitação. Indicado só quando é um selo isolado na
// tela (ex: detalhe de uma licitação); em listas/grades com várias
// licitações, prefira SeloHabilitacaoBadge + useHabilitacaoPorLicitacao,
// que buscam tudo de uma vez em vez de uma consulta por linha/card. Lógica
// de cálculo compartilhada com LicitacaoPage.tsx vive em
// hooks/useBiddingChecklist.ts.
export default function SeloHabilitacao({ bidding, className = '' }: { bidding: Bidding; className?: string }) {
  const { items } = useBiddingChecklist(bidding.id)
  const { documents } = useClientDocuments(bidding.clientId)
  const { status } = calcularHabilitacao(items, documents)
  return <SeloHabilitacaoBadge status={status} className={className} />
}
