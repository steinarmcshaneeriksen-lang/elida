// ─── Enums ──────────────────────────────────────────────────────────────────

export type AccountingKnowledgeLevel = "beginner" | "intermediate" | "advanced";

export type IntegrationProvider = "poweroffice";

export type SyncStatus = "pending" | "running" | "completed" | "failed" | "partial";

export type ConfidenceLevel =
  | "confirmed"
  | "high_confidence"
  | "estimated"
  | "low_confidence"
  | "rough_estimate";

export type DocumentJobStatus =
  | "uploading"
  | "analyzing"
  | "completed"
  | "failed"
  | "deleted";

export type AssistantMessageRole = "user" | "assistant" | "system";

// ─── Row types ──────────────────────────────────────────────────────────────

export interface Company {
  id: string;
  name: string;
  org_number: string | null;
  industry: string | null;
  employer_tax_zone: string | null;
  normal_payroll_date: number | null;
  min_liquidity_buffer: number | null;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  auth_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserCompanyAccess {
  id: string;
  user_id: string;
  company_id: string;
  role: string;
  accounting_knowledge_level: AccountingKnowledgeLevel;
  created_at: string;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  language: string;
  theme: string;
  settings: Record<string, unknown>;
  updated_at: string;
}

export interface Integration {
  id: string;
  company_id: string;
  provider: IntegrationProvider;
  is_active: boolean;
  settings: Record<string, unknown>;
  connected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationCredential {
  id: string;
  integration_id: string;
  encrypted_client_key: string;
  application_key: string | null;
  subscription_key: string | null;
  access_token: string | null;
  token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationSyncState {
  id: string;
  company_id: string;
  resource_type: string;
  last_voucher_number: number | null;
  last_created_at: string | null;
  last_changed_at: string | null;
  last_sync_started_at: string | null;
  last_sync_completed_at: string | null;
  sync_status: SyncStatus;
  error_message: string | null;
  metadata: Record<string, unknown>;
}

export interface FinancialYear {
  id: string;
  company_id: string;
  year: number;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  source_system: string | null;
  source_id: string | null;
}

export interface GLAccount {
  id: string;
  company_id: string;
  account_number: string;
  name: string;
  description: string | null;
  account_type: string | null;
  is_active: boolean;
  source_system: string | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccountCategory {
  id: string;
  key: string;
  name_nb: string;
  name_en: string | null;
  parent_key: string | null;
  display_order: number;
}

export interface AccountMapping {
  id: string;
  company_id: string;
  gl_account_id: string;
  category_key: string;
  confidence: number;
  source: string;
  is_user_override: boolean;
  created_at: string;
  updated_at: string;
}

export interface VatCode {
  id: string;
  company_id: string;
  code: string;
  name: string | null;
  rate: number | null;
  description: string | null;
  is_active: boolean;
  saft_code: string | null;
  source_system: string | null;
  source_id: string | null;
}

export interface VatSettings {
  id: string;
  company_id: string;
  vat_registered: boolean;
  vat_period: string | null;
  settings: Record<string, unknown>;
  source_system: string | null;
  source_id: string | null;
}

export interface Voucher {
  id: string;
  company_id: string;
  voucher_number: number | null;
  voucher_date: string | null;
  description: string | null;
  source_system: string | null;
  source_id: string | null;
  created_at: string;
}

export interface AccountTransaction {
  id: string;
  company_id: string;
  voucher_id: string | null;
  gl_account_id: string | null;
  account_number: string;
  transaction_date: string;
  amount: number;
  currency: string;
  currency_amount: number | null;
  description: string | null;
  vat_code: string | null;
  vat_amount: number | null;
  project_id: string | null;
  department_id: string | null;
  product_id: string | null;
  source_system: string | null;
  source_id: string | null;
  created_at: string;
}

export interface TrialBalanceSnapshot {
  id: string;
  company_id: string;
  snapshot_date: string;
  account_number: string;
  opening_balance: number;
  period_debit: number;
  period_credit: number;
  closing_balance: number;
  source_system: string | null;
  source_id: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  company_id: string;
  name: string;
  customer_number: string | null;
  org_number: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  is_active: boolean;
  source_system: string | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerLedgerEntry {
  id: string;
  company_id: string;
  customer_id: string | null;
  entry_date: string;
  due_date: string | null;
  entry_type: string | null;
  invoice_number: string | null;
  amount: number;
  remaining_amount: number | null;
  currency: string;
  is_open: boolean;
  match_status: string | null;
  description: string | null;
  source_system: string | null;
  source_id: string | null;
  created_at: string;
}

export interface OutgoingInvoice {
  id: string;
  company_id: string;
  customer_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  total_amount: number | null;
  remaining_amount: number | null;
  currency: string;
  status: string | null;
  invoice_type: string | null;
  source_system: string | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OutgoingInvoiceLine {
  id: string;
  invoice_id: string;
  line_number: number | null;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  vat_code: string | null;
  vat_amount: number | null;
  account_number: string | null;
  product_id: string | null;
  project_id: string | null;
  department_id: string | null;
}

export interface Supplier {
  id: string;
  company_id: string;
  name: string;
  supplier_number: string | null;
  org_number: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  country: string | null;
  is_active: boolean;
  source_system: string | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupplierLedgerEntry {
  id: string;
  company_id: string;
  supplier_id: string | null;
  entry_date: string;
  due_date: string | null;
  entry_type: string | null;
  invoice_number: string | null;
  amount: number;
  remaining_amount: number | null;
  currency: string;
  is_open: boolean;
  match_status: string | null;
  description: string | null;
  source_system: string | null;
  source_id: string | null;
  created_at: string;
}

export interface IncomingInvoice {
  id: string;
  company_id: string;
  supplier_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  total_amount: number | null;
  remaining_amount: number | null;
  currency: string;
  status: string | null;
  source_system: string | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  company_id: string;
  payment_date: string;
  amount: number;
  currency: string;
  payment_type: string | null;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  source_system: string | null;
  source_id: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  company_id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  source_system: string | null;
  source_id: string | null;
}

export interface Department {
  id: string;
  company_id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  source_system: string | null;
  source_id: string | null;
}

export interface Product {
  id: string;
  company_id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  source_system: string | null;
  source_id: string | null;
}

export interface FinancialMetricSnapshot {
  id: string;
  company_id: string;
  metric: string;
  value: number;
  period_type: string;
  period_start: string;
  period_end: string;
  comparison_value: number | null;
  comparison_period_start: string | null;
  comparison_period_end: string | null;
  change_amount: number | null;
  change_percent: number | null;
  confidence: ConfidenceLevel;
  calculation_version: string;
  calculated_at: string;
  metadata: Record<string, unknown>;
}

export interface FinancialInsight {
  id: string;
  company_id: string;
  insight_type: string;
  severity: string;
  title_nb: string;
  description_nb: string | null;
  metric_current: number | null;
  metric_reference: number | null;
  period: string | null;
  evidence: unknown[];
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
}

export interface Forecast {
  id: string;
  company_id: string;
  forecast_type: string;
  horizon_days: number;
  forecast_date: string;
  calculated_at: string;
  calculation_version: string;
  confidence: ConfidenceLevel;
  summary: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface ForecastItem {
  id: string;
  forecast_id: string;
  item_date: string;
  category: string;
  description: string | null;
  amount: number;
  confidence: ConfidenceLevel;
  source_type: string | null;
  source_id: string | null;
  metadata: Record<string, unknown>;
}

export interface CustomerPaymentProfile {
  id: string;
  company_id: string;
  customer_id: string;
  total_invoices: number;
  total_invoiced_amount: number;
  current_outstanding: number;
  current_overdue: number;
  avg_agreed_terms_days: number | null;
  avg_actual_payment_days: number | null;
  avg_days_after_due: number | null;
  late_payment_ratio: number | null;
  max_delay_days: number | null;
  payment_risk_score: number | null;
  last_payment_date: string | null;
  payment_trend: string | null;
  calculated_at: string;
}

export interface RecurringCostPattern {
  id: string;
  company_id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  description: string | null;
  category_key: string | null;
  avg_amount: number;
  frequency: string;
  last_occurrence_date: string | null;
  next_expected_date: string | null;
  confidence: ConfidenceLevel;
  is_active: boolean;
  created_at: string;
}

export interface VendorPostingPattern {
  id: string;
  company_id: string;
  supplier_id: string | null;
  vendor_name: string;
  typical_account_number: string | null;
  typical_vat_code: string | null;
  typical_category_key: string | null;
  occurrence_count: number;
  last_occurrence_date: string | null;
  confidence: number;
  created_at: string;
  updated_at: string;
}

export interface AssistantConversation {
  id: string;
  company_id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssistantMessage {
  id: string;
  conversation_id: string;
  role: AssistantMessageRole;
  content: string;
  tool_calls: unknown[] | null;
  tool_results: unknown[] | null;
  structured_response: Record<string, unknown> | null;
  created_at: string;
}

export interface AssistantEvidence {
  id: string;
  message_id: string;
  metric_id: string | null;
  transaction_ids: string[] | null;
  invoice_ids: string[] | null;
  calculation_version: string | null;
  source_period_start: string | null;
  source_period_end: string | null;
  comparison_period_start: string | null;
  comparison_period_end: string | null;
  evidence_data: Record<string, unknown>;
}

export interface EphemeralDocumentJob {
  id: string;
  company_id: string;
  user_id: string;
  status: DocumentJobStatus;
  mime_type: string | null;
  file_size: number | null;
  analysis_result: Record<string, unknown> | null;
  recommendation: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
  deleted_at: string | null;
}

export interface AccountingRule {
  id: string;
  rule_id: string;
  category: string;
  title_nb: string;
  content_nb: string;
  effective_from: string;
  effective_to: string | null;
  jurisdiction: string;
  source: string | null;
  last_reviewed_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ─── Insert types (omit server-generated fields) ────────────────────────────

export type CompanyInsert = Omit<Company, "id" | "created_at" | "updated_at">;
export type UserInsert = Omit<User, "id" | "created_at" | "updated_at">;
export type UserCompanyAccessInsert = Omit<UserCompanyAccess, "id" | "created_at">;
export type UserPreferencesInsert = Omit<UserPreferences, "id" | "updated_at">;
export type IntegrationInsert = Omit<Integration, "id" | "created_at" | "updated_at">;
export type IntegrationCredentialInsert = Omit<IntegrationCredential, "id" | "created_at" | "updated_at">;
export type VoucherInsert = Omit<Voucher, "id" | "created_at">;
export type AccountTransactionInsert = Omit<AccountTransaction, "id" | "created_at">;
export type CustomerInsert = Omit<Customer, "id" | "created_at" | "updated_at">;
export type SupplierInsert = Omit<Supplier, "id" | "created_at" | "updated_at">;
export type OutgoingInvoiceInsert = Omit<OutgoingInvoice, "id" | "created_at" | "updated_at">;
export type IncomingInvoiceInsert = Omit<IncomingInvoice, "id" | "created_at" | "updated_at">;
export type PaymentInsert = Omit<Payment, "id" | "created_at">;
export type AssistantConversationInsert = Omit<AssistantConversation, "id" | "created_at" | "updated_at">;
export type AssistantMessageInsert = Omit<AssistantMessage, "id" | "created_at">;
export type EphemeralDocumentJobInsert = Omit<EphemeralDocumentJob, "id" | "created_at" | "completed_at" | "deleted_at">;

// ─── Database schema type for Supabase client generics ──────────────────────

export interface Database {
  public: {
    Tables: {
      companies: {
        Row: Company;
        Insert: Partial<Pick<Company, "id" | "created_at" | "updated_at">> & Omit<Company, "id" | "created_at" | "updated_at">;
        Update: Partial<Company>;
        Relationships: [];
      };
      users: {
        Row: User;
        Insert: Partial<Pick<User, "id" | "created_at" | "updated_at">> & Omit<User, "id" | "created_at" | "updated_at">;
        Update: Partial<User>;
        Relationships: [];
      };
      user_company_access: {
        Row: UserCompanyAccess;
        Insert: Partial<Pick<UserCompanyAccess, "id" | "created_at" | "role" | "accounting_knowledge_level">> & Omit<UserCompanyAccess, "id" | "created_at" | "role" | "accounting_knowledge_level">;
        Update: Partial<UserCompanyAccess>;
        Relationships: [];
      };
      user_preferences: {
        Row: UserPreferences;
        Insert: Partial<Pick<UserPreferences, "id" | "updated_at" | "language" | "theme" | "settings">> & Omit<UserPreferences, "id" | "updated_at" | "language" | "theme" | "settings">;
        Update: Partial<UserPreferences>;
        Relationships: [];
      };
      integrations: {
        Row: Integration;
        Insert: Partial<Pick<Integration, "id" | "is_active" | "settings" | "created_at" | "updated_at">> & Omit<Integration, "id" | "is_active" | "settings" | "created_at" | "updated_at">;
        Update: Partial<Integration>;
        Relationships: [];
      };
      integration_credentials: {
        Row: IntegrationCredential;
        Insert: Partial<Pick<IntegrationCredential, "id" | "created_at" | "updated_at">> & Omit<IntegrationCredential, "id" | "created_at" | "updated_at">;
        Update: Partial<IntegrationCredential>;
        Relationships: [];
      };
      integration_sync_state: {
        Row: IntegrationSyncState;
        Insert: Partial<Pick<IntegrationSyncState, "id" | "sync_status" | "metadata">> & Omit<IntegrationSyncState, "id" | "sync_status" | "metadata">;
        Update: Partial<IntegrationSyncState>;
        Relationships: [];
      };
      financial_years: {
        Row: FinancialYear;
        Insert: Partial<Pick<FinancialYear, "id" | "is_closed">> & Omit<FinancialYear, "id" | "is_closed">;
        Update: Partial<FinancialYear>;
        Relationships: [];
      };
      gl_accounts: {
        Row: GLAccount;
        Insert: Partial<Pick<GLAccount, "id" | "is_active" | "created_at" | "updated_at">> & Omit<GLAccount, "id" | "is_active" | "created_at" | "updated_at">;
        Update: Partial<GLAccount>;
        Relationships: [];
      };
      account_categories: {
        Row: AccountCategory;
        Insert: Partial<Pick<AccountCategory, "id" | "display_order">> & Omit<AccountCategory, "id" | "display_order">;
        Update: Partial<AccountCategory>;
        Relationships: [];
      };
      account_mappings: {
        Row: AccountMapping;
        Insert: Partial<Pick<AccountMapping, "id" | "confidence" | "source" | "is_user_override" | "created_at" | "updated_at">> & Omit<AccountMapping, "id" | "confidence" | "source" | "is_user_override" | "created_at" | "updated_at">;
        Update: Partial<AccountMapping>;
        Relationships: [];
      };
      vat_codes: {
        Row: VatCode;
        Insert: Partial<Pick<VatCode, "id" | "is_active">> & Omit<VatCode, "id" | "is_active">;
        Update: Partial<VatCode>;
        Relationships: [];
      };
      vat_settings: {
        Row: VatSettings;
        Insert: Partial<Pick<VatSettings, "id" | "vat_registered" | "settings">> & Omit<VatSettings, "id" | "vat_registered" | "settings">;
        Update: Partial<VatSettings>;
        Relationships: [];
      };
      vouchers: {
        Row: Voucher;
        Insert: Partial<Pick<Voucher, "id" | "created_at">> & Omit<Voucher, "id" | "created_at">;
        Update: Partial<Voucher>;
        Relationships: [];
      };
      account_transactions: {
        Row: AccountTransaction;
        Insert: Partial<Pick<AccountTransaction, "id" | "currency" | "created_at">> & Omit<AccountTransaction, "id" | "currency" | "created_at">;
        Update: Partial<AccountTransaction>;
        Relationships: [];
      };
      trial_balance_snapshots: {
        Row: TrialBalanceSnapshot;
        Insert: Partial<Pick<TrialBalanceSnapshot, "id" | "opening_balance" | "period_debit" | "period_credit" | "closing_balance" | "created_at">> & Omit<TrialBalanceSnapshot, "id" | "opening_balance" | "period_debit" | "period_credit" | "closing_balance" | "created_at">;
        Update: Partial<TrialBalanceSnapshot>;
        Relationships: [];
      };
      customers: {
        Row: Customer;
        Insert: Partial<Pick<Customer, "id" | "is_active" | "created_at" | "updated_at">> & Omit<Customer, "id" | "is_active" | "created_at" | "updated_at">;
        Update: Partial<Customer>;
        Relationships: [];
      };
      customer_ledger_entries: {
        Row: CustomerLedgerEntry;
        Insert: Partial<Pick<CustomerLedgerEntry, "id" | "currency" | "is_open" | "created_at">> & Omit<CustomerLedgerEntry, "id" | "currency" | "is_open" | "created_at">;
        Update: Partial<CustomerLedgerEntry>;
        Relationships: [];
      };
      outgoing_invoices: {
        Row: OutgoingInvoice;
        Insert: Partial<Pick<OutgoingInvoice, "id" | "currency" | "created_at" | "updated_at">> & Omit<OutgoingInvoice, "id" | "currency" | "created_at" | "updated_at">;
        Update: Partial<OutgoingInvoice>;
        Relationships: [];
      };
      outgoing_invoice_lines: {
        Row: OutgoingInvoiceLine;
        Insert: Partial<Pick<OutgoingInvoiceLine, "id">> & Omit<OutgoingInvoiceLine, "id">;
        Update: Partial<OutgoingInvoiceLine>;
        Relationships: [];
      };
      suppliers: {
        Row: Supplier;
        Insert: Partial<Pick<Supplier, "id" | "is_active" | "created_at" | "updated_at">> & Omit<Supplier, "id" | "is_active" | "created_at" | "updated_at">;
        Update: Partial<Supplier>;
        Relationships: [];
      };
      supplier_ledger_entries: {
        Row: SupplierLedgerEntry;
        Insert: Partial<Pick<SupplierLedgerEntry, "id" | "currency" | "is_open" | "created_at">> & Omit<SupplierLedgerEntry, "id" | "currency" | "is_open" | "created_at">;
        Update: Partial<SupplierLedgerEntry>;
        Relationships: [];
      };
      incoming_invoices: {
        Row: IncomingInvoice;
        Insert: Partial<Pick<IncomingInvoice, "id" | "currency" | "created_at" | "updated_at">> & Omit<IncomingInvoice, "id" | "currency" | "created_at" | "updated_at">;
        Update: Partial<IncomingInvoice>;
        Relationships: [];
      };
      payments: {
        Row: Payment;
        Insert: Partial<Pick<Payment, "id" | "currency" | "created_at">> & Omit<Payment, "id" | "currency" | "created_at">;
        Update: Partial<Payment>;
        Relationships: [];
      };
      projects: {
        Row: Project;
        Insert: Partial<Pick<Project, "id" | "is_active">> & Omit<Project, "id" | "is_active">;
        Update: Partial<Project>;
        Relationships: [];
      };
      departments: {
        Row: Department;
        Insert: Partial<Pick<Department, "id" | "is_active">> & Omit<Department, "id" | "is_active">;
        Update: Partial<Department>;
        Relationships: [];
      };
      products: {
        Row: Product;
        Insert: Partial<Pick<Product, "id" | "is_active">> & Omit<Product, "id" | "is_active">;
        Update: Partial<Product>;
        Relationships: [];
      };
      financial_metric_snapshots: {
        Row: FinancialMetricSnapshot;
        Insert: Partial<Pick<FinancialMetricSnapshot, "id" | "confidence" | "calculation_version" | "calculated_at" | "metadata">> & Omit<FinancialMetricSnapshot, "id" | "confidence" | "calculation_version" | "calculated_at" | "metadata">;
        Update: Partial<FinancialMetricSnapshot>;
        Relationships: [];
      };
      financial_insights: {
        Row: FinancialInsight;
        Insert: Partial<Pick<FinancialInsight, "id" | "severity" | "evidence" | "is_active" | "created_at">> & Omit<FinancialInsight, "id" | "severity" | "evidence" | "is_active" | "created_at">;
        Update: Partial<FinancialInsight>;
        Relationships: [];
      };
      forecasts: {
        Row: Forecast;
        Insert: Partial<Pick<Forecast, "id" | "calculated_at" | "calculation_version" | "confidence" | "summary" | "metadata">> & Omit<Forecast, "id" | "calculated_at" | "calculation_version" | "confidence" | "summary" | "metadata">;
        Update: Partial<Forecast>;
        Relationships: [];
      };
      forecast_items: {
        Row: ForecastItem;
        Insert: Partial<Pick<ForecastItem, "id" | "confidence" | "metadata">> & Omit<ForecastItem, "id" | "confidence" | "metadata">;
        Update: Partial<ForecastItem>;
        Relationships: [];
      };
      customer_payment_profiles: {
        Row: CustomerPaymentProfile;
        Insert: Partial<Pick<CustomerPaymentProfile, "id" | "total_invoices" | "total_invoiced_amount" | "current_outstanding" | "current_overdue" | "calculated_at">> & Omit<CustomerPaymentProfile, "id" | "total_invoices" | "total_invoiced_amount" | "current_outstanding" | "current_overdue" | "calculated_at">;
        Update: Partial<CustomerPaymentProfile>;
        Relationships: [];
      };
      recurring_cost_patterns: {
        Row: RecurringCostPattern;
        Insert: Partial<Pick<RecurringCostPattern, "id" | "confidence" | "is_active" | "created_at">> & Omit<RecurringCostPattern, "id" | "confidence" | "is_active" | "created_at">;
        Update: Partial<RecurringCostPattern>;
        Relationships: [];
      };
      vendor_posting_patterns: {
        Row: VendorPostingPattern;
        Insert: Partial<Pick<VendorPostingPattern, "id" | "occurrence_count" | "confidence" | "created_at" | "updated_at">> & Omit<VendorPostingPattern, "id" | "occurrence_count" | "confidence" | "created_at" | "updated_at">;
        Update: Partial<VendorPostingPattern>;
        Relationships: [];
      };
      assistant_conversations: {
        Row: AssistantConversation;
        Insert: Partial<Pick<AssistantConversation, "id" | "created_at" | "updated_at">> & Omit<AssistantConversation, "id" | "created_at" | "updated_at">;
        Update: Partial<AssistantConversation>;
        Relationships: [];
      };
      assistant_messages: {
        Row: AssistantMessage;
        Insert: Partial<Pick<AssistantMessage, "id" | "created_at">> & Omit<AssistantMessage, "id" | "created_at">;
        Update: Partial<AssistantMessage>;
        Relationships: [];
      };
      assistant_evidence: {
        Row: AssistantEvidence;
        Insert: Partial<Pick<AssistantEvidence, "id" | "evidence_data">> & Omit<AssistantEvidence, "id" | "evidence_data">;
        Update: Partial<AssistantEvidence>;
        Relationships: [];
      };
      ephemeral_document_jobs: {
        Row: EphemeralDocumentJob;
        Insert: Partial<Pick<EphemeralDocumentJob, "id" | "status" | "created_at">> & Omit<EphemeralDocumentJob, "id" | "status" | "created_at">;
        Update: Partial<EphemeralDocumentJob>;
        Relationships: [];
      };
      accounting_rules: {
        Row: AccountingRule;
        Insert: Partial<Pick<AccountingRule, "id" | "jurisdiction" | "metadata" | "created_at">> & Omit<AccountingRule, "id" | "jurisdiction" | "metadata" | "created_at">;
        Update: Partial<AccountingRule>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      accounting_knowledge_level: AccountingKnowledgeLevel;
      integration_provider: IntegrationProvider;
      sync_status: SyncStatus;
      confidence_level: ConfidenceLevel;
      document_job_status: DocumentJobStatus;
      assistant_message_role: AssistantMessageRole;
    };
    CompositeTypes: Record<string, never>;
  };
}
