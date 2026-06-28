// Tipos espelhando exatamente as colunas do banco (snake_case), usados pelo
// client do Supabase para tipar queries. Os hooks (src/hooks) convertem
// esse formato para o formato de domínio em camelCase (src/types/domain.ts).

export interface Database {
  public: {
    Views: Record<string, never>
    Functions: Record<string, never>
    Tables: {
      clients: {
        Row: {
          id: string
          user_id: string
          name: string
          cnpj: string | null
          address: string | null
          cep: string | null
          phone: string | null
          whatsapp: string | null
          email: string | null
          website: string | null
          is_mensalista: boolean
          valor_mensalidade: number | null
          periodo_meses: number | null
          dia_vencimento: number | null
          data_inicio_contrato: string | null
          data_cadastro: string | null
          data_inicio_pagamento: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['clients']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
        }
        Update: Partial<Database['public']['Tables']['clients']['Insert']>
        Relationships: []
      }
      biddings: {
        Row: {
          id: string
          user_id: string
          client_id: string
          modalidade: string
          tipo: string
          objeto: string
          orgao: string
          valor_licitado: number
          valor_ofertado: number | null
          status: string
          data_abertura: string
          data_cadastro: string
          valor_ofertado_real: number | null
          tipo_disputa: string
          taxa_participacao: number | null
          taxa_participacao_lancada: boolean
          numero_edital: string | null
          processo: string | null
          portal: string | null
          etapa: string | null
          taxa_exito: number | null
          representante: string | null
          observacao_etapa: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['biddings']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
        }
        Update: Partial<Database['public']['Tables']['biddings']['Insert']>
        Relationships: []
      }
      bidding_items: {
        Row: {
          id: string
          user_id: string
          bidding_id: string
          numero_item: string
          descricao: string
          unidade: string | null
          quantidade: number
          valor_unitario_licitado: number
          valor_unitario_ofertado: number | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['bidding_items']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
        }
        Update: Partial<Database['public']['Tables']['bidding_items']['Insert']>
        Relationships: []
      }
      financial_accounts: {
        Row: {
          id: string
          user_id: string
          name: string
          type: string
          bank_name: string | null
          starting_balance: number
          credit_limit: number | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['financial_accounts']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
        }
        Update: Partial<Database['public']['Tables']['financial_accounts']['Insert']>
        Relationships: []
      }
      categories: {
        Row: {
          id: string
          user_id: string
          type: string
          name: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['categories']['Row'], 'id' | 'created_at'> & {
          id?: string
        }
        Update: Partial<Database['public']['Tables']['categories']['Insert']>
        Relationships: []
      }
      empenhos: {
        Row: {
          id: string
          user_id: string
          numero_empenho: string
          numero_nota_fiscal: string | null
          client_id: string
          bidding_id: string | null
          data_empenho: string
          valor_empenhada: number
          percentual_comissao: number
          valor_comissao_total: number
          projetar_doze_meses: boolean
          modo_parcelamento: string
          quantidade_parcelas: number | null
          periodicidade: string | null
          recorrencia_ativa: boolean
          status: string
          observacao: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['empenhos']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
        }
        Update: Partial<Database['public']['Tables']['empenhos']['Insert']>
        Relationships: []
      }
      transactions: {
        Row: {
          id: string
          user_id: string
          type: string
          category: string
          description: string
          client_id: string | null
          bidding_id: string | null
          empenho_id: string | null
          account_id: string | null
          value: number
          due_date: string
          payment_date: string | null
          payment_method: string | null
          status: string
          is_projected: boolean
          projection_parent_id: string | null
          projection_month_number: number | null
          is_recurring: boolean
          recurring_parent_id: string | null
          recurring_day: number | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['transactions']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
        }
        Update: Partial<Database['public']['Tables']['transactions']['Insert']>
        Relationships: []
      }
      employees: {
        Row: {
          id: string
          user_id: string
          name: string
          role: string | null
          payment_type: string
          salary_base: number
          pix_key: string | null
          email: string | null
          phone: string | null
          admission_date: string | null
          is_active: boolean
          inss_percentual: number
          irrf_percentual: number
          outros_encargos: number
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['employees']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
        }
        Update: Partial<Database['public']['Tables']['employees']['Insert']>
        Relationships: []
      }
      contracts: {
        Row: {
          id: string
          user_id: string
          client_id: string
          bidding_id: string | null
          retentor_fixo_mensal: number | null
          comissao_exito: number | null
          comarca_foro: string | null
          clausula_adicional: string | null
          conteudo_gerado: string
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['contracts']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
        }
        Update: Partial<Database['public']['Tables']['contracts']['Insert']>
        Relationships: []
      }
      receipts: {
        Row: {
          id: string
          user_id: string
          client_id: string | null
          kind: string
          value: number
          city: string | null
          issue_date: string
          description: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['receipts']['Row'], 'id' | 'created_at'> & {
          id?: string
        }
        Update: Partial<Database['public']['Tables']['receipts']['Insert']>
        Relationships: []
      }
      attached_files: {
        Row: {
          id: string
          user_id: string
          name: string
          size_bytes: number | null
          mime_type: string | null
          storage_path: string
          category: string
          entity_type: string | null
          entity_id: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['attached_files']['Row'], 'id' | 'created_at'> & {
          id?: string
        }
        Update: Partial<Database['public']['Tables']['attached_files']['Insert']>
        Relationships: []
      }
      audit_logs: {
        Row: {
          id: string
          user_id: string
          action: string
          details: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['audit_logs']['Row'], 'id' | 'created_at'> & {
          id?: string
        }
        Update: never
        Relationships: []
      }
    }
  }
}
