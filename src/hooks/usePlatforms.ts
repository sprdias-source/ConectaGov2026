import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromPlatformRow, toPlatformInsert } from '../lib/mappers'
import { useAuth } from './useAuth'
import type { Platform } from '../types/domain'

const QUERY_KEY = ['platforms']

// Catálogo de plataformas de licitação — cadastrado uma vez, reaproveitado
// em quantas assinaturas de cliente precisar (ver useClientPlatforms).
export function usePlatforms() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platforms')
        .select('*')
        .order('nome')
      if (error) throw error
      return data.map(fromPlatformRow)
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })

  const addPlatform = useMutation({
    mutationFn: async (platform: { nome: string; url?: string | null; tipoPadrao?: Platform['tipoPadrao']; valorPadrao?: number | null }) => {
      if (!user) throw new Error('Não autenticado')
      const { data, error } = await supabase
        .from('platforms')
        .insert(toPlatformInsert(platform, user.id))
        .select('id')
        .single()
      if (error) throw error
      return data.id as string
    },
    onSuccess: invalidate,
  })

  const updatePlatform = useMutation({
    mutationFn: async (platform: Platform) => {
      if (!user) throw new Error('Não autenticado')
      const { error } = await supabase
        .from('platforms')
        .update(toPlatformInsert(platform, user.id))
        .eq('id', platform.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  // A FK de client_platforms.platform_id e de opportunities.platform_id são
  // "on delete restrict" de propósito — se essa plataforma ainda tiver
  // alguma assinatura de cliente ou oportunidade vinculada, o banco recusa
  // o delete em vez de apagar em cascata o histórico de vários
  // clientes/oportunidades de uma vez. Pra esses casos, "inativar"
  // (alternarAtivo) é a alternativa: some das opções de seleção pra uso
  // novo, mas preserva o que já existe.
  const deletePlatform = useMutation({
    mutationFn: async (platform: Platform) => {
      const { error } = await supabase.from('platforms').delete().eq('id', platform.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const alternarAtivo = useMutation({
    mutationFn: async (platform: Platform) => {
      const { error } = await supabase.from('platforms').update({ ativo: !platform.ativo }).eq('id', platform.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    platforms: query.data ?? [],
    isLoading: query.isLoading,
    addPlatform,
    updatePlatform,
    deletePlatform,
    alternarAtivo,
  }
}
