import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromBiddingChecklistItemRow, toBiddingChecklistItemInsert } from '../lib/mappers'
import { useAuth } from './useAuth'
import { calcDocStatus } from './useClientDocuments'
import type { AtestadoTecnico, AttachedFile, BiddingChecklistItem, ClientDocument, DocumentTipo } from '../types/domain'

const QUERY_KEY = ['bidding_checklist_items']

export type StatusHabilitacao = 'HABILITADO' | 'ATENÇÃO' | 'INABILITADO' | null

export interface HabilitacaoResumo {
  status: StatusHabilitacao
  total: number
  atendidos: number
  vencendo: number
  faltando: number
  percentual: number | null
}

// Um item do checklist está "atendido" se: aponta pra um documento
// específico do repositório do cliente (clientDocumentId — caso de um
// documento manual reaproveitável), OU aponta pra um tipo de certidão que
// o cliente já tem válida (clientDocumentTipo — as 7 certidões padrão, sem
// precisar de vínculo por item, casa sozinho), OU foi marcado manualmente
// (atendido — inclui o caso de Atestado Técnico, ligado por atestadoId).
// attachedFileId é só o campo legado (PR anterior a mover tudo pro
// repositório do cliente) — mantido só pra não quebrar itens já anexados
// daquele jeito.
export function statusItemChecklist(item: BiddingChecklistItem, clientDocs: ClientDocument[]): 'atendido' | 'vencendo' | 'faltando' {
  if (item.clientDocumentId) {
    const doc = clientDocs.find((d) => d.id === item.clientDocumentId)
    if (doc?.storagePath) {
      const status = calcDocStatus(doc.dataValidade)
      if (status === 'valido') return 'atendido'
      if (status === 'vencendo') return 'vencendo'
    }
  }
  if (item.clientDocumentTipo) {
    const doc = clientDocs.find((d) => d.tipo === item.clientDocumentTipo)
    if (doc?.storagePath) {
      const status = calcDocStatus(doc.dataValidade)
      if (status === 'valido') return 'atendido'
      if (status === 'vencendo') return 'vencendo'
    }
  }
  if (item.attachedFileId) return 'atendido'
  return item.atendido ? 'atendido' : 'faltando'
}

// Acha o arquivo de verdade que satisfaz um item — pra "Ver PDF" e pro
// resumo em Documentos Finais. Prioriza os vínculos com o repositório do
// cliente (reaproveitáveis); attachedFileId é só o fallback legado.
export function arquivoResolvidoDoItem(
  item: BiddingChecklistItem,
  clientDocs: ClientDocument[],
  atestados: AtestadoTecnico[],
  anexosLegado: AttachedFile[]
): { nome: string; storagePath: string; dataValidade: string | null } | null {
  if (item.clientDocumentId) {
    const doc = clientDocs.find((d) => d.id === item.clientDocumentId)
    if (doc?.storagePath) return { nome: doc.nome, storagePath: doc.storagePath, dataValidade: doc.dataValidade }
  }
  if (item.clientDocumentTipo) {
    const doc = clientDocs.find((d) => d.tipo === item.clientDocumentTipo)
    if (doc?.storagePath) return { nome: doc.nome, storagePath: doc.storagePath, dataValidade: doc.dataValidade }
  }
  if (item.atestadoId) {
    const a = atestados.find((x) => x.id === item.atestadoId)
    if (a?.storagePath) return { nome: a.nome, storagePath: a.storagePath, dataValidade: null }
  }
  if (item.attachedFileId) {
    const f = anexosLegado.find((x) => x.id === item.attachedFileId)
    if (f) return { nome: f.name, storagePath: f.storagePath, dataValidade: null }
  }
  return null
}

// "Motor de Compliance" — cruza o que o edital exige (itens obrigatórios
// do checklist) com o que o cliente já tem, pra saber se a licitação está
// pronta pra disputa. Usado na página de detalhe, no selo compacto
// (components/ui/SeloHabilitacao.tsx) e no alerta do Dashboard, sem
// duplicar a lógica em cada lugar.
export function calcularHabilitacao(items: BiddingChecklistItem[], clientDocs: ClientDocument[]): HabilitacaoResumo {
  const obrigatorios = items.filter((i) => i.obrigatorio)
  const total = obrigatorios.length
  const atendidos = obrigatorios.filter((i) => statusItemChecklist(i, clientDocs) === 'atendido').length
  const vencendo = obrigatorios.filter((i) => statusItemChecklist(i, clientDocs) === 'vencendo').length
  const faltando = obrigatorios.filter((i) => statusItemChecklist(i, clientDocs) === 'faltando').length

  const status: StatusHabilitacao =
    total === 0 ? null
    : faltando > 0 ? 'INABILITADO'
    : vencendo > 0 ? 'ATENÇÃO'
    : 'HABILITADO'

  return { status, total, atendidos, vencendo, faltando, percentual: total > 0 ? Math.round((atendidos / total) * 100) : null }
}

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
export function sugerirTipoDocumento(descricao: string): Exclude<DocumentTipo, 'manual'> | null {
  const texto = descricao.toLowerCase()
  for (const [tipo, palavras] of Object.entries(PALAVRAS_CHAVE_TIPO)) {
    if (palavras.some((p) => texto.includes(p))) return tipo as Exclude<DocumentTipo, 'manual'>
  }
  return null
}

// A Análise de Edital por IA já é instruída a começar cada item do
// checklist pela numeração exata do próprio edital (ex: "5.2 a) Inscrição
// no CNPJ"). Separa esse número num campo próprio em vez de deixar preso
// dentro do texto, cobrindo os formatos mais comuns de numeração de edital
// (com ou sem alínea). Só reconhece número com ponto ("5.2") ou número +
// alínea ("5 a)") — evita casar um número solto no meio de uma frase comum
// (ex: "24 horas de prazo") como se fosse numeração.
const RE_NUMERO_EDITAL = /^(\d+(?:\.\d+)+\s*(?:[a-zà-ÿ]\))?|\d+\s*[a-zà-ÿ]\))\s+(.+)$/i

export function extrairNumeroEdital(descricao: string): { numero: string | null; descricao: string } {
  const m = descricao.match(RE_NUMERO_EDITAL)
  if (!m) return { numero: null, descricao }
  return { numero: m[1].trim(), descricao: m[2].trim() }
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
      numeroEdital?: string | null
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
          numeroEdital: item.numeroEdital ?? null,
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
      const rows = itens.map((item) => {
        const { numero, descricao } = extrairNumeroEdital(item.descricao)
        return toBiddingChecklistItemInsert({
          biddingId,
          numeroEdital: numero,
          descricao,
          categoria: item.categoria ?? null,
          obrigatorio: item.obrigatorio ?? true,
          origem: 'ia',
          clientDocumentTipo: sugerirTipoDocumento(descricao),
          atendido: false,
        }, user.id)
      })
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
          numero_edital: item.numeroEdital,
          descricao: item.descricao,
          categoria: item.categoria,
          obrigatorio: item.obrigatorio,
          atendido: item.atendido,
          client_document_tipo: item.clientDocumentTipo,
          attached_file_id: item.attachedFileId,
          client_document_id: item.clientDocumentId,
          atestado_id: item.atestadoId,
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

  // Usado quando o edital que gerou esses itens é removido (ex: PDF errado
  // foi enviado) — apaga só os itens sugeridos pela IA (origem='ia'), sem
  // mexer nos que o usuário adicionou manualmente, que não têm relação com
  // qual edital foi analisado.
  const limparItensIA = useMutation({
    mutationFn: async () => {
      if (!biddingId) throw new Error('Licitação não informada')
      const { error } = await supabase
        .from('bidding_checklist_items')
        .delete()
        .eq('bidding_id', biddingId)
        .eq('origem', 'ia')
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
    limparItensIA,
  }
}

// Busca os itens de checklist de TODAS as licitações de uma vez — usado
// pelo Dashboard (cruza com certidões pra achar sessões de risco) e pela
// Central de Prazos (pra saber se uma certidão está vinculada a alguma
// licitação com sessão marcada). Mesmo padrão de useAllClientDocuments em
// useClientDocuments.ts.
export function useAllBiddingChecklistItems() {
  const { user } = useAuth()

  const query = useQuery({
    queryKey: [...QUERY_KEY, 'all'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('bidding_checklist_items').select('*')
      if (error) throw error
      return data.map(fromBiddingChecklistItemRow)
    },
  })

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
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
        .is('client_document_id', null)
        .is('atestado_id', null)
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
