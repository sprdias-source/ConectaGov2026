import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { todayLocalISO } from '../lib/dateUtils'
import { supabase } from '../lib/supabase'
import { fromBiddingRow, toBiddingInsert, toBiddingItemInsert, toTransactionInsert } from '../lib/mappers'
import type { Bidding, BiddingItem } from '../types/domain'
import { useAuth } from './useAuth'
import { useAuditLog } from './useAuditLog'

const QUERY_KEY = ['biddings']

async function saveItems(userId: string, biddingId: string, items: Partial<BiddingItem>[]) {
  await supabase.from('bidding_items').delete().eq('bidding_id', biddingId)
  if (items.length === 0) return
  const { error } = await supabase
    .from('bidding_items')
    .insert(items.map((i) => toBiddingItemInsert({ ...i, biddingId }, userId)))
  if (error) throw error
}

// Guarda uma "foto" dos itens ANTES de sobrescrever (saveItems apaga tudo
// e reinsere) — histórico de versões estilo Git, pra nunca perder o
// preço/margem anterior mesmo que a edição atual tenha erro. Só grava se
// já havia algo salvo (edição de verdade, não a primeira criação).
async function snapshotItemsBeforeOverwrite(userId: string, biddingId: string, userEmail: string | null | undefined) {
  const { data: itensAtuais } = await supabase
    .from('bidding_items')
    .select('*')
    .eq('bidding_id', biddingId)
  if (!itensAtuais || itensAtuais.length === 0) return

  const { data: ultimaVersao } = await supabase
    .from('bidding_items_versions')
    .select('versao')
    .eq('bidding_id', biddingId)
    .order('versao', { ascending: false })
    .limit(1)
    .maybeSingle()

  const proximaVersao = (ultimaVersao?.versao ?? 0) + 1

  await supabase.from('bidding_items_versions').insert({
    user_id: userId,
    bidding_id: biddingId,
    versao: proximaVersao,
    itens_snapshot: itensAtuais,
    alterado_por_email: userEmail ?? null,
  })
}

// Se a licitação tem uma taxa de participação definida e ainda não foi
// lançada no financeiro, cria a transação "a receber" correspondente e
// marca a flag para nunca duplicar esse lançamento.
async function maybeLaunchParticipationFee(userId: string, bidding: Bidding): Promise<boolean> {
  if (!bidding.taxaParticipacao || bidding.taxaParticipacao <= 0) return false
  if (bidding.taxaParticipacaoLancada) return false

  const { error } = await supabase.from('transactions').insert(
    toTransactionInsert(
      {
        type: 'Receber',
        category: 'Taxa de Participação Individual',
        description: `Taxa de Participação — ${bidding.objeto}`,
        clientId: bidding.clientId,
        biddingId: bidding.id,
        value: bidding.taxaParticipacao,
        dueDate: bidding.dataCadastro || todayLocalISO(),
        paymentMethod: 'PIX',
        status: 'Pendente',
      },
      userId
    )
  )
  if (error) throw error

  await supabase.from('biddings').update({ taxa_participacao_lancada: true }).eq('id', bidding.id)
  return true
}

export function useBiddings() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { logEvent } = useAuditLog()

  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('biddings')
        .select('*')
        .order('data_abertura', { ascending: false })
      if (error) throw error
      return data.map(fromBiddingRow)
    },
  })

  const invalidate = (biddingId?: string) => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    queryClient.invalidateQueries({ queryKey: ['transactions'] })
    queryClient.invalidateQueries({ queryKey: ['empenhos'] })
    queryClient.invalidateQueries({ queryKey: ['bidding_items'] })
    if (biddingId) {
      queryClient.invalidateQueries({ queryKey: ['bidding_items_versions', biddingId] })
    }
  }

  const addBidding = useMutation({
    mutationFn: async ({ bidding, items }: { bidding: Partial<Bidding>; items: Partial<BiddingItem>[] }) => {
      if (!user) throw new Error('Usuário não autenticado')
      const { data, error } = await supabase
        .from('biddings')
        .insert(toBiddingInsert(bidding, user.id))
        .select()
        .single()
      if (error) throw error
      const created = fromBiddingRow(data)

      if (items.length > 0) await saveItems(user.id, created.id, items)
      const feeLaunched = await maybeLaunchParticipationFee(user.id, created)

      return { created, feeLaunched }
    },
    onSuccess: ({ created, feeLaunched }) => {
      invalidate()
      logEvent('Criou Licitação', `Iniciou licitação "${created.objeto}" no órgão "${created.orgao}" (Valor de R$ ${created.valorLicitado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`)
      if (feeLaunched) {
        logEvent('Lançou Taxa de Participação', `Gerou automaticamente a taxa de participação de R$ ${created.taxaParticipacao?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} para "${created.objeto}"`)
      }
    },
  })

  const updateBidding = useMutation({
    mutationFn: async ({ bidding, items }: { bidding: Bidding; items: Partial<BiddingItem>[] }) => {
      if (!user) throw new Error('Usuário não autenticado')
      const { data, error } = await supabase
        .from('biddings')
        .update(toBiddingInsert(bidding, bidding.userId))
        .eq('id', bidding.id)
        .select()
        .single()
      if (error) throw error
      const updated = fromBiddingRow(data)

      // Melhor esforço: se o snapshot de versão falhar por qualquer motivo
      // (ex: duas edições simultâneas gerando a mesma versão), o histórico
      // fica incompleto, mas a edição real do usuário NUNCA pode ser
      // bloqueada por causa disso.
      try {
        await snapshotItemsBeforeOverwrite(user.id, updated.id, user.email)
      } catch (err) {
        console.warn('Não foi possível salvar o histórico de versão dos itens:', err)
      }
      await saveItems(user.id, updated.id, items)
      const feeLaunched = await maybeLaunchParticipationFee(user.id, updated)

      return { updated, feeLaunched }
    },
    onSuccess: ({ updated, feeLaunched }) => {
      invalidate(updated.id)
      logEvent('Editou Licitação', `Atualizou licitação "${updated.objeto}" (Órgão: ${updated.orgao}) — status: ${updated.status}`)
      if (feeLaunched) {
        logEvent('Lançou Taxa de Participação', `Gerou automaticamente a taxa de participação de R$ ${updated.taxaParticipacao?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} para "${updated.objeto}"`)
      }
    },
  })

  const deleteBidding = useMutation({
    mutationFn: async (bidding: Bidding) => {
      const { error } = await supabase.from('biddings').delete().eq('id', bidding.id)
      if (error) throw error
      return bidding
    },
    onSuccess: (deleted) => {
      invalidate()
      logEvent('Excluiu Licitação', `Removeu a licitação do órgão "${deleted.orgao}" referente ao objeto "${deleted.objeto}". Empenhos e lançamentos vinculados foram removidos automaticamente.`)
    },
  })

  const toggleBiddingActive = useMutation({
    mutationFn: async ({ bidding, isActive }: { bidding: Bidding; isActive: boolean }) => {
      const { data, error } = await supabase
        .from('biddings')
        .update({ is_active: isActive })
        .eq('id', bidding.id)
        .select()
        .single()
      if (error) throw error
      return fromBiddingRow(data)
    },
    onSuccess: (updated) => {
      invalidate()
      logEvent(
        updated.isActive ? 'Reativou Licitação' : 'Inativou Licitação',
        `${updated.isActive ? 'Reativou' : 'Inativou'} a licitação "${updated.objeto}"`
      )
    },
  })

  // Atualiza só o caminho do modelo de proposta customizado (Storage) —
  // separado do updateBidding pra não arriscar mexer nos itens da
  // licitação (updateBidding sempre reescreve bidding_items a partir do
  // array `items` recebido, e aqui não queremos tocar nisso).
  const setModeloCustomizado = useMutation({
    mutationFn: async ({ biddingId, path }: { biddingId: string; path: string | null }) => {
      const { data, error } = await supabase
        .from('biddings')
        .update({ modelo_customizado_path: path })
        .eq('id', biddingId)
        .select()
        .single()
      if (error) throw error
      return fromBiddingRow(data)
    },
    onSuccess: (updated) => {
      invalidate()
      logEvent(
        updated.modeloCustomizadoPath ? 'Enviou Modelo Próprio de Proposta' : 'Removeu Modelo Próprio de Proposta',
        `Licitação "${updated.objeto}" (Órgão: ${updated.orgao})`
      )
    },
  })

  // Atualiza só a etapa do funil — separada do updateBidding pra não
  // arriscar mexer nos itens da licitação (updateBidding sempre reescreve
  // bidding_items a partir do array `items` recebido).
  const updateEtapa = useMutation({
    mutationFn: async ({ biddingId, etapa }: { biddingId: string; etapa: Bidding['etapa'] }) => {
      const { data, error } = await supabase
        .from('biddings')
        .update({ etapa })
        .eq('id', biddingId)
        .select()
        .single()
      if (error) throw error
      return fromBiddingRow(data)
    },
    onSuccess: (updated) => {
      invalidate()
      logEvent('Atualizou Etapa da Licitação', `Licitação "${updated.objeto}" — nova etapa: ${updated.etapa}`)
    },
  })

  const checkBiddingHasFinancialHistory = async (biddingId: string): Promise<boolean> => {
    const { count: txCount } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('bidding_id', biddingId)
      .eq('status', 'Pago')
    if ((txCount ?? 0) > 0) return true

    const { count: empCount } = await supabase
      .from('empenhos')
      .select('id', { count: 'exact', head: true })
      .eq('bidding_id', biddingId)
      .eq('status', 'Faturado')
    return (empCount ?? 0) > 0
  }

  return {
    biddings: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    addBidding,
    updateBidding,
    deleteBidding,
    toggleBiddingActive,
    setModeloCustomizado,
    updateEtapa,
    checkBiddingHasFinancialHistory,
  }
}
