import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromBiddingChecklistItemRow, toBiddingChecklistItemInsert } from '../lib/mappers'
import { useAuth } from './useAuth'
import type { BiddingChecklistItem, DocumentTipo } from '../types/domain'

const QUERY_KEY = ['bidding_checklist_items']

// Palavras-chave simples pra sugerir automaticamente qual certidão do
// cliente já atende um item do checklist, sem precisar de IA pra isso —
// cobre os casos óbvios (o item já diz "CNDT", "FGTS" etc na descrição).
// A análise por IA (quando configurada) pode ainda usar isso como
// primeira passada antes de perguntar pro usuário confirmar o resto.
const PALAVRAS_CHAVE_TIPO: Record<Exclude<DocumentTipo, 'manual'>, string[]> = {
  cndt: ['cndt', 'débitos trabalhistas', 'debitos trabalhistas'],
  cnd_federal: ['cnd federal', 'receita federal', 'pgfn', 'tributos federais'],
  cnd_estadual_rs: ['cnd estadual', 'sefaz', 'tributos estaduais'],
  fgts: ['fgts', 'crf', 'regularidade do fgts'],
  cnd_municipal: ['cnd municipal', 'tributos municipais'],
  certidao_falencia_rs: ['falência', 'falencia', 'concordata', 'recuperação judicial'],
  cnpj_cartao: ['cartão cnpj', 'cartao cnpj', 'inscrição cadastral', 'situação cadastral'],
}

// Tenta casar a descrição de um item do checklist com um dos tipos de
// certidão automática conhecidos, só por palavra-chave simples.
export function sugerirTipoDocumento(descricao: string): DocumentTipo | null {
  const texto = descricao.toLowerCase()
  for (const [tipo, palavras] of Object.entries(PALAVRAS_CHAVE_TIPO)) {
    if (palavras.some((p) => texto.includes(p))) return tipo as DocumentTipo
  }
  return null
}

export function useBiddingChecklist(biddingId?: string) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: [...QUERY_KEY, biddingId],
    enabled: !!user && !!biddingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bidding_checklist_items')
        .select('*')
        .eq('bidding_id', biddingId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data.map(fromBiddingChecklistItemRow)
    },
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, biddingId] })
    queryClient.invalidateQueries({ queryKey: ['bidding_checklist_pendencias'] })
  }

  const addItem = useMutation({
    mutationFn: async (item: {
      descricao: string
      categoria?: string | null
      obrigatorio?: boolean
      origem?: 'manual' | 'ia'
      prazo?: string | null
      responsavelNome?: string | null
    }) => {
      if (!user || !biddingId) throw new Error('Não autenticado')
      const clientDocumentTipo = sugerirTipoDocumento(item.descricao)
      const { error } = await supabase.from('bidding_checklist_items').insert(
        toBiddingChecklistItemInsert({
          biddingId,
          descricao: item.descricao,
          categoria: item.categoria ?? null,
          obrigatorio: item.obrigatorio ?? true,
          origem: item.origem ?? 'manual',
          clientDocumentTipo,
          atendido: false,
          prazo: item.prazo ?? null,
          responsavelNome: item.responsavelNome ?? null,
        }, user.id)
      )
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const addItensEmLote = useMutation({
    mutationFn: async (itens: { descricao: string; categoria?: string | null; obrigatorio?: boolean }[]) => {
      if (!user || !biddingId) throw new Error('Não autenticado')
      const rows = itens.map((item) =>
        toBiddingChecklistItemInsert({
          biddingId,
          descricao: item.descricao,
          categoria: item.categoria ?? null,
          obrigatorio: item.obrigatorio ?? true,
          origem: 'ia',
          clientDocumentTipo: sugerirTipoDocumento(item.descricao),
          atendido: false,
        }, user.id)
      )
      const { error } = await supabase.from('bidding_checklist_items').insert(rows)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const updateItem = useMutation({
    mutationFn: async (item: BiddingChecklistItem) => {
      const { error } = await supabase
        .from('bidding_checklist_items')
        .update({
          descricao: item.descricao,
          categoria: item.categoria,
          obrigatorio: item.obrigatorio,
          atendido: item.atendido,
          client_document_tipo: item.clientDocumentTipo,
          attached_file_id: item.attachedFileId,
          observacoes: item.observacoes,
          prazo: item.prazo,
          responsavel_nome: item.responsavelNome,
        })
        .eq('id', item.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteItem = useMutation({
    mutationFn: async (item: BiddingChecklistItem) => {
      const { error } = await supabase.from('bidding_checklist_items').delete().eq('id', item.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    addItem,
    addItensEmLote,
    updateItem,
    deleteItem,
  }
}

export interface PendenciaChecklist extends BiddingChecklistItem {
  biddingObjeto: string
  biddingOrgao: string
  clientName: string
}

// "Motor de Pendências" — todos os itens de checklist NÃO atendidos, de
// TODAS as licitações, num painel só (tipo lista de tarefas). Não refaz o
// cruzamento automático com certidões (isso já acontece só dentro da tela
// de cada licitação) — aqui é só o que foi marcado como pendente no banco,
// então pode aparecer algum item que na prática já está coberto por uma
// certidão válida mas ainda não foi confirmado manualmente.
export function usePendenciasChecklist() {
  const { user } = useAuth()

  const query = useQuery({
    queryKey: ['bidding_checklist_pendencias'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bidding_checklist_items')
        .select('*, biddings(objeto, orgao, client_id, clients(name))')
        .eq('atendido', false)
        .is('attached_file_id', null)
        .order('prazo', { ascending: true, nullsFirst: false })
      if (error) throw error
      return (data ?? []).map((row: any) => ({
        ...fromBiddingChecklistItemRow(row),
        biddingObjeto: row.biddings?.objeto ?? '—',
        biddingOrgao: row.biddings?.orgao ?? '—',
        clientName: row.biddings?.clients?.name ?? '—',
      })) as PendenciaChecklist[]
    },
  })

  return {
    pendencias: query.data ?? [],
    isLoading: query.isLoading,
  }
}
