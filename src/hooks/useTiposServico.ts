import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromTipoServicoRow, toTipoServicoInsert } from '../lib/mappers'
import { useAuth } from './useAuth'
import type { TipoServico } from '../types/domain'

// Semeado com um único tipo de serviço, sem nenhuma retenção — consultoria/
// assessoria em licitações não entra nos incisos I a XXII do art. 3º da
// LC 116/2003 (fora da lista de retenção obrigatória de ISS) e não é
// cessão de mão de obra (sem retenção de INSS). Fica pronto pra quando um
// tipo de serviço diferente, com retenção, for cadastrado.
const SEED_TIPO_SERVICO = {
  nome: 'Consultoria/Assessoria em Licitações',
  retemIss: false,
  retemInss: false,
  retemIrPisCofinsCsll: false,
}

export function useTiposServico() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['tipos_servico'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('tipos_servico').select('*').order('nome')
      if (error) throw error

      if (data.length === 0 && user) {
        const { data: seeded, error: seedError } = await supabase
          .from('tipos_servico')
          .insert(toTipoServicoInsert(SEED_TIPO_SERVICO, user.id))
          .select()
        if (seedError) throw seedError
        return seeded.map(fromTipoServicoRow)
      }

      return data.map(fromTipoServicoRow)
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['tipos_servico'] })

  const addTipoServico = useMutation({
    mutationFn: async (t: Partial<TipoServico>) => {
      if (!user) throw new Error('Usuário não autenticado')
      const { error } = await supabase.from('tipos_servico').insert(toTipoServicoInsert(t, user.id))
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const updateTipoServico = useMutation({
    mutationFn: async (t: TipoServico) => {
      const { error } = await supabase.from('tipos_servico').update(toTipoServicoInsert(t, t.userId)).eq('id', t.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const tiposServico: TipoServico[] = query.data ?? []

  return {
    tiposServico,
    isLoading: query.isLoading,
    addTipoServico,
    updateTipoServico,
  }
}
