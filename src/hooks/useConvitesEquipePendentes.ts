import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export interface ConvitePendente {
  id: string
  nome: string | null
  convidadoEm: string
}

// Convites de equipe onde o e-mail já pertence a um usuário existente
// nascem com status = 'pendente' (ver convidar-membro/index.ts) — só viram
// 'ativo' (e só aí passam a mudar owner_efetivo/acesso do usuário) depois
// que a própria pessoa convidada aceita explicitamente por aqui.
export function useConvitesEquipePendentes() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['convites_equipe_pendentes'],
    enabled: !!user,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_members')
        .select('id, nome, convidado_em')
        .eq('member_user_id', user!.id)
        .eq('status', 'pendente')
        .order('convidado_em', { ascending: true })
      if (error) throw error
      return (data ?? []).map((r) => ({
        id: r.id,
        nome: r.nome,
        convidadoEm: r.convidado_em,
      })) as ConvitePendente[]
    },
  })

  const responder = useMutation({
    mutationFn: async ({ teamMemberId, aceitar }: { teamMemberId: string; aceitar: boolean }) => {
      const { data, error } = await supabase.functions.invoke('responder-convite', {
        body: { teamMemberId, aceitar },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['convites_equipe_pendentes'] }),
  })

  return {
    convitesPendentes: query.data ?? [],
    responder,
  }
}
