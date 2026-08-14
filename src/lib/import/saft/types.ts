/**
 * SAF-T Regnskap types
 *
 * SAF-T Regnskap (Standard Audit File - Tax) is the XML export format that
 * every bookkeeping-obligated Norwegian business must be able to produce on
 * demand from Skatteetaten (bokføringsforskriften § 7-8). Because the format
 * is mandated, every Norwegian accounting system supports it — which makes it
 * a universal import path that works regardless of which system the customer
 * uses.
 *
 * These types describe the subset of SAF-T v1.3 that Elida imports.
 */

export interface SaftFile {
  header: SaftHeader;
  accounts: SaftAccount[];
  customers: SaftParty[];
  suppliers: SaftParty[];
  taxCodes: SaftTaxCode[];
  analysisEntries: SaftAnalysisEntry[];
  journals: SaftJournal[];
}

export interface SaftHeader {
  auditFileVersion: string | null;
  companyName: string | null;
  registrationNumber: string | null;
  defaultCurrency: string;
  periodStart: string | null;
  periodEnd: string | null;
  /** Software that produced the file, e.g. "Tripletex", "Fiken". */
  softwareName: string | null;
}

export interface SaftAccount {
  accountId: string;
  description: string | null;
  /** Norwegian standard account (NS 4102) reference, when supplied. */
  standardAccountId: string | null;
  accountType: string | null;

  /**
   * Balances as stated in the file, signed debit-positive. A balance-sheet
   * figure must come from here: the postings in the file cover only its own
   * period, so summing them omits everything carried in from earlier years.
   */
  openingBalance: number | null;
  closingBalance: number | null;
}

export interface SaftParty {
  /** Customer/supplier number in the source system. */
  partyId: string;
  name: string;
  registrationNumber: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  country: string | null;

  /**
   * Balances as stated by the source system. SAF-T reports these as separate
   * debit and credit figures; `closingBalance` is the signed net, positive
   * when the party owes us (a customer receivable) and positive for what we
   * owe a supplier after the sign convention is applied at import.
   */
  openingBalance: number | null;
  closingBalance: number | null;
}

export interface SaftTaxCode {
  code: string;
  description: string | null;
  percentage: number | null;
  /** Skatteetaten's standard VAT code. */
  standardCode: string | null;
}

export interface SaftAnalysisEntry {
  /** e.g. "AVDELING" / "DEPARTMENT" / "PROSJEKT" / "PROJECT". */
  analysisType: string;
  analysisId: string;
  description: string | null;
}

export interface SaftJournal {
  journalId: string | null;
  description: string | null;
  transactions: SaftTransaction[];
}

export interface SaftTransaction {
  transactionId: string | null;
  transactionDate: string | null;
  description: string | null;
  /** Voucher number, when the source system supplies a numeric one. */
  voucherNumber: number | null;
  lines: SaftLine[];
}

export interface SaftLine {
  recordId: string | null;
  accountId: string;
  description: string | null;
  /** Debit-positive, credit-negative — matches account_transactions.amount. */
  amount: number;
  currency: string | null;
  currencyAmount: number | null;
  vatCode: string | null;
  vatAmount: number | null;
  customerId: string | null;
  supplierId: string | null;
  departmentCode: string | null;
  projectCode: string | null;
  valueDate: string | null;
}

// ---------------------------------------------------------------------------
// Import result
// ---------------------------------------------------------------------------

export interface SaftImportResult {
  header: SaftHeader;
  counts: SaftImportCounts;
  /** Non-fatal problems worth surfacing to the user. */
  warnings: string[];
  /** Every financial year the company now holds data for, ascending. */
  years: number[];
}

export interface SaftImportCounts {
  accounts: number;
  customers: number;
  suppliers: number;
  taxCodes: number;
  departments: number;
  projects: number;
  vouchers: number;
  transactions: number;
}

export class SaftParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaftParseError";
  }
}
