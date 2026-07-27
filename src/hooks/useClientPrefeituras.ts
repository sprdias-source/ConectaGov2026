import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromClientPrefeituraRow, toClientPrefeituraInsert } from '../lib/mappers'
import { useAuth } from './useAuth'
import type { ClientPrefeitura } from '../types/domain'

const QUERY_KEY = ['client_prefeituras']

export function useClientPrefeituras() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_prefeituras')
        .select('*')
        .order('prefeitura', { ascending: true })
      if (error) throw error
      return data.map(fromClientPrefeituraRow)
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })

  const addPrefeitura = useMutation({
    mutationFn: async (p: { clientId: string; prefeitura: string; portalUrl: string | null }) => {
      if (!user) throw new Error('Não autenticado')
      const { error } = await supabase.from('client_prefeituras').insert(
        toClientPrefeituraInsert(p, user.id)
      )
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const updatePrefeitura = useMutation({
    mutationFn: async ({ id, ...campos }: { id: string; prefeitura?: string; portalUrl?: string | null }) => {
      const { error } = await supabase
        .from('client_prefeituras')
        .update({ prefeitura: campos.prefeitura, portal_url: campos.portalUrl })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deletePrefeitura = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('client_prefeituras').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    prefeituras: query.data ?? [],
    isLoading: query.isLoading,
    addPrefeitura,
    updatePrefeitura,
    deletePrefeitura,
  }
}

export type { ClientPrefeitura }
