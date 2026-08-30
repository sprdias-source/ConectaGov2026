import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { todayLocalISO } from '../lib/dateUtils'
import { supabase } from '../lib/supabase'
import { fromBiddingRow, fromBiddingItemRow, toBiddingInsert, toBiddingItemInsert, toTransactionInsert } from '../lib/mappers'
import { somarValorGanho } from '../lib/analiseEdital'
import { licitacaoBloqueadaPorResultado } from '../lib/biddingLock'
import type { Bidding, BiddingItem, BiddingStatus } from '../types/domain'
import { useAuth } from './useAuth'
import { useAuditLog } from './useAuditLog'

const QUERY_KEY = ['biddings']

// Se a licitação acabou de ficar "Ganhou" + "Adjudicada e Homologada" (nas
// três mutações que podem chegar nessa combinação: marcarResultado grava o
// status, updateEtapa grava a etapa, updateBidding pode gravar os dois de
// uma vez pela edição manual — qualquer uma pode ser a última a chegar),
// preenche sozinho dois campos que dependem exatamente dessa transição:
// - Valor Ganho de Fato: calculado a partir dos itens marcados "Ganhou"
//   (mesma regra de somarValorGanho). Só se: o campo ainda está vazio —
//   nunca sobrescreve um valor já digitado ou já calculado antes, a única
//   forma de mudar depois é editar manualmente — e há itens cadastrados
//   somando mais que zero, pra nunca inventar um número sem itens.
// - Data de Homologação: normalmente já veio preenchida pelo próprio Kanban
//   no momento em que o card entrou na etapa "Adjudicada e Homologada" (ver
//   HomologacaoDialog em KanbanLicitacoesPage.tsx). Serve de rede de
//   segurança pros outros dois caminhos que completam a mesma combinação
//   sem passar por lá — marcarResultado (LicitacaoPage) e updateBidding
//   (edição manual do cadastro) — caindo pra data de hoje só nesses casos.
//   Só se ainda estiver vazia.
export async function tentarPreencherValorGanhoAutomatico(bidding: Bidding): Promise<Bidding> {
  if (!licitacaoBloqueadaPorResultado(bidding)) return bidding

  const updates: { valor_ofertado_real?: number; data_homologacao?: string } = {}

  if (bidding.dataHomologacao == null) {
    updates.data_homologacao = todayLocalISO()
  }

  if (bidding.valorOfertadoReal == null) {
    const { data: itensRows, error } = await supabase
      .from('bidding_items')
      .select('*')
      .eq('bidding_id', bidding.id)
    if (!error && itensRows && itensRows.length > 0) {
      const valorGanho = somarValorGanho(itensRows.map(fromBiddingItemRow))
      if (valorGanho > 0) updates.valor_ofertado_real = valorGanho
    }
  }

  if (Object.keys(updates).length === 0) return bidding

  const { data, error: updError } = await supabase
    .from('biddings')
    .update(updates)
    .eq('id', bidding.id)
    .select()
    .single()
  if (updError || !data) return bidding
  return fromBiddingRow(data)
}

// Mesma lógica acima, mas a partir só do biddingId — usado por quem edita os
// ITENS de uma licitação já ganha/homologada (aba Itens/Proposta da
// LicitacaoPage, fora do formulário de edição da licitação) sem ter o
// objeto Bidding completo em mãos. Sem isso, uma licitação que vira
// "Ganhou + Adjudicada e Homologada" ANTES de os itens terem o campo
// "Ganhou?" marcado (ordem comum: primeiro registra o resultado, só depois
// ajusta os itens na disputa de lances) nunca recebe o Valor Ganho de Fato
// automático — ele só era calculado no momento da transição de estado, e
// a essa altura a soma dos itens "Ganhou" ainda dava zero (a Data de
// Homologação não tem esse problema, já foi preenchida na transição).
export async function recalcularValorGanhoSeAutomatico(biddingId: string): Promise<void> {
  const { data, error } = await supabase.from('biddings').select('*').eq('id', biddingId).single()
  if (error || !data) return
  await tentarPreencherValorGanhoAutomatico(fromBiddingRow(data))
}

async function saveItems(userId: string, biddingId: string, items: Partial<BiddingItem>[]) {
  await supabase.from('bidding_items').delete().eq('bidding_id', biddingId)
  // Descarta itens sem descrição — a coluna é NOT NULL mas aceita string
  // vazia, então nada travava um item sem descrição de ser salvo, e ele
  // aparecia como linha vazia na Proposta em PDF e nos totais do Kanban.
  const itensValidos = items.filter((i) => (i.descricao ?? '').trim())
  if (itensValidos.length === 0) return
  const { error } = await supabase
    .from('bidding_items')
    .insert(itensValidos.map((i) => toBiddingItemInsert({ ...i, biddingId }, userId)))
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
    // 'bidding_items_por_licitacoes' (usado por RelatorioLicitacoesCliente)
    // não é prefixo de 'bidding_items', então precisa ser invalidado à
    // parte — sem isso o relatório por cliente ficava mostrando valores
    // desatualizados depois de editar itens de uma licitação.
    queryClient.invalidateQueries({ queryKey: ['bidding_items_por_licitacoes'] })
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
      logEvent('Criou Licitação', `Iniciou licitação "${created.objeto}" no órgão "${created.orgao}" (Valor de R$ ${created.valorLicitado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`, { type: 'bidding', id: created.id })
      if (feeLaunched) {
        logEvent('Lançou Taxa de Participação', `Gerou automaticamente a taxa de participação de R$ ${created.taxaParticipacao?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} para "${created.objeto}"`, { type: 'bidding', id: created.id })
      }
    },
  })

  const updateBidding = useMutation({
    mutationFn: async ({ bidding, items }: { bidding: Bidding; items: Partial<BiddingItem>[] | null }) => {
      if (!user) throw new Error('Usuário não autenticado')
      const { data, error } = await supabase
        .from('biddings')
        .update(toBiddingInsert(bidding, bidding.userId))
        .eq('id', bidding.id)
        .select()
        .single()
      if (error) throw error
      const updated = fromBiddingRow(data)

      // items === null significa que o usuário não tocou na aba Itens/Lotes
      // nesta edição — nesse caso NÃO reenviamos nada, porque saveItems
      // apaga e recria todos os itens da licitação a partir do array
      // recebido; reenviar o snapshot carregado na abertura do modal
      // sobrescreveria qualquer edição feita nos itens por outra aba/sessão
      // enquanto este modal esteve aberto.
      if (items !== null) {
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
      }
      const feeLaunched = await maybeLaunchParticipationFee(user.id, updated)
      const comValorGanho = await tentarPreencherValorGanhoAutomatico(updated)

      return { updated: comValorGanho, feeLaunched }
    },
    onSuccess: ({ updated, feeLaunched }) => {
      invalidate(updated.id)
      logEvent('Editou Licitação', `Atualizou licitação "${updated.objeto}" (Órgão: ${updated.orgao}) — status: ${updated.status}`, { type: 'bidding', id: updated.id })
      if (feeLaunched) {
        logEvent('Lançou Taxa de Participação', `Gerou automaticamente a taxa de participação de R$ ${updated.taxaParticipacao?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} para "${updated.objeto}"`, { type: 'bidding', id: updated.id })
      }
    },
  })

  const deleteBidding = useMutation({
    mutationFn: async (bidding: Bidding) => {
      // Fecha o ciclo de volta no edital Licitei que originou esta
      // licitação (se houver) ANTES de excluir — a FK de licitei_editais.
      // bidding_id já é "on delete set null", mas só ela não desfaz o
      // status 'aceito'. Sem isso, a aba Editais Licitei mostrava pra
      // sempre "Virou Licitação" com um link morto pra licitação excluída
      // (mesmo padrão já corrigido em deleteOpportunity).
      const { error: licitaiError } = await supabase
        .from('licitei_editais')
        .update({ status: 'linkado' })
        .eq('bidding_id', bidding.id)
      if (licitaiError) throw licitaiError

      const { error } = await supabase.from('biddings').delete().eq('id', bidding.id)
      if (error) throw error
      return bidding
    },
    onSuccess: (deleted) => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['licitei_editais'] })
      logEvent('Excluiu Licitação', `Removeu a licitação do órgão "${deleted.orgao}" referente ao objeto "${deleted.objeto}". Empenhos e lançamentos vinculados foram removidos automaticamente.`, { type: 'bidding', id: deleted.id })
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
        `${updated.isActive ? 'Reativou' : 'Inativou'} a licitação "${updated.objeto}"`,
        { type: 'bidding', id: updated.id }
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
        `Licitação "${updated.objeto}" (Órgão: ${updated.orgao})`,
        { type: 'bidding', id: updated.id }
      )
    },
  })

  // Atualiza só a etapa do funil — separada do updateBidding pra não
  // arriscar mexer nos itens da licitação (updateBidding sempre reescreve
  // bidding_items a partir do array `items` recebido).
  const updateEtapa = useMutation({
    // dataHomologacao é opcional — só vem preenchida quando o destino é
    // "Adjudicada e Homologada" e o Kanban pediu a data ao usuário antes de
    // chamar essa mutação (ver HomologacaoDialog em KanbanLicitacoesPage.tsx);
    // nos demais casos fica undefined e a coluna no banco nem é tocada.
    mutationFn: async ({ biddingId, etapa, dataHomologacao }: { biddingId: string; etapa: Bidding['etapa']; dataHomologacao?: string }) => {
      const updates: { etapa: Bidding['etapa']; data_homologacao?: string } = { etapa }
      if (dataHomologacao) updates.data_homologacao = dataHomologacao
      const { data, error } = await supabase
        .from('biddings')
        .update(updates)
        .eq('id', biddingId)
        .select()
        .single()
      if (error) throw error
      return tentarPreencherValorGanhoAutomatico(fromBiddingRow(data))
    },
    onSuccess: (updated) => {
      invalidate()
      logEvent('Atualizou Etapa da Licitação', `Licitação "${updated.objeto}" — nova etapa: ${updated.etapa}`, { type: 'bidding', id: updated.id })
    },
  })

  // Registra o resultado final da disputa — separada do updateBidding pra
  // não arriscar mexer nos itens da licitação. O motivo só faz sentido pro
  // status correspondente (motivoPerda com 'Perdeu', motivoDesistencia com
  // 'Desistiu', motivoCancelamento com 'Cancelada'); qualquer outro status
  // limpa os três campos, pra não deixar um motivo "fantasma" de uma edição
  // anterior.
  const marcarResultado = useMutation({
    mutationFn: async ({ biddingId, status, motivoPerda, motivoDesistencia, motivoCancelamento }: { biddingId: string; status: BiddingStatus; motivoPerda: string | null; motivoDesistencia?: string | null; motivoCancelamento?: string | null }) => {
      const { data, error } = await supabase
        .from('biddings')
        .update({
          status,
          motivo_perda: status === 'Perdeu' ? motivoPerda : null,
          motivo_desistencia: status === 'Desistiu' ? (motivoDesistencia ?? null) : null,
          motivo_cancelamento: status === 'Cancelada' ? (motivoCancelamento ?? null) : null,
        })
        .eq('id', biddingId)
        .select()
        .single()
      if (error) throw error
      return tentarPreencherValorGanhoAutomatico(fromBiddingRow(data))
    },
    onSuccess: (updated) => {
      invalidate()
      logEvent('Registrou Resultado da Licitação', `Licitação "${updated.objeto}" — resultado: ${updated.status}${updated.motivoPerda ? ` (${updated.motivoPerda})` : ''}${updated.motivoDesistencia ? ` (${updated.motivoDesistencia})` : ''}${updated.motivoCancelamento ? ` (${updated.motivoCancelamento})` : ''}`, { type: 'bidding', id: updated.id })
    },
  })

  const checkBiddingHasFinancialHistory = async (biddingId: string): Promise<boolean> => {
    // Se alguma consulta falhar (rede, RLS, timeout), assume que HÁ
    // histórico — é o lado seguro do erro: melhor mostrar o aviso forte de
    // exclusão à toa do que deixar passar batido uma licitação com
    // dinheiro já recebido ou empenho já faturado.
    const { count: txCount, error: txError } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('bidding_id', biddingId)
      .eq('status', 'Pago')
    if (txError) return true
    if ((txCount ?? 0) > 0) return true

    const { count: empCount, error: empError } = await supabase
      .from('empenhos')
      .select('id', { count: 'exact', head: true })
      .eq('bidding_id', biddingId)
      .eq('status', 'Faturado')
    if (empError) return true
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
    marcarResultado,
    checkBiddingHasFinancialHistory,
  }
}
