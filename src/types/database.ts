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
      atestados_tecnicos: {
        Row: {
          client_id: string
          created_at: string
          data_emissao: string | null
          id: string
          nome: string
          objeto: string
          observacoes: string | null
          orgao_emissor: string | null
          storage_path: string | null
          updated_at: string
          user_id: string
          valor: number | null
        }
        Insert: {
          client_id: string
          created_at?: string
          data_emissao?: string | null
          id?: string
          nome: string
          objeto: string
          observacoes?: string | null
          orgao_emissor?: string | null
          storage_path?: string | null
          updated_at?: string
          user_id: string
          valor?: number | null
        }
        Update: {
          client_id?: string
          created_at?: string
          data_emissao?: string | null
          id?: string
          nome?: string
          objeto?: string
          observacoes?: string | null
          orgao_emissor?: string | null
          storage_path?: string | null
          updated_at?: string
          user_id?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "atestados_tecnicos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      bank_reconciliations: {
        Row: {
          account_id: string
          created_at: string
          data_saldo: string
          diferenca: number
          id: string
          lancamentos_encontrados: number
          nome_arquivo: string | null
          saldo_banco: number
          saldo_sistema: number
          total_lancamentos: number
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          data_saldo: string
          diferenca: number
          id?: string
          lancamentos_encontrados?: number
          nome_arquivo?: string | null
          saldo_banco: number
          saldo_sistema: number
          total_lancamentos?: number
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          data_saldo?: string
          diferenca?: number
          id?: string
          lancamentos_encontrados?: number
          nome_arquivo?: string | null
          saldo_banco?: number
          saldo_sistema?: number
          total_lancamentos?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_reconciliations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bidding_analysis: {
        Row: {
          analise: Json | null
          bidding_id: string
          created_at: string
          erro_mensagem: string | null
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analise?: Json | null
          bidding_id: string
          created_at?: string
          erro_mensagem?: string | null
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analise?: Json | null
          bidding_id?: string
          created_at?: string
          erro_mensagem?: string | null
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bidding_analysis_bidding_id_fkey"
            columns: ["bidding_id"]
            isOneToOne: false
            referencedRelation: "biddings"
            referencedColumns: ["id"]
          },
        ]
      }
      bidding_analysis_juridica: {
        Row: {
          bidding_id: string
          created_at: string
          erro_mensagem: string | null
          id: string
          resultado: Json | null
          status: string
          tipo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bidding_id: string
          created_at?: string
          erro_mensagem?: string | null
          id?: string
          resultado?: Json | null
          status?: string
          tipo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bidding_id?: string
          created_at?: string
          erro_mensagem?: string | null
          id?: string
          resultado?: Json | null
          status?: string
          tipo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bidding_analysis_juridica_bidding_id_fkey"
            columns: ["bidding_id"]
            isOneToOne: false
            referencedRelation: "biddings"
            referencedColumns: ["id"]
          },
        ]
      }
      bidding_checklist_items: {
        Row: {
          atendido: boolean
          atestado_id: string | null
          attached_file_id: string | null
          bidding_id: string
          categoria: string | null
          client_document_id: string | null
          client_document_tipo: string | null
          created_at: string
          descricao: string
          id: string
          numero_edital: string | null
          observacoes: string | null
          obrigatorio: boolean
          origem: string
          nao_aplicavel: boolean
          justificativa_nao_aplicavel: string | null
          prazo: string | null
          responsavel_nome: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          atendido?: boolean
          atestado_id?: string | null
          attached_file_id?: string | null
          bidding_id: string
          categoria?: string | null
          client_document_id?: string | null
          client_document_tipo?: string | null
          created_at?: string
          descricao: string
          id?: string
          numero_edital?: string | null
          observacoes?: string | null
          obrigatorio?: boolean
          origem?: string
          nao_aplicavel?: boolean
          justificativa_nao_aplicavel?: string | null
          prazo?: string | null
          responsavel_nome?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          atendido?: boolean
          atestado_id?: string | null
          attached_file_id?: string | null
          bidding_id?: string
          categoria?: string | null
          client_document_id?: string | null
          client_document_tipo?: string | null
          created_at?: string
          descricao?: string
          id?: string
          numero_edital?: string | null
          observacoes?: string | null
          obrigatorio?: boolean
          origem?: string
          nao_aplicavel?: boolean
          justificativa_nao_aplicavel?: string | null
          prazo?: string | null
          responsavel_nome?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bidding_checklist_items_bidding_id_fkey"
            columns: ["bidding_id"]
            isOneToOne: false
            referencedRelation: "biddings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bidding_checklist_items_attached_file_id_fkey"
            columns: ["attached_file_id"]
            isOneToOne: false
            referencedRelation: "attached_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bidding_checklist_items_client_document_id_fkey"
            columns: ["client_document_id"]
            isOneToOne: false
            referencedRelation: "client_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bidding_checklist_items_atestado_id_fkey"
            columns: ["atestado_id"]
            isOneToOne: false
            referencedRelation: "atestados_tecnicos"
            referencedColumns: ["id"]
          },
        ]
      }
      bidding_declaracao_anexos: {
        Row: {
          attached_file_id: string | null
          bidding_id: string
          created_at: string
          enviado_em: string | null
          fonte: string
          id: string
          status: string
          texto: string
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attached_file_id?: string | null
          bidding_id: string
          created_at?: string
          enviado_em?: string | null
          fonte: string
          id?: string
          status?: string
          texto: string
          titulo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attached_file_id?: string | null
          bidding_id?: string
          created_at?: string
          enviado_em?: string | null
          fonte?: string
          id?: string
          status?: string
          texto?: string
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bidding_declaracao_anexos_bidding_id_fkey"
            columns: ["bidding_id"]
            isOneToOne: false
            referencedRelation: "biddings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bidding_declaracao_anexos_attached_file_id_fkey"
            columns: ["attached_file_id"]
            isOneToOne: false
            referencedRelation: "attached_files"
            referencedColumns: ["id"]
          },
        ]
      }
      bidding_declaracao_anexo_itens: {
        Row: {
          anexo_id: string
          checklist_item_id: string
          created_at: string
          id: string
        }
        Insert: {
          anexo_id: string
          checklist_item_id: string
          created_at?: string
          id?: string
        }
        Update: {
          anexo_id?: string
          checklist_item_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bidding_declaracao_anexo_itens_anexo_id_fkey"
            columns: ["anexo_id"]
            isOneToOne: false
            referencedRelation: "bidding_declaracao_anexos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bidding_declaracao_anexo_itens_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "bidding_checklist_items"
            referencedColumns: ["id"]
          },
        ]
      }
      bidding_items: {
        Row: {
          bidding_id: string
          created_at: string
          custo_unitario: number | null
          descricao: string
          despesas_pct_aplicado: number | null
          ganhou: boolean
          id: string
          impostos_pct_aplicado: number | null
          lote: string | null
          marca: string | null
          margem_pct_aplicada: number | null
          numero_item: string
          participa_precificacao: boolean
          pricing_profile_id: string | null
          quantidade: number
          referencia: string | null
          unidade: string | null
          updated_at: string
          user_id: string
          valor_minimo_calculado: number | null
          valor_unitario_licitado: number
          valor_unitario_ofertado: number | null
        }
        Insert: {
          bidding_id: string
          created_at?: string
          custo_unitario?: number | null
          descricao: string
          despesas_pct_aplicado?: number | null
          ganhou?: boolean
          id?: string
          impostos_pct_aplicado?: number | null
          lote?: string | null
          marca?: string | null
          margem_pct_aplicada?: number | null
          numero_item: string
          participa_precificacao?: boolean
          pricing_profile_id?: string | null
          quantidade?: number
          referencia?: string | null
          unidade?: string | null
          updated_at?: string
          user_id: string
          valor_minimo_calculado?: number | null
          valor_unitario_licitado?: number
          valor_unitario_ofertado?: number | null
        }
        Update: {
          bidding_id?: string
          created_at?: string
          custo_unitario?: number | null
          descricao?: string
          despesas_pct_aplicado?: number | null
          ganhou?: boolean
          id?: string
          impostos_pct_aplicado?: number | null
          lote?: string | null
          marca?: string | null
          margem_pct_aplicada?: number | null
          numero_item?: string
          participa_precificacao?: boolean
          pricing_profile_id?: string | null
          quantidade?: number
          referencia?: string | null
          unidade?: string | null
          updated_at?: string
          user_id?: string
          valor_minimo_calculado?: number | null
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
          {
            foreignKeyName: "bidding_items_pricing_profile_id_fkey"
            columns: ["pricing_profile_id"]
            isOneToOne: false
            referencedRelation: "pricing_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bidding_items_versions: {
        Row: {
          alterado_por_email: string | null
          bidding_id: string
          created_at: string
          enviada: boolean
          id: string
          itens_snapshot: Json
          observacao: string | null
          user_id: string
          versao: number
        }
        Insert: {
          alterado_por_email?: string | null
          bidding_id: string
          created_at?: string
          enviada?: boolean
          id?: string
          itens_snapshot: Json
          observacao?: string | null
          user_id: string
          versao: number
        }
        Update: {
          alterado_por_email?: string | null
          bidding_id?: string
          created_at?: string
          enviada?: boolean
          id?: string
          itens_snapshot?: Json
          observacao?: string | null
          user_id?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "bidding_items_versions_bidding_id_fkey"
            columns: ["bidding_id"]
            isOneToOne: false
            referencedRelation: "biddings"
            referencedColumns: ["id"]
          },
        ]
      }
      biddings: {
        Row: {
          campos_preenchidos_por_ia: string[]
          client_id: string
          created_at: string
          data_abertura: string
          data_cadastro: string
          dias_validade_proposta: string | null
          proposta_readequada_enviada_em: string | null
          proposta_readequada_assinada_em: string | null
          proposta_texto_abertura: string | null
          proposta_texto_fechamento: string | null
          etapa: string | null
          id: string
          is_active: boolean
          modalidade: string
          modelo_customizado_path: string | null
          motivo_perda: string | null
          motivo_desistencia: string | null
          motivo_cancelamento: string | null
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
          valor_participacao: number | null
        }
        Insert: {
          campos_preenchidos_por_ia?: string[]
          client_id: string
          created_at?: string
          data_abertura: string
          data_cadastro?: string
          dias_validade_proposta?: string | null
          proposta_readequada_enviada_em?: string | null
          proposta_readequada_assinada_em?: string | null
          proposta_texto_abertura?: string | null
          proposta_texto_fechamento?: string | null
          etapa?: string | null
          id?: string
          is_active?: boolean
          modalidade: string
          modelo_customizado_path?: string | null
          motivo_perda?: string | null
          motivo_desistencia?: string | null
          motivo_cancelamento?: string | null
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
          valor_participacao?: number | null
        }
        Update: {
          campos_preenchidos_por_ia?: string[]
          client_id?: string
          created_at?: string
          data_abertura?: string
          data_cadastro?: string
          dias_validade_proposta?: string | null
          proposta_readequada_enviada_em?: string | null
          proposta_readequada_assinada_em?: string | null
          proposta_texto_abertura?: string | null
          proposta_texto_fechamento?: string | null
          etapa?: string | null
          id?: string
          is_active?: boolean
          modalidade?: string
          modelo_customizado_path?: string | null
          motivo_perda?: string | null
          motivo_desistencia?: string | null
          motivo_cancelamento?: string | null
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
          valor_participacao?: number | null
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
          pasta: string | null
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
          pasta?: string | null
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
          pasta?: string | null
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
          responsavel_rg: string | null
          estado_civil: string | null
          porte_empresa: string | null
          cabecalho_declaracao: string | null
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
          responsavel_rg?: string | null
          estado_civil?: string | null
          porte_empresa?: string | null
          cabecalho_declaracao?: string | null
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
          responsavel_rg?: string | null
          estado_civil?: string | null
          porte_empresa?: string | null
          cabecalho_declaracao?: string | null
          updated_at?: string
          user_id?: string
          valor_mensalidade?: number | null
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      client_prefeituras: {
        Row: {
          client_id: string
          created_at: string
          id: string
          portal_url: string | null
          prefeitura: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          portal_url?: string | null
          prefeitura: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          portal_url?: string | null
          prefeitura?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platforms: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          tipo_padrao: string
          updated_at: string
          url: string | null
          user_id: string
          valor_padrao: number | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          tipo_padrao?: string
          updated_at?: string
          url?: string | null
          user_id: string
          valor_padrao?: number | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          tipo_padrao?: string
          updated_at?: string
          url?: string | null
          user_id?: string
          valor_padrao?: number | null
        }
        Relationships: []
      }
      client_platforms: {
        Row: {
          ativo: boolean
          client_id: string
          created_at: string
          data_vencimento: string | null
          dias_aviso_vencimento: number
          id: string
          login: string | null
          observacoes: string | null
          platform_id: string
          senha: string | null
          tipo: string
          updated_at: string
          user_id: string
          valor_mensalidade: number | null
        }
        Insert: {
          ativo?: boolean
          client_id: string
          created_at?: string
          data_vencimento?: string | null
          dias_aviso_vencimento?: number
          id?: string
          login?: string | null
          observacoes?: string | null
          platform_id: string
          senha?: string | null
          tipo?: string
          updated_at?: string
          user_id: string
          valor_mensalidade?: number | null
        }
        Update: {
          ativo?: boolean
          client_id?: string
          created_at?: string
          data_vencimento?: string | null
          dias_aviso_vencimento?: number
          id?: string
          login?: string | null
          observacoes?: string | null
          platform_id?: string
          senha?: string | null
          tipo?: string
          updated_at?: string
          user_id?: string
          valor_mensalidade?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_platforms_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_platforms_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "platforms"
            referencedColumns: ["id"]
          },
        ]
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
      contract_marcos: {
        Row: {
          contract_id: string
          created_at: string
          data_prevista: string | null
          data_realizada: string | null
          descricao: string
          id: string
          observacoes: string | null
          status: string
          updated_at: string
          user_id: string
          valor: number | null
        }
        Insert: {
          contract_id: string
          created_at?: string
          data_prevista?: string | null
          data_realizada?: string | null
          descricao: string
          id?: string
          observacoes?: string | null
          status?: string
          updated_at?: string
          user_id: string
          valor?: number | null
        }
        Update: {
          contract_id?: string
          created_at?: string
          data_prevista?: string | null
          data_realizada?: string | null
          descricao?: string
          id?: string
          observacoes?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_marcos_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
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
      licitei_buscas: {
        Row: {
          ativo: boolean
          created_at: string
          filtros: Json
          id: string
          nome: string
          ultima_execucao_em: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          filtros?: Json
          id?: string
          nome: string
          ultima_execucao_em?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          filtros?: Json
          id?: string
          nome?: string
          ultima_execucao_em?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      licitei_editais: {
        Row: {
          bidding_id: string | null
          busca_id: string | null
          client_id: string | null
          created_at: string
          data_sessao: string | null
          edital_storage_path: string | null
          id: string
          link_licitei: string | null
          modalidade: string | null
          numero_edital: string | null
          objeto: string | null
          orgao: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bidding_id?: string | null
          busca_id?: string | null
          client_id?: string | null
          created_at?: string
          data_sessao?: string | null
          edital_storage_path?: string | null
          id?: string
          link_licitei?: string | null
          modalidade?: string | null
          numero_edital?: string | null
          objeto?: string | null
          orgao?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bidding_id?: string | null
          busca_id?: string | null
          client_id?: string | null
          created_at?: string
          data_sessao?: string | null
          edital_storage_path?: string | null
          id?: string
          link_licitei?: string | null
          modalidade?: string | null
          numero_edital?: string | null
          objeto?: string | null
          orgao?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "licitei_editais_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licitei_editais_busca_id_fkey"
            columns: ["busca_id"]
            isOneToOne: false
            referencedRelation: "licitei_buscas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licitei_editais_bidding_id_fkey"
            columns: ["bidding_id"]
            isOneToOne: false
            referencedRelation: "biddings"
            referencedColumns: ["id"]
          },
        ]
      }
      modelos_documentos: {
        Row: {
          categoria: string
          conteudo: string | null
          created_at: string
          id: string
          nome: string
          observacoes: string | null
          storage_path: string | null
          tags: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          categoria: string
          conteudo?: string | null
          created_at?: string
          id?: string
          nome: string
          observacoes?: string | null
          storage_path?: string | null
          tags?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          categoria?: string
          conteudo?: string | null
          created_at?: string
          id?: string
          nome?: string
          observacoes?: string | null
          storage_path?: string | null
          tags?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      opportunities: {
        Row: {
          bidding_id: string | null
          client_id: string | null
          created_at: string
          data_envio_cliente: string | null
          data_resposta: string | null
          data_sessao: string | null
          dias_aviso_prazo: number
          id: string
          licitei_edital_id: string | null
          motivo_recusa: string | null
          numero_edital: string | null
          observacoes: string | null
          platform_id: string | null
          resposta: string
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bidding_id?: string | null
          client_id?: string | null
          created_at?: string
          data_envio_cliente?: string | null
          data_resposta?: string | null
          data_sessao?: string | null
          dias_aviso_prazo?: number
          id?: string
          licitei_edital_id?: string | null
          motivo_recusa?: string | null
          numero_edital?: string | null
          observacoes?: string | null
          platform_id?: string | null
          resposta?: string
          titulo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bidding_id?: string | null
          client_id?: string | null
          created_at?: string
          data_envio_cliente?: string | null
          data_resposta?: string | null
          data_sessao?: string | null
          dias_aviso_prazo?: number
          id?: string
          licitei_edital_id?: string | null
          motivo_recusa?: string | null
          numero_edital?: string | null
          observacoes?: string | null
          platform_id?: string | null
          resposta?: string
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "platforms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_bidding_id_fkey"
            columns: ["bidding_id"]
            isOneToOne: false
            referencedRelation: "biddings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_licitei_edital_id_fkey"
            columns: ["licitei_edital_id"]
            isOneToOne: true
            referencedRelation: "licitei_editais"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_analysis: {
        Row: {
          analise: Json | null
          created_at: string
          erro_mensagem: string | null
          id: string
          opportunity_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analise?: Json | null
          created_at?: string
          erro_mensagem?: string | null
          id?: string
          opportunity_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analise?: Json | null
          created_at?: string
          erro_mensagem?: string | null
          id?: string
          opportunity_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_analysis_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_analysis_juridica: {
        Row: {
          created_at: string
          erro_mensagem: string | null
          id: string
          opportunity_id: string
          resultado: Json | null
          status: string
          tipo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          erro_mensagem?: string | null
          id?: string
          opportunity_id: string
          resultado?: Json | null
          status?: string
          tipo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          erro_mensagem?: string | null
          id?: string
          opportunity_id?: string
          resultado?: Json | null
          status?: string
          tipo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_analysis_juridica_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
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
      pricing_profiles: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          margem_pct: number
          nome: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          margem_pct?: number
          nome: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          margem_pct?: number
          nome?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pricing_profile_lines: {
        Row: {
          created_at: string
          id: string
          nome: string
          ordem: number
          percentual: number
          profile_id: string
          tipo: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          percentual?: number
          profile_id: string
          tipo: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          percentual?: number
          profile_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_profile_lines_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "pricing_profiles"
            referencedColumns: ["id"]
          },
        ]
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
      personal_events: {
        Row: {
          created_at: string
          data: string
          descricao: string | null
          id: string
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data: string
          descricao?: string | null
          id?: string
          titulo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: string
          descricao?: string | null
          id?: string
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
