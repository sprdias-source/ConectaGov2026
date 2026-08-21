import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromContractMarcoRow, toContractMarcoInsert } from '../lib/mappers'
import { useAuth } from './useAuth'
import { todayLocalISO } from '../lib/dateUtils'
import type { ContractMarco } from '../types/domain'

const QUERY_KEY = ['contract_marcos']
const EMPTY_MARCOS: ContractMarco[] = []

// Busca os marcos de VÁRIOS contratos numa query só (mesmo padrão de
// useBiddingItemsPorLicitacoes) — usada na listagem de Execução de
// Contratos, que antes disparava uma query por contrato (cada
// ContratoCard chamava useContractMarcos(contrato.id) sozinho) assim que
// a página carregava, mesmo pros contratos ainda fechados/não expandidos.
export function useContractMarcosPorContratos(contractIds: string[]) {
  const { user } = useAuth()
  const idsOrdenados = useMemo(() => [...contractIds].sort(), [contractIds])

  const query = useQuery({
    queryKey: ['contract_marcos_por_contratos', idsOrdenados],
    enabled: !!user && idsOrdenados.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_marcos')
        .select('*')
        .in('contract_id', idsOrdenados)
        .order('data_prevista', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data.map(fromContractMarcoRow)
    },
  })

  const marcosPorContrato = useMemo(() => {
    const mapa = new Map<string, ContractMarco[]>()
    for (const m of query.data ?? []) {
      const lista = mapa.get(m.contractId) ?? []
      lista.push(m)
      mapa.set(m.contractId, lista)
    }
    return mapa
  }, [query.data])

  return { marcosPorContrato, isLoading: query.isLoading }
}

// `habilitarLeitura: false` pula a query de leitura (usado quando o card já
// recebe os marcos prontos via useContractMarcosPorContratos e só precisa
// deste hook pelas mutations).
export function useContractMarcos(contractId?: string, opts?: { habilitarLeitura?: boolean }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const habilitarLeitura = opts?.habilitarLeitura ?? true

  const query = useQuery({
    queryKey: [...QUERY_KEY, contractId],
    enabled: !!user && !!contractId && habilitarLeitura,
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

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, contractId] })
    queryClient.invalidateQueries({ queryKey: ['contract_marcos_por_contratos'] })
  }

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
    marcos: query.data ?? EMPTY_MARCOS,
    isLoading: query.isLoading,
    addMarco,
    concluirMarco,
    deleteMarco,
  }
}
