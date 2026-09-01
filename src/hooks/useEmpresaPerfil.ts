import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromEmpresaPerfilRow } from '../lib/mappers'
import { useAuth } from './useAuth'
import type { EmpresaPerfil } from '../types/domain'

// Sem seed — cada conta preenche os próprios dados uma vez (razão social,
// CNPJ, endereço), usados só no cabeçalho do DRE/Balanço profissional.
export function useEmpresaPerfil() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['empresa_perfil'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('empresa_perfil').select('*').maybeSingle()
      if (error) throw error
      return data ? fromEmpresaPerfilRow(data) : null
    },
  })

  const salvarPerfil = useMutation({
    mutationFn: async (dados: { razaoSocial: string; cnpj: string; endereco: string; capitalSocial: number }) => {
      if (!user) throw new Error('Usuário não autenticado')
      const { error } = await supabase.from('empresa_perfil').upsert(
        { user_id: user.id, razao_social: dados.razaoSocial, cnpj: dados.cnpj, endereco: dados.endereco, capital_social: dados.capitalSocial },
        { onConflict: 'user_id' }
      )
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['empresa_perfil'] }),
  })

  const perfil: EmpresaPerfil | null = query.data ?? null

  return { perfil, isLoading: query.isLoading, salvarPerfil }
}
