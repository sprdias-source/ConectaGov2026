import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromAtestadoRow, toAtestadoInsert } from '../lib/mappers'
import { useAuth } from './useAuth'
import type { AtestadoTecnico } from '../types/domain'

const QUERY_KEY = ['atestados_tecnicos']

// Comparação de texto simples (contagem de palavras em comum, sem IA) —
// serve como aproximação inicial pro ranking de compatibilidade entre o
// objeto do edital e o objeto de cada atestado. Quando a análise por IA
// (Gemini) estiver configurada, esse cálculo pode ser substituído por uma
// comparação semântica de verdade, mais precisa — por enquanto é só
// contagem de palavras relevantes em comum, então os percentuais tendem a
// ser mais conservadores que uma comparação semântica real.
const PALAVRAS_IGNORADAS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'em', 'para',
  'com', 'por', 'no', 'na', 'nos', 'nas', 'um', 'uma', 'uns', 'umas', 'ao',
  'à', 'aos', 'às', 'que', 'ou', 'ser', 'sob', 'sem',
])

function tokenizar(texto: string): Set<string> {
  const normalizado = texto
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
  const palavras = normalizado.split(/\s+/).filter((p) => p.length > 2 && !PALAVRAS_IGNORADAS.has(p))
  return new Set(palavras)
}

// Retorna um percentual (0-100) de sobreposição de palavras-chave entre
// dois textos — quanto mais palavras relevantes em comum (proporcional ao
// total de palavras únicas dos dois), maior o percentual.
export function calcularSimilaridade(textoA: string, textoB: string): number {
  const tokensA = tokenizar(textoA)
  const tokensB = tokenizar(textoB)
  if (tokensA.size === 0 || tokensB.size === 0) return 0
  let intersecao = 0
  for (const t of tokensA) if (tokensB.has(t)) intersecao++
  const uniao = new Set([...tokensA, ...tokensB]).size
  return Math.round((intersecao / uniao) * 100)
}

export function useAtestados(clientId?: string) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: [...QUERY_KEY, clientId],
    enabled: !!user && !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('atestados_tecnicos')
        .select('*')
        .eq('client_id', clientId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data.map(fromAtestadoRow)
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, clientId] })

  const addAtestado = useMutation({
    mutationFn: async (atestado: {
      nome: string
      objeto: string
      orgaoEmissor?: string | null
      valor?: number | null
      dataEmissao?: string | null
      observacoes?: string | null
      file?: File | null
    }) => {
      if (!user || !clientId) throw new Error('Não autenticado')
      let storagePath: string | null = null
      if (atestado.file) {
        const ext = atestado.file.name.split('.').pop() ?? 'pdf'
        const path = `${user.id}/${clientId}/atestados/${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('client-documents')
          .upload(path, atestado.file, { upsert: true })
        if (uploadError) throw uploadError
        storagePath = path
      }
      const { error } = await supabase.from('atestados_tecnicos').insert(
        toAtestadoInsert({
          clientId,
          nome: atestado.nome,
          objeto: atestado.objeto,
          orgaoEmissor: atestado.orgaoEmissor ?? null,
          valor: atestado.valor ?? null,
          dataEmissao: atestado.dataEmissao ?? null,
          storagePath,
          observacoes: atestado.observacoes ?? null,
        }, user.id)
      )
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteAtestado = useMutation({
    mutationFn: async (atestado: AtestadoTecnico) => {
      if (atestado.storagePath) {
        await supabase.storage.from('client-documents').remove([atestado.storagePath])
      }
      const { error } = await supabase.from('atestados_tecnicos').delete().eq('id', atestado.id)
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
    atestados: query.data ?? [],
    isLoading: query.isLoading,
    addAtestado,
    deleteAtestado,
    getDownloadUrl,
  }
}
