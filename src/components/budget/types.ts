export interface BudgetCategory {
  key: string;
  label: string;
  kind: "revenue" | "cost";
  is_primary: boolean;
}

export interface BudgetResult {
  months: Array<{
    month: number;
    revenue: number;
    costs: number;
    operating_profit: number;
  }>;
  annual: {
    revenue: number;
    costs: number;
    operating_profit: number;
    margin: number | null;
  };
}

export interface BudgetCash {
  months: Array<{ month: number; balance: number }>;
  lowest: { month: number; balance: number };
  closing: number;
  opening_balance: number;
}

export interface BudgetAssumption {
  id: string;
  type: string;
  name: string;
  value: number | null;
  effective_from: string | null;
  metadata: Record<string, unknown>;
}

export interface BudgetDetail {
  budget: {
    id: string;
    name: string;
    year: number;
    status: string;
    scenario: string;
    based_on: string | null;
    /** The months of actuals the starting grid was generated from. */
    basis_start: string | null;
    basis_end: string | null;
    version: number;
  };
  grid: Record<string, number[]>;
  actuals: Record<string, number[]>;
  /** Highest month number with any posting, so later months are forecast. */
  actual_months: number;
  result: BudgetResult;
  cash: BudgetCash;
  assumptions: BudgetAssumption[];
  categories: BudgetCategory[];
}

export const MONTH_SHORT = [
  "jan", "feb", "mar", "apr", "mai", "jun",
  "jul", "aug", "sep", "okt", "nov", "des",
];

export const MONTH_LONG = [
  "januar", "februar", "mars", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "desember",
];
