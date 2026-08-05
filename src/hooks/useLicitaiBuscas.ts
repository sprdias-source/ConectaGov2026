import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromLicitaiBuscaRow, toLicitaiBuscaInsert } from '../lib/mappers'
import { useAuth } from './useAuth'
import type { LicitaiBusca, LicitaiBuscaFiltros } from '../types/domain'

const QUERY_KEY = ['licitei_buscas']

// Buscas salvas do Licitei — cada uma reproduz o painel de filtros do
// Licitei (ver LicitaiBuscaFiltros em types/domain.ts) e vai ser o que o
// robô (próxima etapa, Playwright + GitHub Actions) usa pra logar, aplicar
// os filtros e gravar o que encontrar em licitei_editais.
export function useLicitaiBuscas() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('licitei_buscas')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data.map(fromLicitaiBuscaRow)
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })

  const addBusca = useMutation({
    mutationFn: async (b: { nome: string; filtros: LicitaiBuscaFiltros }) => {
      if (!user) throw new Error('Não autenticado')
      const { error } = await supabase.from('licitei_buscas').insert(toLicitaiBuscaInsert(b, user.id))
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const updateBusca = useMutation({
    mutationFn: async (b: LicitaiBusca) => {
      if (!user) throw new Error('Não autenticado')
      const { error } = await supabase.from('licitei_buscas').update(toLicitaiBuscaInsert(b, user.id)).eq('id', b.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const alternarAtivo = useMutation({
    mutationFn: async (busca: LicitaiBusca) => {
      const { error } = await supabase.from('licitei_buscas').update({ ativo: !busca.ativo }).eq('id', busca.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteBusca = useMutation({
    mutationFn: async (busca: LicitaiBusca) => {
      const { error } = await supabase.from('licitei_buscas').delete().eq('id', busca.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    buscas: query.data ?? [],
    isLoading: query.isLoading,
    addBusca,
    updateBusca,
    alternarAtivo,
    deleteBusca,
  }
}
