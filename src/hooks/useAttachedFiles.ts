import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromFileRow, toFileInsert } from '../lib/mappers'
import { uploadResumivel } from '../lib/uploadResumivel'
import { useAuth } from './useAuth'
import { useToast } from './useToast'
import type { AttachedFile, FileCategory, FileEntityType } from '../types/domain'

const QUERY_KEY = ['attached_files']

// Anexos genéricos ligados a qualquer entidade do sistema (por enquanto,
// usado pra documentos de uma licitação específica — o edital, atestados
// específicos daquele certame, etc.). Reaproveita a tabela `attached_files`
// que já existia no schema, mas nunca tinha RLS nem hook nenhum construído
// em cima.
export function useAttachedFiles(entityType: FileEntityType, entityId?: string) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)

  const query = useQuery({
    queryKey: [...QUERY_KEY, entityType, entityId],
    enabled: !!user && !!entityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attached_files')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data.map(fromFileRow)
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, entityType, entityId] })

  const uploadFile = useMutation({
    mutationFn: async ({ file, category }: { file: File; category: FileCategory }) => {
      if (!user || !entityId) throw new Error('Não autenticado')
      const ext = file.name.split('.').pop() ?? 'pdf'
      const path = `${user.id}/${entityType}/${entityId}/${Date.now()}.${ext}`
      console.log('Tentando upload:', { path, tamanhoBytes: file.size, tipo: file.type })

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Não autenticado')

      setUploadProgress(0)
      try {
        await uploadResumivel(file, path, session.access_token, setUploadProgress)
      } finally {
        setUploadProgress(null)
      }

      const { data, error } = await supabase.from('attached_files').insert(
        toFileInsert({
          name: file.name,
          sizeBytes: file.size,
          mimeType: file.type || null,
          storagePath: path,
          category,
          entityType,
          entityId,
        }, user.id)
      ).select('id').single()
      if (error) throw error
      return { path, id: data.id as string }
    },
    onSuccess: (_, variables) => {
      invalidate()
      showToast(`${variables.category} enviado com sucesso.`)
    },
  })

  const deleteFile = useMutation({
    mutationFn: async (file: AttachedFile) => {
      await supabase.storage.from('client-documents').remove([file.storagePath])
      const { error } = await supabase.from('attached_files').delete().eq('id', file.id)
      if (error) throw error
    },
    onSuccess: (_, file) => {
      invalidate()
      showToast(`${file.category} removido.`)
    },
  })

  const getDownloadUrl = async (storagePath: string) => {
    const { data, error } = await supabase.storage
      .from('client-documents')
      .createSignedUrl(storagePath, 60 * 10)
    if (error) throw error
    return data.signedUrl
  }

  return {
    files: query.data ?? [],
    isLoading: query.isLoading,
    uploadFile,
    uploadProgress,
    deleteFile,
    getDownloadUrl,
  }
}

// Busca de uma vez só quais licitações já têm Proposta Readequada e/ou
// Contrato assinado anexados — usado no Kanban pra saber quais licitações
// "Ganhou" ainda têm pendência (ver ganhasComPendencia em
// KanbanLicitacoesPage.tsx) sem precisar de uma consulta por licitação.
export function useBiddingIdsComDocumentosFinais() {
  const { user } = useAuth()

  const query = useQuery({
    queryKey: [...QUERY_KEY, 'documentos-finais-por-licitacao'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attached_files')
        .select('entity_id, category')
        .eq('entity_type', 'licitacao')
        .in('category', ['Proposta Readequada', 'Contrato'])
      if (error) throw error
      const comPropostaReadequada = new Set<string>()
      const comContrato = new Set<string>()
      for (const row of data) {
        if (!row.entity_id) continue
        if (row.category === 'Proposta Readequada') comPropostaReadequada.add(row.entity_id)
        if (row.category === 'Contrato') comContrato.add(row.entity_id)
      }
      return { comPropostaReadequada, comContrato }
    },
  })

  return {
    biddingIdsComPropostaReadequada: query.data?.comPropostaReadequada ?? new Set<string>(),
    biddingIdsComContrato: query.data?.comContrato ?? new Set<string>(),
    isLoading: query.isLoading,
  }
}
