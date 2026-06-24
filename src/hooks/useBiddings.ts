import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromBiddingRow, toBiddingInsert } from '../lib/mappers'
import type { Bidding } from '../types/domain'
import { useAuth } from './useAuth'
import { useAuditLog } from './useAuditLog'

const QUERY_KEY = ['biddings']

export function useBiddings() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { logEvent } = useAuditLog()

  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('biddings')
        .select('*')
        .order('data_abertura', { ascending: false })
      if (error) throw error
      return data.map(fromBiddingRow)
    },
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    queryClient.invalidateQueries({ queryKey: ['transactions'] })
    queryClient.invalidateQueries({ queryKey: ['empenhos'] })
  }

  const addBidding = useMutation({
    mutationFn: async (bidding: Partial<Bidding>) => {
      if (!user) throw new Error('Usuário não autenticado')
      const { data, error } = await supabase
        .from('biddings')
        .insert(toBiddingInsert(bidding, user.id))
        .select()
        .single()
      if (error) throw error
      return fromBiddingRow(data)
    },
    onSuccess: (created) => {
      invalidate()
      logEvent('Criou Licitação', `Iniciou licitação "${created.objeto}" no órgão "${created.orgao}" (Valor de R$ ${created.valorLicitado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`)
    },
  })

  const updateBidding = useMutation({
    mutationFn: async (bidding: Bidding) => {
      const { data, error } = await supabase
        .from('biddings')
        .update(toBiddingInsert(bidding, bidding.userId))
        .eq('id', bidding.id)
        .select()
        .single()
      if (error) throw error
      return fromBiddingRow(data)
    },
    onSuccess: (updated) => {
      invalidate()
      logEvent('Editou Licitação', `Atualizou licitação "${updated.objeto}" (Órgão: ${updated.orgao}) — status: ${updated.status}`)
    },
  })

  const deleteBidding = useMutation({
    mutationFn: async (bidding: Bidding) => {
      const { error } = await supabase.from('biddings').delete().eq('id', bidding.id)
      if (error) throw error
      return bidding
    },
    onSuccess: (deleted) => {
      invalidate()
      logEvent('Excluiu Licitação', `Removeu a licitação do órgão "${deleted.orgao}" referente ao objeto "${deleted.objeto}". Empenhos e lançamentos vinculados foram removidos automaticamente.`)
    },
  })

  return {
    biddings: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    addBidding,
    updateBidding,
    deleteBidding,
  }
}
