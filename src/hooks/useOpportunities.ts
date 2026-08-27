import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromOpportunityRow, toOpportunityInsert, toBiddingInsert, toBiddingItemInsert } from '../lib/mappers'
import { mapearCamposDaAnalise, mapearItensDaAnalise, somarValorLicitado } from '../lib/analiseEdital'
import { useAuth } from './useAuth'
import { useAuditLog } from './useAuditLog'
import { todayLocalISO } from '../lib/dateUtils'
import type { AnaliseEdital, Opportunity, OpportunityStatus } from '../types/domain'

const QUERY_KEY = ['opportunities']

// Mesma régua de calcDocStatus/calcPlatformStatus: a antecedência do aviso
// vem do próprio registro (dias_aviso_prazo), editável por oportunidade.
// 'resolvida' (aceita ou recusada) nunca alerta, mesmo perto da sessão —
// já não depende mais de resposta de ninguém.
export function calcOpportunityStatus(opp: Pick<Opportunity, 'resposta' | 'dataSessao' | 'diasAvisoPrazo'>): OpportunityStatus {
  if (opp.resposta !== 'pendente') return 'resolvida'
  if (!opp.dataSessao) return 'aguardando'
  const today = new Date(todayLocalISO() + 'T00:00:00')
  const sessao = new Date(opp.dataSessao + 'T00:00:00')
  const diffDays = Math.floor((sessao.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'vencida'
  if (diffDays <= opp.diasAvisoPrazo) return 'urgente'
  return 'aguardando'
}

export function diasParaSessao(dataSessao: string | null): number | null {
  if (!dataSessao) return null
  const today = new Date(todayLocalISO() + 'T00:00:00')
  const sessao = new Date(dataSessao + 'T00:00:00')
  return Math.floor((sessao.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

// Lista global (todos os clientes juntos) — o hábito de trabalho aqui é
// escanear tudo que está aguardando resposta de uma vez, não olhar cliente
// por cliente (diferente de Documentos/Plataformas, que pedem selecionar
// um cliente primeiro).
export function useOpportunities() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { logEvent } = useAuditLog()

  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('opportunities')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data.map(fromOpportunityRow)
    },
  })

  // Município vem da análise por IA (opportunity_analysis.analise.municipio),
  // não da própria oportunidade — busca à parte, leve (projeção JSON do
  // PostgREST: só extrai o texto de analise->>municipio, sem baixar o
  // JSONB inteiro — que pode ter itens, checklist e textos longos), pra
  // alimentar a listagem sem carregar a análise inteira de cada oportunidade.
  const municipiosQuery = useQuery({
    queryKey: [...QUERY_KEY, 'municipios'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('opportunity_analysis')
        .select('opportunity_id, municipio:analise->>municipio')
        .returns<{ opportunity_id: string; municipio: string | null }[]>()
      if (error) throw error
      const map: Record<string, string> = {}
      for (const row of data) {
        if (row.municipio) map[row.opportunity_id] = row.municipio
      }
      return map
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })

  const addOpportunity = useMutation({
    mutationFn: async (o: {
      clientId?: string | null
      platformId?: string | null
      titulo: string
      numeroEdital?: string | null
      dataSessao?: string | null
      dataEnvioCliente?: string | null
      diasAvisoPrazo?: number
      observacoes?: string | null
      licitaiEditalId?: string | null
    }) => {
      if (!user) throw new Error('Não autenticado')
      const { data, error } = await supabase
        .from('opportunities')
        .insert(toOpportunityInsert(o, user.id))
        .select('id')
        .single()
      if (error) throw error
      return data.id as string
    },
    onSuccess: invalidate,
  })

  const updateOpportunity = useMutation({
    mutationFn: async (o: Opportunity) => {
      if (!user) throw new Error('Não autenticado')
      const { error } = await supabase
        .from('opportunities')
        .update(toOpportunityInsert(o, user.id))
        .eq('id', o.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  // Só o registro da resposta — não mexe em nenhum outro campo, pra não
  // pisar em uma edição concorrente de outro campo do formulário.
  const marcarResposta = useMutation({
    mutationFn: async ({ opportunity, resposta, motivoRecusa }: {
      opportunity: Opportunity
      resposta: 'aceita' | 'recusada'
      motivoRecusa?: string | null
    }) => {
      const { error } = await supabase
        .from('opportunities')
        .update({
          resposta,
          data_resposta: todayLocalISO(),
          motivo_recusa: resposta === 'recusada' ? (motivoRecusa ?? null) : null,
        })
        .eq('id', opportunity.id)
      if (error) throw error

      // Reflete a recusa de volta no edital Licitei que originou esta
      // oportunidade (se houver) — "aceita" só é refletida lá na conversão
      // em licitação de verdade (ver converterEmLicitacao), já que só aí
      // existe um bidding_id pra gravar junto.
      if (resposta === 'recusada' && opportunity.licitaiEditalId) {
        const { error: licitaiError } = await supabase
          .from('licitei_editais')
          .update({ status: 'recusado' })
          .eq('id', opportunity.licitaiEditalId)
        if (licitaiError) throw licitaiError
      }
    },
    onSuccess: (_, { opportunity }) => {
      invalidate()
      if (opportunity.licitaiEditalId) queryClient.invalidateQueries({ queryKey: ['licitei_editais'] })
    },
  })

  const deleteOpportunity = useMutation({
    mutationFn: async (o: Opportunity) => {
      const { error } = await supabase.from('opportunities').delete().eq('id', o.id)
      if (error) throw error

      // Reflete a exclusão de volta no edital Licitei que originou esta
      // oportunidade (se houver) — mesmo padrão de marcarResposta
      // (recusar) e converterEmLicitacao (aceitar), que já sincronizam de
      // volta. Sem isso, o licitei_edital ficava travado pra sempre em
      // status 'oportunidade' (sem ação nenhuma disponível na aba Editais
      // Licitei) sempre que a Oportunidade vinculada fosse excluída em vez
      // de aceita/recusada. Volta pro estado de antes de enviar (edital já
      // baixado e com cliente linkado), não pra 'novo' — enviarParaOportunidades
      // exige clientId, então ele nunca foi perdido.
      if (o.licitaiEditalId) {
        const { error: licitaiError } = await supabase
          .from('licitei_editais')
          .update({ status: 'linkado' })
          .eq('id', o.licitaiEditalId)
        if (licitaiError) throw licitaiError
      }
    },
    onSuccess: (_, o) => {
      invalidate()
      if (o.licitaiEditalId) queryClient.invalidateQueries({ queryKey: ['licitei_editais'] })
    },
  })

  // O coração do "nasce quase pronta": cria a licitação de verdade a
  // partir da oportunidade aceita, reaproveitando a MESMA transformação já
  // usada em "Preencher Licitação com estes Dados" (mapearCamposDaAnalise /
  // mapearItensDaAnalise) — sem duplicar lógica. Se já existe uma análise
  // de IA rodada nesta oportunidade, ela é COPIADA pra bidding_analysis da
  // licitação nova (não roda a IA de novo). Os arquivos (edital/TR) só têm
  // a referência movida (entity_type/entity_id) — nunca reenviados.
  const converterEmLicitacao = useMutation({
    mutationFn: async (opportunity: Opportunity) => {
      if (!user) throw new Error('Não autenticado')
      // client_id é opcional na oportunidade (dá pra analisar um edital
      // antes de saber o cliente), mas a licitação de verdade sempre
      // pertence a um cliente — sem essa checagem, o erro só apareceria lá
      // na frente, como uma violação de not-null crua do Postgres.
      if (!opportunity.clientId) throw new Error('Selecione um cliente antes de converter em licitação.')
      const clientId = opportunity.clientId

      const { data: analiseRow } = await supabase
        .from('opportunity_analysis')
        .select('analise, status')
        .eq('opportunity_id', opportunity.id)
        .maybeSingle()
      const analise = (analiseRow?.status === 'concluido' ? analiseRow.analise : null) as AnaliseEdital | null

      const campos = analise ? mapearCamposDaAnalise(analise) : {}
      const itens = analise ? mapearItensDaAnalise(analise) : null
      // "Valor que Vamos Participar" começa igual à soma dos itens extraídos
      // pela IA (mesma regra do botão "Preencher Licitação com estes Dados"
      // em LicitacaoPage.tsx) — editável depois na tela da licitação.
      if (itens?.length) campos.valorParticipacao = somarValorLicitado(itens)

      const biddingPartial = {
        ...campos,
        clientId,
        objeto: campos.objeto ?? opportunity.titulo,
        orgao: campos.orgao ?? '',
        numeroEdital: campos.numeroEdital ?? opportunity.numeroEdital ?? null,
        dataAbertura: campos.dataAbertura ?? opportunity.dataSessao ?? todayLocalISO(),
        status: 'Em Andamento' as const,
        etapa: 'Análise de Edital' as const,
      }

      const { data: biddingRow, error: biddingError } = await supabase
        .from('biddings')
        .insert(toBiddingInsert(biddingPartial, user.id))
        .select('id')
        .single()
      if (biddingError) throw biddingError
      const novoBiddingId = biddingRow.id as string

      if (itens?.length) {
        const { error: itensError } = await supabase
          .from('bidding_items')
          .insert(itens.map((i) => toBiddingItemInsert({ ...i, biddingId: novoBiddingId }, user.id)))
        if (itensError) throw itensError
      }

      // Move a referência dos arquivos (edital/TR) — mesmo storage_path,
      // sem reenviar nada.
      const { error: arquivosError } = await supabase
        .from('attached_files')
        .update({ entity_type: 'licitacao', entity_id: novoBiddingId })
        .eq('entity_type', 'oportunidade')
        .eq('entity_id', opportunity.id)
      if (arquivosError) throw arquivosError

      if (analise) {
        const { error: analiseError } = await supabase
          .from('bidding_analysis')
          .insert({ user_id: user.id, bidding_id: novoBiddingId, status: 'concluido', analise: analiseRow!.analise })
        if (analiseError) throw analiseError
      }

      const { error: opportunityError } = await supabase
        .from('opportunities')
        .update({ bidding_id: novoBiddingId })
        .eq('id', opportunity.id)
      if (opportunityError) throw opportunityError

      // Fecha o ciclo do edital Licitei que originou esta oportunidade (se
      // houver): vira 'aceito' e grava o bidding_id de verdade — é assim
      // que a aba Editais Licitei sabe que este edital não é mais uma
      // oportunidade pendente, virou uma licitação de fato.
      if (opportunity.licitaiEditalId) {
        const { error: licitaiError } = await supabase
          .from('licitei_editais')
          .update({ status: 'aceito', bidding_id: novoBiddingId })
          .eq('id', opportunity.licitaiEditalId)
        if (licitaiError) throw licitaiError
      }

      return { biddingId: novoBiddingId, objeto: biddingPartial.objeto, orgao: biddingPartial.orgao, licitaiEditalId: opportunity.licitaiEditalId }
    },
    onSuccess: ({ objeto, orgao, licitaiEditalId }) => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['biddings'] })
      queryClient.invalidateQueries({ queryKey: ['bidding_items'] })
      queryClient.invalidateQueries({ queryKey: ['attached_files'] })
      if (licitaiEditalId) queryClient.invalidateQueries({ queryKey: ['licitei_editais'] })
      logEvent('Criou Licitação', `Convertida a partir de uma oportunidade — "${objeto}"${orgao ? ` (Órgão: ${orgao})` : ''}`)
    },
  })

  return {
    opportunities: query.data ?? [],
    municipioPorOportunidade: municipiosQuery.data ?? {},
    isLoading: query.isLoading,
    addOpportunity,
    updateOpportunity,
    marcarResposta,
    deleteOpportunity,
    converterEmLicitacao,
  }
}
