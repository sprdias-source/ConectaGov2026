import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromRegimeTributarioRow } from '../lib/mappers'
import { useAuth } from './useAuth'
import type { RegimeTributarioHistorico, RegimeTributario, AnexoSimples } from '../types/domain'

// Histórico real da CONECTAGOV: MEI desde a abertura do CNPJ (30/09/2022) até
// a véspera da transformação em Sociedade Limitada, e Simples Nacional
// Anexo III a partir da data em que o registro na Junta Comercial passou a
// ter efeito (10/02/2026 — não a data em que foi protocolado/registrado,
// que veio depois). Semeado só na primeira carga, igual a categorias — se o
// usuário já tiver algum registro (editou manualmente), nunca sobrescreve.
const SEED_HISTORICO: Omit<RegimeTributarioHistorico, 'id' | 'userId' | 'createdAt'>[] = [
  {
    regime: 'mei',
    anexoSimples: null,
    vigenciaInicio: '2022-09-30',
    vigenciaFim: '2026-02-09',
    observacao: 'Empresário Individual (MEI) — antes da transformação em Sociedade Limitada.',
  },
  {
    regime: 'simples_nacional',
    anexoSimples: 'III',
    vigenciaInicio: '2026-02-10',
    vigenciaFim: null,
    observacao: 'Transformação em Sociedade Limitada (CONECTAGOV REPRESENTAÇÕES LTDA) — data de início dos efeitos do registro na Junta Comercial.',
  },
]

export function useRegimeTributario() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['regime_tributario_historico'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('regime_tributario_historico')
        .select('*')
        .order('vigencia_inicio')
      if (error) throw error

      if (data.length === 0 && user) {
        const seed = SEED_HISTORICO.map((h) => ({
          user_id: user.id,
          regime: h.regime,
          anexo_simples: h.anexoSimples,
          vigencia_inicio: h.vigenciaInicio,
          vigencia_fim: h.vigenciaFim,
          observacao: h.observacao,
        }))
        const { data: seeded, error: seedError } = await supabase.from('regime_tributario_historico').insert(seed).select()
        if (seedError) throw seedError
        return seeded.map(fromRegimeTributarioRow)
      }

      return data.map(fromRegimeTributarioRow)
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['regime_tributario_historico'] })

  // Registrar uma troca de regime nunca sobrescreve o vigente — fecha a
  // vigência anterior (vigencia_fim = um dia antes da nova) e abre a nova.
  const registrarTroca = useMutation({
    mutationFn: async ({ regime, anexoSimples, vigenciaInicio, observacao }: {
      regime: RegimeTributario; anexoSimples: AnexoSimples | null; vigenciaInicio: string; observacao?: string
    }) => {
      if (!user) throw new Error('Usuário não autenticado')

      const vigente = historico.find((h) => h.vigenciaFim === null)
      if (vigente) {
        const diaAnterior = new Date(vigenciaInicio + 'T12:00:00')
        diaAnterior.setDate(diaAnterior.getDate() - 1)
        const vigenciaFim = diaAnterior.toISOString().slice(0, 10)
        const { error: fechaError } = await supabase
          .from('regime_tributario_historico')
          .update({ vigencia_fim: vigenciaFim })
          .eq('id', vigente.id)
        if (fechaError) throw fechaError
      }

      const { error } = await supabase.from('regime_tributario_historico').insert({
        user_id: user.id,
        regime,
        anexo_simples: anexoSimples,
        vigencia_inicio: vigenciaInicio,
        vigencia_fim: null,
        observacao: observacao ?? null,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const historico: RegimeTributarioHistorico[] = query.data ?? []
  const vigente = historico.find((h) => h.vigenciaFim === null) ?? null

  return {
    historico,
    vigente,
    isLoading: query.isLoading,
    registrarTroca,
  }
}
