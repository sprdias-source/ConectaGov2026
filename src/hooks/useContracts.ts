import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromContractRow, toContractInsert } from '../lib/mappers'
import type { Contract } from '../types/domain'
import { useAuth } from './useAuth'
import { useAuditLog } from './useAuditLog'

const QUERY_KEY = ['contracts']

export function useContracts() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { logEvent } = useAuditLog()

  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data.map(fromContractRow)
    },
  })

  const addContract = useMutation({
    mutationFn: async (contract: Partial<Contract>) => {
      if (!user) throw new Error('Usuário não autenticado')
      const { data, error } = await supabase
        .from('contracts')
        .insert(toContractInsert(contract, user.id))
        .select()
        .single()
      if (error) throw error
      return fromContractRow(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      logEvent('Gerou Contrato', 'Criou um novo contrato de prestação de serviços')
    },
  })

  return {
    contracts: query.data ?? [],
    isLoading: query.isLoading,
    addContract,
  }
}
