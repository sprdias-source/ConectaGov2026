import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

// Chave usada na tabela `system_settings` (key/value) pra guardar a
// configuração padrão de classificação tributária do serviço prestado.
// Fica num JSON dentro do `value` porque são vários campos relacionados
// que sempre mudam juntos (se um dia o tipo de serviço mudar, todos os
// códigos mudam de uma vez).
const SETTINGS_KEY = 'nfse_config_padrao'

export interface NfseConfigPadrao {
  itemServico: string
  codTributacaoNacional: string
  codTributacaoMunicipal: string
  exigibilidadeIss: string
  descricaoPadrao: string
}

// Valores padrão pré-preenchidos a partir de uma nota já emitida pelo
// usuário (assessoria/consultoria em licitações) — editável na tela de
// configuração se o tipo de serviço mudar no futuro.
export const DEFAULT_NFSE_CONFIG: NfseConfigPadrao = {
  itemServico: '17.01 - Assessoria ou consultoria de qualquer natureza, não contida em outros itens',
  codTributacaoNacional: '17.01.01 - Assessoria ou consultoria de qualquer natureza, não contida em outros itens',
  codTributacaoMunicipal: '7020400 - Atividades de consultoria em gestão empresarial',
  exigibilidadeIss: 'Exigível',
  descricaoPadrao: 'Serviços de organização, conferência, cadastramento de documentos e representação em licitação, incluindo participação em pregões eletrônicos.',
}

export function useNfseConfig() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['nfse_config'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .eq('key', SETTINGS_KEY)
        .maybeSingle()
      if (error) throw error
      if (!data) return DEFAULT_NFSE_CONFIG
      try {
        return { ...DEFAULT_NFSE_CONFIG, ...JSON.parse(data.value) } as NfseConfigPadrao
      } catch {
        return DEFAULT_NFSE_CONFIG
      }
    },
  })

  const saveConfig = useMutation({
    mutationFn: async (config: NfseConfigPadrao) => {
      const { error } = await supabase
        .from('system_settings')
        .upsert({ key: SETTINGS_KEY, value: JSON.stringify(config) }, { onConflict: 'key' })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['nfse_config'] }),
  })

  return {
    config: query.data ?? DEFAULT_NFSE_CONFIG,
    isLoading: query.isLoading,
    saveConfig,
  }
}
