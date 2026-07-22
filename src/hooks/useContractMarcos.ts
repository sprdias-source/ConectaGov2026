import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromContractMarcoRow, toContractMarcoInsert } from '../lib/mappers'
import { useAuth } from './useAuth'
import { todayLocalISO } from '../lib/dateUtils'
import type { ContractMarco } from '../types/domain'

const QUERY_KEY = ['contract_marcos']

export function useContractMarcos(contractId?: string) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: [...QUERY_KEY, contractId],
    enabled: !!user && !!contractId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_marcos')
        .select('*')
        .eq('contract_id', contractId!)
        .order('data_prevista', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data.map(fromContractMarcoRow)
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, contractId] })

  const addMarco = useMutation({
    mutationFn: async (marco: { descricao: string; dataPrevista?: string | null; valor?: number | null; observacoes?: string | null }) => {
      if (!user || !contractId) throw new Error('Não autenticado')
      const { error } = await supabase.from('contract_marcos').insert(
        toContractMarcoInsert({
          contractId,
          descricao: marco.descricao,
          dataPrevista: marco.dataPrevista ?? null,
          valor: marco.valor ?? null,
          observacoes: marco.observacoes ?? null,
          status: 'Pendente',
        }, user.id)
      )
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const concluirMarco = useMutation({
    mutationFn: async (marco: ContractMarco) => {
      const { error } = await supabase
        .from('contract_marcos')
        .update({ status: 'Concluído', data_realizada: todayLocalISO() })
        .eq('id', marco.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteMarco = useMutation({
    mutationFn: async (marco: ContractMarco) => {
      const { error } = await supabase.from('contract_marcos').delete().eq('id', marco.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    marcos: query.data ?? [],
    isLoading: query.isLoading,
    addMarco,
    concluirMarco,
    deleteMarco,
  }
}
