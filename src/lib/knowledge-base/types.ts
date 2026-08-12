/**
 * Knowledge Base Types
 *
 * Type definitions for Elida's accounting knowledge engine.
 * Each "article" covers one specific accounting topic with explanations
 * at multiple levels, source references, risk assessment, and
 * evaluation criteria.
 *
 * Schema follows the Elida Knowledge Engine Masterprompt specification.
 */

// ---------------------------------------------------------------------------
// Core article type
// ---------------------------------------------------------------------------

export interface KnowledgeArticle {
  id: string | null;
  title: string;
  slug: string;
  category: ArticleCategory;
  subcategory: string;
  jurisdiction: "NO";
  company_types: CompanyType[];
  keywords: string[];
  search_phrases: string[];

  summary: string;
  beginner_explanation: string;
  professional_explanation: string;

  main_rule: string;
  exceptions: string[];

  accounting_treatment: string;
  vat_treatment: string;
  tax_treatment: string;

  documentation_requirements: string[];
  questions_to_ask_user: string[];
  recommended_accounts: RecommendedAccount[];

  poweroffice_guidance: string;

  examples: ArticleExample[];
  common_mistakes: string[];
  warning_signs: string[];
  related_topics: string[];

  risk_level: RiskLevel;
  confidence: ArticleConfidence;

  requires_professional_review: boolean;
  professional_review_reason: string;

  effective_from: string;
  effective_to: string | null;

  sources: ArticleSource[];
  last_researched_at: string;

  content_version: number;
  review_status: ReviewStatus;
}

// ---------------------------------------------------------------------------
// Information type classification
// ---------------------------------------------------------------------------

export type InformationType =
  | "RULE"
  | "INTERPRETATION"
  | "COMPANY_SPECIFIC_RECOMMENDATION";

// ---------------------------------------------------------------------------
// Enums / union types
// ---------------------------------------------------------------------------

export type ArticleCategory =
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
  | "poweroffice";

export type CompanyType = "AS" | "ENK" | "ANS" | "DA" | "NUF" | "SA";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export type ArticleConfidence = "HIGH" | "MEDIUM" | "LOW";

export type ReviewStatus =
  | "AI_GENERATED"
  | "NEEDS_REVIEW"
  | "REVIEWED"
  | "PUBLISHED";

// ---------------------------------------------------------------------------
// Sub-types
// ---------------------------------------------------------------------------

export interface RecommendedAccount {
  account_type: string;
  example_account_number: string;
  example_account_name: string;
  condition: string;
}

export interface ArticleExample {
  scenario: string;
  facts: string;
  likely_treatment: string;
  important_notes: string;
}

export interface ArticleSource {
  source_name: string;
  source_title: string;
  source_url: string;
  source_type: "PRIMARY" | "SECONDARY";
  published_or_updated_at: string | null;
  accessed_at: string;
  supports: string[];
}

// ---------------------------------------------------------------------------
// Evaluation / testing
// ---------------------------------------------------------------------------

export interface EvaluationQuestion {
  question: string;
  expected_topics: string[];
  required_clarifying_questions: string[];
  unacceptable_behavior: string[];
  expected_risk_level: RiskLevel;
}

// ---------------------------------------------------------------------------
// Deterministic rule type (for calculable rules)
// ---------------------------------------------------------------------------

export interface AccountingRule {
  id: string | null;
  rule_key: string;
  rule_type: "calculation" | "threshold" | "lookup";
  title: string;
  description: string;
  parameters: Record<string, number | string | boolean>;
  effective_from: string;
  effective_to: string | null;
  source: string;
  content_version: number;
}

// ---------------------------------------------------------------------------
// Batch task input
// ---------------------------------------------------------------------------

export interface ArticleTask {
  task: "CREATE_ARTICLE" | "UPDATE_ARTICLE" | "REVIEW_ARTICLE";
  topic: string;
  current_date: string;
  jurisdiction: "NO";
  target_company_types: CompanyType[];
  research_required: boolean;
}

// ---------------------------------------------------------------------------
// Needs-more-information response
// ---------------------------------------------------------------------------

export interface NeedsMoreInformation {
  needs_more_information: true;
  questions: string[];
}
