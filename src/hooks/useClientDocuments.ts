import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromClientDocumentRow } from '../lib/mappers'
import { useAuth } from './useAuth'
import { todayLocalISO } from '../lib/dateUtils'
import type { ClientDocument, DocumentTipo, DocumentStatus } from '../types/domain'

const QUERY_KEY = ['client_documents']

// Calcula o status real de uma certidão com base na validade e no alerta
// configurado (padrão: 15 dias de antecedência antes de considerar crítico).
export function calcDocStatus(dataValidade: string | null, alertaDias = 15): DocumentStatus {
  if (!dataValidade) return 'pendente'
  const today = new Date(todayLocalISO() + 'T00:00:00')
  const validade = new Date(dataValidade + 'T00:00:00')
  const diffDays = Math.floor((validade.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'vencido'
  if (diffDays <= alertaDias) return 'vencendo'
  return 'valido'
}

// Retorna quantos dias restam de validade de uma certidão (-N se vencida)
export function diasRestantes(dataValidade: string | null): number | null {
  if (!dataValidade) return null
  const today = new Date(todayLocalISO() + 'T00:00:00')
  const validade = new Date(dataValidade + 'T00:00:00')
  return Math.floor((validade.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export function useClientDocuments(clientId?: string) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: [...QUERY_KEY, clientId],
    enabled: !!user && !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_documents')
        .select('*')
        .eq('client_id', clientId!)
        .order('tipo')
      if (error) throw error
      return data.map(fromClientDocumentRow)
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })

  const upsertDocument = useMutation({
    mutationFn: async (doc: {
      tipo: DocumentTipo
      nome: string
      storagePath?: string | null
      dataEmissao?: string | null
      dataValidade?: string | null
      autoRenovavel?: boolean
      observacoes?: string | null
    }) => {
      if (!user || !clientId) throw new Error('Não autenticado')
      const status = calcDocStatus(doc.dataValidade ?? null)
      const { error } = await supabase.from('client_documents').upsert({
        user_id: user.id,
        client_id: clientId,
        tipo: doc.tipo,
        nome: doc.nome,
        storage_path: doc.storagePath ?? null,
        data_emissao: doc.dataEmissao ?? null,
        data_validade: doc.dataValidade ?? null,
        status,
        auto_renovavel: doc.autoRenovavel ?? false,
        observacoes: doc.observacoes ?? null,
      }, { onConflict: 'user_id,client_id,tipo' })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const uploadAndSave = useMutation({
    mutationFn: async ({
      file, tipo, nome, dataEmissao, dataValidade, observacoes,
    }: {
      file: File
      tipo: DocumentTipo
      nome: string
      dataEmissao?: string | null
      dataValidade?: string | null
      observacoes?: string | null
    }) => {
      if (!user || !clientId) throw new Error('Não autenticado')
      const ext = file.name.split('.').pop() ?? 'pdf'
      const path = `${user.id}/${clientId}/${tipo}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('client-documents')
        .upload(path, file, { upsert: true })
      if (uploadError) throw uploadError
      await upsertDocument.mutateAsync({
        tipo, nome, storagePath: path, dataEmissao, dataValidade,
        autoRenovavel: false, observacoes,
      })
      return path
    },
    onSuccess: invalidate,
  })

  const deleteDocument = useMutation({
    mutationFn: async (doc: ClientDocument) => {
      if (doc.storagePath) {
        await supabase.storage.from('client-documents').remove([doc.storagePath])
      }
      const { error } = await supabase.from('client_documents').delete().eq('id', doc.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const getDownloadUrl = async (storagePath: string) => {
    const { data, error } = await supabase.storage
      .from('client-documents')
      .createSignedUrl(storagePath, 60 * 10) // 10 minutos
    if (error) throw error
    return data.signedUrl
  }

  return {
    documents: query.data ?? [],
    isLoading: query.isLoading,
    upsertDocument,
    uploadAndSave,
    deleteDocument,
    getDownloadUrl,
  }
}
