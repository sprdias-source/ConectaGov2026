import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromBiddingItemRow, toBiddingItemInsert } from '../lib/mappers'
import { compararNumeroItem } from '../lib/numberParsing'
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
      if (error) throw error
      // Ordena no cliente com comparador numérico — numero_item é texto
      // livre ("1", "2", ..., "10"), e um ORDER BY direto no Postgres é
      // lexicográfico (colocaria "10" antes de "2").
      return data.map(fromBiddingItemRow).sort((a, b) => compararNumeroItem(a.numeroItem, b.numeroItem))
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey })

  // Aplica um Perfil de Precificação (ver usePricingProfiles.ts) aos itens
  // marcados como "participa" na aba Precificação — UPDATE direto por id,
  // com lista explícita de colunas (não é um replace completo como
  // setItems): não toca em descrição/quantidade/valores licitados/ofertados
  // de cada item, só nos campos da precificação.
  const aplicarPrecificacao = useMutation({
    mutationFn: async (itens: Pick<BiddingItem, 'id' | 'custoUnitario' | 'valorMinimoCalculado' | 'participaPrecificacao' | 'pricingProfileId' | 'impostosPctAplicado' | 'despesasPctAplicado' | 'margemPctAplicada'>[]) => {
      // RPC atômica (migração 048) em vez de um UPDATE por item — antes,
      // uma queda de rede no meio do loop deixava alguns itens com o
      // perfil novo e outros com o antigo, sem rollback nem aviso de quais
      // foram atualizados.
      const { error } = await supabase.rpc('aplicar_precificacao_items', {
        itens: itens.map((item) => ({
          id: item.id,
          custo_unitario: item.custoUnitario,
          valor_minimo_calculado: item.valorMinimoCalculado,
          participa_precificacao: item.participaPrecificacao,
          pricing_profile_id: item.pricingProfileId,
          impostos_pct_aplicado: item.impostosPctAplicado,
          despesas_pct_aplicado: item.despesasPctAplicado,
          margem_pct_aplicada: item.margemPctAplicada,
        })),
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

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
    aplicarPrecificacao,
  }
}

// Busca os itens de várias licitações de uma vez (usado no relatório de
// oportunidades por cliente — precisa dos itens de TODAS as licitações do
// cliente pra montar o detalhamento por item, não só de uma).
export function useBiddingItemsPorLicitacoes(biddingIds: string[]) {
  const { user } = useAuth()
  const idsOrdenados = useMemo(() => [...biddingIds].sort(), [biddingIds])

  const query = useQuery({
    queryKey: ['bidding_items_por_licitacoes', idsOrdenados],
    enabled: !!user && idsOrdenados.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bidding_items')
        .select('*')
        .in('bidding_id', idsOrdenados)
      if (error) throw error
      return data.map(fromBiddingItemRow).sort((a, b) => compararNumeroItem(a.numeroItem, b.numeroItem))
    },
  })

  return {
    items: query.data ?? EMPTY_ITEMS,
    isLoading: query.isLoading,
  }
}

export interface BiddingItemHistorico extends BiddingItem {
  biddingObjeto: string
  biddingOrgao: string
  clientName: string
}

// Busca itens de licitações ANTERIORES por descrição parecida — usado na
// Calculadora de Preço, pra saber por qual valor um item já foi cotado
// antes e pra quem, em vez de estimar do zero toda vez. Mesmo padrão de
// join usado em usePendenciasChecklist (useBiddingChecklist.ts).
export function useSearchBiddingItems(termoBusca: string) {
  const { user } = useAuth()
  const termo = termoBusca.trim()

  const query = useQuery({
    queryKey: ['bidding_items_search', termo],
    enabled: !!user && termo.length >= 3,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bidding_items')
        .select('*, biddings(objeto, orgao, client_id, clients(name))')
        .ilike('descricao', `%${termo}%`)
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) throw error
      return (data ?? []).map((row: any) => ({
        ...fromBiddingItemRow(row),
        biddingObjeto: row.biddings?.objeto ?? '—',
        biddingOrgao: row.biddings?.orgao ?? '—',
        clientName: row.biddings?.clients?.name ?? '—',
      })) as BiddingItemHistorico[]
    },
  })

  return {
    resultados: query.data ?? [],
    isLoading: query.isFetching,
  }
}
