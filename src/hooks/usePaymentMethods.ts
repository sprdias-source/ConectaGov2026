import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromPaymentMethodRow } from '../lib/mappers'
import { useAuth } from './useAuth'

const DEFAULT_METHODS = ['PIX', 'Boleto', 'Transferência', 'Dinheiro', 'Cartão']

export function usePaymentMethods() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['payment_methods'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('payment_methods').select('*').order('name')
      if (error) throw error

      if (data.length === 0 && user) {
        const seed = DEFAULT_METHODS.map((name) => ({ user_id: user.id, name }))
        const { data: seeded, error: seedError } = await supabase
          .from('payment_methods')
          .insert(seed)
          .select()
        if (seedError) throw seedError
        return seeded.map(fromPaymentMethodRow)
      }

      return data.map(fromPaymentMethodRow)
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['payment_methods'] })

  const addPaymentMethod = useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error('Usuário não autenticado')
      const { error } = await supabase.from('payment_methods').insert({ user_id: user.id, name })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deletePaymentMethod = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('payment_methods').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const renamePaymentMethod = useMutation({
    mutationFn: async ({ id, name, oldName }: { id: string; name: string; oldName: string }) => {
      const { error } = await supabase.from('payment_methods').update({ name }).eq('id', id)
      if (error) throw error
      const { error: txError } = await supabase
        .from('transactions')
        .update({ payment_method: name })
        .eq('payment_method', oldName)
      if (txError) throw txError
    },
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })

  const methods = query.data ?? []
  return {
    paymentMethods: methods.map((m) => m.name),
    allPaymentMethods: methods,
    isLoading: query.isLoading,
    addPaymentMethod,
    deletePaymentMethod,
    renamePaymentMethod,
  }
}
