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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      account_categories: {
        Row: {
          display_order: number
          id: string
          key: string
          name_en: string | null
          name_nb: string
          parent_key: string | null
        }
        Insert: {
          display_order?: number
          id?: string
          key: string
          name_en?: string | null
          name_nb: string
          parent_key?: string | null
        }
        Update: {
          display_order?: number
          id?: string
          key?: string
          name_en?: string | null
          name_nb?: string
          parent_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_categories_parent_key_fkey"
            columns: ["parent_key"]
            isOneToOne: false
            referencedRelation: "account_categories"
            referencedColumns: ["key"]
          },
        ]
      }
      account_mappings: {
        Row: {
          category_key: string
          company_id: string
          confidence: number
          created_at: string
          gl_account_id: string
          id: string
          is_user_override: boolean
          source: string
          updated_at: string
        }
        Insert: {
          category_key: string
          company_id: string
          confidence?: number
          created_at?: string
          gl_account_id: string
          id?: string
          is_user_override?: boolean
          source?: string
          updated_at?: string
        }
        Update: {
          category_key?: string
          company_id?: string
          confidence?: number
          created_at?: string
          gl_account_id?: string
          id?: string
          is_user_override?: boolean
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_mappings_category_key_fkey"
            columns: ["category_key"]
            isOneToOne: false
            referencedRelation: "account_categories"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "account_mappings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_mappings_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      account_transactions: {
        Row: {
          account_number: string
          amount: number
          company_id: string
          created_at: string
          currency: string
          currency_amount: number | null
          customer_id: string | null
          department_id: string | null
          description: string | null
          gl_account_id: string | null
          id: string
          product_id: string | null
          project_id: string | null
          source_id: string | null
          source_system: string | null
          supplier_id: string | null
          transaction_date: string
          vat_amount: number | null
          vat_code: string | null
          voucher_id: string | null
        }
        Insert: {
          account_number: string
          amount: number
          company_id: string
          created_at?: string
          currency?: string
          currency_amount?: number | null
          customer_id?: string | null
          department_id?: string | null
          description?: string | null
          gl_account_id?: string | null
          id?: string
          product_id?: string | null
          project_id?: string | null
          source_id?: string | null
          source_system?: string | null
          supplier_id?: string | null
          transaction_date: string
          vat_amount?: number | null
          vat_code?: string | null
          voucher_id?: string | null
        }
        Update: {
          account_number?: string
          amount?: number
          company_id?: string
          created_at?: string
          currency?: string
          currency_amount?: number | null
          customer_id?: string | null
          department_id?: string | null
          description?: string | null
          gl_account_id?: string | null
          id?: string
          product_id?: string | null
          project_id?: string | null
          source_id?: string | null
          source_system?: string | null
          supplier_id?: string | null
          transaction_date?: string
          vat_amount?: number | null
          vat_code?: string | null
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_transactions_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_transactions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_transactions_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_rules: {
        Row: {
          category: string
          content_nb: string
          content_version: number | null
          created_at: string
          description: string | null
          effective_from: string
          effective_to: string | null
          id: string
          jurisdiction: string
          last_reviewed_at: string | null
          metadata: Json
          parameters: Json | null
          rule_id: string
          rule_key: string | null
          rule_type: string | null
          source: string | null
          title: string | null
          title_nb: string
          updated_at: string | null
        }
        Insert: {
          category: string
          content_nb: string
          content_version?: number | null
          created_at?: string
          description?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          jurisdiction?: string
          last_reviewed_at?: string | null
          metadata?: Json
          parameters?: Json | null
          rule_id: string
          rule_key?: string | null
          rule_type?: string | null
          source?: string | null
          title?: string | null
          title_nb: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          content_nb?: string
          content_version?: number | null
          created_at?: string
          description?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          jurisdiction?: string
          last_reviewed_at?: string | null
          metadata?: Json
          parameters?: Json | null
          rule_id?: string
          rule_key?: string | null
          rule_type?: string | null
          source?: string | null
          title?: string | null
          title_nb?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      assistant_conversations: {
        Row: {
          company_id: string
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_evidence: {
        Row: {
          calculation_version: string | null
          comparison_period_end: string | null
          comparison_period_start: string | null
          evidence_data: Json
          id: string
          invoice_ids: string[] | null
          message_id: string
          metric_id: string | null
          source_period_end: string | null
          source_period_start: string | null
          transaction_ids: string[] | null
        }
        Insert: {
          calculation_version?: string | null
          comparison_period_end?: string | null
          comparison_period_start?: string | null
          evidence_data?: Json
          id?: string
          invoice_ids?: string[] | null
          message_id: string
          metric_id?: string | null
          source_period_end?: string | null
          source_period_start?: string | null
          transaction_ids?: string[] | null
        }
        Update: {
          calculation_version?: string | null
          comparison_period_end?: string | null
          comparison_period_start?: string | null
          evidence_data?: Json
          id?: string
          invoice_ids?: string[] | null
          message_id?: string
          metric_id?: string | null
          source_period_end?: string | null
          source_period_start?: string | null
          transaction_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "assistant_evidence_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "assistant_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["assistant_message_role"]
          structured_response: Json | null
          tool_calls: Json | null
          tool_results: Json | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["assistant_message_role"]
          structured_response?: Json | null
          tool_calls?: Json | null
          tool_results?: Json | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["assistant_message_role"]
          structured_response?: Json | null
          tool_calls?: Json | null
          tool_results?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "assistant_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "assistant_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_assumptions: {
        Row: {
          budget_id: string
          created_at: string
          effective_from: string | null
          effective_to: string | null
          id: string
          metadata: Json
          name: string
          type: string
          value: number | null
        }
        Insert: {
          budget_id: string
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          metadata?: Json
          name: string
          type: string
          value?: number | null
        }
        Update: {
          budget_id?: string
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          metadata?: Json
          name?: string
          type?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_assumptions_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_lines: {
        Row: {
          account_number: string | null
          amount: number
          budget_id: string
          category_key: string
          comment: string | null
          id: string
          month: number
        }
        Insert: {
          account_number?: string | null
          amount?: number
          budget_id: string
          category_key: string
          comment?: string | null
          id?: string
          month: number
        }
        Update: {
          account_number?: string | null
          amount?: number
          budget_id?: string
          category_key?: string
          comment?: string | null
          id?: string
          month?: number
        }
        Relationships: [
          {
            foreignKeyName: "budget_lines_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          approved_at: string | null
          based_on: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          scenario: string
          status: string
          updated_at: string
          version: number
          year: number
        }
        Insert: {
          approved_at?: string | null
          based_on?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          scenario?: string
          status?: string
          updated_at?: string
          version?: number
          year: number
        }
        Update: {
          approved_at?: string | null
          based_on?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          scenario?: string
          status?: string
          updated_at?: string
          version?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "budgets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          employer_tax_zone: string | null
          id: string
          industry: string | null
          min_liquidity_buffer: number | null
          name: string
          normal_payroll_date: number | null
          org_number: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          employer_tax_zone?: string | null
          id?: string
          industry?: string | null
          min_liquidity_buffer?: number | null
          name: string
          normal_payroll_date?: number | null
          org_number?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          employer_tax_zone?: string | null
          id?: string
          industry?: string | null
          min_liquidity_buffer?: number | null
          name?: string
          normal_payroll_date?: number | null
          org_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      customer_ledger_entries: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          currency: string
          customer_id: string | null
          description: string | null
          due_date: string | null
          entry_date: string
          entry_type: string | null
          id: string
          invoice_number: string | null
          is_open: boolean
          match_status: string | null
          remaining_amount: number | null
          source_id: string | null
          source_system: string | null
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          currency?: string
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          entry_date: string
          entry_type?: string | null
          id?: string
          invoice_number?: string | null
          is_open?: boolean
          match_status?: string | null
          remaining_amount?: number | null
          source_id?: string | null
          source_system?: string | null
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          currency?: string
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          entry_date?: string
          entry_type?: string | null
          id?: string
          invoice_number?: string | null
          is_open?: boolean
          match_status?: string | null
          remaining_amount?: number | null
          source_id?: string | null
          source_system?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_ledger_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_ledger_entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_payment_profiles: {
        Row: {
          avg_actual_payment_days: number | null
          avg_agreed_terms_days: number | null
          avg_days_after_due: number | null
          calculated_at: string
          company_id: string
          current_outstanding: number
          current_overdue: number
          customer_id: string
          id: string
          last_payment_date: string | null
          late_payment_ratio: number | null
          max_delay_days: number | null
          payment_risk_score: number | null
          payment_trend: string | null
          total_invoiced_amount: number
          total_invoices: number
        }
        Insert: {
          avg_actual_payment_days?: number | null
          avg_agreed_terms_days?: number | null
          avg_days_after_due?: number | null
          calculated_at?: string
          company_id: string
          current_outstanding?: number
          current_overdue?: number
          customer_id: string
          id?: string
          last_payment_date?: string | null
          late_payment_ratio?: number | null
          max_delay_days?: number | null
          payment_risk_score?: number | null
          payment_trend?: string | null
          total_invoiced_amount?: number
          total_invoices?: number
        }
        Update: {
          avg_actual_payment_days?: number | null
          avg_agreed_terms_days?: number | null
          avg_days_after_due?: number | null
          calculated_at?: string
          company_id?: string
          current_outstanding?: number
          current_overdue?: number
          customer_id?: string
          id?: string
          last_payment_date?: string | null
          late_payment_ratio?: number | null
          max_delay_days?: number | null
          payment_risk_score?: number | null
          payment_trend?: string | null
          total_invoiced_amount?: number
          total_invoices?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_payment_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payment_profiles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          closing_balance: number | null
          company_id: string
          created_at: string
          customer_number: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          opening_balance: number | null
          org_number: string | null
          phone: string | null
          source_id: string | null
          source_system: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          closing_balance?: number | null
          company_id: string
          created_at?: string
          customer_number?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          opening_balance?: number | null
          org_number?: string | null
          phone?: string | null
          source_id?: string | null
          source_system?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          closing_balance?: number | null
          company_id?: string
          created_at?: string
          customer_number?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          opening_balance?: number | null
          org_number?: string | null
          phone?: string | null
          source_id?: string | null
          source_system?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          code: string | null
          company_id: string
          id: string
          is_active: boolean
          name: string
          source_id: string | null
          source_system: string | null
        }
        Insert: {
          code?: string | null
          company_id: string
          id?: string
          is_active?: boolean
          name: string
          source_id?: string | null
          source_system?: string | null
        }
        Update: {
          code?: string | null
          company_id?: string
          id?: string
          is_active?: boolean
          name?: string
          source_id?: string | null
          source_system?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_balances: {
        Row: {
          closing_balance: number | null
          company_id: string
          entity_key: string
          entity_type: string
          id: string
          opening_balance: number | null
          source: string
          updated_at: string
          year: number
        }
        Insert: {
          closing_balance?: number | null
          company_id: string
          entity_key: string
          entity_type: string
          id?: string
          opening_balance?: number | null
          source?: string
          updated_at?: string
          year: number
        }
        Update: {
          closing_balance?: number | null
          company_id?: string
          entity_key?: string
          entity_type?: string
          id?: string
          opening_balance?: number | null
          source?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "entity_balances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ephemeral_document_jobs: {
        Row: {
          analysis_result: Json | null
          company_id: string
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          file_size: number | null
          id: string
          mime_type: string | null
          recommendation: Json | null
          status: Database["public"]["Enums"]["document_job_status"]
          user_id: string
        }
        Insert: {
          analysis_result?: Json | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          recommendation?: Json | null
          status?: Database["public"]["Enums"]["document_job_status"]
          user_id: string
        }
        Update: {
          analysis_result?: Json | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          recommendation?: Json | null
          status?: Database["public"]["Enums"]["document_job_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ephemeral_document_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ephemeral_document_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_insights: {
        Row: {
          company_id: string
          created_at: string
          description_nb: string | null
          evidence: Json
          expires_at: string | null
          id: string
          insight_type: string
          is_active: boolean
          metric_current: number | null
          metric_reference: number | null
          period: string | null
          severity: string
          title_nb: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description_nb?: string | null
          evidence?: Json
          expires_at?: string | null
          id?: string
          insight_type: string
          is_active?: boolean
          metric_current?: number | null
          metric_reference?: number | null
          period?: string | null
          severity?: string
          title_nb: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description_nb?: string | null
          evidence?: Json
          expires_at?: string | null
          id?: string
          insight_type?: string
          is_active?: boolean
          metric_current?: number | null
          metric_reference?: number | null
          period?: string | null
          severity?: string
          title_nb?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_insights_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_metric_snapshots: {
        Row: {
          calculated_at: string
          calculation_version: string
          change_amount: number | null
          change_percent: number | null
          company_id: string
          comparison_period_end: string | null
          comparison_period_start: string | null
          comparison_value: number | null
          confidence: Database["public"]["Enums"]["confidence_level"]
          id: string
          metadata: Json
          metric: string
          period_end: string
          period_start: string
          period_type: string
          value: number
        }
        Insert: {
          calculated_at?: string
          calculation_version?: string
          change_amount?: number | null
          change_percent?: number | null
          company_id: string
          comparison_period_end?: string | null
          comparison_period_start?: string | null
          comparison_value?: number | null
          confidence?: Database["public"]["Enums"]["confidence_level"]
          id?: string
          metadata?: Json
          metric: string
          period_end: string
          period_start: string
          period_type: string
          value: number
        }
        Update: {
          calculated_at?: string
          calculation_version?: string
          change_amount?: number | null
          change_percent?: number | null
          company_id?: string
          comparison_period_end?: string | null
          comparison_period_start?: string | null
          comparison_value?: number | null
          confidence?: Database["public"]["Enums"]["confidence_level"]
          id?: string
          metadata?: Json
          metric?: string
          period_end?: string
          period_start?: string
          period_type?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "financial_metric_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_years: {
        Row: {
          company_id: string
          end_date: string
          id: string
          is_closed: boolean
          source_id: string | null
          source_system: string | null
          start_date: string
          year: number
        }
        Insert: {
          company_id: string
          end_date: string
          id?: string
          is_closed?: boolean
          source_id?: string | null
          source_system?: string | null
          start_date: string
          year: number
        }
        Update: {
          company_id?: string
          end_date?: string
          id?: string
          is_closed?: boolean
          source_id?: string | null
          source_system?: string | null
          start_date?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "financial_years_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_items: {
        Row: {
          amount: number
          category: string
          confidence: Database["public"]["Enums"]["confidence_level"]
          description: string | null
          forecast_id: string
          id: string
          item_date: string
          metadata: Json
          source_id: string | null
          source_type: string | null
        }
        Insert: {
          amount: number
          category: string
          confidence?: Database["public"]["Enums"]["confidence_level"]
          description?: string | null
          forecast_id: string
          id?: string
          item_date: string
          metadata?: Json
          source_id?: string | null
          source_type?: string | null
        }
        Update: {
          amount?: number
          category?: string
          confidence?: Database["public"]["Enums"]["confidence_level"]
          description?: string | null
          forecast_id?: string
          id?: string
          item_date?: string
          metadata?: Json
          source_id?: string | null
          source_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "forecast_items_forecast_id_fkey"
            columns: ["forecast_id"]
            isOneToOne: false
            referencedRelation: "forecasts"
            referencedColumns: ["id"]
          },
        ]
      }
      forecasts: {
        Row: {
          calculated_at: string
          calculation_version: string
          company_id: string
          confidence: Database["public"]["Enums"]["confidence_level"]
          forecast_date: string
          forecast_type: string
          horizon_days: number
          id: string
          metadata: Json
          summary: Json
        }
        Insert: {
          calculated_at?: string
          calculation_version?: string
          company_id: string
          confidence?: Database["public"]["Enums"]["confidence_level"]
          forecast_date: string
          forecast_type: string
          horizon_days: number
          id?: string
          metadata?: Json
          summary?: Json
        }
        Update: {
          calculated_at?: string
          calculation_version?: string
          company_id?: string
          confidence?: Database["public"]["Enums"]["confidence_level"]
          forecast_date?: string
          forecast_type?: string
          horizon_days?: number
          id?: string
          metadata?: Json
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "forecasts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      gl_accounts: {
        Row: {
          account_number: string
          account_type: string | null
          closing_balance: number | null
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          opening_balance: number | null
          source_id: string | null
          source_system: string | null
          updated_at: string
        }
        Insert: {
          account_number: string
          account_type?: string | null
          closing_balance?: number | null
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          opening_balance?: number | null
          source_id?: string | null
          source_system?: string | null
          updated_at?: string
        }
        Update: {
          account_number?: string
          account_type?: string | null
          closing_balance?: number | null
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          opening_balance?: number | null
          source_id?: string | null
          source_system?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gl_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      import_runs: {
        Row: {
          company_id: string
          completed_at: string | null
          counts: Json | null
          error_message: string | null
          file_name: string | null
          file_size: number | null
          id: string
          period_end: string | null
          period_start: string | null
          source_format: string
          started_at: string
          status: string
          user_id: string | null
          warnings: Json | null
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          counts?: Json | null
          error_message?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          source_format?: string
          started_at?: string
          status?: string
          user_id?: string | null
          warnings?: Json | null
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          counts?: Json | null
          error_message?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          source_format?: string
          started_at?: string
          status?: string
          user_id?: string | null
          warnings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "import_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      incoming_invoices: {
        Row: {
          company_id: string
          created_at: string
          currency: string
          due_date: string | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          remaining_amount: number | null
          source_id: string | null
          source_system: string | null
          status: string | null
          supplier_id: string | null
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          currency?: string
          due_date?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          remaining_amount?: number | null
          source_id?: string | null
          source_system?: string | null
          status?: string | null
          supplier_id?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          currency?: string
          due_date?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          remaining_amount?: number | null
          source_id?: string | null
          source_system?: string | null
          status?: string | null
          supplier_id?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incoming_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_credentials: {
        Row: {
          access_token: string | null
          application_key: string | null
          created_at: string
          encrypted_client_key: string
          id: string
          integration_id: string
          subscription_key: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          application_key?: string | null
          created_at?: string
          encrypted_client_key: string
          id?: string
          integration_id: string
          subscription_key?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          application_key?: string | null
          created_at?: string
          encrypted_client_key?: string
          id?: string
          integration_id?: string
          subscription_key?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_credentials_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: true
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_sync_state: {
        Row: {
          company_id: string
          error_message: string | null
          id: string
          last_changed_at: string | null
          last_created_at: string | null
          last_sync_completed_at: string | null
          last_sync_started_at: string | null
          last_voucher_number: number | null
          metadata: Json
          resource_type: string
          sync_status: Database["public"]["Enums"]["sync_status"]
        }
        Insert: {
          company_id: string
          error_message?: string | null
          id?: string
          last_changed_at?: string | null
          last_created_at?: string | null
          last_sync_completed_at?: string | null
          last_sync_started_at?: string | null
          last_voucher_number?: number | null
          metadata?: Json
          resource_type: string
          sync_status?: Database["public"]["Enums"]["sync_status"]
        }
        Update: {
          company_id?: string
          error_message?: string | null
          id?: string
          last_changed_at?: string | null
          last_created_at?: string | null
          last_sync_completed_at?: string | null
          last_sync_started_at?: string | null
          last_voucher_number?: number | null
          metadata?: Json
          resource_type?: string
          sync_status?: Database["public"]["Enums"]["sync_status"]
        }
        Relationships: [
          {
            foreignKeyName: "integration_sync_state_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          company_id: string
          connected_at: string | null
          created_at: string
          id: string
          is_active: boolean
          provider: Database["public"]["Enums"]["integration_provider"]
          settings: Json
          updated_at: string
        }
        Insert: {
          company_id: string
          connected_at?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          provider: Database["public"]["Enums"]["integration_provider"]
          settings?: Json
          updated_at?: string
        }
        Update: {
          company_id?: string
          connected_at?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          provider?: Database["public"]["Enums"]["integration_provider"]
          settings?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_articles: {
        Row: {
          accounting_treatment: string
          beginner_explanation: string
          category: Database["public"]["Enums"]["article_category"]
          common_mistakes: string[]
          company_types: Database["public"]["Enums"]["company_type"][]
          confidence: Database["public"]["Enums"]["article_confidence"]
          content_version: number
          created_at: string
          documentation_requirements: string[]
          effective_from: string
          effective_to: string | null
          examples: Json
          exceptions: string[]
          id: string
          jurisdiction: string
          keywords: string[]
          last_researched_at: string
          main_rule: string
          poweroffice_guidance: string
          professional_explanation: string
          professional_review_reason: string
          questions_to_ask_user: string[]
          recommended_accounts: Json
          related_topics: string[]
          requires_professional_review: boolean
          review_status: Database["public"]["Enums"]["review_status"]
          risk_level: Database["public"]["Enums"]["risk_level"]
          search_phrases: string[]
          slug: string
          sources: Json
          subcategory: string
          summary: string
          tax_treatment: string
          title: string
          updated_at: string
          vat_treatment: string
          warning_signs: string[]
        }
        Insert: {
          accounting_treatment?: string
          beginner_explanation: string
          category: Database["public"]["Enums"]["article_category"]
          common_mistakes?: string[]
          company_types?: Database["public"]["Enums"]["company_type"][]
          confidence?: Database["public"]["Enums"]["article_confidence"]
          content_version?: number
          created_at?: string
          documentation_requirements?: string[]
          effective_from?: string
          effective_to?: string | null
          examples?: Json
          exceptions?: string[]
          id?: string
          jurisdiction?: string
          keywords?: string[]
          last_researched_at?: string
          main_rule: string
          poweroffice_guidance?: string
          professional_explanation: string
          professional_review_reason?: string
          questions_to_ask_user?: string[]
          recommended_accounts?: Json
          related_topics?: string[]
          requires_professional_review?: boolean
          review_status?: Database["public"]["Enums"]["review_status"]
          risk_level?: Database["public"]["Enums"]["risk_level"]
          search_phrases?: string[]
          slug: string
          sources?: Json
          subcategory?: string
          summary: string
          tax_treatment?: string
          title: string
          updated_at?: string
          vat_treatment?: string
          warning_signs?: string[]
        }
        Update: {
          accounting_treatment?: string
          beginner_explanation?: string
          category?: Database["public"]["Enums"]["article_category"]
          common_mistakes?: string[]
          company_types?: Database["public"]["Enums"]["company_type"][]
          confidence?: Database["public"]["Enums"]["article_confidence"]
          content_version?: number
          created_at?: string
          documentation_requirements?: string[]
          effective_from?: string
          effective_to?: string | null
          examples?: Json
          exceptions?: string[]
          id?: string
          jurisdiction?: string
          keywords?: string[]
          last_researched_at?: string
          main_rule?: string
          poweroffice_guidance?: string
          professional_explanation?: string
          professional_review_reason?: string
          questions_to_ask_user?: string[]
          recommended_accounts?: Json
          related_topics?: string[]
          requires_professional_review?: boolean
          review_status?: Database["public"]["Enums"]["review_status"]
          risk_level?: Database["public"]["Enums"]["risk_level"]
          search_phrases?: string[]
          slug?: string
          sources?: Json
          subcategory?: string
          summary?: string
          tax_treatment?: string
          title?: string
          updated_at?: string
          vat_treatment?: string
          warning_signs?: string[]
        }
        Relationships: []
      }
      knowledge_evaluations: {
        Row: {
          article_id: string
          created_at: string
          expected_risk_level: Database["public"]["Enums"]["risk_level"]
          expected_topics: string[]
          id: string
          question: string
          required_clarifying_questions: string[]
          unacceptable_behavior: string[]
        }
        Insert: {
          article_id: string
          created_at?: string
          expected_risk_level?: Database["public"]["Enums"]["risk_level"]
          expected_topics?: string[]
          id?: string
          question: string
          required_clarifying_questions?: string[]
          unacceptable_behavior?: string[]
        }
        Update: {
          article_id?: string
          created_at?: string
          expected_risk_level?: Database["public"]["Enums"]["risk_level"]
          expected_topics?: string[]
          id?: string
          question?: string
          required_clarifying_questions?: string[]
          unacceptable_behavior?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_evaluations_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "knowledge_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      outgoing_invoice_lines: {
        Row: {
          account_number: string | null
          amount: number | null
          department_id: string | null
          description: string | null
          id: string
          invoice_id: string
          line_number: number | null
          product_id: string | null
          project_id: string | null
          quantity: number | null
          unit_price: number | null
          vat_amount: number | null
          vat_code: string | null
        }
        Insert: {
          account_number?: string | null
          amount?: number | null
          department_id?: string | null
          description?: string | null
          id?: string
          invoice_id: string
          line_number?: number | null
          product_id?: string | null
          project_id?: string | null
          quantity?: number | null
          unit_price?: number | null
          vat_amount?: number | null
          vat_code?: string | null
        }
        Update: {
          account_number?: string | null
          amount?: number | null
          department_id?: string | null
          description?: string | null
          id?: string
          invoice_id?: string
          line_number?: number | null
          product_id?: string | null
          project_id?: string | null
          quantity?: number | null
          unit_price?: number | null
          vat_amount?: number | null
          vat_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outgoing_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "outgoing_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      outgoing_invoices: {
        Row: {
          company_id: string
          created_at: string
          currency: string
          customer_id: string | null
          due_date: string | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          invoice_type: string | null
          remaining_amount: number | null
          source_id: string | null
          source_system: string | null
          status: string | null
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          currency?: string
          customer_id?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_type?: string | null
          remaining_amount?: number | null
          source_id?: string | null
          source_system?: string | null
          status?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          currency?: string
          customer_id?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_type?: string | null
          remaining_amount?: number | null
          source_id?: string | null
          source_system?: string | null
          status?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outgoing_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outgoing_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          currency: string
          description: string | null
          id: string
          payment_date: string
          payment_type: string | null
          reference_id: string | null
          reference_type: string | null
          source_id: string | null
          source_system: string | null
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          payment_date: string
          payment_type?: string | null
          reference_id?: string | null
          reference_type?: string | null
          source_id?: string | null
          source_system?: string | null
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          payment_date?: string
          payment_type?: string | null
          reference_id?: string | null
          reference_type?: string | null
          source_id?: string | null
          source_system?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          code: string | null
          company_id: string
          cost_price: number | null
          id: string
          is_active: boolean
          is_recurring: boolean
          name: string
          price_updated_at: string | null
          product_group: string | null
          sales_account: string | null
          sales_price: number | null
          source_id: string | null
          source_system: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          code?: string | null
          company_id: string
          cost_price?: number | null
          id?: string
          is_active?: boolean
          is_recurring?: boolean
          name: string
          price_updated_at?: string | null
          product_group?: string | null
          sales_account?: string | null
          sales_price?: number | null
          source_id?: string | null
          source_system?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          code?: string | null
          company_id?: string
          cost_price?: number | null
          id?: string
          is_active?: boolean
          is_recurring?: boolean
          name?: string
          price_updated_at?: string | null
          product_group?: string | null
          sales_account?: string | null
          sales_price?: number | null
          source_id?: string | null
          source_system?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          code: string | null
          company_id: string
          id: string
          is_active: boolean
          name: string
          source_id: string | null
          source_system: string | null
        }
        Insert: {
          code?: string | null
          company_id: string
          id?: string
          is_active?: boolean
          name: string
          source_id?: string | null
          source_system?: string | null
        }
        Update: {
          code?: string | null
          company_id?: string
          id?: string
          is_active?: boolean
          name?: string
          source_id?: string | null
          source_system?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_contracts: {
        Row: {
          company_id: string
          customer_id: string | null
          customer_name: string
          customer_number: string | null
          department: string | null
          description: string | null
          gross_amount: number | null
          id: string
          imported_at: string
          interval_months: number
          is_active: boolean
          is_draft: boolean
          net_amount: number
          next_invoice_date: string | null
          org_number: string | null
          seller: string | null
          source_id: string | null
          source_system: string
        }
        Insert: {
          company_id: string
          customer_id?: string | null
          customer_name: string
          customer_number?: string | null
          department?: string | null
          description?: string | null
          gross_amount?: number | null
          id?: string
          imported_at?: string
          interval_months: number
          is_active?: boolean
          is_draft?: boolean
          net_amount: number
          next_invoice_date?: string | null
          org_number?: string | null
          seller?: string | null
          source_id?: string | null
          source_system?: string
        }
        Update: {
          company_id?: string
          customer_id?: string | null
          customer_name?: string
          customer_number?: string | null
          department?: string | null
          description?: string | null
          gross_amount?: number | null
          id?: string
          imported_at?: string
          interval_months?: number
          is_active?: boolean
          is_draft?: boolean
          net_amount?: number
          next_invoice_date?: string | null
          org_number?: string | null
          seller?: string | null
          source_id?: string | null
          source_system?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_cost_patterns: {
        Row: {
          avg_amount: number
          category_key: string | null
          company_id: string
          confidence: Database["public"]["Enums"]["confidence_level"]
          created_at: string
          description: string | null
          frequency: string
          id: string
          is_active: boolean
          last_occurrence_date: string | null
          next_expected_date: string | null
          supplier_id: string | null
          supplier_name: string | null
        }
        Insert: {
          avg_amount: number
          category_key?: string | null
          company_id: string
          confidence?: Database["public"]["Enums"]["confidence_level"]
          created_at?: string
          description?: string | null
          frequency: string
          id?: string
          is_active?: boolean
          last_occurrence_date?: string | null
          next_expected_date?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
        }
        Update: {
          avg_amount?: number
          category_key?: string | null
          company_id?: string
          confidence?: Database["public"]["Enums"]["confidence_level"]
          created_at?: string
          description?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_occurrence_date?: string | null
          next_expected_date?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_cost_patterns_category_key_fkey"
            columns: ["category_key"]
            isOneToOne: false
            referencedRelation: "account_categories"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "recurring_cost_patterns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_cost_patterns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      report_templates: {
        Row: {
          company_id: string
          configuration: Json
          created_at: string
          created_by: string | null
          id: string
          name: string
          report_type: string
        }
        Insert: {
          company_id: string
          configuration?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          report_type: string
        }
        Update: {
          company_id?: string
          configuration?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          report_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          company_id: string
          comparison_type: string | null
          configuration: Json
          created_at: string
          created_by: string | null
          dataset: Json | null
          dataset_version: string
          generated_at: string
          id: string
          period_end: string
          period_start: string
          report_type: string
          status: string
          title: string
        }
        Insert: {
          company_id: string
          comparison_type?: string | null
          configuration?: Json
          created_at?: string
          created_by?: string | null
          dataset?: Json | null
          dataset_version?: string
          generated_at?: string
          id?: string
          period_end: string
          period_start: string
          report_type: string
          status?: string
          title: string
        }
        Update: {
          company_id?: string
          comparison_type?: string | null
          configuration?: Json
          created_at?: string
          created_by?: string | null
          dataset?: Json | null
          dataset_version?: string
          generated_at?: string
          id?: string
          period_end?: string
          period_start?: string
          report_type?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_ledger_entries: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          currency: string
          description: string | null
          due_date: string | null
          entry_date: string
          entry_type: string | null
          id: string
          invoice_number: string | null
          is_open: boolean
          match_status: string | null
          remaining_amount: number | null
          source_id: string | null
          source_system: string | null
          supplier_id: string | null
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          currency?: string
          description?: string | null
          due_date?: string | null
          entry_date: string
          entry_type?: string | null
          id?: string
          invoice_number?: string | null
          is_open?: boolean
          match_status?: string | null
          remaining_amount?: number | null
          source_id?: string | null
          source_system?: string | null
          supplier_id?: string | null
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          currency?: string
          description?: string | null
          due_date?: string | null
          entry_date?: string
          entry_type?: string | null
          id?: string
          invoice_number?: string | null
          is_open?: boolean
          match_status?: string | null
          remaining_amount?: number | null
          source_id?: string | null
          source_system?: string | null
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_ledger_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_ledger_entries_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          closing_balance: number | null
          company_id: string
          country: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          is_anonymised: boolean
          is_possible_private_person: boolean
          name: string
          opening_balance: number | null
          org_number: string | null
          phone: string | null
          source_id: string | null
          source_system: string | null
          supplier_number: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          closing_balance?: number | null
          company_id: string
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_anonymised?: boolean
          is_possible_private_person?: boolean
          name: string
          opening_balance?: number | null
          org_number?: string | null
          phone?: string | null
          source_id?: string | null
          source_system?: string | null
          supplier_number?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          closing_balance?: number | null
          company_id?: string
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_anonymised?: boolean
          is_possible_private_person?: boolean
          name?: string
          opening_balance?: number | null
          org_number?: string | null
          phone?: string | null
          source_id?: string | null
          source_system?: string | null
          supplier_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_balance_snapshots: {
        Row: {
          account_number: string
          closing_balance: number
          company_id: string
          created_at: string
          id: string
          opening_balance: number
          period_credit: number
          period_debit: number
          snapshot_date: string
          source_id: string | null
          source_system: string | null
        }
        Insert: {
          account_number: string
          closing_balance?: number
          company_id: string
          created_at?: string
          id?: string
          opening_balance?: number
          period_credit?: number
          period_debit?: number
          snapshot_date: string
          source_id?: string | null
          source_system?: string | null
        }
        Update: {
          account_number?: string
          closing_balance?: number
          company_id?: string
          created_at?: string
          id?: string
          opening_balance?: number
          period_credit?: number
          period_debit?: number
          snapshot_date?: string
          source_id?: string | null
          source_system?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trial_balance_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_company_access: {
        Row: {
          accounting_knowledge_level: Database["public"]["Enums"]["accounting_knowledge_level"]
          company_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          accounting_knowledge_level?: Database["public"]["Enums"]["accounting_knowledge_level"]
          company_id: string
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          accounting_knowledge_level?: Database["public"]["Enums"]["accounting_knowledge_level"]
          company_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_company_access_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_company_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          id: string
          language: string
          settings: Json
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          language?: string
          settings?: Json
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          language?: string
          settings?: Json
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_user_id: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      vat_codes: {
        Row: {
          code: string
          company_id: string
          description: string | null
          id: string
          is_active: boolean
          name: string | null
          rate: number | null
          saft_code: string | null
          source_id: string | null
          source_system: string | null
        }
        Insert: {
          code: string
          company_id: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string | null
          rate?: number | null
          saft_code?: string | null
          source_id?: string | null
          source_system?: string | null
        }
        Update: {
          code?: string
          company_id?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string | null
          rate?: number | null
          saft_code?: string | null
          source_id?: string | null
          source_system?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vat_codes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      vat_settings: {
        Row: {
          company_id: string
          id: string
          settings: Json
          source_id: string | null
          source_system: string | null
          vat_period: string | null
          vat_registered: boolean
        }
        Insert: {
          company_id: string
          id?: string
          settings?: Json
          source_id?: string | null
          source_system?: string | null
          vat_period?: string | null
          vat_registered?: boolean
        }
        Update: {
          company_id?: string
          id?: string
          settings?: Json
          source_id?: string | null
          source_system?: string | null
          vat_period?: string | null
          vat_registered?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "vat_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_posting_patterns: {
        Row: {
          company_id: string
          confidence: number
          created_at: string
          id: string
          last_occurrence_date: string | null
          occurrence_count: number
          supplier_id: string | null
          typical_account_number: string | null
          typical_category_key: string | null
          typical_vat_code: string | null
          updated_at: string
          vendor_name: string
        }
        Insert: {
          company_id: string
          confidence?: number
          created_at?: string
          id?: string
          last_occurrence_date?: string | null
          occurrence_count?: number
          supplier_id?: string | null
          typical_account_number?: string | null
          typical_category_key?: string | null
          typical_vat_code?: string | null
          updated_at?: string
          vendor_name: string
        }
        Update: {
          company_id?: string
          confidence?: number
          created_at?: string
          id?: string
          last_occurrence_date?: string | null
          occurrence_count?: number
          supplier_id?: string | null
          typical_account_number?: string | null
          typical_category_key?: string | null
          typical_vat_code?: string | null
          updated_at?: string
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_posting_patterns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_posting_patterns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_posting_patterns_typical_category_key_fkey"
            columns: ["typical_category_key"]
            isOneToOne: false
            referencedRelation: "account_categories"
            referencedColumns: ["key"]
          },
        ]
      }
      vouchers: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          source_id: string | null
          source_system: string | null
          voucher_date: string | null
          voucher_number: number | null
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          source_id?: string | null
          source_system?: string | null
          voucher_date?: string | null
          voucher_number?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          source_id?: string | null
          source_system?: string | null
          voucher_date?: string | null
          voucher_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      company_balance_totals: {
        Args: { p_company_id: string }
        Returns: {
          cash: number
          is_stated: boolean
          payables: number
          receivables: number
        }[]
      }
      company_cash_series: {
        Args: { p_company_id: string }
        Returns: {
          balance: number
          is_estimated: boolean
          month: string
          movement: number
        }[]
      }
      company_customer_summary: {
        Args: { p_company_id: string }
        Returns: {
          customer_id: string
          customer_number: string
          last_activity: string
          name: string
          org_number: string
          outstanding: number
          outstanding_is_stated: boolean
          posting_count: number
          revenue: number
        }[]
      }
      company_mrr: {
        Args: { p_company_id: string }
        Returns: {
          is_complete: boolean
          month: string
          normalised_mrr: number
          one_off: number
          recurring: number
          total: number
        }[]
      }
      company_recurring_revenue: {
        Args: { p_company_id: string }
        Returns: {
          avg_per_month: number
          description: string
          first_month: string
          has_cadence: boolean
          has_keyword: boolean
          last_month: string
          matched_product: string
          months_active: number
          posting_count: number
          total: number
        }[]
      }
      company_supplier_summary: {
        Args: { p_company_id: string }
        Returns: {
          cost: number
          last_activity: string
          name: string
          org_number: string
          outstanding: number
          outstanding_is_stated: boolean
          posting_count: number
          supplier_id: string
          supplier_number: string
        }[]
      }
      create_company_with_access: {
        Args: {
          p_company_name: string
          p_industry?: string
          p_knowledge_level?: Database["public"]["Enums"]["accounting_knowledge_level"]
          p_org_number?: string
        }
        Returns: Json
      }
      get_user_company_ids: { Args: never; Returns: string[] }
      user_administers_company: {
        Args: { p_company_id: string }
        Returns: boolean
      }
    }
    Enums: {
      accounting_knowledge_level: "beginner" | "intermediate" | "advanced"
      article_category:
        | "bookkeeping"
        | "accounting"
        | "vat"
        | "tax"
        | "payroll"
        | "travel"
        | "representation"
        | "employee_benefits"
        | "assets"
        | "depreciation"
        | "receivables"
        | "shareholder"
        | "foreign_transactions"
        | "vehicle"
        | "documentation"
        | "poweroffice"
      article_confidence: "HIGH" | "MEDIUM" | "LOW"
      assistant_message_role: "user" | "assistant" | "system"
      company_type: "AS" | "ENK" | "ANS" | "DA" | "NUF" | "SA"
      confidence_level:
        | "confirmed"
        | "high_confidence"
        | "estimated"
        | "low_confidence"
        | "rough_estimate"
      document_job_status:
        | "uploading"
        | "analyzing"
        | "completed"
        | "failed"
        | "deleted"
      integration_provider: "poweroffice"
      review_status: "AI_GENERATED" | "NEEDS_REVIEW" | "REVIEWED" | "PUBLISHED"
      risk_level: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH"
      sync_status: "pending" | "running" | "completed" | "failed" | "partial"
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
    Enums: {
      accounting_knowledge_level: ["beginner", "intermediate", "advanced"],
      article_category: [
        "bookkeeping",
        "accounting",
        "vat",
        "tax",
        "payroll",
        "travel",
        "representation",
        "employee_benefits",
        "assets",
        "depreciation",
        "receivables",
        "shareholder",
        "foreign_transactions",
        "vehicle",
        "documentation",
        "poweroffice",
      ],
      article_confidence: ["HIGH", "MEDIUM", "LOW"],
      assistant_message_role: ["user", "assistant", "system"],
      company_type: ["AS", "ENK", "ANS", "DA", "NUF", "SA"],
      confidence_level: [
        "confirmed",
        "high_confidence",
        "estimated",
        "low_confidence",
        "rough_estimate",
      ],
      document_job_status: [
        "uploading",
        "analyzing",
        "completed",
        "failed",
        "deleted",
      ],
      integration_provider: ["poweroffice"],
      review_status: ["AI_GENERATED", "NEEDS_REVIEW", "REVIEWED", "PUBLISHED"],
      risk_level: ["LOW", "MEDIUM", "HIGH", "VERY_HIGH"],
      sync_status: ["pending", "running", "completed", "failed", "partial"],
    },
  },
} as const

export type Company = Tables<"companies">;
export type User = Tables<"users">;
export type UserCompanyAccess = Tables<"user_company_access">;
export type UserPreferences = Tables<"user_preferences">;
export type Integration = Tables<"integrations">;
export type IntegrationCredential = Tables<"integration_credentials">;
export type IntegrationSyncState = Tables<"integration_sync_state">;
export type FinancialYear = Tables<"financial_years">;
export type GLAccount = Tables<"gl_accounts">;
export type AccountCategory = Tables<"account_categories">;
export type AccountMapping = Tables<"account_mappings">;
export type VatCode = Tables<"vat_codes">;
export type VatSettings = Tables<"vat_settings">;
export type Voucher = Tables<"vouchers">;
export type AccountTransaction = Tables<"account_transactions">;
export type TrialBalanceSnapshot = Tables<"trial_balance_snapshots">;
export type Customer = Tables<"customers">;
export type CustomerLedgerEntry = Tables<"customer_ledger_entries">;
export type CustomerPaymentProfile = Tables<"customer_payment_profiles">;
export type OutgoingInvoice = Tables<"outgoing_invoices">;
export type OutgoingInvoiceLine = Tables<"outgoing_invoice_lines">;
export type Supplier = Tables<"suppliers">;
export type SupplierLedgerEntry = Tables<"supplier_ledger_entries">;
export type IncomingInvoice = Tables<"incoming_invoices">;
export type Payment = Tables<"payments">;
export type FinancialMetricSnapshot = Tables<"financial_metric_snapshots">;
export type FinancialInsight = Tables<"financial_insights">;
export type Forecast = Tables<"forecasts">;
export type ForecastItem = Tables<"forecast_items">;
export type RecurringCostPattern = Tables<"recurring_cost_patterns">;
export type VendorPostingPattern = Tables<"vendor_posting_patterns">;
export type AccountingRule = Tables<"accounting_rules">;
export type AssistantConversation = Tables<"assistant_conversations">;
export type AssistantMessage = Tables<"assistant_messages">;
export type AssistantEvidence = Tables<"assistant_evidence">;
export type EphemeralDocumentJob = Tables<"ephemeral_document_jobs">;
export type Department = Tables<"departments">;
export type Product = Tables<"products">;
export type Project = Tables<"projects">;
export type KnowledgeArticle = Tables<"knowledge_articles">;
export type KnowledgeEvaluation = Tables<"knowledge_evaluations">;
export type ImportRun = Tables<"import_runs">;

export type AccountingKnowledgeLevel = Enums<"accounting_knowledge_level">;
export type IntegrationProvider = Enums<"integration_provider">;
export type SyncStatus = Enums<"sync_status">;
export type ConfidenceLevel = Enums<"confidence_level">;
export type DocumentJobStatus = Enums<"document_job_status">;
export type AssistantMessageRole = Enums<"assistant_message_role">;
export type ReviewStatusEnum = Enums<"review_status">;
export type RiskLevelEnum = Enums<"risk_level">;

export type Report = Tables<"reports">;
export type ReportTemplate = Tables<"report_templates">;
export type Budget = Tables<"budgets">;
export type BudgetLine = Tables<"budget_lines">;
export type BudgetAssumption = Tables<"budget_assumptions">;
export type RecurringContract = Tables<"recurring_contracts">;
export type EntityBalance = Tables<"entity_balances">;
