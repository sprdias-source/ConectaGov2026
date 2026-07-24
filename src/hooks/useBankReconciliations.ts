import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export interface BankReconciliation {
  id: string
  accountId: string
  dataSaldo: string
  saldoBanco: number
  saldoSistema: number
  diferenca: number
  nomeArquivo: string | null
  totalLancamentos: number
  lancamentosEncontrados: number
  createdAt: string
}

const QUERY_KEY = ['bank_reconciliations']

function fromRow(r: {
  id: string
  account_id: string
  data_saldo: string
  saldo_banco: number
  saldo_sistema: number
  diferenca: number
  nome_arquivo: string | null
  total_lancamentos: number
  lancamentos_encontrados: number
  created_at: string
}): BankReconciliation {
  return {
    id: r.id,
    accountId: r.account_id,
    dataSaldo: r.data_saldo,
    saldoBanco: r.saldo_banco,
    saldoSistema: r.saldo_sistema,
    diferenca: r.diferenca,
    nomeArquivo: r.nome_arquivo,
    totalLancamentos: r.total_lancamentos,
    lancamentosEncontrados: r.lancamentos_encontrados,
    createdAt: r.created_at,
  }
}

export function useBankReconciliations() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_reconciliations')
        .select('*')
        .order('data_saldo', { ascending: false })
      if (error) throw error
      return data.map(fromRow)
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })

  // Salvar de novo o mesmo mês/conta (ex: reenviou o extrato corrigido)
  // atualiza o registro em vez de duplicar — onConflict bate com a
  // constraint unique(user_id, account_id, data_saldo) da migration.
  const salvar = useMutation({
    mutationFn: async (rec: {
      accountId: string
      dataSaldo: string
      saldoBanco: number
      saldoSistema: number
      diferenca: number
      nomeArquivo: string | null
      totalLancamentos: number
      lancamentosEncontrados: number
    }) => {
      if (!user) throw new Error('Não autenticado')
      const { error } = await supabase.from('bank_reconciliations').upsert(
        {
          user_id: user.id,
          account_id: rec.accountId,
          data_saldo: rec.dataSaldo,
          saldo_banco: rec.saldoBanco,
          saldo_sistema: rec.saldoSistema,
          diferenca: rec.diferenca,
          nome_arquivo: rec.nomeArquivo,
          total_lancamentos: rec.totalLancamentos,
          lancamentos_encontrados: rec.lancamentosEncontrados,
        },
        { onConflict: 'user_id,account_id,data_saldo' }
      )
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bank_reconciliations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    reconciliations: query.data ?? [],
    isLoading: query.isLoading,
    salvar,
    remover,
  }
}
