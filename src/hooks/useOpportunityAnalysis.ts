import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { erroEhTemporario } from '../lib/analiseEdital'
import type { Database } from '../types/database'

export type OpportunityAnalysisStatus = 'processando' | 'concluido' | 'erro' | string

export interface OpportunityAnalysisResult {
  id: string
  userId: string
  opportunityId: string
  status: OpportunityAnalysisStatus
  analise: Record<string, unknown> | null
  erroMensagem: string | null
  createdAt: string
  updatedAt: string
}

function fromRow(r: Database['public']['Tables']['opportunity_analysis']['Row']): OpportunityAnalysisResult {
  return {
    id: r.id,
    userId: r.user_id,
    opportunityId: r.opportunity_id,
    status: r.status,
    analise: (r.analise as Record<string, unknown> | null) ?? null,
    erroMensagem: r.erro_mensagem,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const QUERY_KEY = ['opportunity_analysis']

// Mesmo limite usado em useBiddingAnalysis: se a function travar antes de
// gravar o resultado, a linha fica presa em 'processando' pra sempre.
const LIMITE_PROCESSANDO_MS = 3 * 60 * 1000

// Quantas vezes tenta de novo SOZINHO (sem o usuário clicar) quando o erro
// é classificado como temporário (ver erroEhTemporario). Cada tentativa é
// uma invocação NOVA de Analisar-oportunidade, com um orçamento de tempo de
// execução zerado (ver AbortController em comLimiteDeTempo, no código da
// function) — dribla de graça o teto por invocação do plano atual do
// Supabase, sem precisar de nenhum plano pago.
const MAX_TENTATIVAS_AUTOMATICAS = 2
const INTERVALO_RETRY_AUTOMATICO_MS = 5000

// Mesmo padrão de useBiddingAnalysis, mas pro estágio de Oportunidade —
// permite rodar a mesma análise de IA (Analisar-oportunidade) antes mesmo
// da licitação existir de verdade. Ao converter a oportunidade, o
// resultado é copiado direto pra bidding_analysis (ver useOpportunities.ts)
// em vez de rodar a IA de novo.
export function useOpportunityAnalysis(opportunityId?: string) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const queryKey = [...QUERY_KEY, opportunityId]

  const query = useQuery({
    queryKey,
    enabled: !!user && !!opportunityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('opportunity_analysis')
        .select('*')
        .eq('opportunity_id', opportunityId!)
        .maybeSingle()
      if (error) throw error
      return data ? fromRow(data) : null
    },
    refetchInterval: (query) => {
      const data = query.state.data
      if (data?.status !== 'processando') return false
      const decorrido = Date.now() - new Date(data.updatedAt).getTime()
      return decorrido > LIMITE_PROCESSANDO_MS ? false : 3000
    },
    // Sem isso, o polling acima pausa sozinho assim que a aba perde o foco
    // (comportamento padrão do React Query) — como a análise de IA
    // costuma levar mais de 1 minuto, é comum o usuário trocar de aba
    // enquanto espera; ao voltar, refetchOnWindowFocus está desligado de
    // propósito (ver main.tsx), então o resultado só aparecia depois de
    // alguma ação não relacionada forçar um refetch — parecendo "travado"
    // mesmo quando a análise já tinha terminado havia tempo.
    refetchIntervalInBackground: true,
  })

  const analysis = query.data ?? null

  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    if (analysis?.status !== 'processando') return
    const id = setInterval(() => setAgora(Date.now()), 5000)
    return () => clearInterval(id)
  }, [analysis?.status])

  const travado = !!analysis
    && analysis.status === 'processando'
    && agora - new Date(analysis.updatedAt).getTime() > LIMITE_PROCESSANDO_MS

  const [tentativasAutomaticas, setTentativasAutomaticas] = useState(0)
  // Guarda qual erro (linha + horário) já disparou um retry automático,
  // pra não tentar de novo repetidamente enquanto o React Query re-renderiza
  // com o mesmo dado — sem isso o efeito abaixo dispararia a cada render.
  const ultimoErroRetentadoRef = useRef<string | null>(null)

  const analisar = useMutation({
    mutationFn: async () => {
      if (!opportunityId) throw new Error('Oportunidade não informada')
      const { error } = await supabase.functions.invoke('Analisar-oportunidade', { body: { opportunityId } })
      if (error) throw error
    },
    onMutate: () => {
      // Um clique MANUAL sempre reseta o contador — o usuário pode querer
      // tentar de novo depois que as tentativas automáticas já esgotaram.
      setTentativasAutomaticas(0)
      ultimoErroRetentadoRef.current = null
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  // Retry automático: se a análise terminar em erro CLASSIFICADO COMO
  // TEMPORÁRIO (sobrecarga do provedor de IA, timeout de execução — nunca
  // cota esgotada nem arquivo corrompido, ver erroEhTemporario), tenta de
  // novo sozinha até MAX_TENTATIVAS_AUTOMATICAS vezes antes de deixar o erro
  // visível pro usuário. Cada tentativa é uma invocação nova da Edge
  // Function, com orçamento de tempo próprio — ver comentário de
  // MAX_TENTATIVAS_AUTOMATICAS acima.
  useEffect(() => {
    if (!analysis || analysis.status !== 'erro') return
    if (!erroEhTemporario(analysis.erroMensagem)) return
    if (tentativasAutomaticas >= MAX_TENTATIVAS_AUTOMATICAS) return

    const chaveErro = `${analysis.id}:${analysis.updatedAt}`
    if (ultimoErroRetentadoRef.current === chaveErro) return
    ultimoErroRetentadoRef.current = chaveErro

    const timer = setTimeout(() => {
      setTentativasAutomaticas((n) => n + 1)
      analisar.mutate()
    }, INTERVALO_RETRY_AUTOMATICO_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis?.id, analysis?.status, analysis?.updatedAt, analysis?.erroMensagem, tentativasAutomaticas])

  // Enquanto uma tentativa automática está pendente (aguardando o intervalo
  // antes de disparar) ou já foi disparada e a análise voltou a
  // "processando", a tela mostra um aviso diferente do erro final — só faz
  // sentido exibir isso enquanto ainda houver tentativas automáticas em
  // curso.
  const tentandoNovamenteAutomaticamente = tentativasAutomaticas > 0
    && tentativasAutomaticas <= MAX_TENTATIVAS_AUTOMATICAS
    && (analysis?.status === 'processando' || analisar.isPending)

  // Apaga o resultado da análise guardado pra esta oportunidade — usado
  // quando o edital que gerou aquela análise é removido (ou trocado por
  // outro), mesma ideia de limparAnalise em useBiddingAnalysis.ts.
  const limparAnalise = useMutation({
    mutationFn: async () => {
      if (!opportunityId) throw new Error('Oportunidade não informada')
      const { error } = await supabase.from('opportunity_analysis').delete().eq('opportunity_id', opportunityId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  // Liga/desliga "participando" de um item — o edital às vezes traz itens
  // que a empresa não vai disputar (ver mapearItensDaAnalise, o único ponto
  // por onde essa flag é lida na hora de preencher bidding_items de
  // verdade). Mexe só no array de itens dentro do JSON, sem tocar em mais
  // nada da análise.
  const alternarItemParticipando = useMutation({
    mutationFn: async (index: number) => {
      if (!opportunityId) throw new Error('Oportunidade não informada')
      const atual = analysis?.analise as { itens?: { participando?: boolean }[] } | null | undefined
      if (!atual?.itens?.[index]) throw new Error('Item não encontrado na análise')
      const itens = atual.itens.map((it, i) => (i === index ? { ...it, participando: it.participando === false } : it))
      const { error } = await supabase.from('opportunity_analysis').update({ analise: { ...atual, itens } }).eq('opportunity_id', opportunityId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  // Marcar/desmarcar todos de uma vez — útil quando só um ou dois itens do
  // meio de uma lista grande são exceção (mais rápido que desmarcar um por
  // um a partir do padrão "todos participam").
  const definirTodosParticipando = useMutation({
    mutationFn: async (participando: boolean) => {
      if (!opportunityId) throw new Error('Oportunidade não informada')
      const atual = analysis?.analise as { itens?: { participando?: boolean }[] } | null | undefined
      if (!atual?.itens?.length) return
      const itens = atual.itens.map((it) => ({ ...it, participando }))
      const { error } = await supabase.from('opportunity_analysis').update({ analise: { ...atual, itens } }).eq('opportunity_id', opportunityId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  return {
    analysis,
    isLoading: query.isLoading,
    travado,
    analisar,
    limparAnalise,
    alternarItemParticipando,
    definirTodosParticipando,
    tentandoNovamenteAutomaticamente,
    tentativasAutomaticas,
  }
}
