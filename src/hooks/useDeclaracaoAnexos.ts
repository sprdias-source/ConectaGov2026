import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromDeclaracaoAnexoRow } from '../lib/mappers'
import { useAuth } from './useAuth'
import type { Database } from '../types/database'

const QUERY_KEY = ['bidding_declaracao_anexos']

type RowComItens = Database['public']['Tables']['bidding_declaracao_anexos']['Row'] & {
  bidding_declaracao_anexo_itens: { checklist_item_id: string }[] | null
}

// Anexos-modelo de declaração extraídos do edital pela IA (ver
// DeclaracaoAnexo em types/domain.ts). Fluxo de 3 passos: rascunho ->
// enviado ao cliente -> assinado e anexado. O upload do arquivo assinado em
// si acontece via useAttachedFiles (mesmo storage/tabela dos outros
// documentos da licitação) — este hook só orquestra o status e propaga o
// vínculo pros itens do checklist quando o passo 3 é concluído.
export function useDeclaracaoAnexos(biddingId?: string) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const queryKey = [...QUERY_KEY, biddingId]

  const query = useQuery({
    queryKey,
    enabled: !!user && !!biddingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bidding_declaracao_anexos')
        .select('*, bidding_declaracao_anexo_itens(checklist_item_id)')
        .eq('bidding_id', biddingId as string)
        .order('created_at', { ascending: true })
      if (error) throw error
      return ((data ?? []) as unknown as RowComItens[]).map((row) =>
        fromDeclaracaoAnexoRow(row, (row.bidding_declaracao_anexo_itens ?? []).map((i) => i.checklist_item_id))
      )
    },
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey })
    queryClient.invalidateQueries({ queryKey: ['bidding_checklist_items', biddingId] })
  }

  // Dispara a análise por IA — cria os anexos em 'rascunho'. Uma reanálise
  // substitui só os rascunhos anteriores (rodrunda na própria edge
  // function); anexos já enviados/assinados nunca são apagados por ela.
  const analisar = useMutation({
    mutationFn: async () => {
      if (!biddingId) throw new Error('Licitação não definida')
      const { data, error } = await supabase.functions.invoke('Analisar-anexos-declaracao', { body: { biddingId } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data as { success: boolean; criados: number }
    },
    onSuccess: invalidate,
  })

  const atualizarTexto = useMutation({
    mutationFn: async ({ id, texto }: { id: string; texto: string }) => {
      const { error } = await supabase.from('bidding_declaracao_anexos').update({ texto }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  // Gera o .pdf já formatado (cabeçalho do cliente + corpo do texto) e
  // dispara o download no navegador — substitui o antigo "Copiar" (que só
  // copiava o texto pra área de transferência) por um documento pronto pra
  // mandar o cliente assinar. Não grava nada no banco, só baixa o arquivo.
  const gerarPdf = useMutation({
    mutationFn: async (anexoId: string) => {
      const { data, error } = await supabase.functions.invoke('gerar-anexo-declaracao', { body: { anexoId } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      const resultado = data as { fileBase64: string; mimeType: string; fileName: string }
      const bytes = Uint8Array.from(atob(resultado.fileBase64), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: resultado.mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = resultado.fileName
      a.click()
      URL.revokeObjectURL(url)
    },
  })

  // Passo 1 -> 2: registra que foi mandado pro cliente assinar. O texto
  // não é travado no banco (isso é só uma regra de UI) — só o status muda.
  const marcarEnviado = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bidding_declaracao_anexos').update({ status: 'enviado', enviado_em: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  // Passo 2 -> 3: o arquivo assinado (já enviado ao Storage via
  // useAttachedFiles, aqui só recebe o id) fica vinculado ao anexo, e o
  // mesmo attached_file_id é propagado pra cada item do checklist que esse
  // anexo resolve — é esse vínculo que faz o item marcar como atendido
  // (statusItemChecklist já trata attachedFileId como "atendido" sozinho).
  const anexarAssinado = useMutation({
    mutationFn: async ({ anexoId, attachedFileId, itensChecklistIds }: { anexoId: string; attachedFileId: string; itensChecklistIds: string[] }) => {
      const { error } = await supabase
        .from('bidding_declaracao_anexos')
        .update({ status: 'assinado', attached_file_id: attachedFileId })
        .eq('id', anexoId)
      if (error) throw error

      for (const itemId of itensChecklistIds) {
        await supabase.from('bidding_checklist_items').update({ attached_file_id: attachedFileId }).eq('id', itemId)
      }
    },
    onSuccess: invalidate,
  })

  const deleteAnexo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bidding_declaracao_anexos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    anexos: query.data ?? [],
    isLoading: query.isLoading,
    analisar,
    atualizarTexto,
    gerarPdf,
    marcarEnviado,
    anexarAssinado,
    deleteAnexo,
  }
}
