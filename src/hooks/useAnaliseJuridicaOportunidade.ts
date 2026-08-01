import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import type { Database } from '../types/database'
import type { ResultadoAnaliseJuridica, TipoAnaliseJuridica } from './useAnaliseJuridicaEdital'

export interface AnaliseJuridicaOportunidade {
  id: string
  userId: string
  opportunityId: string
  tipo: TipoAnaliseJuridica
  status: string
  resultado: ResultadoAnaliseJuridica | null
  erroMensagem: string | null
  createdAt: string
  updatedAt: string
}

function fromRow(r: Database['public']['Tables']['opportunity_analysis_juridica']['Row']): AnaliseJuridicaOportunidade {
  return {
    id: r.id,
    userId: r.user_id,
    opportunityId: r.opportunity_id,
    tipo: r.tipo as TipoAnaliseJuridica,
    status: r.status,
    resultado: (r.resultado as ResultadoAnaliseJuridica | null) ?? null,
    erroMensagem: r.erro_mensagem,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const QUERY_KEY = ['opportunity_analysis_juridica']

// Mesmo limite usado em useAnaliseJuridicaEdital: se a function travar antes
// de gravar o resultado, a linha fica presa em 'processando' pra sempre.
const LIMITE_PROCESSANDO_MS = 3 * 60 * 1000

// Esclarecimentos / Impugnações / Raio-X do edital por IA, já na fase de
// Oportunidade — mesmo padrão de useAnaliseJuridicaEdital, só que lendo/
// gravando em opportunity_analysis_juridica (uma linha por opportunity_id +
// tipo) via a function Analisar-oportunidade-juridico.
export function useAnaliseJuridicaOportunidade(opportunityId: string | undefined, tipo: TipoAnaliseJuridica) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const queryKey = [...QUERY_KEY, opportunityId, tipo]

  const query = useQuery({
    queryKey,
    enabled: !!user && !!opportunityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('opportunity_analysis_juridica')
        .select('*')
        .eq('opportunity_id', opportunityId!)
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

  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    if (analysis?.status !== 'processando') return
    const id = setInterval(() => setAgora(Date.now()), 5000)
    return () => clearInterval(id)
  }, [analysis?.status])

  const travado = !!analysis
    && analysis.status === 'processando'
    && agora - new Date(analysis.updatedAt).getTime() > LIMITE_PROCESSANDO_MS

  const analisar = useMutation({
    mutationFn: async () => {
      if (!opportunityId) throw new Error('Oportunidade não informada')
      const { error } = await supabase.functions.invoke('Analisar-oportunidade-juridico', { body: { opportunityId, tipo } })
      if (error) throw error
    },
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

// Apaga as 3 análises jurídicas (Esclarecimentos/Impugnações/Raio-X) de uma
// oportunidade de uma vez — usado quando o edital que gerou essas análises
// é removido, mesma ideia de useLimparAnaliseJuridica.
export function useLimparAnaliseJuridicaOportunidade(opportunityId: string | undefined) {
  const queryClient = useQueryClient()

  const limpar = useMutation({
    mutationFn: async () => {
      if (!opportunityId) throw new Error('Oportunidade não informada')
      const { error } = await supabase.from('opportunity_analysis_juridica').delete().eq('opportunity_id', opportunityId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, opportunityId] })
    },
  })

  return { limpar }
}
