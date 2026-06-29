import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromAuditLogRow } from '../lib/mappers'
import { useAuth } from './useAuth'

const QUERY_KEY = ['audit_logs']

export function useAuditLog() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data.map(fromAuditLogRow)
    },
  })

  const logMutation = useMutation({
    mutationFn: async ({ action, details }: { action: string; details: string }) => {
      if (!user) return
      const { error } = await supabase
        .from('audit_logs')
        .insert({ user_id: user.id, action, details })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  const logEvent = (action: string, details: string) => {
    logMutation.mutate({ action, details })
  }

  return {
    logs: query.data ?? [],
    isLoading: query.isLoading,
    logEvent,
  }
}
