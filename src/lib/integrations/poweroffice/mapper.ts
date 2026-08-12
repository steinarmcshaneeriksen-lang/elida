/**
 * PowerOffice Mapper
 *
 * Maps normalized External* types to our internal database model types.
 * Returns Partial<> so the caller can merge with company-specific fields
 * (companyId, integration IDs, etc.) before upserting.
 *
 * Internal model types are defined inline here until the Supabase-generated
 * Database types are available. They mirror the planned database schema.
 */

import type {
  ExternalGLAccount,
  ExternalVatCode,
  ExternalTrialBalanceEntry,
  ExternalTransaction,
  ExternalCustomer,
  ExternalSupplier,
  ExternalLedgerEntry,
  ExternalInvoice,
  ExternalProject,
  ExternalDepartment,
} from "../types";

// ---------------------------------------------------------------------------
// Internal Database Model Types (will move to shared types once DB is set up)
// ---------------------------------------------------------------------------

export interface GLAccount {
  id: string;
  company_id: string;
  account_number: number;
  name: string;
  description: string | null;
  is_active: boolean;
  account_type: string;
  vat_code: string | null;
  currency_code: string | null;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface VatCode {
  id: string;
  company_id: string;
  code: string;
  name: string;
  rate: number;
  is_active: boolean;
  description: string | null;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrialBalanceEntry {
  id: string;
  company_id: string;
  balance_date: string;
  account_number: number;
  account_name: string;
  opening_balance: number;
  debit: number;
  credit: number;
  closing_balance: number;
  currency_code: string | null;
  created_at: string;
}

export interface AccountTransaction {
  id: string;
  company_id: string;
  external_id: string | null;
  voucher_number: number;
  voucher_date: string;
  account_number: number;
  description: string;
  debit_amount: number;
  credit_amount: number;
  amount: number;
  currency_code: string;
  currency_amount: number | null;
  vat_code: string | null;
  vat_amount: number | null;
  department_code: string | null;
  project_code: string | null;
  customer_id: string | null;
  supplier_id: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  company_id: string;
  external_id: string | null;
  customer_number: number;
  name: string;
  organization_number: string | null;
  email: string | null;
  phone: string | null;
  address_street: string | null;
  address_street2: string | null;
  address_postal_code: string | null;
  address_city: string | null;
  address_country: string | null;
  is_active: boolean;
  contact_person: string | null;
  currency_code: string | null;
  payment_term_days: number | null;
  credit_limit: number | null;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  company_id: string;
  external_id: string | null;
  supplier_number: number;
  name: string;
  organization_number: string | null;
  email: string | null;
  phone: string | null;
  address_street: string | null;
  address_street2: string | null;
  address_postal_code: string | null;
  address_city: string | null;
  address_country: string | null;
  is_active: boolean;
  contact_person: string | null;
  currency_code: string | null;
  payment_term_days: number | null;
  bank_account_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface LedgerEntry {
  id: string;
  company_id: string;
  ledger_type: "customer" | "supplier";
  external_id: string | null;
  entity_id: string;
  entity_number: number;
  voucher_number: number;
  voucher_date: string;
  due_date: string | null;
  invoice_number: string | null;
  description: string;
  debit_amount: number;
  credit_amount: number;
  balance: number;
  currency_code: string;
  currency_amount: number | null;
  is_open: boolean;
  match_id: string | null;
  created_at: string;
}

export interface Invoice {
  id: string;
  company_id: string;
  invoice_type: "outgoing" | "incoming";
  external_id: string | null;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  entity_id: string;
  entity_number: number;
  entity_name: string;
  total_amount: number;
  vat_amount: number;
  currency_code: string;
  currency_amount: number | null;
  status: string;
  reference: string | null;
  paid_amount: number | null;
  remaining_amount: number | null;
  payment_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  company_id: string;
  external_id: string | null;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  manager_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: string;
  company_id: string;
  external_id: string | null;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  manager_id: string | null;
  parent_code: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

export class PowerOfficeMapper {
  /**
   * Map an external GL account to our internal model.
   */
  mapGLAccount(external: ExternalGLAccount): Partial<GLAccount> {
    return {
      account_number: external.accountNumber,
      name: external.name,
      description: external.description ?? null,
      is_active: external.isActive,
      account_type: external.accountType,
      vat_code: external.vatCode ?? null,
      currency_code: external.currencyCode ?? null,
      external_id: external.externalId,
    };
  }

  /**
   * Map an external VAT code to our internal model.
   */
  mapVatCode(external: ExternalVatCode): Partial<VatCode> {
    return {
      code: external.code,
      name: external.name,
      rate: external.rate,
      is_active: external.isActive,
      description: external.description ?? null,
      external_id: external.externalId,
    };
  }

  /**
   * Map an external trial balance entry to our internal model.
   */
  mapTrialBalanceEntry(
    external: ExternalTrialBalanceEntry,
    balanceDate: Date
  ): Partial<TrialBalanceEntry> {
    return {
      balance_date: balanceDate.toISOString().split("T")[0],
      account_number: external.accountNumber,
      account_name: external.accountName,
      opening_balance: external.openingBalance,
      debit: external.debit,
      credit: external.credit,
      closing_balance: external.closingBalance,
      currency_code: external.currencyCode ?? null,
    };
  }

  /**
   * Map an external transaction to our internal model.
   */
  mapTransaction(external: ExternalTransaction): Partial<AccountTransaction> {
    return {
      external_id: external.externalId,
      voucher_number: external.voucherNumber,
      voucher_date: external.voucherDate.toISOString().split("T")[0],
      account_number: external.accountNumber,
      description: external.description,
      debit_amount: external.debitAmount,
      credit_amount: external.creditAmount,
      amount: external.amount,
      currency_code: external.currencyCode,
      currency_amount: external.currencyAmount ?? null,
      vat_code: external.vatCode ?? null,
      vat_amount: external.vatAmount ?? null,
      department_code: external.departmentCode ?? null,
      project_code: external.projectCode ?? null,
      customer_id: external.customerId ?? null,
      supplier_id: external.supplierId ?? null,
    };
  }

  /**
   * Map an external customer to our internal model.
   */
  mapCustomer(external: ExternalCustomer): Partial<Customer> {
    return {
      external_id: external.externalId,
      customer_number: external.customerNumber,
      name: external.name,
      organization_number: external.organizationNumber ?? null,
      email: external.email ?? null,
      phone: external.phone ?? null,
      address_street: external.address?.street ?? null,
      address_street2: external.address?.street2 ?? null,
      address_postal_code: external.address?.postalCode ?? null,
      address_city: external.address?.city ?? null,
      address_country: external.address?.country ?? null,
      is_active: external.isActive,
      contact_person: external.contactPerson ?? null,
      currency_code: external.currencyCode ?? null,
      payment_term_days: external.paymentTermDays ?? null,
      credit_limit: external.creditLimit ?? null,
    };
  }

  /**
   * Map an external supplier to our internal model.
   */
  mapSupplier(external: ExternalSupplier): Partial<Supplier> {
    return {
      external_id: external.externalId,
      supplier_number: external.supplierNumber,
      name: external.name,
      organization_number: external.organizationNumber ?? null,
      email: external.email ?? null,
      phone: external.phone ?? null,
      address_street: external.address?.street ?? null,
      address_street2: external.address?.street2 ?? null,
      address_postal_code: external.address?.postalCode ?? null,
      address_city: external.address?.city ?? null,
      address_country: external.address?.country ?? null,
      is_active: external.isActive,
      contact_person: external.contactPerson ?? null,
      currency_code: external.currencyCode ?? null,
      payment_term_days: external.paymentTermDays ?? null,
      bank_account_number: external.bankAccountNumber ?? null,
    };
  }

  /**
   * Map an external ledger entry to our internal model.
   */
  mapLedgerEntry(
    external: ExternalLedgerEntry,
    ledgerType: "customer" | "supplier"
  ): Partial<LedgerEntry> {
    return {
      ledger_type: ledgerType,
      external_id: external.externalId,
      entity_id: external.entityId,
      entity_number: external.entityNumber,
      voucher_number: external.voucherNumber,
      voucher_date: external.voucherDate.toISOString().split("T")[0],
      due_date: external.dueDate
        ? external.dueDate.toISOString().split("T")[0]
        : null,
      invoice_number: external.invoiceNumber ?? null,
      description: external.description,
      debit_amount: external.debitAmount,
      credit_amount: external.creditAmount,
      balance: external.balance,
      currency_code: external.currencyCode,
      currency_amount: external.currencyAmount ?? null,
      is_open: external.isOpen,
      match_id: external.matchId ?? null,
    };
  }

  /**
   * Map an external invoice to our internal model.
   */
  mapInvoice(
    external: ExternalInvoice,
    invoiceType: "outgoing" | "incoming"
  ): Partial<Invoice> {
    return {
      invoice_type: invoiceType,
      external_id: external.externalId,
      invoice_number: external.invoiceNumber,
      invoice_date: external.invoiceDate.toISOString().split("T")[0],
      due_date: external.dueDate.toISOString().split("T")[0],
      entity_id: external.entityId,
      entity_number: external.entityNumber,
      entity_name: external.entityName,
      total_amount: external.totalAmount,
      vat_amount: external.vatAmount,
      currency_code: external.currencyCode,
      currency_amount: external.currencyAmount ?? null,
      status: external.status,
      reference: external.reference ?? null,
      paid_amount: external.paidAmount ?? null,
      remaining_amount: external.remainingAmount ?? null,
      payment_date: external.paymentDate
        ? external.paymentDate.toISOString().split("T")[0]
        : null,
    };
  }

  /**
   * Map an external project to our internal model.
   */
  mapProject(external: ExternalProject): Partial<Project> {
    return {
      external_id: external.externalId,
      code: external.code,
      name: external.name,
      description: external.description ?? null,
      is_active: external.isActive,
      start_date: external.startDate
        ? external.startDate.toISOString().split("T")[0]
        : null,
      end_date: external.endDate
        ? external.endDate.toISOString().split("T")[0]
        : null,
      manager_id: external.managerId ?? null,
    };
  }

  /**
   * Map an external department to our internal model.
   */
  mapDepartment(external: ExternalDepartment): Partial<Department> {
    return {
      external_id: external.externalId,
      code: external.code,
      name: external.name,
      description: external.description ?? null,
      is_active: external.isActive,
      manager_id: external.managerId ?? null,
      parent_code: external.parentCode ?? null,
    };
  }
}
