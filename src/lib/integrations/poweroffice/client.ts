/**
 * PowerOffice Go API v2 Client
 *
 * Low-level HTTP client for the PowerOffice Go REST API. Handles OAuth 2.0
 * authentication (Client Credentials), token caching, pagination, rate
 * limiting, and error handling.
 *
 * SECURITY: Client keys and tokens are never written to logs. Credentials
 * are masked in all error messages.
 */

// ---------------------------------------------------------------------------
// Types — PowerOffice API DTOs
// ---------------------------------------------------------------------------

/** Shape returned by the OAuth token endpoint. */
interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/** Paginated response envelope used by PowerOffice v2. */
interface PaginatedResponse<T> {
  data: T[];
  count: number;
  pageSize: number;
  page: number;
  totalCount: number;
}

/** Non-paginated single-object response. */
interface SingleResponse<T> {
  data: T;
}

// ---------------------------------------------------------------------------
// PowerOffice DTO shapes (partial — only fields we consume)
// ---------------------------------------------------------------------------

export interface POClientInfo {
  id: number;
  name: string;
  organizationNo: string;
  baseCurrencyCode: string;
  modules?: string[];
}

export interface POFinancialSettings {
  baseCurrencyCode: string;
  firstMonthOfFiscalYear: number;
  conversionDate?: string;
  isVatRegistered: boolean;
  vatReturnPeriod?: string;
}

export interface POGeneralLedgerAccount {
  id: number;
  accountNo: number;
  name: string;
  description?: string;
  isActive: boolean;
  accountType?: string;
  vatCode?: string;
  currencyCode?: string;
  departmentCode?: string;
  projectCode?: string;
}

export interface POVatCode {
  id: number;
  code: string;
  name: string;
  rate: number;
  isActive: boolean;
  description?: string;
}

export interface POTrialBalanceEntry {
  accountNo: number;
  accountName: string;
  incomingBalance: number;
  debit: number;
  credit: number;
  outgoingBalance: number;
  currencyCode?: string;
}

export interface POAccountTransaction {
  id: number;
  voucherNo: number;
  voucherDate: string;
  accountNo: number;
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
  customerId?: number;
  supplierId?: number;
  createdDateTimeOffset: string;
}

export interface POCustomer {
  id: number;
  customerNo: number;
  name: string;
  organizationNo?: string;
  emailAddress?: string;
  phoneNo?: string;
  mailingAddress?: POAddress;
  isActive: boolean;
  contactPerson?: string;
  currencyCode?: string;
  paymentTerms?: number;
  creditLimit?: number;
}

export interface POSupplier {
  id: number;
  supplierNo: number;
  name: string;
  organizationNo?: string;
  emailAddress?: string;
  phoneNo?: string;
  mailingAddress?: POAddress;
  isActive: boolean;
  contactPerson?: string;
  currencyCode?: string;
  paymentTerms?: number;
  bankAccountNo?: string;
}

export interface POAddress {
  address1?: string;
  address2?: string;
  zipCode?: string;
  city?: string;
  countryCode?: string;
}

export interface POLedgerEntry {
  id: number;
  contactId: number;
  contactNo: number;
  voucherNo: number;
  voucherDate: string;
  dueDate?: string;
  invoiceNo?: string;
  description: string;
  debitAmount: number;
  creditAmount: number;
  balance: number;
  currencyCode: string;
  currencyAmount?: number;
  isOpen: boolean;
  matchId?: string;
}

export interface POInvoice {
  id: number;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  contactId: number;
  contactNo: number;
  contactName: string;
  totalAmount: number;
  vatAmount: number;
  currencyCode: string;
  currencyAmount?: number;
  status: string;
  ourReference?: string;
  lines?: POInvoiceLine[];
  paidAmount?: number;
  remainingAmount?: number;
  paymentDate?: string;
}

export interface POInvoiceLine {
  lineNo: number;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  vatCode?: string;
  vatAmount?: number;
  accountNo?: number;
  productCode?: string;
  departmentCode?: string;
  projectCode?: string;
}

export interface POProject {
  id: number;
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
  startDate?: string;
  endDate?: string;
  managerId?: number;
}

export interface PODepartment {
  id: number;
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
  managerId?: number;
  parentCode?: string;
}

// ---------------------------------------------------------------------------
// Query Param Types
// ---------------------------------------------------------------------------

export interface POTransactionQueryParams {
  fromDate?: string;
  toDate?: string;
  fromVoucherNo?: number;
  toVoucherNo?: number;
  accountNos?: number[];
}

export interface POLedgerQueryParams {
  contactId?: number;
  fromDate?: string;
  toDate?: string;
  openItemsOnly?: boolean;
}

export interface POInvoiceQueryParams {
  fromDate?: string;
  toDate?: string;
  status?: string;
  contactId?: number;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class PowerOfficeApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly endpoint: string,
    public readonly responseBody?: string
  ) {
    super(message);
    this.name = "PowerOfficeApiError";
  }
}

export class PowerOfficeAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PowerOfficeAuthError";
  }
}

export class PowerOfficeRateLimitError extends PowerOfficeApiError {
  public readonly retryAfterMs: number;

  constructor(endpoint: string, retryAfterMs: number) {
    super(
      `Rate limited on ${endpoint}. Retry after ${retryAfterMs}ms.`,
      429,
      endpoint
    );
    this.name = "PowerOfficeRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const API_BASE_URL = "https://api.poweroffice.net/v2";
const AUTH_URL = "https://api.poweroffice.net/OAuth/Token";

/** Token validity minus safety margin (20 minutes minus 60 seconds). */
const TOKEN_LIFETIME_MS = 19 * 60 * 1000;

const DEFAULT_PAGE_SIZE = 5000;
const MAX_PAGE_SIZE = 20000;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_BASE_MS = 1000;

export class PowerOfficeClient {
  private readonly applicationKey: string;
  private readonly clientKey: string;
  private readonly subscriptionKey: string;

  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(config: {
    applicationKey: string;
    clientKey: string;
    subscriptionKey: string;
  }) {
    if (!config.applicationKey || !config.clientKey || !config.subscriptionKey) {
      throw new Error(
        "PowerOfficeClient requires applicationKey, clientKey, and subscriptionKey."
      );
    }
    this.applicationKey = config.applicationKey;
    this.clientKey = config.clientKey;
    this.subscriptionKey = config.subscriptionKey;
  }

  // -------------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------------

  /**
   * Acquire an OAuth 2.0 access token via Client Credentials grant.
   * Tokens are cached and reused until 1 minute before expiry.
   */
  async authenticate(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return; // token still valid
    }

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.applicationKey,
      client_secret: this.clientKey,
    });

    const response = await fetch(AUTH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Ocp-Apim-Subscription-Key": this.subscriptionKey,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      this.accessToken = null;
      this.tokenExpiresAt = 0;
      throw new PowerOfficeAuthError(
        `Authentication failed (HTTP ${response.status}). ` +
          "Verify that credentials are correct."
      );
    }

    const data = (await response.json()) as TokenResponse;
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + TOKEN_LIFETIME_MS;
  }

  // -------------------------------------------------------------------------
  // Generic request with retries & rate-limit handling
  // -------------------------------------------------------------------------

  /**
   * Make an authenticated API request.
   *
   * Handles:
   * - Automatic (re-)authentication
   * - Retry with exponential backoff on 429 / 5xx
   * - Credential masking in errors
   */
  async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    await this.authenticate();

    const url = this.buildUrl(path, params);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Ocp-Apim-Subscription-Key": this.subscriptionKey,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        return (await response.json()) as T;
      }

      // Rate limited
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const waitMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt);

        if (attempt === MAX_RETRIES) {
          throw new PowerOfficeRateLimitError(path, waitMs);
        }
        await this.sleep(waitMs);
        continue;
      }

      // Auth token expired mid-session — re-authenticate once
      if (response.status === 401 && attempt === 0) {
        this.accessToken = null;
        this.tokenExpiresAt = 0;
        await this.authenticate();
        continue;
      }

      // Retriable server errors
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        await this.sleep(RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt));
        continue;
      }

      // Non-retriable error
      const body = await response.text().catch(() => "");
      throw new PowerOfficeApiError(
        `PowerOffice API error on ${method} ${path}: HTTP ${response.status}`,
        response.status,
        path,
        this.maskSecrets(body)
      );
    }

    // Unreachable but satisfies the compiler
    throw new PowerOfficeApiError(
      `Max retries exceeded for ${method} ${path}`,
      0,
      path
    );
  }

  // -------------------------------------------------------------------------
  // Paginated fetching
  // -------------------------------------------------------------------------

  /**
   * Fetch all pages of a paginated endpoint, returning the merged data array.
   */
  async requestAllPages<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
    pageSize: number = DEFAULT_PAGE_SIZE
  ): Promise<T[]> {
    const effectivePageSize = Math.min(pageSize, MAX_PAGE_SIZE);
    const allData: T[] = [];
    let page = 1;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const response = await this.request<PaginatedResponse<T>>("GET", path, {
        ...params,
        page: page,
        pageSize: effectivePageSize,
      });

      allData.push(...response.data);

      if (allData.length >= response.totalCount || response.data.length === 0) {
        break;
      }
      page++;
    }

    return allData;
  }

  // -------------------------------------------------------------------------
  // Resource endpoints
  // -------------------------------------------------------------------------

  async getClientIntegrationInfo(): Promise<POClientInfo> {
    const response = await this.request<SingleResponse<POClientInfo>>(
      "GET",
      "/client"
    );
    return response.data;
  }

  async getFinancialSettings(): Promise<POFinancialSettings> {
    const response = await this.request<SingleResponse<POFinancialSettings>>(
      "GET",
      "/financial-settings"
    );
    return response.data;
  }

  async getGeneralLedgerAccounts(): Promise<POGeneralLedgerAccount[]> {
    return this.requestAllPages<POGeneralLedgerAccount>(
      "/general-ledger-accounts"
    );
  }

  async getVatCodes(): Promise<POVatCode[]> {
    return this.requestAllPages<POVatCode>("/vat-codes");
  }

  async getTrialBalance(date: Date): Promise<POTrialBalanceEntry[]> {
    const dateStr = this.formatDate(date);
    return this.requestAllPages<POTrialBalanceEntry>("/trial-balance", {
      date: dateStr,
    });
  }

  async getAccountTransactions(
    params: POTransactionQueryParams = {}
  ): Promise<POAccountTransaction[]> {
    const queryParams: Record<string, string | number | boolean | undefined> =
      {};

    if (params.fromDate) queryParams.fromDate = params.fromDate;
    if (params.toDate) queryParams.toDate = params.toDate;
    if (params.fromVoucherNo !== undefined)
      queryParams.fromVoucherNo = params.fromVoucherNo;
    if (params.toVoucherNo !== undefined)
      queryParams.toVoucherNo = params.toVoucherNo;
    if (params.accountNos?.length)
      queryParams.accountNos = params.accountNos.join(",");

    return this.requestAllPages<POAccountTransaction>(
      "/account-transactions",
      queryParams
    );
  }

  async getCustomers(): Promise<POCustomer[]> {
    return this.requestAllPages<POCustomer>("/customers");
  }

  async getSuppliers(): Promise<POSupplier[]> {
    return this.requestAllPages<POSupplier>("/suppliers");
  }

  async getCustomerLedger(
    params: POLedgerQueryParams = {}
  ): Promise<POLedgerEntry[]> {
    const queryParams: Record<string, string | number | boolean | undefined> =
      {};

    if (params.contactId !== undefined)
      queryParams.contactId = params.contactId;
    if (params.fromDate) queryParams.fromDate = params.fromDate;
    if (params.toDate) queryParams.toDate = params.toDate;
    if (params.openItemsOnly !== undefined)
      queryParams.openItemsOnly = params.openItemsOnly;

    return this.requestAllPages<POLedgerEntry>(
      "/customer-ledger",
      queryParams
    );
  }

  async getSupplierLedger(
    params: POLedgerQueryParams = {}
  ): Promise<POLedgerEntry[]> {
    const queryParams: Record<string, string | number | boolean | undefined> =
      {};

    if (params.contactId !== undefined)
      queryParams.contactId = params.contactId;
    if (params.fromDate) queryParams.fromDate = params.fromDate;
    if (params.toDate) queryParams.toDate = params.toDate;
    if (params.openItemsOnly !== undefined)
      queryParams.openItemsOnly = params.openItemsOnly;

    return this.requestAllPages<POLedgerEntry>(
      "/supplier-ledger",
      queryParams
    );
  }

  async getOutgoingInvoices(
    params: POInvoiceQueryParams = {}
  ): Promise<POInvoice[]> {
    const queryParams: Record<string, string | number | boolean | undefined> =
      {};

    if (params.fromDate) queryParams.fromDate = params.fromDate;
    if (params.toDate) queryParams.toDate = params.toDate;
    if (params.status) queryParams.status = params.status;
    if (params.contactId !== undefined)
      queryParams.contactId = params.contactId;

    return this.requestAllPages<POInvoice>("/outgoing-invoices", queryParams);
  }

  async getIncomingInvoices(
    params: POInvoiceQueryParams = {}
  ): Promise<POInvoice[]> {
    const queryParams: Record<string, string | number | boolean | undefined> =
      {};

    if (params.fromDate) queryParams.fromDate = params.fromDate;
    if (params.toDate) queryParams.toDate = params.toDate;
    if (params.status) queryParams.status = params.status;
    if (params.contactId !== undefined)
      queryParams.contactId = params.contactId;

    return this.requestAllPages<POInvoice>("/incoming-invoices", queryParams);
  }

  async getProjects(): Promise<POProject[]> {
    return this.requestAllPages<POProject>("/projects");
  }

  async getDepartments(): Promise<PODepartment[]> {
    return this.requestAllPages<PODepartment>("/departments");
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private buildUrl(
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): string {
    const url = new URL(`${API_BASE_URL}${path}`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }

  private formatDate(date: Date): string {
    return date.toISOString().split("T")[0];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Remove anything that looks like a key, token, or secret from a string
   * so it is safe to include in error messages or logs.
   */
  private maskSecrets(text: string): string {
    // Replace long hex/base64 sequences (tokens, keys)
    return text.replace(
      /[A-Za-z0-9+/=_-]{20,}/g,
      "[REDACTED]"
    );
  }
}
