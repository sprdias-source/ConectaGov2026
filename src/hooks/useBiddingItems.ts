import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromBiddingItemRow, toBiddingItemInsert } from '../lib/mappers'
import type { BiddingItem } from '../types/domain'
import { useAuth } from './useAuth'

const EMPTY_ITEMS: BiddingItem[] = []

export function useBiddingItems(biddingId: string | null) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const queryKey = ['bidding_items', biddingId]

  const query = useQuery({
    queryKey,
    enabled: !!user && !!biddingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bidding_items')
        .select('*')
        .eq('bidding_id', biddingId as string)
        .order('numero_item', { ascending: true })
      if (error) throw error
      return data.map(fromBiddingItemRow)
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey })

  const setItems = useMutation({
    mutationFn: async (items: Partial<BiddingItem>[]) => {
      if (!user || !biddingId) throw new Error('Licitação não definida')
      // Substitui o conjunto de itens por completo: remove os antigos e
      // insere os novos. Mais simples e seguro que tentar diff/merge na UI.
      const { error: delError } = await supabase.from('bidding_items').delete().eq('bidding_id', biddingId)
      if (delError) throw delError
      if (items.length === 0) return []
      const { data, error } = await supabase
        .from('bidding_items')
        .insert(items.map((i) => toBiddingItemInsert({ ...i, biddingId }, user.id)))
        .select()
      if (error) throw error
      return data.map(fromBiddingItemRow)
    },
    onSuccess: invalidate,
  })

  // CORREÇÃO DE BUG CRÍTICO: sem este useMemo, "query.data ?? []" criava um
  // array NOVO (nova referência) a cada chamada do hook. Como o
  // BiddingFormModal usava esse valor como dependência de um useEffect,
  // isso causava um LOOP INFINITO de re-render sempre que o componente
  // estivesse montado — mesmo com o modal fechado, já que React não
  // desmonta o formulário só por causa do `open=false`. Esse loop rodando
  // em segundo plano era a causa real da sensação de "sistema travando"
  // ao navegar entre abas.
  const items = useMemo(() => query.data ?? EMPTY_ITEMS, [query.data])

  return {
    items,
    isLoading: query.isLoading,
    setItems,
  }
}
