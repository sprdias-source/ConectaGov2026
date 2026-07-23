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
      pasta?: string | null
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
        pasta: doc.pasta ?? null,
      }, { onConflict: 'user_id,client_id,tipo' })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const uploadAndSave = useMutation({
    mutationFn: async ({
      file, tipo, nome, dataEmissao, dataValidade, observacoes, pasta,
    }: {
      file: File
      tipo: DocumentTipo
      nome: string
      dataEmissao?: string | null
      dataValidade?: string | null
      observacoes?: string | null
      pasta?: string | null
    }) => {
      if (!user || !clientId) throw new Error('Não autenticado')
      const ext = file.name.split('.').pop() ?? 'pdf'
      // Tipos de certidão automática (cndt, cnd_federal, etc.) só têm UM
      // documento por cliente — nome estável, sobrescreve o antigo
      // automaticamente ao renovar. Documentos 'manual' podem ter vários
      // por cliente (Contrato Social, Atestado Técnico...) — precisam de
      // nome único cada, senão um novo envio apagaria um documento
      // diferente sem querer.
      const path = tipo === 'manual'
        ? `${user.id}/${clientId}/${tipo}/${Date.now()}.${ext}`
        : `${user.id}/${clientId}/${tipo}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('client-documents')
        .upload(path, file, { upsert: true })
      if (uploadError) throw uploadError
      await upsertDocument.mutateAsync({
        tipo, nome, storagePath: path, dataEmissao, dataValidade,
        autoRenovavel: false, observacoes, pasta,
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

// Busca as certidões de TODOS os clientes de uma vez — usado pela Central
// de Prazos e pelo badge de alertas na sidebar, onde a visão precisa ser
// consolidada em vez de por cliente individual.
export function useAllClientDocuments() {
  const { user } = useAuth()

  const query = useQuery({
    queryKey: [...QUERY_KEY, 'all'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_documents')
        .select('*')
        .order('data_validade', { ascending: true })
      if (error) throw error
      return data.map(fromClientDocumentRow)
    },
  })

  return {
    documents: query.data ?? [],
    isLoading: query.isLoading,
  }
}
