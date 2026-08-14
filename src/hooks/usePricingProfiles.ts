import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromPricingProfileRow, fromPricingProfileLineRow, toPricingProfileInsert, toPricingProfileLineInsert } from '../lib/mappers'
import { useAuth } from './useAuth'
import type { PricingProfile, PricingProfileLine } from '../types/domain'
import type { Database } from '../types/database'

const QUERY_KEY = ['pricing_profiles']

// Perfis de Precificação reutilizáveis (ver PricingProfile em
// types/domain.ts) — cada perfil tem uma Margem e uma lista de linhas de
// Impostos/Despesas, aplicáveis em lote aos itens de qualquer licitação
// (ver a aba "Precificação" em LicitacaoPage.tsx). Mesma fórmula de markup
// divisor já usada na Calculadora de Formação de Preço, só que com o perfil
// salvo e reutilizável em vez de digitado toda vez.
export function usePricingProfiles() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pricing_profiles')
        .select('*, pricing_profile_lines(*)')
        .order('nome', { ascending: true })
      if (error) throw error
      type RowComLinhas = Database['public']['Tables']['pricing_profiles']['Row'] & {
        pricing_profile_lines: Database['public']['Tables']['pricing_profile_lines']['Row'][] | null
      }
      return ((data ?? []) as unknown as RowComLinhas[]).map((row) => {
        const linhas = (row.pricing_profile_lines ?? [])
          .map(fromPricingProfileLineRow)
          .sort((a, b) => a.ordem - b.ordem)
        return fromPricingProfileRow(row, linhas)
      })
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })

  // Salva perfil + linhas juntos: sempre substitui as linhas por completo
  // (apaga as antigas, insere as novas) — mais simples e seguro que tentar
  // diff/merge no editor, e a lista de impostos/despesas de um perfil
  // raramente passa de 5-6 linhas.
  const salvarPerfil = useMutation({
    mutationFn: async ({ perfil, linhas }: { perfil: Partial<PricingProfile>; linhas: Partial<PricingProfileLine>[] }) => {
      if (!user) throw new Error('Não autenticado')

      let profileId = perfil.id
      if (profileId) {
        const { error } = await supabase.from('pricing_profiles').update(toPricingProfileInsert(perfil, user.id)).eq('id', profileId)
        if (error) throw error
        const { error: delError } = await supabase.from('pricing_profile_lines').delete().eq('profile_id', profileId)
        if (delError) throw delError
      } else {
        const { data, error } = await supabase.from('pricing_profiles').insert(toPricingProfileInsert(perfil, user.id)).select().single()
        if (error) throw error
        profileId = data.id
      }

      if (linhas.length > 0) {
        const rows = linhas.map((l, idx) => toPricingProfileLineInsert({ ...l, ordem: idx }, profileId as string))
        const { error } = await supabase.from('pricing_profile_lines').insert(rows)
        if (error) throw error
      }
    },
    onSuccess: invalidate,
  })

  const deletePerfil = useMutation({
    mutationFn: async (perfil: PricingProfile) => {
      const { error } = await supabase.from('pricing_profiles').delete().eq('id', perfil.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    profiles: query.data ?? [],
    isLoading: query.isLoading,
    salvarPerfil,
    deletePerfil,
  }
}
