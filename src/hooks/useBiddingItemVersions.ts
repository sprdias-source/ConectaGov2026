import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export interface BiddingItemVersion {
  id: string
  biddingId: string
  versao: number
  itensSnapshot: any[]
  alteradoPorEmail: string | null
  enviada: boolean
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
  const queryClient = useQueryClient()

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
        enviada: r.enviada,
        createdAt: r.created_at,
      })) as BiddingItemVersion[]
    },
  })

  // Marca uma versão como "a que foi enviada" — desmarca qualquer outra
  // versão dessa mesma licitação que estivesse marcada antes, pra nunca
  // haver duas versões "enviadas" ao mesmo tempo.
  //
  // Limitação conhecida: as duas escritas abaixo (desmarcar a antiga,
  // marcar a nova) não são atômicas — não há transação nem constraint no
  // banco garantindo a invariante. Em teoria, dois cliques quase
  // simultâneos em versões diferentes (ou duas abas abertas na mesma
  // licitação) podem intercalar essas escritas e deixar duas versões
  // marcadas como enviada=true. O botão que dispara essa mutation fica
  // desabilitado durante `marcarComoEnviada.isPending` (ver
  // HistoricoVersoes em LicitacaoPage.tsx), o que evita o caso mais comum
  // (duplo clique na mesma aba) — mas não cobre duas abas/dispositivos
  // diferentes agindo ao mesmo tempo. Resolver isso de vez exigiria uma
  // transação/constraint no Postgres, fora do alcance de uma correção só
  // no cliente.
  const marcarComoEnviada = useMutation({
    mutationFn: async (versionId: string) => {
      if (!biddingId) throw new Error('Licitação não informada')
      const { error: clearError } = await supabase
        .from('bidding_items_versions')
        .update({ enviada: false })
        .eq('bidding_id', biddingId)
        .eq('enviada', true)
      if (clearError) throw clearError

      const { error } = await supabase
        .from('bidding_items_versions')
        .update({ enviada: true })
        .eq('id', versionId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bidding_items_versions', biddingId] })
    },
  })

  return {
    versoes: query.data ?? [],
    isLoading: query.isLoading,
    marcarComoEnviada,
  }
}
