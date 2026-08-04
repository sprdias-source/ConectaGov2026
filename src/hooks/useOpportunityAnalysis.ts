import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import type { Database } from '../types/database'

export type OpportunityAnalysisStatus = 'processando' | 'concluido' | 'erro' | string

export interface OpportunityAnalysisResult {
  id: string
  userId: string
  opportunityId: string
  status: OpportunityAnalysisStatus
  analise: Record<string, unknown> | null
  erroMensagem: string | null
  createdAt: string
  updatedAt: string
}

function fromRow(r: Database['public']['Tables']['opportunity_analysis']['Row']): OpportunityAnalysisResult {
  return {
    id: r.id,
    userId: r.user_id,
    opportunityId: r.opportunity_id,
    status: r.status,
    analise: (r.analise as Record<string, unknown> | null) ?? null,
    erroMensagem: r.erro_mensagem,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const QUERY_KEY = ['opportunity_analysis']

// Mesmo limite usado em useBiddingAnalysis: se a function travar antes de
// gravar o resultado, a linha fica presa em 'processando' pra sempre.
const LIMITE_PROCESSANDO_MS = 3 * 60 * 1000

// Mesmo padrão de useBiddingAnalysis, mas pro estágio de Oportunidade —
// permite rodar a mesma análise de IA (Analisar-oportunidade) antes mesmo
// da licitação existir de verdade. Ao converter a oportunidade, o
// resultado é copiado direto pra bidding_analysis (ver useOpportunities.ts)
// em vez de rodar a IA de novo.
export function useOpportunityAnalysis(opportunityId?: string) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const queryKey = [...QUERY_KEY, opportunityId]

  const query = useQuery({
    queryKey,
    enabled: !!user && !!opportunityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('opportunity_analysis')
        .select('*')
        .eq('opportunity_id', opportunityId!)
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

  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    if (analysis?.status !== 'processando') return
    const id = setInterval(() => setAgora(Date.now()), 5000)
    return () => clearInterval(id)
  }, [analysis?.status])

  const travado = !!analysis
    && analysis.status === 'processando'
    && agora - new Date(analysis.updatedAt).getTime() > LIMITE_PROCESSANDO_MS

  const analisar = useMutation({
    mutationFn: async () => {
      if (!opportunityId) throw new Error('Oportunidade não informada')
      const { error } = await supabase.functions.invoke('Analisar-oportunidade', { body: { opportunityId } })
      if (error) throw error
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  // Apaga o resultado da análise guardado pra esta oportunidade — usado
  // quando o edital que gerou aquela análise é removido (ou trocado por
  // outro), mesma ideia de limparAnalise em useBiddingAnalysis.ts.
  const limparAnalise = useMutation({
    mutationFn: async () => {
      if (!opportunityId) throw new Error('Oportunidade não informada')
      const { error } = await supabase.from('opportunity_analysis').delete().eq('opportunity_id', opportunityId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  // Liga/desliga "participando" de um item — o edital às vezes traz itens
  // que a empresa não vai disputar (ver mapearItensDaAnalise, o único ponto
  // por onde essa flag é lida na hora de preencher bidding_items de
  // verdade). Mexe só no array de itens dentro do JSON, sem tocar em mais
  // nada da análise.
  const alternarItemParticipando = useMutation({
    mutationFn: async (index: number) => {
      if (!opportunityId) throw new Error('Oportunidade não informada')
      const atual = analysis?.analise as { itens?: { participando?: boolean }[] } | null | undefined
      if (!atual?.itens?.[index]) throw new Error('Item não encontrado na análise')
      const itens = atual.itens.map((it, i) => (i === index ? { ...it, participando: it.participando === false } : it))
      const { error } = await supabase.from('opportunity_analysis').update({ analise: { ...atual, itens } }).eq('opportunity_id', opportunityId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  // Marcar/desmarcar todos de uma vez — útil quando só um ou dois itens do
  // meio de uma lista grande são exceção (mais rápido que desmarcar um por
  // um a partir do padrão "todos participam").
  const definirTodosParticipando = useMutation({
    mutationFn: async (participando: boolean) => {
      if (!opportunityId) throw new Error('Oportunidade não informada')
      const atual = analysis?.analise as { itens?: { participando?: boolean }[] } | null | undefined
      if (!atual?.itens?.length) return
      const itens = atual.itens.map((it) => ({ ...it, participando }))
      const { error } = await supabase.from('opportunity_analysis').update({ analise: { ...atual, itens } }).eq('opportunity_id', opportunityId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  return {
    analysis,
    isLoading: query.isLoading,
    travado,
    analisar,
    limparAnalise,
    alternarItemParticipando,
    definirTodosParticipando,
  }
}
