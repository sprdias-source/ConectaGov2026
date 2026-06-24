import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromClientRow, toClientInsert } from '../lib/mappers'
import type { Client } from '../types/domain'
import { useAuth } from './useAuth'
import { useAuditLog } from './useAuditLog'

const QUERY_KEY = ['clients']

export function useClients() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { logEvent } = useAuditLog()

  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      return data.map(fromClientRow)
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })

  const addClient = useMutation({
    mutationFn: async (client: Partial<Client>) => {
      if (!user) throw new Error('Usuário não autenticado')
      const { data, error } = await supabase
        .from('clients')
        .insert(toClientInsert(client, user.id))
        .select()
        .single()
      if (error) throw error
      return fromClientRow(data)
    },
    onSuccess: (created) => {
      invalidate()
      logEvent('Adicionou Cliente', `Cadastrou o cliente/órgão "${created.name}"${created.isMensalista ? ' como Mensalista' : ''}`)
    },
  })

  const updateClient = useMutation({
    mutationFn: async (client: Client) => {
      const { data, error } = await supabase
        .from('clients')
        .update(toClientInsert(client, client.userId))
        .eq('id', client.id)
        .select()
        .single()
      if (error) throw error
      return fromClientRow(data)
    },
    onSuccess: (updated) => {
      invalidate()
      logEvent('Editou Cliente', `Atualizou dados do cliente "${updated.name}"`)
    },
  })

  const deleteClient = useMutation({
    mutationFn: async (client: Client) => {
      const { error } = await supabase.from('clients').delete().eq('id', client.id)
      if (error) throw error
      return client
    },
    onSuccess: (deleted) => {
      // Cascata de licitações/transações/empenhos é feita pelo próprio banco
      // (ON DELETE CASCADE), então só precisamos invalidar tudo que depende disso.
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['biddings'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['empenhos'] })
      logEvent('Excluiu Cliente', `Removeu o cadastro do cliente/órgão "${deleted.name}". Licitações, empenhos e lançamentos vinculados foram removidos automaticamente.`)
    },
  })

  return {
    clients: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    addClient,
    updateClient,
    deleteClient,
  }
}
