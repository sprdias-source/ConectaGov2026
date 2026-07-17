import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export interface CaptchaSessionPendente {
  id: string
  clientId: string
  tipo: string
  imagemBase64: string
  criadoEm: string
}

// Sessões de captcha criadas pelo robô (rodando no GitHub Actions) que
// esperam uma resposta do usuário pra continuar a automação. Usa polling
// simples (não Realtime) — o intervalo curto já dá uma sensação de "quase
// instantâneo" sem precisar montar assinatura de canal.
export function useCaptchaSessions() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['captcha_sessions_pendentes'],
    enabled: !!user,
    refetchInterval: 4000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('captcha_sessions')
        .select('*')
        .eq('status', 'aguardando')
        .gt('expira_em', new Date().toISOString())
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []).map((r) => ({
        id: r.id,
        clientId: r.client_id,
        tipo: r.tipo,
        imagemBase64: r.imagem_base64,
        criadoEm: r.created_at,
      })) as CaptchaSessionPendente[]
    },
  })

  const responder = useMutation({
    mutationFn: async ({ id, resposta }: { id: string; resposta: string }) => {
      const { error } = await supabase
        .from('captcha_sessions')
        .update({ resposta, status: 'respondida' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['captcha_sessions_pendentes'] }),
  })

  return {
    sessoesPendentes: query.data ?? [],
    responder,
  }
}
