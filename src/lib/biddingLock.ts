import { useEffect, useState } from 'react'
import type { Bidding } from '../types/domain'

// Uma licitação com resultado "Ganhou" E etapa "Adjudicada e Homologada" já
// está com os dados definitivos — o Kanban preenche tudo que alimenta (ver
// analiseEdital.ts: somarValorGanho, gravado automaticamente em
// useBiddings.ts assim que as duas condições ficam verdadeiras). A partir
// daqui, editar manualmente o cadastro, rodar uma nova análise de IA ou
// mexer nos itens/proposta só acontece mediante confirmação de senha, pra
// não desfazer sem querer um processo já encerrado — a licitação continua
// editável, só passa a exigir senha, igual à exclusão (ver
// DeleteWithPasswordDialog).
export function licitacaoBloqueadaPorResultado(bidding: Pick<Bidding, 'status' | 'etapa'>): boolean {
  return bidding.status === 'Ganhou' && bidding.etapa === 'Adjudicada e Homologada'
}

const UNLOCK_STORAGE_PREFIX = 'bidding-unlocked:'

function estaDesbloqueada(biddingId: string): boolean {
  try {
    return sessionStorage.getItem(`${UNLOCK_STORAGE_PREFIX}${biddingId}`) === '1'
  } catch {
    return false
  }
}

// Desbloqueio vale pra sessão inteira do navegador (não só pro componente
// atual) — sem isso, pediria senha de novo a cada troca de aba dentro da
// mesma licitação (Cadastro, Edital & Análise, Itens/Proposta). Guardado no
// sessionStorage porque BiddingFormModal também abre fora da LicitacaoPage
// (em Cadastros > Licitações e no Kanban), sem árvore de componentes em
// comum com essas outras telas.
export function useBiddingEditLock(bidding: Pick<Bidding, 'id' | 'status' | 'etapa'> | null | undefined) {
  const bloqueadaPeloResultado = !!bidding && licitacaoBloqueadaPorResultado(bidding)
  const [desbloqueada, setDesbloqueada] = useState(() => !!bidding && estaDesbloqueada(bidding.id))

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- recarrega do sessionStorage (fonte externa) sempre que a licitação em tela muda.
    setDesbloqueada(!!bidding && estaDesbloqueada(bidding.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bidding?.id])

  const desbloquear = () => {
    if (!bidding) return
    try {
      sessionStorage.setItem(`${UNLOCK_STORAGE_PREFIX}${bidding.id}`, '1')
    } catch {
      // sessionStorage indisponível — degrada pra estado só em memória.
    }
    setDesbloqueada(true)
  }

  return {
    bloqueada: bloqueadaPeloResultado && !desbloqueada,
    desbloquear,
  }
}
