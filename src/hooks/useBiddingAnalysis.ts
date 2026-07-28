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

// Se a function travar ou for encerrada à força pela plataforma (limite de
// memória/tempo) antes de conseguir gravar o resultado, a linha fica presa
// em status='processando' pra sempre — a function morta não tem como
// atualizar mais nada. Passado esse tempo sem novidade, tratamos como
// falho na tela em vez de confiar cegamente e ficar reconsultando pra
// sempre (nenhum edital, por maior que seja, deveria levar tanto tempo).
const LIMITE_PROCESSANDO_MS = 3 * 60 * 1000

// Análise do edital por IA — a tabela bidding_analysis e a function
// Analisar-edital já existem no banco (feitas por fora deste repo). Aqui é
// só a leitura do resultado + o disparo da análise. Enquanto status estiver
// 'processando' (a function roda em segundo plano e atualiza a linha
// depois), a query fica se atualizando sozinha até sair desse estado — ou
// até o limite de tempo acima, o que vier primeiro.
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
    refetchInterval: (query) => {
      const data = query.state.data
      if (data?.status !== 'processando') return false
      const decorrido = Date.now() - new Date(data.updatedAt).getTime()
      return decorrido > LIMITE_PROCESSANDO_MS ? false : 3000
    },
  })

  const analysis = query.data ?? null
  const travado = !!analysis
    && analysis.status === 'processando'
    && Date.now() - new Date(analysis.updatedAt).getTime() > LIMITE_PROCESSANDO_MS

  const analisar = useMutation({
    mutationFn: async () => {
      if (!biddingId) throw new Error('Licitação não informada')
      const { error } = await supabase.functions.invoke('Analisar-edital', { body: { biddingId } })
      if (error) throw error
    },
    // onSettled (não só onSuccess): a function grava status='erro' + a
    // mensagem real na linha antes de responder, mesmo quando retorna um
    // status de erro pro client. Sem reconsultar aqui também nesse caso, um
    // "Tentar novamente" que falha rápido deixa a tela presa mostrando pra
    // sempre a mensagem antiga de "travado", mesmo com um resultado (ou erro
    // de verdade) já disponível no banco.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  // Apaga o resultado da análise guardado pra esta licitação — usado quando
  // o edital que gerou aquela análise é removido (ou trocado por outro), pra
  // não deixar dado de um documento que não existe mais disponível pra
  // "Preencher Licitação com estes Dados" nem exibido como se ainda
  // valesse. Sem isso, a análise antiga ficava presa até alguém clicar
  // "Analisar Novamente" por conta própria.
  const limparAnalise = useMutation({
    mutationFn: async () => {
      if (!biddingId) throw new Error('Licitação não informada')
      const { error } = await supabase.from('bidding_analysis').delete().eq('bidding_id', biddingId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  return {
    analysis,
    isLoading: query.isLoading,
    travado,
    analisar,
    limparAnalise,
  }
}
