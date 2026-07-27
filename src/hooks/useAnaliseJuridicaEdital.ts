import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import type { Database } from '../types/database'

export type TipoAnaliseJuridica = 'esclarecimento' | 'impugnacao' | 'raio_x'

export interface PontoAnaliseJuridica {
  tipoPonto?: 'Esclarecimento' | 'Impugnação' | null
  localizacao: string
  textoOriginal: string
  motivo: string
  fundamentoLegal?: string | null
  jurisprudencia?: string | null
  risco?: string | null
  probabilidade?: 'Baixo' | 'Médio' | 'Alto' | null
  prioridade?: 'Alta' | 'Média' | 'Baixa' | null
  sugestao: string
}

export interface ResultadoAnaliseJuridica {
  resumoGeral?: string | null
  pontos?: PontoAnaliseJuridica[]
}

export type AnaliseJuridicaStatus = 'processando' | 'concluido' | 'erro' | string

export interface AnaliseJuridicaEdital {
  id: string
  userId: string
  biddingId: string
  tipo: TipoAnaliseJuridica
  status: AnaliseJuridicaStatus
  resultado: ResultadoAnaliseJuridica | null
  erroMensagem: string | null
  createdAt: string
  updatedAt: string
}

function fromRow(r: Database['public']['Tables']['bidding_analysis_juridica']['Row']): AnaliseJuridicaEdital {
  return {
    id: r.id,
    userId: r.user_id,
    biddingId: r.bidding_id,
    tipo: r.tipo as TipoAnaliseJuridica,
    status: r.status,
    resultado: (r.resultado as ResultadoAnaliseJuridica | null) ?? null,
    erroMensagem: r.erro_mensagem,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const QUERY_KEY = ['bidding_analysis_juridica']

// Mesmo limite usado em useBiddingAnalysis: se a function travar antes de
// gravar o resultado, a linha fica presa em 'processando' pra sempre — depois
// desse tempo tratamos como falho em vez de continuar reconsultando à toa.
const LIMITE_PROCESSANDO_MS = 3 * 60 * 1000

// Esclarecimentos / Impugnações / Raio-X do edital por IA — mesmo padrão do
// useBiddingAnalysis, mas com uma linha por (bidding_id, tipo) na tabela
// bidding_analysis_juridica, já que os 3 tipos de análise coexistem pra uma
// mesma licitação.
export function useAnaliseJuridicaEdital(biddingId: string | undefined, tipo: TipoAnaliseJuridica) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const queryKey = [...QUERY_KEY, biddingId, tipo]

  const query = useQuery({
    queryKey,
    enabled: !!user && !!biddingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bidding_analysis_juridica')
        .select('*')
        .eq('bidding_id', biddingId!)
        .eq('tipo', tipo)
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
  })

  const analysis = query.data ?? null
  const travado = !!analysis
    && analysis.status === 'processando'
    && Date.now() - new Date(analysis.updatedAt).getTime() > LIMITE_PROCESSANDO_MS

  const analisar = useMutation({
    mutationFn: async () => {
      if (!biddingId) throw new Error('Licitação não informada')
      const { error } = await supabase.functions.invoke('Analisar-edital-juridico', { body: { biddingId, tipo } })
      if (error) throw error
    },
    // onSettled (não só onSuccess): mesmo quando a function retorna um
    // status de erro, ela já gravou status='erro' + a mensagem real do
    // Gemini na linha antes de responder — sem reconsultar aqui, a tela só
    // mostra o erro genérico do client ("Edge Function returned a non-2xx
    // status code") em vez do motivo de verdade.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  return {
    analysis,
    isLoading: query.isLoading,
    travado,
    analisar,
  }
}
