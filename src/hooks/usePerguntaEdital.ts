import { useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// Pergunta livre sobre o edital já enviado — reenvia o PDF pro Gemini
// (edge functions Perguntar-edital / Perguntar-oportunidade, espelhando o
// par Analisar-edital/Analisar-oportunidade) e devolve uma resposta em
// texto, sem o schema estruturado da análise completa. Nada é persistido
// no banco — o histórico de perguntas/respostas vive só no estado local do
// componente enquanto a aba estiver aberta.
export function usePerguntaEdital(biddingId?: string) {
  const perguntarMutation = useMutation({
    mutationFn: async (pergunta: string) => {
      if (!biddingId) throw new Error('Licitação não informada')
      const { data, error } = await supabase.functions.invoke('Perguntar-edital', { body: { biddingId, pergunta } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data.resposta as string
    },
  })

  return { perguntar: (pergunta: string) => perguntarMutation.mutateAsync(pergunta), isPending: perguntarMutation.isPending }
}

export function usePerguntaOportunidade(opportunityId?: string) {
  const perguntarMutation = useMutation({
    mutationFn: async (pergunta: string) => {
      if (!opportunityId) throw new Error('Oportunidade não informada')
      const { data, error } = await supabase.functions.invoke('Perguntar-oportunidade', { body: { opportunityId, pergunta } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data.resposta as string
    },
  })

  return { perguntar: (pergunta: string) => perguntarMutation.mutateAsync(pergunta), isPending: perguntarMutation.isPending }
}
