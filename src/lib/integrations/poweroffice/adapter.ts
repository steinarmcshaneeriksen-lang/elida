/**
 * PowerOffice Go Adapter
 *
 * Implements AccountingSystemAdapter for PowerOffice Go. Translates between
 * PowerOffice-specific DTOs and our normalized External* types.
 */

import type {
  AccountingSystemAdapter,
  ConnectionResult,
  ConnectorCredentials,
  ExternalCustomer,
  ExternalDepartment,
  ExternalGLAccount,
  ExternalAccountType,
  ExternalInvoice,
  ExternalInvoiceLine,
  ExternalInvoiceStatus,
  ExternalLedgerEntry,
  ExternalProject,
  ExternalSupplier,
  ExternalTransaction,
  ExternalTrialBalanceEntry,
  ExternalVatCode,
  FinancialSettings,
  IntegrationInfo,
  InvoiceQueryParams,
  LedgerQueryParams,
  TransactionQueryParams,
} from "../types";

import {
  PowerOfficeClient,
  PowerOfficeAuthError,
  type POGeneralLedgerAccount,
  type POVatCode,
  type POTrialBalanceEntry,
  type POAccountTransaction,
  type POCustomer,
  type POSupplier,
  type POLedgerEntry,
  type POInvoice,
  type POInvoiceLine,
  type POProject,
  type PODepartment,
} from "./client";

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class PowerOfficeAdapter implements AccountingSystemAdapter {
  readonly provider = "poweroffice" as const;

  private client: PowerOfficeClient | null = null;

  // -------------------------------------------------------------------------
  // Connection
  // -------------------------------------------------------------------------

  async connect(credentials: ConnectorCredentials): Promise<ConnectionResult> {
    const { applicationKey, clientKey, subscriptionKey } = credentials;

    if (!applicationKey || !clientKey || !subscriptionKey) {
      return {
        success: false,
        provider: this.provider,
        error:
          "Missing required credentials: applicationKey, clientKey, subscriptionKey",
      };
    }

    this.client = new PowerOfficeClient({
      applicationKey,
      clientKey,
      subscriptionKey,
    });

    try {
      await this.client.authenticate();
      const info = await this.client.getClientIntegrationInfo();

      return {
        success: true,
        provider: this.provider,
        companyName: info.name,
        organizationNumber: info.organizationNo,
      };
    } catch (error) {
      this.client = null;

      const message =
        error instanceof PowerOfficeAuthError
          ? "Authentication failed. Verify credentials."
          : error instanceof Error
            ? error.message
            : "Unknown connection error";

      return {
        success: false,
        provider: this.provider,
        error: message,
      };
    }
  }

  async testConnection(): Promise<boolean> {
    const client = this.getClient();
    try {
      await client.getClientIntegrationInfo();
      return true;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Data retrieval — delegates to client, maps to External* types
  // -------------------------------------------------------------------------

  async getIntegrationInfo(): Promise<IntegrationInfo> {
    const client = this.getClient();
    const info = await client.getClientIntegrationInfo();

    return {
      provider: this.provider,
      companyName: info.name,
      organizationNumber: info.organizationNo,
      baseCurrency: info.baseCurrencyCode,
      fiscalYearStartMonth: 1, // overridden by financial settings
      modules: info.modules ?? [],
      apiVersion: "v2",
    };
  }

  async getFinancialSettings(): Promise<FinancialSettings> {
    const client = this.getClient();
    const settings = await client.getFinancialSettings();

    return {
      baseCurrency: settings.baseCurrencyCode,
      fiscalYearStartMonth: settings.firstMonthOfFiscalYear,
      conversionDate: settings.conversionDate
        ? new Date(settings.conversionDate)
        : undefined,
      vatRegistered: settings.isVatRegistered,
      vatPeriod: mapVatPeriod(settings.vatReturnPeriod),
    };
  }

  async getChartOfAccounts(): Promise<ExternalGLAccount[]> {
    const accounts = await this.getClient().getGeneralLedgerAccounts();
    return accounts.map(mapGLAccount);
  }

  async getVatCodes(): Promise<ExternalVatCode[]> {
    const codes = await this.getClient().getVatCodes();
    return codes.map(mapVatCode);
  }

  async getTrialBalance(date: Date): Promise<ExternalTrialBalanceEntry[]> {
    const entries = await this.getClient().getTrialBalance(date);
    return entries.map(mapTrialBalanceEntry);
  }

  async getAccountTransactions(
    params: TransactionQueryParams
  ): Promise<ExternalTransaction[]> {
    const poParams = {
      fromDate: params.fromDate
        ? formatDate(params.fromDate)
        : undefined,
      toDate: params.toDate ? formatDate(params.toDate) : undefined,
      fromVoucherNo: params.fromVoucherNumber,
      toVoucherNo: params.toVoucherNumber,
      accountNos: params.accountNumbers,
    };

    const transactions = await this.getClient().getAccountTransactions(poParams);
    return transactions.map(mapTransaction);
  }

  async getCustomers(): Promise<ExternalCustomer[]> {
    const customers = await this.getClient().getCustomers();
    return customers.map(mapCustomer);
  }

  async getSuppliers(): Promise<ExternalSupplier[]> {
    const suppliers = await this.getClient().getSuppliers();
    return suppliers.map(mapSupplier);
  }

  async getCustomerLedger(
    params: LedgerQueryParams
  ): Promise<ExternalLedgerEntry[]> {
    const poParams = {
      contactId: params.entityId ? parseInt(params.entityId, 10) : undefined,
      fromDate: params.fromDate
        ? formatDate(params.fromDate)
        : undefined,
      toDate: params.toDate ? formatDate(params.toDate) : undefined,
      openItemsOnly: params.openItemsOnly,
    };

    const entries = await this.getClient().getCustomerLedger(poParams);
    return entries.map(mapLedgerEntry);
  }

  async getSupplierLedger(
    params: LedgerQueryParams
  ): Promise<ExternalLedgerEntry[]> {
    const poParams = {
      contactId: params.entityId ? parseInt(params.entityId, 10) : undefined,
      fromDate: params.fromDate
        ? formatDate(params.fromDate)
        : undefined,
      toDate: params.toDate ? formatDate(params.toDate) : undefined,
      openItemsOnly: params.openItemsOnly,
    };

    const entries = await this.getClient().getSupplierLedger(poParams);
    return entries.map(mapLedgerEntry);
  }

  async getOutgoingInvoices(
    params: InvoiceQueryParams
  ): Promise<ExternalInvoice[]> {
    const poParams = {
      fromDate: params.fromDate
        ? formatDate(params.fromDate)
        : undefined,
      toDate: params.toDate ? formatDate(params.toDate) : undefined,
      status: params.status,
      contactId: params.entityId
        ? parseInt(params.entityId, 10)
        : undefined,
    };

    const invoices = await this.getClient().getOutgoingInvoices(poParams);
    return invoices.map(mapInvoice);
  }

  async getIncomingInvoices(
    params: InvoiceQueryParams
  ): Promise<ExternalInvoice[]> {
    const poParams = {
      fromDate: params.fromDate
        ? formatDate(params.fromDate)
        : undefined,
      toDate: params.toDate ? formatDate(params.toDate) : undefined,
      status: params.status,
      contactId: params.entityId
        ? parseInt(params.entityId, 10)
        : undefined,
    };

    const invoices = await this.getClient().getIncomingInvoices(poParams);
    return invoices.map(mapInvoice);
  }

  async getProjects(): Promise<ExternalProject[]> {
    const projects = await this.getClient().getProjects();
    return projects.map(mapProject);
  }

  async getDepartments(): Promise<ExternalDepartment[]> {
    const departments = await this.getClient().getDepartments();
    return departments.map(mapDepartment);
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /**
   * Return the connected client or throw if not yet connected.
   */
  private getClient(): PowerOfficeClient {
    if (!this.client) {
      throw new Error(
        "PowerOfficeAdapter is not connected. Call connect() first."
      );
    }
    return this.client;
  }
}

// ---------------------------------------------------------------------------
// Mapping functions  (PowerOffice DTO -> External*)
// ---------------------------------------------------------------------------

function mapGLAccount(po: POGeneralLedgerAccount): ExternalGLAccount {
  return {
    externalId: String(po.id),
    accountNumber: po.accountNo,
    name: po.name,
    description: po.description,
    isActive: po.isActive,
    accountType: mapAccountType(po.accountNo, po.accountType),
    vatCode: po.vatCode,
    currencyCode: po.currencyCode,
    department: po.departmentCode,
    project: po.projectCode,
  };
}

/**
 * Derive account type from the Norwegian standard chart of accounts (NS 4102)
 * account number ranges when the API does not provide an explicit type.
 */
function mapAccountType(
  accountNo: number,
  poType?: string
): ExternalAccountType {
  if (poType) {
    const normalized = poType.toLowerCase();
    if (normalized.includes("asset") || normalized.includes("eiendel"))
      return "asset";
    if (normalized.includes("liabilit") || normalized.includes("gjeld"))
      return "liability";
    if (normalized.includes("equity") || normalized.includes("egenkapital"))
      return "equity";
    if (normalized.includes("revenue") || normalized.includes("inntekt"))
      return "revenue";
    if (normalized.includes("expense") || normalized.includes("kostnad"))
      return "expense";
  }

  // Fall back to NS 4102 ranges
  if (accountNo >= 1000 && accountNo < 2000) return "asset";
  if (accountNo >= 2000 && accountNo < 2100) return "equity";
  if (accountNo >= 2100 && accountNo < 3000) return "liability";
  if (accountNo >= 3000 && accountNo < 4000) return "revenue";
  if (accountNo >= 4000 && accountNo < 9000) return "expense";

  return "unknown";
}

function mapVatCode(po: POVatCode): ExternalVatCode {
  return {
    externalId: String(po.id),
    code: po.code,
    name: po.name,
    rate: po.rate,
    isActive: po.isActive,
    description: po.description,
  };
}

function mapTrialBalanceEntry(
  po: POTrialBalanceEntry
): ExternalTrialBalanceEntry {
  return {
    accountNumber: po.accountNo,
    accountName: po.accountName,
    openingBalance: po.incomingBalance,
    debit: po.debit,
    credit: po.credit,
    closingBalance: po.outgoingBalance,
    currencyCode: po.currencyCode,
  };
}

function mapTransaction(po: POAccountTransaction): ExternalTransaction {
  return {
    externalId: String(po.id),
    voucherNumber: po.voucherNo,
    voucherDate: new Date(po.voucherDate),
    accountNumber: po.accountNo,
    description: po.description,
    debitAmount: po.debitAmount,
    creditAmount: po.creditAmount,
    amount: po.amount,
    currencyCode: po.currencyCode,
    currencyAmount: po.currencyAmount,
    vatCode: po.vatCode,
    vatAmount: po.vatAmount,
    departmentCode: po.departmentCode,
    projectCode: po.projectCode,
    customerId: po.customerId ? String(po.customerId) : undefined,
    supplierId: po.supplierId ? String(po.supplierId) : undefined,
    createdAt: new Date(po.createdDateTimeOffset),
  };
}

function mapCustomer(po: POCustomer): ExternalCustomer {
  return {
    externalId: String(po.id),
    customerNumber: po.customerNo,
    name: po.name,
    organizationNumber: po.organizationNo,
    email: po.emailAddress,
    phone: po.phoneNo,
    address: po.mailingAddress
      ? {
          street: po.mailingAddress.address1,
          street2: po.mailingAddress.address2,
          postalCode: po.mailingAddress.zipCode,
          city: po.mailingAddress.city,
          country: po.mailingAddress.countryCode,
        }
      : undefined,
    isActive: po.isActive,
    contactPerson: po.contactPerson,
    currencyCode: po.currencyCode,
    paymentTermDays: po.paymentTerms,
    creditLimit: po.creditLimit,
  };
}

function mapSupplier(po: POSupplier): ExternalSupplier {
  return {
    externalId: String(po.id),
    supplierNumber: po.supplierNo,
    name: po.name,
    organizationNumber: po.organizationNo,
    email: po.emailAddress,
    phone: po.phoneNo,
    address: po.mailingAddress
      ? {
          street: po.mailingAddress.address1,
          street2: po.mailingAddress.address2,
          postalCode: po.mailingAddress.zipCode,
          city: po.mailingAddress.city,
          country: po.mailingAddress.countryCode,
        }
      : undefined,
    isActive: po.isActive,
    contactPerson: po.contactPerson,
    currencyCode: po.currencyCode,
    paymentTermDays: po.paymentTerms,
    bankAccountNumber: po.bankAccountNo,
  };
}

function mapLedgerEntry(po: POLedgerEntry): ExternalLedgerEntry {
  return {
    externalId: String(po.id),
    entityId: String(po.contactId),
    entityNumber: po.contactNo,
    voucherNumber: po.voucherNo,
    voucherDate: new Date(po.voucherDate),
    dueDate: po.dueDate ? new Date(po.dueDate) : undefined,
    invoiceNumber: po.invoiceNo,
    description: po.description,
    debitAmount: po.debitAmount,
    creditAmount: po.creditAmount,
    balance: po.balance,
    currencyCode: po.currencyCode,
    currencyAmount: po.currencyAmount,
    isOpen: po.isOpen,
    matchId: po.matchId,
  };
}

function mapInvoice(po: POInvoice): ExternalInvoice {
  return {
    externalId: String(po.id),
    invoiceNumber: po.invoiceNo,
    invoiceDate: new Date(po.invoiceDate),
    dueDate: new Date(po.dueDate),
    entityId: String(po.contactId),
    entityNumber: po.contactNo,
    entityName: po.contactName,
    totalAmount: po.totalAmount,
    vatAmount: po.vatAmount,
    currencyCode: po.currencyCode,
    currencyAmount: po.currencyAmount,
    status: mapInvoiceStatus(po.status),
    reference: po.ourReference,
    lines: (po.lines ?? []).map(mapInvoiceLine),
    paidAmount: po.paidAmount,
    remainingAmount: po.remainingAmount,
    paymentDate: po.paymentDate ? new Date(po.paymentDate) : undefined,
  };
}

function mapInvoiceLine(po: POInvoiceLine): ExternalInvoiceLine {
  return {
    lineNumber: po.lineNo,
    description: po.description,
    quantity: po.quantity,
    unitPrice: po.unitPrice,
    amount: po.amount,
    vatCode: po.vatCode,
    vatAmount: po.vatAmount,
    accountNumber: po.accountNo,
    productCode: po.productCode,
    departmentCode: po.departmentCode,
    projectCode: po.projectCode,
  };
}

function mapInvoiceStatus(poStatus: string): ExternalInvoiceStatus {
  const normalized = poStatus.toLowerCase();
  if (normalized === "draft") return "draft";
  if (normalized === "sent" || normalized === "approved") return "sent";
  if (normalized === "paid" || normalized === "settled") return "paid";
  if (normalized === "partiallypaid" || normalized === "partially_paid")
    return "partially_paid";
  if (normalized === "overdue") return "overdue";
  if (normalized === "credited" || normalized === "creditnote")
    return "credited";
  return "unknown";
}

function mapProject(po: POProject): ExternalProject {
  return {
    externalId: String(po.id),
    code: po.code,
    name: po.name,
    description: po.description,
    isActive: po.isActive,
    startDate: po.startDate ? new Date(po.startDate) : undefined,
    endDate: po.endDate ? new Date(po.endDate) : undefined,
    managerId: po.managerId ? String(po.managerId) : undefined,
  };
}

function mapDepartment(po: PODepartment): ExternalDepartment {
  return {
    externalId: String(po.id),
    code: po.code,
    name: po.name,
    description: po.description,
    isActive: po.isActive,
    managerId: po.managerId ? String(po.managerId) : undefined,
    parentCode: po.parentCode,
  };
}

function mapVatPeriod(
  period?: string
): "monthly" | "bimonthly" | "quarterly" | "annual" | undefined {
  if (!period) return undefined;
  const normalized = period.toLowerCase();
  if (normalized.includes("month") && !normalized.includes("bi"))
    return "monthly";
  if (normalized.includes("bimonth") || normalized.includes("twomonth"))
    return "bimonthly";
  if (normalized.includes("quarter")) return "quarterly";
  if (normalized.includes("annual") || normalized.includes("year"))
    return "annual";
  return undefined;
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}
