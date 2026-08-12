import type { ConfidenceLevel } from "./database";

// ─── Intent classification ──────────────────────────────────────────────────

export enum AssistantIntent {
  FINANCIAL_QUERY = "financial_query",
  ACCOUNTING_ADVICE = "accounting_advice",
  SCENARIO_ANALYSIS = "scenario_analysis",
  DOCUMENT_ACCOUNTING_ADVICE = "document_accounting_advice",
  GENERAL = "general",
}

// ─── Tool interaction ───────────────────────────────────────────────────────

export interface ToolCall {
  id: string;
  tool_name: string;
  parameters: Record<string, unknown>;
}

export interface ToolResult {
  tool_call_id: string;
  tool_name: string;
  result: unknown;
  error: string | null;
  execution_time_ms: number;
}

// ─── Response types ─────────────────────────────────────────────────────────

export interface AssistantResponse {
  content: string;
  intent: AssistantIntent;
  tool_calls: ToolCall[];
  tool_results: ToolResult[];
  structured_data: Record<string, unknown> | null;
  evidence: ResponseEvidence | null;
  follow_up_suggestions: string[];
}

export interface ResponseEvidence {
  metric_ids: string[];
  transaction_ids: string[];
  invoice_ids: string[];
  calculation_version: string;
  source_period_start: string | null;
  source_period_end: string | null;
  comparison_period_start: string | null;
  comparison_period_end: string | null;
  data: Record<string, unknown>;
}

// ─── Accounting recommendation (for document analysis) ──────────────────────

export type RiskLevel = "low" | "medium" | "high";

export interface AccountingRecommendation {
  classification: string;
  recommended_account: {
    account_number: string;
    account_name: string;
  };
  vat: {
    code: string;
    rate: number;
    deductible: boolean;
    explanation: string;
  };
  treatment: {
    description: string;
    debit_account: string;
    credit_account: string;
    amount: number;
    vat_amount: number;
  };
  periodization: {
    required: boolean;
    start_date: string | null;
    end_date: string | null;
    monthly_amount: number | null;
    explanation: string | null;
  };
  confidence: ConfidenceLevel;
  reasoning_summary: string;
  needs_user_input: boolean;
  questions: string[];
  risk_level: RiskLevel;
}

// ─── Document extraction (from invoice / receipt images or PDFs) ────────────

export interface DocumentExtraction {
  document_type: "invoice" | "receipt" | "credit_note" | "unknown";
  vendor: {
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
  lines: DocumentLine[];
  subtotal: number | null;
  vat_amounts: Array<{
    rate: number;
    base: number;
    amount: number;
  }>;
  total_amount: number | null;
  total_vat: number | null;
  raw_text: string | null;
  extraction_confidence: ConfidenceLevel;
}

export interface DocumentLine {
  line_number: number;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  vat_rate: number | null;
  account_suggestion: string | null;
}
