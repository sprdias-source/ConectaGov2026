import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import type { Database, Json } from '../types/database'

export type ExtracaoItensStatus = 'processando' | 'concluido' | 'erro' | string

export interface ItemExtraido {
  numero?: string | number
  lote?: string | number
  descricao: string
  unidade?: string
  quantidade?: number
  valorReferencia?: number
  participando?: boolean
}

export interface ExtracaoItens {
  id: string
  userId: string
  biddingId: string
  status: ExtracaoItensStatus
  itens: ItemExtraido[] | null
  erroMensagem: string | null
  createdAt: string
  updatedAt: string
}

function fromRow(r: Database['public']['Tables']['bidding_itens_extracao']['Row']): ExtracaoItens {
  return {
    id: r.id,
    userId: r.user_id,
    biddingId: r.bidding_id,
    status: r.status,
    itens: (r.itens as ItemExtraido[] | null) ?? null,
    erroMensagem: r.erro_mensagem,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const QUERY_KEY = ['bidding_itens_extracao']

// Mesmo raciocínio de useBiddingAnalysis: se a function travar antes de
// gravar o resultado, a linha fica presa em 'processando' pra sempre.
const LIMITE_PROCESSANDO_MS = 3 * 60 * 1000

// Extração de itens dedicada (botão "Puxar Itens", ao lado de "Analisar com
// IA") — mesmo padrão de useBiddingAnalysis, mas guardada numa tabela
// própria (bidding_itens_extracao) pra ter seu próprio orçamento de tempo de
// execução na Edge Function, sem competir com resumo/checklist/habilitação
// (ver Extrair-itens-edital, criada porque editais de 100+ itens estouravam
// o teto de tempo da análise completa).
export function useExtracaoItensEdital(biddingId?: string) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const queryKey = [...QUERY_KEY, biddingId]

  const query = useQuery({
    queryKey,
    enabled: !!user && !!biddingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bidding_itens_extracao')
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
      if (!biddingId) throw new Error('Licitação não informada')
      const { error } = await supabase.functions.invoke('Extrair-itens-edital', { body: { biddingId } })
      if (error) throw error
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  // Apaga o resultado guardado pra esta licitação — usado quando o edital
  // que gerou aquela extração é removido (ou trocado por outro), mesma
  // ideia de limparAnalise em useBiddingAnalysis.ts.
  const limparExtracao = useMutation({
    mutationFn: async () => {
      if (!biddingId) throw new Error('Licitação não informada')
      const { error } = await supabase.from('bidding_itens_extracao').delete().eq('bidding_id', biddingId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  // Liga/desliga "participando" de um item — mesma lógica de
  // alternarItemParticipando em useBiddingAnalysis.ts, só que aqui o array
  // de itens é a coluna inteira (não um campo dentro de um JSON maior).
  const alternarItemParticipando = useMutation({
    mutationFn: async (index: number) => {
      if (!biddingId) throw new Error('Licitação não informada')
      if (!extracao?.itens?.[index]) throw new Error('Item não encontrado na extração')
      const itens = extracao.itens.map((it, i) => (i === index ? { ...it, participando: it.participando === false } : it))
      const { error } = await supabase.from('bidding_itens_extracao').update({ itens: itens as unknown as Json }).eq('bidding_id', biddingId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const definirTodosParticipando = useMutation({
    mutationFn: async (participando: boolean) => {
      if (!biddingId) throw new Error('Licitação não informada')
      if (!extracao?.itens?.length) return
      const itens = extracao.itens.map((it) => ({ ...it, participando }))
      const { error } = await supabase.from('bidding_itens_extracao').update({ itens: itens as unknown as Json }).eq('bidding_id', biddingId)
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
