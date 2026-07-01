import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromFileRow } from '../lib/mappers'
import type { AttachedFile, FileCategory, FileEntityType } from '../types/domain'
import { useAuth } from './useAuth'

const QUERY_KEY = ['attached_files']
const BUCKET = 'documents'
const EMPTY_FILES: AttachedFile[] = []

export function useAttachedFiles(entityType?: FileEntityType, entityId?: string | null) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: [...QUERY_KEY, entityType, entityId],
    enabled: !!user && (!entityType || !!entityId),
    queryFn: async () => {
      let q = supabase.from('attached_files').select('*').order('created_at', { ascending: false })
      if (entityType) q = q.eq('entity_type', entityType)
      if (entityId) q = q.eq('entity_id', entityId)
      const { data, error } = await q
      if (error) throw error
      return data.map(fromFileRow)
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })

  const uploadFile = useMutation({
    mutationFn: async ({
      file, category, entityType: et, entityId: eid,
    }: { file: File; category: FileCategory; entityType?: FileEntityType; entityId?: string }) => {
      if (!user) throw new Error('Usuário não autenticado')

      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
      const storagePath = `${user.id}/${Date.now()}-${safeName}`

      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      })
      if (uploadError) throw uploadError

      const { data, error } = await supabase
        .from('attached_files')
        .insert({
          user_id: user.id,
          name: file.name,
          size_bytes: file.size,
          mime_type: file.type,
          storage_path: storagePath,
          category,
          entity_type: et ?? null,
          entity_id: eid ?? null,
        })
        .select()
        .single()

      if (error) {
        await supabase.storage.from(BUCKET).remove([storagePath])
        throw error
      }
      return fromFileRow(data)
    },
    onSuccess: invalidate,
  })

  const deleteFile = useMutation({
    mutationFn: async (file: AttachedFile) => {
      await supabase.storage.from(BUCKET).remove([file.storagePath])
      const { error } = await supabase.from('attached_files').delete().eq('id', file.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const getDownloadUrl = async (file: AttachedFile): Promise<string | null> => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(file.storagePath, 60 * 5)
    if (error) return null
    return data.signedUrl
  }

  const files = useMemo(() => query.data ?? EMPTY_FILES, [query.data])

  return {
    files,
    isLoading: query.isLoading,
    uploadFile,
    deleteFile,
    getDownloadUrl,
  }
}
