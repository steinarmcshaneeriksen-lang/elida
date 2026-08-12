import type { ConfidenceLevel } from "./database";

// ─── Financial summaries ────────────────────────────────────────────────────

export interface FinancialSummary {
  period_start: string;
  period_end: string;
  revenue: RevenueAnalysis;
  profit: ProfitAnalysis;
  costs: CostAnalysis;
  cash_flow: CashFlowForecast;
  vat: VatEstimate;
  tax: TaxEstimate;
  receivables: CustomerReceivablesSummary;
  payables: SupplierPayablesSummary;
  confidence: ConfidenceLevel;
  calculated_at: string;
}

export interface RevenueAnalysis {
  total: number;
  by_category: Record<string, number>;
  by_customer_top: Array<{ customer_id: string; customer_name: string; amount: number }>;
  previous_period_total: number | null;
  change_amount: number | null;
  change_percent: number | null;
  trend_direction: "up" | "down" | "stable";
}

export interface ProfitAnalysis {
  gross_profit: number;
  gross_margin_percent: number;
  operating_profit: number;
  operating_margin_percent: number;
  net_profit: number;
  net_margin_percent: number;
  previous_period_net_profit: number | null;
  change_amount: number | null;
  change_percent: number | null;
}

export interface CostAnalysis {
  total: number;
  by_category: Record<string, number>;
  cost_of_goods_sold: number;
  payroll_costs: number;
  other_operating_costs: number;
  depreciation: number;
  financial_costs: number;
  largest_increases: ChangeDriver[];
  previous_period_total: number | null;
  change_percent: number | null;
}

// ─── Forecasts and projections ──────────────────────────────────────────────

export interface CashFlowForecast {
  current_balance: number;
  projected_inflows: number;
  projected_outflows: number;
  projected_balance: number;
  horizon_days: number;
  daily_projections: Array<{
    date: string;
    inflows: number;
    outflows: number;
    balance: number;
  }>;
  upcoming_obligations: UpcomingObligation[];
  minimum_projected_balance: number;
  minimum_balance_date: string;
  confidence: ConfidenceLevel;
}

export interface VatEstimate {
  period: string;
  output_vat: number;
  input_vat: number;
  net_vat_payable: number;
  due_date: string;
  breakdown_by_rate: Array<{
    rate: number;
    base_amount: number;
    vat_amount: number;
  }>;
  confidence: ConfidenceLevel;
}

export interface TaxEstimate {
  estimated_taxable_income: number;
  estimated_tax: number;
  effective_rate: number;
  tax_year: number;
  adjustments: Array<{
    description: string;
    amount: number;
  }>;
  confidence: ConfidenceLevel;
}

// ─── Receivables and payables ───────────────────────────────────────────────

export interface CustomerReceivablesSummary {
  total_outstanding: number;
  total_overdue: number;
  count_outstanding: number;
  count_overdue: number;
  aging: AgingBucket[];
  top_debtors: Array<{
    customer_id: string;
    customer_name: string;
    outstanding: number;
    overdue: number;
    avg_days_overdue: number;
    risk_score: number | null;
  }>;
  weighted_avg_days_outstanding: number;
}

export interface SupplierPayablesSummary {
  total_outstanding: number;
  total_overdue: number;
  count_outstanding: number;
  count_overdue: number;
  aging: AgingBucket[];
  upcoming_due: Array<{
    supplier_id: string;
    supplier_name: string;
    amount: number;
    due_date: string;
  }>;
  weighted_avg_days_outstanding: number;
}

export interface AgingBucket {
  label: string;
  min_days: number;
  max_days: number | null;
  amount: number;
  count: number;
  percentage: number;
}

export interface UpcomingObligation {
  date: string;
  category: string;
  description: string;
  amount: number;
  is_recurring: boolean;
  confidence: ConfidenceLevel;
  source_type: string | null;
  source_id: string | null;
}

// ─── Insights and drivers ───────────────────────────────────────────────────

export interface InsightData {
  insight_type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  metric_current: number | null;
  metric_reference: number | null;
  change_percent: number | null;
  period: string;
  drivers: ChangeDriver[];
  recommendations: string[];
}

export interface ChangeDriver {
  category: string;
  description: string;
  amount: number;
  change_amount: number;
  change_percent: number;
  direction: "increase" | "decrease";
}

// ─── Scenario analysis ─────────────────────────────────────────────────────

export interface ScenarioInput {
  name: string;
  description: string;
  adjustments: Array<{
    category: string;
    type: "absolute" | "percentage";
    value: number;
    applies_to: "revenue" | "cost" | "both";
  }>;
  horizon_months: number;
}

export interface ScenarioResult {
  scenario: ScenarioInput;
  projected_revenue: number;
  projected_costs: number;
  projected_profit: number;
  projected_cash_flow: number;
  monthly_projections: Array<{
    month: string;
    revenue: number;
    costs: number;
    profit: number;
    cash_balance: number;
  }>;
  comparison_to_baseline: {
    revenue_change: number;
    cost_change: number;
    profit_change: number;
    cash_flow_change: number;
  };
  risk_factors: string[];
  confidence: ConfidenceLevel;
}
