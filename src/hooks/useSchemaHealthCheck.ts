import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export interface SchemaCheckResult {
  ok: boolean
  missingColumns: string[]
  checkedAt: string
}

// Tenta selecionar 1 linha de cada tabela/coluna crítica adicionada nas
// migrações 003+. Se a coluna não existir, o Supabase retorna um erro
// específico (código 42703 / mensagem "column does not exist") que
// conseguimos detectar e listar de forma legível para o usuário —
// transformando um problema "invisível" em um diagnóstico claro dentro
// do próprio app, sem precisar abrir o SQL Editor do Supabase.
export function useSchemaHealthCheck() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['schema_health_check'],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SchemaCheckResult> => {
      const missing: string[] = []

      const checks: { table: string; columns: string; label: string }[] = [
        { table: 'biddings', columns: 'taxa_participacao,taxa_participacao_lancada,data_cadastro,valor_ofertado_real,tipo_disputa', label: 'Licitações (taxa de participação, itens)' },
        { table: 'empenhos', columns: 'modo_parcelamento,quantidade_parcelas,periodicidade,recorrencia_ativa', label: 'Empenhos (parcelamento e recorrência)' },
        { table: 'transactions', columns: 'is_recurring,recurring_parent_id,recurring_day', label: 'Transações (lançamentos recorrentes)' },
        { table: 'employees', columns: 'inss_percentual,irrf_percentual,outros_encargos', label: 'Funcionários (pró-labore e encargos)' },
        { table: 'clients', columns: 'cep', label: 'Clientes (CEP)' },
        { table: 'bidding_items', columns: 'id', label: 'Itens de Licitação (tabela)' },
      ]

      for (const check of checks) {
        const { error } = await supabase.from(check.table).select(check.columns).limit(1)
        if (error) {
          missing.push(check.label)
        }
      }

      return { ok: missing.length === 0, missingColumns: missing, checkedAt: new Date().toISOString() }
    },
  })
}
