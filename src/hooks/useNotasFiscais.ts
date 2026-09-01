import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromNotaFiscalRow, toNotaFiscalInsert } from '../lib/mappers'
import { useAuth } from './useAuth'
import type { NotaFiscalEmitida } from '../types/domain'

// Registro manual — hoje a emissão de NFS-e acontece fora do sistema (portal
// da prefeitura), então não há como capturar automaticamente. Preparado pra,
// quando a emissão por certificado digital sair dentro do ConectaGov, gravar
// direto aqui em vez de depender de alguém digitar manualmente.
export function useNotasFiscais() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['notas_fiscais_emitidas'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notas_fiscais_emitidas')
        .select('*')
        .order('data_emissao', { ascending: false })
      if (error) throw error
      return data.map(fromNotaFiscalRow)
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notas_fiscais_emitidas'] })

  const addNotaFiscal = useMutation({
    mutationFn: async (n: Partial<NotaFiscalEmitida>) => {
      if (!user) throw new Error('Usuário não autenticado')
      const { error } = await supabase.from('notas_fiscais_emitidas').insert(toNotaFiscalInsert(n, user.id))
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const updateNotaFiscal = useMutation({
    mutationFn: async (n: NotaFiscalEmitida) => {
      const { error } = await supabase.from('notas_fiscais_emitidas').update(toNotaFiscalInsert(n, n.userId)).eq('id', n.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteNotaFiscal = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('notas_fiscais_emitidas').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const vincularTransacao = useMutation({
    mutationFn: async ({ notaId, transactionId }: { notaId: string; transactionId: string | null }) => {
      const { error } = await supabase.from('notas_fiscais_emitidas').update({ transaction_id: transactionId }).eq('id', notaId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const notasFiscais: NotaFiscalEmitida[] = query.data ?? []

  return {
    notasFiscais,
    isLoading: query.isLoading,
    addNotaFiscal,
    updateNotaFiscal,
    deleteNotaFiscal,
    vincularTransacao,
  }
}
