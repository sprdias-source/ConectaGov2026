import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromAccountRow, toAccountInsert } from '../lib/mappers'
import type { FinancialAccount } from '../types/domain'
import { useAuth } from './useAuth'

const QUERY_KEY = ['financial_accounts']

export function useFinancialAccounts() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_accounts')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data.map(fromAccountRow)
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })

  const addAccount = useMutation({
    mutationFn: async (account: Partial<FinancialAccount>) => {
      if (!user) throw new Error('Usuário não autenticado')
      const { data, error } = await supabase
        .from('financial_accounts')
        .insert(toAccountInsert(account, user.id))
        .select()
        .single()
      if (error) throw error
      return fromAccountRow(data)
    },
    onSuccess: invalidate,
  })

  const updateAccount = useMutation({
    mutationFn: async (account: FinancialAccount) => {
      const { data, error } = await supabase
        .from('financial_accounts')
        .update(toAccountInsert(account, account.userId))
        .eq('id', account.id)
        .select()
        .single()
      if (error) throw error
      return fromAccountRow(data)
    },
    onSuccess: invalidate,
  })

  const deleteAccount = useMutation({
    mutationFn: async (account: FinancialAccount) => {
      const { error } = await supabase.from('financial_accounts').delete().eq('id', account.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    accounts: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    addAccount,
    updateAccount,
    deleteAccount,
  }
}
