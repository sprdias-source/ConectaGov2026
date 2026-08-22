import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromFileRow, toFileInsert } from '../lib/mappers'
import { uploadResumivel } from '../lib/uploadResumivel'
import { useAuth } from './useAuth'
import { useToast } from './useToast'
import type { AttachedFile, FileCategory, FileEntityType } from '../types/domain'

const QUERY_KEY = ['attached_files']

// Limite de tamanho e tipos aceitos pra anexos — reflete o que o `accept`
// dos inputs de arquivo já promete na tela (.pdf, .doc, .docx). Isso é só
// defesa de robustez/UX no cliente (fácil de contornar por quem quiser);
// a barreira de verdade tem que estar em RLS/policy do Storage no
// Supabase, que fica fora do alcance de uma validação em JS no navegador.
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024 // 20MB
const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx']
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

// Confere tamanho e tipo do arquivo antes de subir. Retorna uma mensagem
// de erro pronta pra mostrar ao usuário, ou `null` se o arquivo passou.
export function validateFileBeforeUpload(file: File): string | null {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `Arquivo muito grande (máximo de ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB).`
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const tipoValido = ALLOWED_EXTENSIONS.includes(ext) || (file.type && ALLOWED_MIME_TYPES.includes(file.type))
  if (!tipoValido) {
    return 'Tipo de arquivo não permitido. Envie apenas PDF, DOC ou DOCX.'
  }
  return null
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
      // Mesma validação já feita no componente (DocumentUploader,
      // EditaisAnaliseSection etc.) antes de chamar `.mutate` — repetida
      // aqui pra garantir que exista pelo menos uma barreira mesmo se
      // algum chamador futuro esquecer de validar antes de disparar o
      // upload.
      const erroValidacao = validateFileBeforeUpload(file)
      if (erroValidacao) throw new Error(erroValidacao)
      const ext = file.name.split('.').pop() ?? 'pdf'
      // Mesmo motivo do fix em useClientDocuments.ts: a policy de Storage
      // exige que o primeiro segmento do caminho seja owner_efetivo(uid),
      // não o uid de quem está logado — sem isso, upload de um membro de
      // equipe sempre falhava com 403.
      const { data: ownerId, error: ownerError } = await supabase.rpc('owner_efetivo', { usuario_id: user.id })
      if (ownerError) throw ownerError
      const path = `${ownerId}/${entityType}/${entityId}/${Date.now()}.${ext}`

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
