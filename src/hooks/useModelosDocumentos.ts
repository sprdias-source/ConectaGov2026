import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromModeloDocumentoRow, toModeloDocumentoInsert } from '../lib/mappers'
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
        const path = `${user.id}/modelos/${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('client-documents')
          .upload(path, modelo.file, { upsert: true })
        if (uploadError) throw uploadError
        storagePath = path
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
        await supabase.storage.from('client-documents').remove([modelo.storagePath])
      }
      const { error } = await supabase.from('modelos_documentos').delete().eq('id', modelo.id)
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
    modelos: query.data ?? [],
    isLoading: query.isLoading,
    addModelo,
    deleteModelo,
    getDownloadUrl,
  }
}
