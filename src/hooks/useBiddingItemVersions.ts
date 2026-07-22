import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export interface BiddingItemVersion {
  id: string
  biddingId: string
  versao: number
  itensSnapshot: any[]
  alteradoPorEmail: string | null
  createdAt: string
}

// Histórico de versões dos itens (preços, margens) de uma licitação —
// uma "foto" é gravada automaticamente toda vez que a licitação é editada
// com itens já existentes (ver `snapshotItemsBeforeOverwrite` em
// useBiddings.ts). Aqui é só leitura — não existe função de "restaurar"
// de propósito, pra não arriscar sobrescrever algo sem querer; o valor já
// está em poder CONFERIR o que mudou e quem mudou.
export function useBiddingItemVersions(biddingId?: string) {
  const { user } = useAuth()

  const query = useQuery({
    queryKey: ['bidding_items_versions', biddingId],
    enabled: !!user && !!biddingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bidding_items_versions')
        .select('*')
        .eq('bidding_id', biddingId!)
        .order('versao', { ascending: false })
      if (error) throw error
      return (data ?? []).map((r) => ({
        id: r.id,
        biddingId: r.bidding_id,
        versao: r.versao,
        itensSnapshot: r.itens_snapshot ?? [],
        alteradoPorEmail: r.alterado_por_email,
        createdAt: r.created_at,
      })) as BiddingItemVersion[]
    },
  })

  return {
    versoes: query.data ?? [],
    isLoading: query.isLoading,
  }
}
