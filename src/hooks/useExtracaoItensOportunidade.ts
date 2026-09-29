import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import type { Database, Json } from '../types/database'
import type { ItemExtraido } from './useExtracaoItensEdital'

export type ExtracaoItensStatus = 'processando' | 'concluido' | 'erro' | string

export interface ExtracaoItensOportunidade {
  id: string
  userId: string
  opportunityId: string
  status: ExtracaoItensStatus
  itens: ItemExtraido[] | null
  erroMensagem: string | null
  createdAt: string
  updatedAt: string
}

function fromRow(r: Database['public']['Tables']['opportunity_itens_extracao']['Row']): ExtracaoItensOportunidade {
  return {
    id: r.id,
    userId: r.user_id,
    opportunityId: r.opportunity_id,
    status: r.status,
    itens: (r.itens as ItemExtraido[] | null) ?? null,
    erroMensagem: r.erro_mensagem,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const QUERY_KEY = ['opportunity_itens_extracao']

// Mesmo limite usado em useExtracaoItensEdital.
const LIMITE_PROCESSANDO_MS = 3 * 60 * 1000

// Mesmo padrão de useExtracaoItensEdital, mas pro estágio de Oportunidade —
// permite rodar a extração dedicada de itens (Extrair-itens-oportunidade)
// antes mesmo da licitação existir de verdade. Ao converter a oportunidade,
// o resultado é copiado direto pra bidding_itens_extracao (ver
// useOpportunities.ts), igual já acontece com a análise completa.
export function useExtracaoItensOportunidade(opportunityId?: string) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const queryKey = [...QUERY_KEY, opportunityId]

  const query = useQuery({
    queryKey,
    enabled: !!user && !!opportunityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('opportunity_itens_extracao')
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
    refetchIntervalInBackground: true,
  })

  const extracao = query.data ?? null

  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    if (extracao?.status !== 'processando') return
    const id = setInterval(() => setAgora(Date.now()), 5000)
    return () => clearInterval(id)
  }, [extracao?.status])

  const travado = !!extracao
    && extracao.status === 'processando'
    && agora - new Date(extracao.updatedAt).getTime() > LIMITE_PROCESSANDO_MS

  const extrair = useMutation({
    mutationFn: async () => {
      if (!opportunityId) throw new Error('Oportunidade não informada')
      const { error } = await supabase.functions.invoke('Extrair-itens-oportunidade', { body: { opportunityId } })
      if (error) throw error
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  const limparExtracao = useMutation({
    mutationFn: async () => {
      if (!opportunityId) throw new Error('Oportunidade não informada')
      const { error } = await supabase.from('opportunity_itens_extracao').delete().eq('opportunity_id', opportunityId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  const alternarItemParticipando = useMutation({
    mutationFn: async (index: number) => {
      if (!opportunityId) throw new Error('Oportunidade não informada')
      if (!extracao?.itens?.[index]) throw new Error('Item não encontrado na extração')
      const itens = extracao.itens.map((it, i) => (i === index ? { ...it, participando: it.participando === false } : it))
      const { error } = await supabase.from('opportunity_itens_extracao').update({ itens: itens as unknown as Json }).eq('opportunity_id', opportunityId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const definirTodosParticipando = useMutation({
    mutationFn: async (participando: boolean) => {
      if (!opportunityId) throw new Error('Oportunidade não informada')
      if (!extracao?.itens?.length) return
      const itens = extracao.itens.map((it) => ({ ...it, participando }))
      const { error } = await supabase.from('opportunity_itens_extracao').update({ itens: itens as unknown as Json }).eq('opportunity_id', opportunityId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  return {
    extracao,
    isLoading: query.isLoading,
    travado,
    extrair,
    limparExtracao,
    alternarItemParticipando,
    definirTodosParticipando,
  }
}
