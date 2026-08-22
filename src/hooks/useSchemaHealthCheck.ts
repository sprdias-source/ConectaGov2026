import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import type { Database } from '../types/database'

export interface SchemaCheckResult {
  ok: boolean
  missingColumns: string[]
  checkedAt: string
}

// Nome de tabela precisa bater com um dos nomes reais gerados pelo Supabase
// (não aceita mais "string" solto depois que os tipos foram regenerados).
type TableName = keyof Database['public']['Tables']

// Tenta selecionar 1 linha de cada tabela/coluna crítica adicionada ao longo
// do projeto. Se a coluna/tabela não existir, o Supabase retorna um erro
// específico (código 42703/42P01) que conseguimos detectar e listar de
// forma legível para o usuário — transformando um problema "invisível" em
// um diagnóstico claro dentro do próprio app, sem precisar abrir o SQL
// Editor do Supabase.
export function useSchemaHealthCheck() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['schema_health_check'],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SchemaCheckResult> => {
      const missing: string[] = []
      const checks: { table: TableName; columns: string; label: string }[] = [
        // --- Checagens originais (migrations 003-009) ---
        { table: 'biddings', columns: 'taxa_participacao,taxa_participacao_lancada,data_cadastro,valor_ofertado_real,tipo_disputa,is_active', label: 'Licitações (taxa de participação, itens, inativação)' },
        { table: 'empenhos', columns: 'modo_parcelamento,quantidade_parcelas,periodicidade,is_active', label: 'Empenhos (parcelamento e inativação)' },
        { table: 'transactions', columns: 'is_recurring,recurring_parent_id,recurring_day', label: 'Transações (lançamentos recorrentes)' },
        { table: 'employees', columns: 'inss_percentual,irrf_percentual,outros_encargos', label: 'Funcionários (pró-labore e encargos)' },
        { table: 'clients', columns: 'cep,is_active', label: 'Clientes (CEP e inativação)' },
        { table: 'bidding_items', columns: 'id', label: 'Itens de Licitação (tabela)' },
        { table: 'payment_methods', columns: 'id', label: 'Formas de Pagamento (tabela)' },
        // --- Checagens novas: documentos/certidões (migrations 019-021, 027) ---
        { table: 'client_documents', columns: 'tipo,storage_path,auto_renovavel,observacoes', label: 'Documentos de Habilitação (certidões e campo de observações)' },
        { table: 'captcha_sessions', columns: 'id', label: 'Captcha Manual (tabela)' },
        { table: 'document_types', columns: 'codigo', label: 'Checklist de Documentos — catálogo (tabela)' },
        { table: 'document_logs', columns: 'id', label: 'Log de Documentos (tabela)' },
        // --- Checagens novas: sistema multiusuário (migrations 013, 022-023, 025-026) ---
        { table: 'system_tools', columns: 'key,nome', label: 'Multiusuário — catálogo de ferramentas (tabela)' },
        { table: 'team_members', columns: 'owner_id,member_user_id,status', label: 'Multiusuário — membros da equipe (tabela)' },
        { table: 'member_permissions', columns: 'team_member_id,tool_key,nivel_acesso', label: 'Multiusuário — permissões por ferramenta (tabela)' },
        // --- Checagem nova: log de auditoria (migration 012) ---
        { table: 'audit_logs', columns: 'action,details', label: 'Log de Auditoria (tabela)' },
        // --- Checagens novas: perícia técnica (achadas fora de qualquer
        // migration rastreada, capturadas nas migrations 033-034) ---
        { table: 'biddings', columns: 'municipio,uf,dias_validade_proposta,modelo_customizado_path,motivo_perda', label: 'Licitações (município/UF/validade da proposta/modelo próprio/motivo da perda)' },
        { table: 'bidding_analysis', columns: 'id', label: 'Análise de Edital por IA (tabela)' },
        { table: 'bidding_analysis_juridica', columns: 'id', label: 'Análise Jurídica de Edital por IA (tabela)' },
        { table: 'bidding_checklist_items', columns: 'id,client_document_tipo', label: 'Checklist de Habilitação (tabela)' },
        { table: 'bidding_items_versions', columns: 'id,enviada', label: 'Versões de Itens da Proposta (tabela)' },
        { table: 'atestados_tecnicos', columns: 'id', label: 'Atestados Técnicos (tabela)' },
        { table: 'contract_marcos', columns: 'id', label: 'Marcos de Execução de Contrato (tabela)' },
        { table: 'client_prefeituras', columns: 'id', label: 'Prefeituras por Cliente (tabela)' },
        { table: 'bank_reconciliations', columns: 'id', label: 'Conciliação Bancária (tabela)' },
        { table: 'personal_events', columns: 'id', label: 'Eventos Pessoais da Agenda (tabela)' },
        { table: 'modelos_documentos', columns: 'id', label: 'Banco de Modelos de Documentos (tabela)' },
        { table: 'system_settings', columns: 'key,value', label: 'Configurações do Sistema — ex: NFS-e (tabela)' },
      ]
      for (const check of checks) {
        const { error } = await supabase.from(check.table).select(check.columns).limit(1)
        if (error) {
          missing.push(check.label)
        }
      }
      // Verificação extra: constraint de payment_type (não detectável só
      // checando se a coluna existe — a coluna sempre existiu, o que
      // mudou foi a LISTA DE VALORES aceitos por ela).
      try {
        const { data: constraintOk, error: rpcError } = await supabase.rpc('check_employees_payment_type_constraint')
        if (rpcError || constraintOk === false) {
          missing.push('Funcionários (tipo de vínculo "Sócio/Pró-labore" ainda bloqueado pelo banco)')
        }
      } catch {
        missing.push('Funcionários (tipo de vínculo "Sócio/Pró-labore" ainda bloqueado pelo banco)')
      }
      // Verificação extra: cascata empenho -> licitação (migração 008)
      try {
        const { data: cascadeOk, error: rpcError } = await supabase.rpc('check_empenho_bidding_cascade')
        if (rpcError || cascadeOk === false) {
          missing.push('Empenhos (exclusão de licitação não remove empenhos vinculados corretamente)')
        }
      } catch {
        missing.push('Empenhos (exclusão de licitação não remove empenhos vinculados corretamente)')
      }
      // Verificação extra: funções auxiliares do multiusuário (migration 013)
      try {
        const { error: rpcError } = await supabase.rpc('owner_efetivo', { usuario_id: user!.id })
        if (rpcError) missing.push('Multiusuário — função owner_efetivo() ausente')
      } catch {
        missing.push('Multiusuário — função owner_efetivo() ausente')
      }
      // Verificação extra: as 3 ferramentas da migration 030 (usuarios,
      // funcionarios, modelos) — a tabela system_tools já existe há muito
      // tempo, então o check acima de "tabela existe" não pega isso; aqui
      // conferimos se as LINHAS específicas dessas 3 ferramentas foram
      // inseridas, senão a Matriz de Permissões fica sem essas colunas.
      try {
        const { data: ferramentasNovas, error: toolsError } = await supabase
          .from('system_tools')
          .select('key')
          .in('key', ['usuarios', 'funcionarios', 'modelos'])
        if (toolsError) {
          missing.push('Multiusuário — não foi possível conferir as ferramentas Usuários/Funcionários/Modelos')
        } else {
          const encontradas = new Set((ferramentasNovas ?? []).map((f) => f.key))
          const faltando = ['usuarios', 'funcionarios', 'modelos'].filter((k) => !encontradas.has(k))
          if (faltando.length > 0) {
            missing.push(`Multiusuário — ferramentas ausentes em system_tools: ${faltando.join(', ')} (rode a migration 030)`)
          }
        }
      } catch {
        missing.push('Multiusuário — não foi possível conferir as ferramentas Usuários/Funcionários/Modelos')
      }
      return { ok: missing.length === 0, missingColumns: missing, checkedAt: new Date().toISOString() }
    },
  })
}
