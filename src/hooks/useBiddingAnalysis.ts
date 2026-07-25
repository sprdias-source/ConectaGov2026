import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import type { Database } from '../types/database'

export type BiddingAnalysisStatus = 'processando' | 'concluido' | 'erro' | string

export interface BiddingAnalysis {
  id: string
  userId: string
  biddingId: string
  status: BiddingAnalysisStatus
  analise: Record<string, unknown> | null
  erroMensagem: string | null
  createdAt: string
  updatedAt: string
}

function fromRow(r: Database['public']['Tables']['bidding_analysis']['Row']): BiddingAnalysis {
  return {
    id: r.id,
    userId: r.user_id,
    biddingId: r.bidding_id,
    status: r.status,
    analise: (r.analise as Record<string, unknown> | null) ?? null,
    erroMensagem: r.erro_mensagem,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const QUERY_KEY = ['bidding_analysis']

// Análise do edital por IA — a tabela bidding_analysis e a function
// analisar-edital já existem no banco (feitas por fora deste repo). Aqui é
// só a leitura do resultado + o disparo da análise. Enquanto status estiver
// 'processando' (a function roda em segundo plano e atualiza a linha
// depois), a query fica se atualizando sozinha até sair desse estado.
export function useBiddingAnalysis(biddingId?: string) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const queryKey = [...QUERY_KEY, biddingId]

  const query = useQuery({
    queryKey,
    enabled: !!user && !!biddingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bidding_analysis')
        .select('*')
        .eq('bidding_id', biddingId!)
        .maybeSingle()
      if (error) throw error
      return data ? fromRow(data) : null
    },
    refetchInterval: (query) => (query.state.data?.status === 'processando' ? 3000 : false),
  })

  const analisar = useMutation({
    mutationFn: async () => {
      if (!biddingId) throw new Error('Licitação não informada')
      const { error } = await supabase.functions.invoke('analisar-edital', { body: { biddingId } })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  return {
    analysis: query.data ?? null,
    isLoading: query.isLoading,
    analisar,
  }
}
