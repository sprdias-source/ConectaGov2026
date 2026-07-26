import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromPersonalEventRow, toPersonalEventInsert } from '../lib/mappers'
import { useAuth } from './useAuth'
import type { PersonalEvent } from '../types/domain'

const QUERY_KEY = ['personal_events']

export function usePersonalEvents() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('personal_events')
        .select('*')
        .order('data', { ascending: true })
      if (error) throw error
      return data.map(fromPersonalEventRow)
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })

  const addEvent = useMutation({
    mutationFn: async (evento: { titulo: string; descricao?: string | null; data: string }) => {
      if (!user) throw new Error('Não autenticado')
      const { error } = await supabase.from('personal_events').insert(
        toPersonalEventInsert(evento, user.id)
      )
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const updateEvent = useMutation({
    mutationFn: async ({ id, ...campos }: { id: string; titulo?: string; descricao?: string | null; data?: string }) => {
      const { error } = await supabase.from('personal_events').update(campos).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteEvent = useMutation({
    mutationFn: async (evento: PersonalEvent) => {
      const { error } = await supabase.from('personal_events').delete().eq('id', evento.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    events: query.data ?? [],
    isLoading: query.isLoading,
    addEvent,
    updateEvent,
    deleteEvent,
  }
}
