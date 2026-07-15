export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      attached_files: {
        Row: {
          category: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          mime_type: string | null
          name: string
          size_bytes: number | null
          storage_path: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          mime_type?: string | null
          name: string
          size_bytes?: number | null
          storage_path: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          mime_type?: string | null
          name?: string
          size_bytes?: number | null
          storage_path?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: string | null
          id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: string | null
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      bidding_items: {
        Row: {
          bidding_id: string
          created_at: string
          descricao: string
          id: string
          marca: string | null
          numero_item: string
          quantidade: number
          referencia: string | null
          unidade: string | null
          updated_at: string
          user_id: string
          valor_unitario_licitado: number
          valor_unitario_ofertado: number | null
        }
        Insert: {
          bidding_id: string
          created_at?: string
          descricao: string
          id?: string
          marca?: string | null
          numero_item: string
          quantidade?: number
          referencia?: string | null
          unidade?: string | null
          updated_at?: string
          user_id: string
          valor_unitario_licitado?: number
          valor_unitario_ofertado?: number | null
        }
        Update: {
          bidding_id?: string
          created_at?: string
          descricao?: string
          id?: string
          marca?: string | null
          numero_item?: string
          quantidade?: number
          referencia?: string | null
          unidade?: string | null
          updated_at?: string
          user_id?: string
          valor_unitario_licitado?: number
          valor_unitario_ofertado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bidding_items_bidding_id_fkey"
            columns: ["bidding_id"]
            isOneToOne: false
            referencedRelation: "biddings"
            referencedColumns: ["id"]
          },
        ]
      }
      biddings: {
        Row: {
          client_id: string
          created_at: string
          data_abertura: string
          data_cadastro: string
          dias_validade_proposta: string | null
          etapa: string | null
          id: string
          is_active: boolean
          modalidade: string
          municipio: string | null
          numero_edital: string | null
          objeto: string
          observacao_etapa: string | null
          orgao: string
          portal: string | null
          processo: string | null
          representante: string | null
          status: string
          taxa_exito: number | null
          taxa_participacao: number | null
          taxa_participacao_lancada: boolean
          tipo: string
          tipo_disputa: string
          uf: string | null
          updated_at: string
          user_id: string
          valor_licitado: number
          valor_ofertado: number | null
          valor_ofertado_real: number | null
        }
        Insert: {
          client_id: string
          created_at?: string
          data_abertura: string
          data_cadastro?: string
          dias_validade_proposta?: string | null
          etapa?: string | null
          id?: string
          is_active?: boolean
          modalidade: string
          municipio?: string | null
          numero_edital?: string | null
          objeto: string
          observacao_etapa?: string | null
          orgao: string
          portal?: string | null
          processo?: string | null
          representante?: string | null
          status?: string
          taxa_exito?: number | null
          taxa_participacao?: number | null
          taxa_participacao_lancada?: boolean
          tipo: string
          tipo_disputa?: string
          uf?: string | null
          updated_at?: string
          user_id: string
          valor_licitado?: number
          valor_ofertado?: number | null
          valor_ofertado_real?: number | null
        }
        Update: {
          client_id?: string
          created_at?: string
          data_abertura?: string
          data_cadastro?: string
          dias_validade_proposta?: string | null
          etapa?: string | null
          id?: string
          is_active?: boolean
          modalidade?: string
          municipio?: string | null
          numero_edital?: string | null
          objeto?: string
          observacao_etapa?: string | null
          orgao?: string
          portal?: string | null
          processo?: string | null
          representante?: string | null
          status?: string
          taxa_exito?: number | null
          taxa_participacao?: number | null
          taxa_participacao_lancada?: boolean
          tipo?: string
          tipo_disputa?: string
          uf?: string | null
          updated_at?: string
          user_id?: string
          valor_licitado?: number
          valor_ofertado?: number | null
          valor_ofertado_real?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "biddings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      busca_pncp_config: {
        Row: {
          ativo: boolean
          codigos_modalidade: number[] | null
          codigos_municipio_ibge: string[] | null
          created_at: string
          dias_retroativos: number
          esferas: string[] | null
          id: string
          nome: string
          palavras_chave: string[]
          poderes: string[] | null
          status: string
          tipo_busca: string
          ufs: string[] | null
          ultima_execucao: string | null
          user_id: string
        }
        Insert: {
          ativo?: boolean
          codigos_modalidade?: number[] | null
          codigos_municipio_ibge?: string[] | null
          created_at?: string
          dias_retroativos?: number
          esferas?: string[] | null
          id?: string
          nome: string
          palavras_chave?: string[]
          poderes?: string[] | null
          status?: string
          tipo_busca?: string
          ufs?: string[] | null
          ultima_execucao?: string | null
          user_id: string
        }
        Update: {
          ativo?: boolean
          codigos_modalidade?: number[] | null
          codigos_municipio_ibge?: string[] | null
          created_at?: string
          dias_retroativos?: number
          esferas?: string[] | null
          id?: string
          nome?: string
          palavras_chave?: string[]
          poderes?: string[] | null
          status?: string
          tipo_busca?: string
          ufs?: string[] | null
          ultima_execucao?: string | null
          user_id?: string
        }
        Relationships: []
      }
      captcha_sessions: {
        Row: {
          client_id: string
          created_at: string
          expira_em: string
          id: string
          imagem_base64: string
          resposta: string | null
          status: string
          tipo: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          expira_em: string
          id?: string
          imagem_base64: string
          resposta?: string | null
          status?: string
          tipo: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          expira_em?: string
          id?: string
          imagem_base64?: string
          resposta?: string | null
          status?: string
          tipo?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      client_documents: {
        Row: {
          auto_renovavel: boolean
          client_id: string
          created_at: string
          data_emissao: string | null
          data_validade: string | null
          id: string
          nome: string
          observacoes: string | null
          status: string
          storage_path: string | null
          tipo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_renovavel?: boolean
          client_id: string
          created_at?: string
          data_emissao?: string | null
          data_validade?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          status?: string
          storage_path?: string | null
          tipo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_renovavel?: boolean
          client_id?: string
          created_at?: string
          data_emissao?: string | null
          data_validade?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          status?: string
          storage_path?: string | null
          tipo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          bairro: string | null
          banco_agencia: string | null
          banco_conta: string | null
          banco_nome: string | null
          cep: string | null
          cidade: string | null
          cnpj: string | null
          created_at: string
          data_cadastro: string | null
          data_inicio_contrato: string | null
          data_inicio_pagamento: string | null
          dia_vencimento: number | null
          email: string | null
          id: string
          inscricao_estadual: string | null
          is_active: boolean
          is_mensalista: boolean
          name: string
          periodo_meses: number | null
          phone: string | null
          responsavel_cargo: string | null
          responsavel_cpf: string | null
          responsavel_nome: string | null
          updated_at: string
          user_id: string
          valor_mensalidade: number | null
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          bairro?: string | null
          banco_agencia?: string | null
          banco_conta?: string | null
          banco_nome?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          data_cadastro?: string | null
          data_inicio_contrato?: string | null
          data_inicio_pagamento?: string | null
          dia_vencimento?: number | null
          email?: string | null
          id?: string
          inscricao_estadual?: string | null
          is_active?: boolean
          is_mensalista?: boolean
          name: string
          periodo_meses?: number | null
          phone?: string | null
          responsavel_cargo?: string | null
          responsavel_cpf?: string | null
          responsavel_nome?: string | null
          updated_at?: string
          user_id: string
          valor_mensalidade?: number | null
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          bairro?: string | null
          banco_agencia?: string | null
          banco_conta?: string | null
          banco_nome?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          data_cadastro?: string | null
          data_inicio_contrato?: string | null
          data_inicio_pagamento?: string | null
          dia_vencimento?: number | null
          email?: string | null
          id?: string
          inscricao_estadual?: string | null
          is_active?: boolean
          is_mensalista?: boolean
          name?: string
          periodo_meses?: number | null
          phone?: string | null
          responsavel_cargo?: string | null
          responsavel_cpf?: string | null
          responsavel_nome?: string | null
          updated_at?: string
          user_id?: string
          valor_mensalidade?: number | null
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      contracts: {
        Row: {
          bidding_id: string | null
          clausula_adicional: string | null
          client_id: string
          comarca_foro: string | null
          comissao_exito: number | null
          conteudo_gerado: string
          created_at: string
          id: string
          retentor_fixo_mensal: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bidding_id?: string | null
          clausula_adicional?: string | null
          client_id: string
          comarca_foro?: string | null
          comissao_exito?: number | null
          conteudo_gerado: string
          created_at?: string
          id?: string
          retentor_fixo_mensal?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bidding_id?: string | null
          clausula_adicional?: string | null
          client_id?: string
          comarca_foro?: string | null
          comissao_exito?: number | null
          conteudo_gerado?: string
          created_at?: string
          id?: string
          retentor_fixo_mensal?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_bidding_id_fkey"
            columns: ["bidding_id"]
            isOneToOne: false
            referencedRelation: "biddings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      document_logs: {
        Row: {
          client_id: string
          created_at: string
          duracao_ms: number | null
          erro: string | null
          id: string
          status: string
          tentativa: number
          tipo: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          duracao_ms?: number | null
          erro?: string | null
          id?: string
          status: string
          tentativa?: number
          tipo: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          duracao_ms?: number | null
          erro?: string | null
          id?: string
          status?: string
          tentativa?: number
          tipo?: string
          user_id?: string
        }
        Relationships: []
      }
      document_types: {
        Row: {
          categoria: string
          codigo: string
          dias_alerta_vencimento: number
          nome: string
          ordem: number
          origem: string
          referencia_edital: string | null
          tem_validade: boolean
        }
        Insert: {
          categoria: string
          codigo: string
          dias_alerta_vencimento?: number
          nome: string
          ordem?: number
          origem: string
          referencia_edital?: string | null
          tem_validade?: boolean
        }
        Update: {
          categoria?: string
          codigo?: string
          dias_alerta_vencimento?: number
          nome?: string
          ordem?: number
          origem?: string
          referencia_edital?: string | null
          tem_validade?: boolean
        }
        Relationships: []
      }
      empenhos: {
        Row: {
          bidding_id: string | null
          client_id: string
          created_at: string
          data_empenho: string
          id: string
          is_active: boolean
          modo_parcelamento: string
          numero_empenho: string
          numero_nota_fiscal: string | null
          observacao: string | null
          percentual_comissao: number
          periodicidade: string | null
          projetar_doze_meses: boolean
          quantidade_parcelas: number | null
          recorrencia_ativa: boolean
          status: string
          updated_at: string
          user_id: string
          valor_comissao_total: number
          valor_empenhada: number
        }
        Insert: {
          bidding_id?: string | null
          client_id: string
          created_at?: string
          data_empenho: string
          id?: string
          is_active?: boolean
          modo_parcelamento?: string
          numero_empenho: string
          numero_nota_fiscal?: string | null
          observacao?: string | null
          percentual_comissao?: number
          periodicidade?: string | null
          projetar_doze_meses?: boolean
          quantidade_parcelas?: number | null
          recorrencia_ativa?: boolean
          status?: string
          updated_at?: string
          user_id: string
          valor_comissao_total?: number
          valor_empenhada?: number
        }
        Update: {
          bidding_id?: string | null
          client_id?: string
          created_at?: string
          data_empenho?: string
          id?: string
          is_active?: boolean
          modo_parcelamento?: string
          numero_empenho?: string
          numero_nota_fiscal?: string | null
          observacao?: string | null
          percentual_comissao?: number
          periodicidade?: string | null
          projetar_doze_meses?: boolean
          quantidade_parcelas?: number | null
          recorrencia_ativa?: boolean
          status?: string
          updated_at?: string
          user_id?: string
          valor_comissao_total?: number
          valor_empenhada?: number
        }
        Relationships: [
          {
            foreignKeyName: "empenhos_bidding_id_fkey"
            columns: ["bidding_id"]
            isOneToOne: false
            referencedRelation: "biddings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empenhos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          admission_date: string | null
          created_at: string
          email: string | null
          id: string
          inss_percentual: number | null
          irrf_percentual: number | null
          is_active: boolean
          name: string
          outros_encargos: number | null
          payment_type: string
          phone: string | null
          pix_key: string | null
          role: string | null
          salary_base: number
          updated_at: string
          user_id: string
        }
        Insert: {
          admission_date?: string | null
          created_at?: string
          email?: string | null
          id?: string
          inss_percentual?: number | null
          irrf_percentual?: number | null
          is_active?: boolean
          name: string
          outros_encargos?: number | null
          payment_type: string
          phone?: string | null
          pix_key?: string | null
          role?: string | null
          salary_base?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          admission_date?: string | null
          created_at?: string
          email?: string | null
          id?: string
          inss_percentual?: number | null
          irrf_percentual?: number | null
          is_active?: boolean
          name?: string
          outros_encargos?: number | null
          payment_type?: string
          phone?: string | null
          pix_key?: string | null
          role?: string | null
          salary_base?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      financial_accounts: {
        Row: {
          bank_name: string | null
          created_at: string
          credit_limit: number | null
          id: string
          name: string
          starting_balance: number
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bank_name?: string | null
          created_at?: string
          credit_limit?: number | null
          id?: string
          name: string
          starting_balance?: number
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bank_name?: string | null
          created_at?: string
          credit_limit?: number | null
          id?: string
          name?: string
          starting_balance?: number
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      licitacoes_pncp: {
        Row: {
          busca_config_id: string
          created_at: string
          data_encerramento_proposta: string | null
          data_publicacao_pncp: string | null
          encontrado_em: string
          id: string
          item_descricao: string | null
          link_sistema_origem: string | null
          modalidade_nome: string | null
          municipio_nome: string | null
          numero_controle_pncp: string
          objeto_compra: string | null
          orgao_cnpj: string | null
          orgao_nome: string | null
          palavra_chave_encontrada: string
          uf: string | null
          user_id: string
          valor_total_estimado: number | null
          valor_total_homologado: number | null
          visto: boolean
        }
        Insert: {
          busca_config_id: string
          created_at?: string
          data_encerramento_proposta?: string | null
          data_publicacao_pncp?: string | null
          encontrado_em: string
          id?: string
          item_descricao?: string | null
          link_sistema_origem?: string | null
          modalidade_nome?: string | null
          municipio_nome?: string | null
          numero_controle_pncp: string
          objeto_compra?: string | null
          orgao_cnpj?: string | null
          orgao_nome?: string | null
          palavra_chave_encontrada: string
          uf?: string | null
          user_id: string
          valor_total_estimado?: number | null
          valor_total_homologado?: number | null
          visto?: boolean
        }
        Update: {
          busca_config_id?: string
          created_at?: string
          data_encerramento_proposta?: string | null
          data_publicacao_pncp?: string | null
          encontrado_em?: string
          id?: string
          item_descricao?: string | null
          link_sistema_origem?: string | null
          modalidade_nome?: string | null
          municipio_nome?: string | null
          numero_controle_pncp?: string
          objeto_compra?: string | null
          orgao_cnpj?: string | null
          orgao_nome?: string | null
          palavra_chave_encontrada?: string
          uf?: string | null
          user_id?: string
          valor_total_estimado?: number | null
          valor_total_homologado?: number | null
          visto?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "licitacoes_pncp_busca_config_id_fkey"
            columns: ["busca_config_id"]
            isOneToOne: false
            referencedRelation: "busca_pncp_config"
            referencedColumns: ["id"]
          },
        ]
      }
      member_permissions: {
        Row: {
          atualizado_em: string
          id: string
          nivel_acesso: string
          team_member_id: string
          tool_key: string
        }
        Insert: {
          atualizado_em?: string
          id?: string
          nivel_acesso?: string
          team_member_id: string
          tool_key: string
        }
        Update: {
          atualizado_em?: string
          id?: string
          nivel_acesso?: string
          team_member_id?: string
          tool_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_permissions_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_permissions_tool_key_fkey"
            columns: ["tool_key"]
            isOneToOne: false
            referencedRelation: "system_tools"
            referencedColumns: ["key"]
          },
        ]
      }
      payment_methods: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      receipts: {
        Row: {
          city: string | null
          client_id: string | null
          created_at: string
          description: string | null
          id: string
          issue_date: string
          kind: string
          user_id: string
          value: number
        }
        Insert: {
          city?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          issue_date?: string
          kind: string
          user_id: string
          value?: number
        }
        Update: {
          city?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          issue_date?: string
          kind?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "receipts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          atualizado_em: string
          key: string
          value: string
        }
        Insert: {
          atualizado_em?: string
          key: string
          value: string
        }
        Update: {
          atualizado_em?: string
          key?: string
          value?: string
        }
        Relationships: []
      }
      system_tools: {
        Row: {
          created_at: string
          descricao: string | null
          key: string
          nome: string
          ordem: number
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          key: string
          nome: string
          ordem?: number
        }
        Update: {
          created_at?: string
          descricao?: string | null
          key?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      team_members: {
        Row: {
          convidado_em: string
          email: string | null
          id: string
          member_user_id: string
          nome: string | null
          owner_id: string
          status: string
        }
        Insert: {
          convidado_em?: string
          email?: string | null
          id?: string
          member_user_id: string
          nome?: string | null
          owner_id: string
          status?: string
        }
        Update: {
          convidado_em?: string
          email?: string | null
          id?: string
          member_user_id?: string
          nome?: string | null
          owner_id?: string
          status?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          account_id: string | null
          bidding_id: string | null
          category: string
          client_id: string | null
          created_at: string
          description: string
          due_date: string
          empenho_id: string | null
          id: string
          is_projected: boolean
          is_recurring: boolean
          payment_date: string | null
          payment_method: string | null
          projection_month_number: number | null
          projection_parent_id: string | null
          recurring_day: number | null
          recurring_parent_id: string | null
          status: string
          type: string
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          account_id?: string | null
          bidding_id?: string | null
          category: string
          client_id?: string | null
          created_at?: string
          description: string
          due_date: string
          empenho_id?: string | null
          id?: string
          is_projected?: boolean
          is_recurring?: boolean
          payment_date?: string | null
          payment_method?: string | null
          projection_month_number?: number | null
          projection_parent_id?: string | null
          recurring_day?: number | null
          recurring_parent_id?: string | null
          status?: string
          type: string
          updated_at?: string
          user_id: string
          value?: number
        }
        Update: {
          account_id?: string | null
          bidding_id?: string | null
          category?: string
          client_id?: string | null
          created_at?: string
          description?: string
          due_date?: string
          empenho_id?: string | null
          id?: string
          is_projected?: boolean
          is_recurring?: boolean
          payment_date?: string | null
          payment_method?: string | null
          projection_month_number?: number | null
          projection_parent_id?: string | null
          recurring_day?: number | null
          recurring_parent_id?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_bidding_id_fkey"
            columns: ["bidding_id"]
            isOneToOne: false
            referencedRelation: "biddings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_empenho_id_fkey"
            columns: ["empenho_id"]
            isOneToOne: false
            referencedRelation: "empenhos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_recurring_parent_id_fkey"
            columns: ["recurring_parent_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_empenho_bidding_cascade: { Args: never; Returns: boolean }
      check_employees_payment_type_constraint: { Args: never; Returns: boolean }
      checklist_documentos: {
        Args: { p_client_id: string }
        Returns: {
          categoria: string
          codigo: string
          data_emissao: string
          data_validade: string
          nome: string
          origem: string
          referencia_edital: string
          status_calculado: string
          storage_path: string
          tem_validade: boolean
        }[]
      }
      owner_efetivo: { Args: { usuario_id: string }; Returns: string }
      reagendar_backup_diario: {
        Args: { hora_brasilia: string }
        Returns: undefined
      }
      tem_acesso: {
        Args: { ferramenta: string; nivel_minimo: string; usuario_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
