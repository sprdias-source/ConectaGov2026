import { useMemo } from 'react'
import { useBiddings } from './useBiddings'
import { useAllBiddingChecklistItems, calcularHabilitacao } from './useBiddingChecklist'
import { useAllClientDocuments } from './useClientDocuments'
import { todayLocalISO } from '../lib/dateUtils'
import type { Bidding } from '../types/domain'

export const JANELA_SESSAO_RISCO_DIAS = 3

export interface SessaoDeRisco {
  bidding: Bidding
  dias: number
  status: 'ATENÇÃO' | 'INABILITADO'
}

// Combinação perigosa: sessão de disputa nos próximos N dias E
// documentação ainda não pronta (ATENÇÃO = certidão vencendo, INABILITADO
// = falta item obrigatório) — vai disputar sem estar pronto. Extraído de
// DashboardPage.tsx pra ser reaproveitado em HojePage.tsx sem duplicar.
export function useSessoesDeRisco() {
  const { biddings, isLoading: loadingBiddings } = useBiddings()
  const { items: allChecklistItems, isLoading: loadingChecklist } = useAllBiddingChecklistItems()
  const { documents: allClientDocs, isLoading: loadingDocs } = useAllClientDocuments()

  const sessoesDeRisco = useMemo(() => {
    const hoje = todayLocalISO()
    return biddings
      .filter((b) => b.isActive && b.status === 'Em Andamento')
      .map((b) => {
        const dias = Math.floor(
          (new Date(b.dataAbertura + 'T00:00:00').getTime() - new Date(hoje + 'T00:00:00').getTime())
          / (1000 * 60 * 60 * 24)
        )
        if (dias < 0 || dias > JANELA_SESSAO_RISCO_DIAS) return null
        const itemsDaLicitacao = allChecklistItems.filter((i) => i.biddingId === b.id)
        const docsDoCliente = allClientDocs.filter((d) => d.clientId === b.clientId)
        const { status } = calcularHabilitacao(itemsDaLicitacao, docsDoCliente)
        if (status !== 'ATENÇÃO' && status !== 'INABILITADO') return null
        return { bidding: b, dias, status } as SessaoDeRisco
      })
      .filter((x): x is SessaoDeRisco => x !== null)
      .sort((a, b) => a.dias - b.dias)
  }, [biddings, allChecklistItems, allClientDocs])

  return {
    sessoesDeRisco,
    isLoading: loadingBiddings || loadingChecklist || loadingDocs,
  }
}
