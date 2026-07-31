import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromClientPlatformRow, toClientPlatformInsert } from '../lib/mappers'
import { useAuth } from './useAuth'
import { todayLocalISO } from '../lib/dateUtils'
import type { ClientPlatform, PlatformStatus } from '../types/domain'

const QUERY_KEY = ['client_platforms']

// Mesma régua de calcDocStatus (useClientDocuments.ts), mas a antecedência
// do aviso vem do PRÓPRIO registro (dias_aviso_vencimento), não de uma
// tabela fixa no código — é o campo que o usuário edita por cliente.
// Computado ao vivo (não gravado no banco) de propósito: se o dia mudar,
// o status reflete na hora, sem precisar salvar o registro de novo.
export function calcPlatformStatus(dataVencimento: string | null, diasAvisoVencimento: number): PlatformStatus {
  if (!dataVencimento) return 'sem_vencimento'
  const today = new Date(todayLocalISO() + 'T00:00:00')
  const vencimento = new Date(dataVencimento + 'T00:00:00')
  const diffDays = Math.floor((vencimento.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'vencida'
  if (diffDays <= diasAvisoVencimento) return 'vencendo'
  return 'ativa'
}

export function diasParaVencer(dataVencimento: string | null): number | null {
  if (!dataVencimento) return null
  const today = new Date(todayLocalISO() + 'T00:00:00')
  const vencimento = new Date(dataVencimento + 'T00:00:00')
  return Math.floor((vencimento.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export function useClientPlatforms(clientId?: string) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: [...QUERY_KEY, clientId],
    enabled: !!user && !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_platforms')
        .select('*')
        .eq('client_id', clientId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data.map(fromClientPlatformRow)
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, clientId] })

  const addClientPlatform = useMutation({
    mutationFn: async (cp: {
      platformId: string
      tipo: ClientPlatform['tipo']
      valorMensalidade?: number | null
      dataVencimento?: string | null
      diasAvisoVencimento?: number
      login?: string | null
      senha?: string | null
      observacoes?: string | null
      ativo?: boolean
    }) => {
      if (!user || !clientId) throw new Error('Cliente não definido')
      const { error } = await supabase
        .from('client_platforms')
        .insert(toClientPlatformInsert({ ...cp, clientId }, user.id))
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const updateClientPlatform = useMutation({
    mutationFn: async (cp: ClientPlatform) => {
      if (!user) throw new Error('Não autenticado')
      const { error } = await supabase
        .from('client_platforms')
        .update(toClientPlatformInsert(cp, user.id))
        .eq('id', cp.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteClientPlatform = useMutation({
    mutationFn: async (cp: ClientPlatform) => {
      const { error } = await supabase.from('client_platforms').delete().eq('id', cp.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    clientPlatforms: query.data ?? [],
    isLoading: query.isLoading,
    addClientPlatform,
    updateClientPlatform,
    deleteClientPlatform,
  }
}

// Busca as assinaturas de TODOS os clientes de uma vez — usado pelo badge
// da sidebar e pela Central de Prazos, mesmo padrão de
// useAllClientDocuments (useClientDocuments.ts).
export function useAllClientPlatforms() {
  const { user } = useAuth()

  const query = useQuery({
    queryKey: [...QUERY_KEY, 'all'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_platforms')
        .select('*')
        .eq('ativo', true)
        .order('data_vencimento', { ascending: true })
      if (error) throw error
      return data.map(fromClientPlatformRow)
    },
  })

  return {
    clientPlatforms: query.data ?? [],
    isLoading: query.isLoading,
  }
}
