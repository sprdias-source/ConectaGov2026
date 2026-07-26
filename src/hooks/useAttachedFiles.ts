import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload as TusUpload } from 'tus-js-client'
import { supabase } from '../lib/supabase'
import { fromFileRow, toFileInsert } from '../lib/mappers'
import { useAuth } from './useAuth'
import { useToast } from './useToast'
import type { AttachedFile, FileCategory, FileEntityType } from '../types/domain'

const QUERY_KEY = ['attached_files']

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Upload resumível via protocolo TUS — caminho oficialmente recomendado
// pela própria Supabase pra arquivos grandes/conexões instáveis (edital,
// termo de referência, atestados escaneados etc). Em vez de mandar o
// arquivo inteiro numa tacada só (o que o .upload() padrão faz, e que
// falha com "Failed to fetch" ao primeiro soluço de rede num arquivo
// grande), divide em pedaços de 6MB e retoma sozinho de onde parou se uma
// parte falhar, em qualquer conexão — não só celular.
function uploadResumivel(file: File, path: string, accessToken: string, onProgress: (percentual: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const upload = new TusUpload(file, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: 'client-documents',
        objectName: path,
        contentType: file.type || 'application/octet-stream',
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024, // fixo — exigido pelo endpoint resumível da Supabase, não é ajustável
      onError: (error) => {
        console.error('Erro detalhado no upload resumível:', error)
        reject(new Error('Falha no envio por problema de conexão durante o upload. Tente novamente.'))
      },
      onProgress: (bytesEnviados, bytesTotais) => {
        onProgress(bytesTotais > 0 ? Math.round((bytesEnviados / bytesTotais) * 100) : 0)
      },
      onSuccess: () => resolve(),
    })

    // Se um envio anterior desse mesmo arquivo ficou pela metade (aba
    // fechada, conexão caiu de vez), retoma de onde parou em vez de
    // recomeçar do zero.
    upload.findPreviousUploads().then((uploadsAnteriores) => {
      if (uploadsAnteriores.length > 0) {
        upload.resumeFromPreviousUpload(uploadsAnteriores[0])
      }
      upload.start()
    })
  })
}

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
