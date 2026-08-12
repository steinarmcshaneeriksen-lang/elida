/**
 * Accounting Advisor Types
 *
 * Type definitions for the accounting advisor module. The advisor
 * takes a description of a transaction and returns a structured
 * recommendation for how to book it in the Norwegian accounting system.
 *
 * These types are internal to the advisor; the existing
 * AccountingRecommendation in @/lib/types/assistant is the "external"
 * shape returned to the chat assistant. The advisor maps between them.
 */

import type { ConfidenceLevel } from "@/lib/types/database";

// ---------------------------------------------------------------------------
// Query — what the user wants help booking
// ---------------------------------------------------------------------------

/**
 * Input to the accounting advisor. Describes a transaction the user
 * wants guidance on how to record.
 */
export interface AccountingQuery {
  /** Company whose chart of accounts and history to use. */
  companyId: string;

  /** Free-text description of what was purchased or invoiced. */
  description: string;

  /** Vendor / supplier name, if known. */
  vendorName?: string;

  /** Transaction amount (positive). */
  amount?: number;

  /** ISO 4217 currency code (default NOK). */
  currency?: string;

  /** ISO 3166-1 alpha-2 country code of the vendor. */
  country?: string;

  /**
   * Pre-extracted document data from the DocumentAnalyzer.
   * When present the advisor can use line items, VAT breakdown, etc.
   */
  documentExtraction?: AdvisorDocumentExtraction;

  /**
   * An explicit question the user typed, e.g.
   * "Skal dette aktiveres eller kostnadsfoeres?"
   */
  userQuestion?: string;
}

// ---------------------------------------------------------------------------
// Recommendation — the advisor's output
// ---------------------------------------------------------------------------

export interface AccountingRecommendation {
  /** High-level classification, e.g. "Programvarelisens", "Kontorrekvisita". */
  classification: string;

  /** The single best-matching account in the company's chart of accounts. */
  recommended_account: AccountRef | null;

  /** Other plausible accounts, with a reason for each. */
  alternative_accounts: AlternativeAccount[];

  /** VAT treatment recommendation. */
  vat: VatRecommendation;

  /** Whether to expense immediately, capitalize, or flag for review. */
  treatment: "expense" | "capitalize" | "review_needed";

  /** Whether the cost should be periodized across multiple months. */
  periodization: boolean;

  /** Explanation of why periodization is or is not needed. */
  periodization_note?: string;

  /**
   * Confidence score from 0 to 1.
   * Maps to ConfidenceLevel thresholds:
   *   >= 0.9  confirmed
   *   >= 0.7  high_confidence
   *   >= 0.5  estimated
   *   >= 0.3  low_confidence
   *   <  0.3  rough_estimate
   */
  confidence: number;

  /** Overall risk of the recommendation being wrong or incomplete. */
  risk_level: "low" | "medium" | "high";

  /** Step-by-step reasoning in Norwegian. */
  reasoning_summary: string[];

  /** True if the advisor needs more information before it can give a final answer. */
  needs_user_input: boolean;

  /** Follow-up questions to ask the user (in Norwegian). */
  questions: string[];

  /** Instructions for posting in PowerOffice Go, if applicable. */
  poweroffice_instructions?: string[];

  /**
   * If set, the recommendation should be escalated to a human
   * accountant. Contains the reason in Norwegian.
   */
  escalation_note?: string;
}

// ---------------------------------------------------------------------------
// Sub-types used by the recommendation
// ---------------------------------------------------------------------------

export interface AccountRef {
  number: string;
  name: string;
}

export interface AlternativeAccount {
  number: string;
  name: string;
  reason: string;
}

export interface VatRecommendation {
  /** Human-readable recommendation in Norwegian. */
  recommendation: string;

  /** MVA-kode to use, e.g. "1" for standard 25%. */
  vat_code: string | null;

  /** The applicable VAT rate as a percentage, e.g. 25. */
  rate: number | null;

  /** Additional notes (e.g. reverse charge, representation limits). */
  notes: string;
}

// ---------------------------------------------------------------------------
// Similar transactions / vendor history
// ---------------------------------------------------------------------------

/** A historical transaction that matches the current query. */
export interface SimilarTransaction {
  /** The GL account number used. */
  account_number: string;

  /** Account name. */
  account_name: string;

  /** Transaction description. */
  description: string;

  /** Transaction date (ISO 8601). */
  date: string;

  /** Amount (signed: debit positive, credit negative). */
  amount: number;

  /** Currency. */
  currency: string;

  /** MVA-kode used. */
  vat_code: string | null;

  /** Vendor name if available. */
  vendor_name: string | null;
}

/** Aggregated posting history for a specific vendor. */
export interface VendorHistory {
  /** Vendor name. */
  vendor_name: string;

  /** The most frequently used account for this vendor. */
  typical_account: AccountRef | null;

  /** The most frequently used VAT code. */
  typical_vat_code: string | null;

  /** Number of historical transactions matched. */
  transaction_count: number;

  /** All distinct accounts used, with occurrence count. */
  accounts_used: Array<{
    account_number: string;
    account_name: string;
    count: number;
    total_amount: number;
  }>;

  /** Date range of matched transactions. */
  first_transaction_date: string | null;
  last_transaction_date: string | null;
}

// ---------------------------------------------------------------------------
// Document extraction (advisor-internal shape)
// ---------------------------------------------------------------------------

/**
 * Structured data extracted from an invoice, receipt, or credit note.
 * Produced by the DocumentAnalyzer.
 */
export interface AdvisorDocumentExtraction {
  document_type: "invoice" | "receipt" | "credit_note" | "unknown";

  supplier: {
    name: string | null;
    org_number: string | null;
    address: string | null;
    bank_account: string | null;
  };

  buyer: {
    name: string | null;
    org_number: string | null;
    address: string | null;
  };

  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  payment_reference: string | null;
  currency: string;
  country: string | null;

  lines: DocumentLineItem[];

  subtotal: number | null;
  vat_amounts: Array<{
    rate: number;
    base: number;
    amount: number;
  }>;
  total_amount: number | null;
  total_vat: number | null;

  /** Raw OCR / extracted text (for debugging, never stored). */
  raw_text: string | null;

  /** How confident the extraction is. */
  extraction_confidence: ConfidenceLevel;
}

export interface DocumentLineItem {
  line_number: number;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  vat_rate: number | null;
  account_suggestion: string | null;
}

// ---------------------------------------------------------------------------
// Company context fetched by the advisor
// ---------------------------------------------------------------------------

/** Company-specific context the advisor uses alongside general rules. */
export interface CompanyContext {
  company_id: string;
  company_name: string;
  org_number: string | null;
  industry: string | null;

  /** Whether the company is registered for VAT. */
  vat_registered: boolean;

  /** VAT reporting period. */
  vat_period: "monthly" | "bimonthly" | "quarterly" | "annual" | null;

  /** The company's actual chart of accounts. */
  chart_of_accounts: CompanyAccount[];

  /** The company's VAT codes. */
  vat_codes: CompanyVatCode[];
}

export interface CompanyAccount {
  account_number: string;
  name: string;
  is_active: boolean;
  account_type: string | null;
}

export interface CompanyVatCode {
  code: string;
  name: string | null;
  rate: number | null;
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// Rule types (used by the rules modules)
// ---------------------------------------------------------------------------

/** A Norwegian accounting rule with metadata and provenance. */
export interface AccountingRuleDefinition {
  id: string;
  category: string;
  title_nb: string;
  description_nb: string;
  effective_from: string;
  effective_to?: string;
  jurisdiction: "NO";
  source: string;
  thresholds?: Record<string, number>;
}

/** A VAT rule entry. */
export interface VatRuleDefinition {
  id: string;
  rate: number;
  category: string;
  title_nb: string;
  description_nb: string;
  effective_from: string;
  effective_to?: string;
  jurisdiction: "NO";
  source: string;
  deductible: boolean;
  special_conditions?: string;
}

/** A standard chart of accounts entry. */
export interface StandardAccountDefinition {
  number: string;
  name_nb: string;
  range_start: number;
  range_end: number;
  class_nb: string;
  typical_vat_code?: string;
  typical_use_nb: string;
}

/** A pre-built common booking scenario. */
export interface CommonScenario {
  id: string;
  name_nb: string;
  keywords: string[];
  typical_accounts: AccountRef[];
  vat_treatment: {
    rate: number | null;
    code: string | null;
    deductible: boolean;
    notes_nb: string;
  };
  treatment: "expense" | "capitalize" | "depends" | "review_needed";
  risk_level: "low" | "medium" | "high";
  notes_nb: string;
  conditions_nb?: string;
}

/** An escalation rule. */
export interface EscalationRule {
  id: string;
  category: string;
  title_nb: string;
  description_nb: string;
  keywords: string[];
  severity: "warning" | "block";
  message_nb: string;
}

// ---------------------------------------------------------------------------
// Confidence helpers
// ---------------------------------------------------------------------------

/**
 * Convert a numeric 0-1 confidence score to the ConfidenceLevel enum
 * used elsewhere in the application.
 */
export function toConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 0.9) return "confirmed";
  if (score >= 0.7) return "high_confidence";
  if (score >= 0.5) return "estimated";
  if (score >= 0.3) return "low_confidence";
  return "rough_estimate";
}
