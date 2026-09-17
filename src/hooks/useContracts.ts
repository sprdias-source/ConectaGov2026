import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromContractRow, toContractInsert } from '../lib/mappers'
import type { Bidding, Contract } from '../types/domain'
import { useAuth } from './useAuth'
import { useAuditLog } from './useAuditLog'
import { addMonths } from './useEmpenhos'
import { todayLocalISO } from '../lib/dateUtils'
import { ehArquivoDrive, excluirNoDrive } from '../lib/driveStorage'

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
    // Escreve o contrato recém-criado no cache NA HORA, além de invalidar
    // (que dispara um refetch em segundo plano, mas não é síncrono) —
    // sem isso, a checagem de contrato duplicado em ContratosPage.tsx
    // (que lê `contracts` deste mesmo cache) tinha uma janela em que um
    // segundo clique bem cedo, antes do refetch terminar, não via o
    // contrato que acabou de ser salvo e não detectava a duplicata.
    onSuccess: (novo) => {
      queryClient.setQueryData<Contract[]>(QUERY_KEY, (old) => old ? [novo, ...old] : [novo])
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      logEvent('Gerou Contrato', 'Criou um novo contrato de prestação de serviços')
    },
  })

  const deleteContract = useMutation({
    mutationFn: async (contract: Contract) => {
      // Apaga o CONTRATO primeiro — é o passo que decide de verdade se a
      // exclusão aconteceu (RLS, rede etc. podem barrar bem aqui). Só
      // depois de confirmado que o contrato já não existe mais é que
      // limpamos o "Contrato Assinado" anexado (ver DocumentUploader em
      // ContratosPage.tsx) — uma referência solta por
      // entity_type/entity_id em attached_files, não uma FK de verdade
      // pro contrato. Nessa ordem, se a limpeza do anexo falhar no meio,
      // o pior caso é um arquivo órfão consumindo espaço; na ordem
      // inversa (como era antes), uma falha bem aqui podia apagar o
      // arquivo assinado de um contrato que continuava existindo, sem
      // nenhum jeito de recuperar.
      const { error } = await supabase.from('contracts').delete().eq('id', contract.id)
      if (error) throw error

      const { data: anexos, error: anexosError } = await supabase
        .from('attached_files')
        .select('id, storage_path')
        .eq('entity_type', 'contrato')
        .eq('entity_id', contract.id)
      if (anexosError) return

      for (const anexo of anexos ?? []) {
        if (!anexo.storage_path) continue
        if (ehArquivoDrive(anexo.storage_path)) {
          await excluirNoDrive('attached_files', anexo.storage_path).catch(() => {})
        } else {
          await supabase.storage.from('client-documents').remove([anexo.storage_path]).catch(() => {})
        }
      }
      if (anexos && anexos.length > 0) {
        await supabase.from('attached_files').delete().eq('entity_type', 'contrato').eq('entity_id', contract.id)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      logEvent('Excluiu Contrato', 'Excluiu um contrato de prestação de serviços')
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
    deleteContract,
    updateContractStatus,
  }
}
