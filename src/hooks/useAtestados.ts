import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromAtestadoRow, toAtestadoInsert } from '../lib/mappers'
import { enviarParaDrive, baixarDoDrive, excluirNoDrive, ehArquivoDrive } from '../lib/driveStorage'
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
        // Mesmo ajuste já feito em useClientDocuments.ts/useAttachedFiles.ts:
        // o primeiro segmento do caminho tem que ser o dono efetivo, não o
        // uid de quem está logado, senão um membro de equipe teria o
        // upload rejeitado (pela Edge Function drive-storage, que exige
        // essa regra explicitamente).
        const { data: ownerId, error: ownerError } = await supabase.rpc('owner_efetivo', { usuario_id: user.id })
        if (ownerError) throw ownerError
        const path = `${ownerId}/${clientId}/atestados/${Date.now()}.${ext}`
        storagePath = await enviarParaDrive(atestado.file, path)
      }
      const { data, error } = await supabase.from('atestados_tecnicos').insert(
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
      ).select('id').single()
      if (error) {
        // Se o registro no banco falhar depois do arquivo já ter subido pro
        // Drive, desfaz o upload — sem isso, o arquivo ficava órfão no
        // Drive, sem nenhuma referência no banco.
        if (storagePath) await excluirNoDrive('atestados_tecnicos', storagePath).catch(() => {})
        throw error
      }
      return data.id as string
    },
    onSuccess: invalidate,
  })

  const deleteAtestado = useMutation({
    mutationFn: async (atestado: AtestadoTecnico) => {
      // Desvincula qualquer item de checklist que dependia deste atestado
      // ANTES de apagar — a FK (atestado_id) zera sozinha via ON DELETE SET
      // NULL, mas só ela não bastaria: a flag "atendido" (setada quando o
      // atestado foi vinculado) ficaria presa em true pra sempre, e o item
      // continuaria aparecendo como resolvido mesmo sem nenhum arquivo por
      // trás. Precisa rodar antes do delete, enquanto ainda dá pra achar
      // essas linhas pelo atestado_id (depois a FK já zerou e não tem mais
      // como filtrar por ele).
      await supabase
        .from('bidding_checklist_items')
        .update({ atestado_id: null, atendido: false })
        .eq('atestado_id', atestado.id)

      // Apaga primeiro o REGISTRO no banco — só depois de confirmado é que
      // o arquivo de verdade é apagado no Drive/Storage. Nessa ordem, se o
      // passo do arquivo falhar, o pior caso é um arquivo órfão consumindo
      // espaço — nunca um registro apontando pra um arquivo que já não
      // existe mais.
      const { error } = await supabase.from('atestados_tecnicos').delete().eq('id', atestado.id)
      if (error) throw error

      if (atestado.storagePath) {
        if (ehArquivoDrive(atestado.storagePath)) {
          await excluirNoDrive('atestados_tecnicos', atestado.storagePath)
        } else {
          await supabase.storage.from('client-documents').remove([atestado.storagePath])
        }
      }
    },
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['bidding_checklist_items'] })
      queryClient.invalidateQueries({ queryKey: ['bidding_checklist_pendencias'] })
    },
  })

  const getDownloadUrl = async (storagePath: string) => {
    if (ehArquivoDrive(storagePath)) {
      return baixarDoDrive('atestados_tecnicos', storagePath)
    }
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
