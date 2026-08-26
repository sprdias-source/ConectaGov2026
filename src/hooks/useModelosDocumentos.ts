import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromModeloDocumentoRow, toModeloDocumentoInsert } from '../lib/mappers'
import { enviarParaDrive, baixarDoDrive, excluirNoDrive, ehArquivoDrive } from '../lib/driveStorage'
import { useAuth } from './useAuth'
import type { ModeloDocumento, CategoriaModeloDocumento } from '../types/domain'

const QUERY_KEY = ['modelos_documentos']

export function useModelosDocumentos() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('modelos_documentos')
        .select('*')
        .order('nome', { ascending: true })
      if (error) throw error
      return data.map(fromModeloDocumentoRow)
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })

  const addModelo = useMutation({
    mutationFn: async (modelo: {
      nome: string
      categoria: CategoriaModeloDocumento
      tags?: string | null
      conteudo?: string | null
      observacoes?: string | null
      file?: File | null
    }) => {
      if (!user) throw new Error('Não autenticado')
      let storagePath: string | null = null
      if (modelo.file) {
        const ext = modelo.file.name.split('.').pop() ?? 'docx'
        // Mesmo ajuste já feito em useClientDocuments.ts/useAttachedFiles.ts
        // — ver comentário equivalente em useAtestados.ts.
        const { data: ownerId, error: ownerError } = await supabase.rpc('owner_efetivo', { usuario_id: user.id })
        if (ownerError) throw ownerError
        const path = `${ownerId}/modelos/${Date.now()}.${ext}`
        storagePath = await enviarParaDrive(modelo.file, path)
      }
      const { error } = await supabase.from('modelos_documentos').insert(
        toModeloDocumentoInsert({
          nome: modelo.nome,
          categoria: modelo.categoria,
          tags: modelo.tags ?? null,
          conteudo: modelo.conteudo ?? null,
          storagePath,
          observacoes: modelo.observacoes ?? null,
        }, user.id)
      )
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteModelo = useMutation({
    mutationFn: async (modelo: ModeloDocumento) => {
      if (modelo.storagePath) {
        if (ehArquivoDrive(modelo.storagePath)) {
          await excluirNoDrive('modelos_documentos', modelo.storagePath)
        } else {
          await supabase.storage.from('client-documents').remove([modelo.storagePath])
        }
      }
      const { error } = await supabase.from('modelos_documentos').delete().eq('id', modelo.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const getDownloadUrl = async (storagePath: string) => {
    if (ehArquivoDrive(storagePath)) {
      return baixarDoDrive('modelos_documentos', storagePath)
    }
    const { data, error } = await supabase.storage
      .from('client-documents')
      .createSignedUrl(storagePath, 60 * 10)
    if (error) throw error
    return data.signedUrl
  }

  return {
    modelos: query.data ?? [],
    isLoading: query.isLoading,
    addModelo,
    deleteModelo,
    getDownloadUrl,
  }
}
