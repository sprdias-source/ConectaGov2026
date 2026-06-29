import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromReceiptRow, toReceiptInsert } from '../lib/mappers'
import type { Receipt } from '../types/domain'
import { useAuth } from './useAuth'
import { useAuditLog } from './useAuditLog'

const QUERY_KEY = ['receipts']

export function useReceipts() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { logEvent } = useAuditLog()

  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receipts')
        .select('*')
        .order('issue_date', { ascending: false })
      if (error) throw error
      return data.map(fromReceiptRow)
    },
  })

  const addReceipt = useMutation({
    mutationFn: async (receipt: Partial<Receipt>) => {
      if (!user) throw new Error('Usuário não autenticado')
      const { data, error } = await supabase
        .from('receipts')
        .insert(toReceiptInsert(receipt, user.id))
        .select()
        .single()
      if (error) throw error
      return fromReceiptRow(data)
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      logEvent('Emitiu Documento', `Gerou um ${created.kind === 'Recibo' ? 'recibo' : 'orçamento'} de R$ ${created.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
    },
  })

  return {
    receipts: query.data ?? [],
    isLoading: query.isLoading,
    addReceipt,
    isSaving: addReceipt.isPending,
  }
}
