import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromContractRow, toContractInsert } from '../lib/mappers'
import type { Bidding, Contract } from '../types/domain'
import { useAuth } from './useAuth'
import { useAuditLog } from './useAuditLog'
import { addMonths } from './useEmpenhos'
import { todayLocalISO } from '../lib/dateUtils'

const QUERY_KEY = ['contracts']

// Só se aplica a contrato Mensalista — Individual não tem vigência em
// meses (o "prazo" é a própria licitação vinculada). Nunca gravado: é
// sempre calculado a partir de dataInicio + vigenciaMeses, reaproveitando
// a mesma soma de meses "à prova de estouro de mês" já usada em
// useEmpenhos.ts (addMonths).
export function calcContratoTermino(contract: Pick<Contract, 'dataInicio' | 'vigenciaMeses'>): string | null {
  if (!contract.dataInicio || !contract.vigenciaMeses) return null
  return addMonths(contract.dataInicio, contract.vigenciaMeses)
}

export type ContratoStatusExibido =
  | { tipo: 'rescindido' }
  | { tipo: 'sem_vigencia' }
  | { tipo: 'ativo' | 'vencendo' | 'vencido'; diasParaTermino: number; termino: string }
  | { tipo: 'licitacao'; biddingStatus: Bidding['status'] }

// Mesmo padrão de statusExibidoEmpenho: só 'rescindido' é gravado por ação
// manual do usuário — todo o resto é calculado ao vivo a partir da data
// (Mensalista) ou do status da licitação vinculada (Individual), nunca
// lido de um campo "parado no tempo".
const JANELA_VENCIMENTO_CONTRATO_DIAS = 45

export function calcContratoStatus(contract: Contract, bidding?: Bidding | null): ContratoStatusExibido {
  if (contract.status === 'rescindido') return { tipo: 'rescindido' }

  if (contract.tipo === 'individual') {
    if (!bidding) return { tipo: 'sem_vigencia' }
    return { tipo: 'licitacao', biddingStatus: bidding.status }
  }

  const termino = calcContratoTermino(contract)
  if (!termino) return { tipo: 'sem_vigencia' }
  const hoje = new Date(todayLocalISO() + 'T00:00:00')
  const dataTermino = new Date(termino + 'T00:00:00')
  const dias = Math.floor((dataTermino.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
  const tipo = dias < 0 ? 'vencido' : dias <= JANELA_VENCIMENTO_CONTRATO_DIAS ? 'vencendo' : 'ativo'
  return { tipo, diasParaTermino: dias, termino }
}

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

  const updateContractStatus = useMutation({
    mutationFn: async ({ contract, newStatus }: { contract: Contract; newStatus: Contract['status'] }) => {
      const { data, error } = await supabase
        .from('contracts')
        .update({ status: newStatus })
        .eq('id', contract.id)
        .select()
        .single()
      if (error) throw error
      return fromContractRow(data)
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      logEvent('Mudou Status do Contrato', `Alterou o status do contrato para ${updated.status}`)
    },
  })

  return {
    contracts: query.data ?? [],
    isLoading: query.isLoading,
    addContract,
    updateContractStatus,
  }
}
