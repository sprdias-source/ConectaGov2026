import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromFileRow, toFileInsert } from '../lib/mappers'
import { useAuth } from './useAuth'
import type { AttachedFile, FileCategory, FileEntityType } from '../types/domain'

const QUERY_KEY = ['attached_files']

// Anexos genéricos ligados a qualquer entidade do sistema (por enquanto,
// usado pra documentos de uma licitação específica — o edital, atestados
// específicos daquele certame, etc.). Reaproveita a tabela `attached_files`
// que já existia no schema, mas nunca tinha RLS nem hook nenhum construído
// em cima.
export function useAttachedFiles(entityType: FileEntityType, entityId?: string) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

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
      const path = `${user.id}/${entityType}/${entityId}/${Date.now()}_${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('client-documents')
        .upload(path, file, { upsert: true })
      if (uploadError) throw uploadError

      const { error } = await supabase.from('attached_files').insert(
        toFileInsert({
          name: file.name,
          sizeBytes: file.size,
          mimeType: file.type || null,
          storagePath: path,
          category,
          entityType,
          entityId,
        }, user.id)
      )
      if (error) throw error
      return path
    },
    onSuccess: invalidate,
  })

  const deleteFile = useMutation({
    mutationFn: async (file: AttachedFile) => {
      await supabase.storage.from('client-documents').remove([file.storagePath])
      const { error } = await supabase.from('attached_files').delete().eq('id', file.id)
      if (error) throw error
    },
    onSuccess: invalidate,
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
    deleteFile,
    getDownloadUrl,
  }
}
