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
    mutationFn: async ({ action, details, entity }: { action: string; details: string; entity?: { type: string; id: string } }) => {
      if (!user) return
      const { error } = await supabase
        .from('audit_logs')
        .insert({ user_id: user.id, action, details, entity_type: entity?.type ?? null, entity_id: entity?.id ?? null })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  // entity é opcional de propósito: a maioria dos eventos (financeiro,
  // clientes, backup...) não tem uma entidade única e continua só na visão
  // geral. Quando informado, o evento também aparece filtrado — ver
  // useAuditLogPorEntidade — na tela daquela entidade específica (ex: aba
  // Histórico de uma licitação).
  const logEvent = (action: string, details: string, entity?: { type: string; id: string }) => {
    logMutation.mutate({ action, details, entity })
  }

  return {
    logs: query.data ?? [],
    isLoading: query.isLoading,
    logEvent,
  }
}

// Histórico de UMA entidade específica (ex: uma licitação) — consulta
// direto no banco filtrada por entity_type/entity_id, em vez de recortar os
// 200 logs mais recentes da visão geral (que podem não incluir eventos mais
// antigos de uma entidade específica numa conta movimentada).
export function useAuditLogPorEntidade(entityType: string, entityId?: string) {
  const { user } = useAuth()

  const query = useQuery({
    queryKey: [...QUERY_KEY, entityType, entityId],
    enabled: !!user && !!entityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data.map(fromAuditLogRow)
    },
  })

  return {
    logs: query.data ?? [],
    isLoading: query.isLoading,
  }
}
