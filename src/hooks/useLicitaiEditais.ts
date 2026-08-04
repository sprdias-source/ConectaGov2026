import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromLicitaiEditalRow, toLicitaiEditalInsert, toFileInsert } from '../lib/mappers'
import { useAuth } from './useAuth'
import { useAuditLog } from './useAuditLog'
import type { Json } from '../types/database'
import type { AnaliseEdital, LicitaiEdital } from '../types/domain'

const QUERY_KEY = ['licitei_editais']
const NOME_PLATAFORMA_LICITEI = 'Licitei'

// Editais Licitei — o robô de busca (Playwright + GitHub Actions, ainda não
// implementado) vai gravar as linhas iniciais aqui direto via Supabase REST.
// Enquanto isso não existe, addLicitaiEdital permite cadastrar manualmente
// pra já poder usar o resto do fluxo (linkar cliente → enviar pra
// Oportunidades → aceitar/recusar).
export function useLicitaiEditais() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { logEvent } = useAuditLog()

  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('licitei_editais')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data.map(fromLicitaiEditalRow)
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })

  const addLicitaiEdital = useMutation({
    mutationFn: async (e: {
      numeroEdital?: string | null
      orgao?: string | null
      objeto?: string | null
      modalidade?: string | null
      dataSessao?: string | null
      linkLicitei?: string | null
    }) => {
      if (!user) throw new Error('Não autenticado')
      const { error } = await supabase.from('licitei_editais').insert(toLicitaiEditalInsert(e, user.id))
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const linkarCliente = useMutation({
    mutationFn: async ({ edital, clientId }: { edital: LicitaiEdital; clientId: string }) => {
      const { error } = await supabase
        .from('licitei_editais')
        .update({ client_id: clientId, status: 'linkado' })
        .eq('id', edital.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteLicitaiEdital = useMutation({
    mutationFn: async (edital: LicitaiEdital) => {
      const { error } = await supabase.from('licitei_editais').delete().eq('id', edital.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  // O coração da ponte com Oportunidades: cria a oportunidade já com o
  // objeto/órgão/modalidade/nº do edital que o Licitei trouxe (sem precisar
  // rodar a IA de novo pra redescobrir o que já se sabia) e referencia o
  // PDF que o robô já baixou — sem reenviar o arquivo, só apontando
  // attached_files pro mesmo storage_path. Reaproveita a plataforma
  // "Licitei" do catálogo (cria se ainda não existir), mesma ideia de
  // usePlatforms.
  const enviarParaOportunidades = useMutation({
    mutationFn: async (edital: LicitaiEdital) => {
      if (!user) throw new Error('Não autenticado')
      if (!edital.clientId) throw new Error('Vincule um cliente antes de enviar pra Oportunidades')
      if (!edital.editalStoragePath) throw new Error('Aguarde o edital ser baixado antes de enviar pra Oportunidades')

      const { data: plataforma } = await supabase
        .from('platforms')
        .select('id')
        .eq('user_id', user.id)
        .ilike('nome', NOME_PLATAFORMA_LICITEI)
        .maybeSingle()
      let platformId = plataforma?.id as string | undefined
      if (!platformId) {
        const { data: novaPlataforma, error: platformError } = await supabase
          .from('platforms')
          .insert({ user_id: user.id, nome: NOME_PLATAFORMA_LICITEI, tipo_padrao: 'paga' })
          .select('id')
          .single()
        if (platformError) throw platformError
        platformId = novaPlataforma.id as string
      }

      const { data: opportunityRow, error: opportunityError } = await supabase
        .from('opportunities')
        .insert({
          user_id: user.id,
          client_id: edital.clientId,
          platform_id: platformId,
          titulo: edital.objeto ?? '',
          numero_edital: edital.numeroEdital,
          data_sessao: edital.dataSessao,
          licitei_edital_id: edital.id,
        })
        .select('id')
        .single()
      if (opportunityError) throw opportunityError
      const opportunityId = opportunityRow.id as string

      // "Análise" sintética a partir dos dados já trazidos pelo Licitei —
      // o mesmo formato usado pela IA (AnaliseEdital), só que sem rodar
      // nenhum modelo: já sabemos objeto/órgão/modalidade, então
      // "Converter em Licitação" (useOpportunities.ts) já nasce prenchida
      // sem trabalho extra, e o usuário ainda pode rodar "Analisar
      // novamente" depois pra completar o resto (itens, habilitação etc.).
      const analiseSintetica: AnaliseEdital = {
        objeto: edital.objeto ?? undefined,
        orgao: edital.orgao ?? undefined,
        modalidade: edital.modalidade ?? undefined,
        numeroEdital: edital.numeroEdital ?? undefined,
        data: edital.dataSessao ?? undefined,
      }
      const { error: analysisError } = await supabase
        .from('opportunity_analysis')
        .insert({ user_id: user.id, opportunity_id: opportunityId, status: 'concluido', analise: analiseSintetica as unknown as Json })
      if (analysisError) throw analysisError

      const nomeArquivo = edital.numeroEdital ? `Edital ${edital.numeroEdital}.pdf` : 'Edital.pdf'
      const { error: fileError } = await supabase.from('attached_files').insert(
        toFileInsert({
          name: nomeArquivo,
          mimeType: 'application/pdf',
          storagePath: edital.editalStoragePath,
          category: 'Edital',
          entityType: 'oportunidade',
          entityId: opportunityId,
        }, user.id)
      )
      if (fileError) throw fileError

      const { error: statusError } = await supabase
        .from('licitei_editais')
        .update({ status: 'oportunidade' })
        .eq('id', edital.id)
      if (statusError) throw statusError

      return { opportunityId }
    },
    onSuccess: (_, edital) => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['opportunities'] })
      queryClient.invalidateQueries({ queryKey: ['platforms'] })
      queryClient.invalidateQueries({ queryKey: ['attached_files'] })
      logEvent('Enviou Edital Licitei pra Oportunidades', edital.objeto ?? edital.numeroEdital ?? edital.id)
    },
  })

  return {
    licitaiEditais: query.data ?? [],
    isLoading: query.isLoading,
    addLicitaiEdital,
    linkarCliente,
    deleteLicitaiEdital,
    enviarParaOportunidades,
  }
}
