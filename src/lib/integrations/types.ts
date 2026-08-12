/**
 * Accounting System Integration — Adapter Interface & Normalized Types
 *
 * All external accounting systems (PowerOffice Go, Tripletex, Fiken, etc.)
 * must conform to AccountingSystemAdapter. Data flows through normalized
 * "External*" types before being mapped to internal DB models.
 */

// ---------------------------------------------------------------------------
// Credentials & Connection
// ---------------------------------------------------------------------------

export interface ConnectorCredentials {
  /** Provider-specific credential fields */
  [key: string]: string;
}

export interface ConnectionResult {
  success: boolean;
  provider: AccountingProvider;
  companyName?: string;
  organizationNumber?: string;
  error?: string;
}

export interface IntegrationInfo {
  provider: AccountingProvider;
  companyName: string;
  organizationNumber: string;
  /** ISO 4217 currency code */
  baseCurrency: string;
  fiscalYearStartMonth: number;
  modules: string[];
  apiVersion: string;
}

export interface FinancialSettings {
  baseCurrency: string;
  fiscalYearStartMonth: number;
  /** Date from which we should sync (company conversion date, if any) */
  conversionDate?: Date;
  vatRegistered: boolean;
  vatPeriod?: "monthly" | "bimonthly" | "quarterly" | "annual";
}

// ---------------------------------------------------------------------------
// Supported Providers
// ---------------------------------------------------------------------------

export type AccountingProvider =
  | "poweroffice"
  | "tripletex"
  | "fiken"
  | "visma";

// ---------------------------------------------------------------------------
// Normalized External Types
// ---------------------------------------------------------------------------

export interface ExternalGLAccount {
  externalId: string;
  accountNumber: number;
  name: string;
  description?: string;
  isActive: boolean;
  accountType: ExternalAccountType;
  vatCode?: string;
  currencyCode?: string;
  department?: string;
  project?: string;
}

export type ExternalAccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "expense"
  | "unknown";

export interface ExternalVatCode {
  externalId: string;
  code: string;
  name: string;
  rate: number;
  /** Whether the code is currently in use */
  isActive: boolean;
  description?: string;
}

export interface ExternalTrialBalanceEntry {
  accountNumber: number;
  accountName: string;
  openingBalance: number;
  debit: number;
  credit: number;
  closingBalance: number;
  currencyCode?: string;
}

export interface ExternalTransaction {
  externalId: string;
  voucherNumber: number;
  voucherDate: Date;
  accountNumber: number;
  description: string;
  debitAmount: number;
  creditAmount: number;
  amount: number;
  currencyCode: string;
  currencyAmount?: number;
  vatCode?: string;
  vatAmount?: number;
  departmentCode?: string;
  projectCode?: string;
  customerId?: string;
  supplierId?: string;
  createdAt: Date;
}

export interface ExternalCustomer {
  externalId: string;
  customerNumber: number;
  name: string;
  organizationNumber?: string;
  email?: string;
  phone?: string;
  address?: ExternalAddress;
  isActive: boolean;
  contactPerson?: string;
  currencyCode?: string;
  paymentTermDays?: number;
  creditLimit?: number;
}

export interface ExternalSupplier {
  externalId: string;
  supplierNumber: number;
  name: string;
  organizationNumber?: string;
  email?: string;
  phone?: string;
  address?: ExternalAddress;
  isActive: boolean;
  contactPerson?: string;
  currencyCode?: string;
  paymentTermDays?: number;
  bankAccountNumber?: string;
}

export interface ExternalAddress {
  street?: string;
  street2?: string;
  postalCode?: string;
  city?: string;
  country?: string;
}

export interface ExternalLedgerEntry {
  externalId: string;
  entityId: string;
  entityNumber: number;
  voucherNumber: number;
  voucherDate: Date;
  dueDate?: Date;
  invoiceNumber?: string;
  description: string;
  debitAmount: number;
  creditAmount: number;
  balance: number;
  currencyCode: string;
  currencyAmount?: number;
  isOpen: boolean;
  matchId?: string;
}

export interface ExternalInvoice {
  externalId: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  entityId: string;
  entityNumber: number;
  entityName: string;
  totalAmount: number;
  vatAmount: number;
  currencyCode: string;
  currencyAmount?: number;
  status: ExternalInvoiceStatus;
  reference?: string;
  lines: ExternalInvoiceLine[];
  paidAmount?: number;
  remainingAmount?: number;
  paymentDate?: Date;
}

export type ExternalInvoiceStatus =
  | "draft"
  | "sent"
  | "paid"
  | "partially_paid"
  | "overdue"
  | "credited"
  | "unknown";

export interface ExternalInvoiceLine {
  lineNumber: number;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  vatCode?: string;
  vatAmount?: number;
  accountNumber?: number;
  productCode?: string;
  departmentCode?: string;
  projectCode?: string;
}

export interface ExternalProject {
  externalId: string;
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
  startDate?: Date;
  endDate?: Date;
  managerId?: string;
}

export interface ExternalDepartment {
  externalId: string;
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
  managerId?: string;
  parentCode?: string;
}

// ---------------------------------------------------------------------------
// Query Parameters
// ---------------------------------------------------------------------------

export interface TransactionQueryParams {
  fromDate?: Date;
  toDate?: Date;
  fromVoucherNumber?: number;
  toVoucherNumber?: number;
  accountNumbers?: number[];
}

export interface LedgerQueryParams {
  entityId?: string;
  fromDate?: Date;
  toDate?: Date;
  openItemsOnly?: boolean;
}

export interface InvoiceQueryParams {
  fromDate?: Date;
  toDate?: Date;
  status?: ExternalInvoiceStatus;
  entityId?: string;
}

// ---------------------------------------------------------------------------
// Sync State
// ---------------------------------------------------------------------------

export type SyncResourceType =
  | "integration_info"
  | "financial_settings"
  | "chart_of_accounts"
  | "vat_codes"
  | "trial_balance"
  | "account_transactions"
  | "customers"
  | "customer_ledger"
  | "outgoing_invoices"
  | "suppliers"
  | "supplier_ledger"
  | "incoming_invoices"
  | "projects"
  | "departments";

export type SyncStatus = "pending" | "in_progress" | "completed" | "failed";

export interface SyncState {
  resourceType: SyncResourceType;
  status: SyncStatus;
  lastSyncedAt?: Date;
  lastError?: string;
  recordCount?: number;
  /** Provider-specific cursor for incremental sync */
  cursor?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Adapter Interface
// ---------------------------------------------------------------------------

export interface AccountingSystemAdapter {
  readonly provider: AccountingProvider;

  /** Establish connection using provider-specific credentials. */
  connect(credentials: ConnectorCredentials): Promise<ConnectionResult>;

  /** Verify that the current connection is still valid. */
  testConnection(): Promise<boolean>;

  /** Retrieve general information about the connected company. */
  getIntegrationInfo(): Promise<IntegrationInfo>;

  /** Retrieve financial settings (currency, fiscal year, VAT config). */
  getFinancialSettings(): Promise<FinancialSettings>;

  /** Full chart of accounts. */
  getChartOfAccounts(): Promise<ExternalGLAccount[]>;

  /** VAT / tax codes. */
  getVatCodes(): Promise<ExternalVatCode[]>;

  /** Trial balance as of a given date. */
  getTrialBalance(date: Date): Promise<ExternalTrialBalanceEntry[]>;

  /** General ledger account transactions. */
  getAccountTransactions(
    params: TransactionQueryParams
  ): Promise<ExternalTransaction[]>;

  /** Customer master data. */
  getCustomers(): Promise<ExternalCustomer[]>;

  /** Supplier / vendor master data. */
  getSuppliers(): Promise<ExternalSupplier[]>;

  /** Customer sub-ledger entries. */
  getCustomerLedger(params: LedgerQueryParams): Promise<ExternalLedgerEntry[]>;

  /** Supplier sub-ledger entries. */
  getSupplierLedger(params: LedgerQueryParams): Promise<ExternalLedgerEntry[]>;

  /** Outgoing (sales) invoices. */
  getOutgoingInvoices(params: InvoiceQueryParams): Promise<ExternalInvoice[]>;

  /** Incoming (purchase) invoices. */
  getIncomingInvoices(params: InvoiceQueryParams): Promise<ExternalInvoice[]>;

  /** Projects / cost centers. */
  getProjects(): Promise<ExternalProject[]>;

  /** Departments. */
  getDepartments(): Promise<ExternalDepartment[]>;
}
