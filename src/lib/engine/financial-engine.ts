import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import type { ConfidenceLevel } from "../types/database";

// ─── Result types ─────────────────────────────────────────────────────────

export interface RevenueResult {
  amount: number;
  period: { start: Date; end: Date };
  accountBreakdown: Array<{
    accountNumber: string;
    accountName: string;
    amount: number;
  }>;
}

export interface RevenueGrowthResult {
  currentRevenue: number;
  previousRevenue: number;
  changeAmount: number;
  changePercent: number | null;
  currentPeriod: { start: Date; end: Date };
  previousPeriod: { start: Date; end: Date };
}

export interface CostBreakdownItem {
  category: string;
  categoryNameNb: string;
  amount: number;
  percentOfRevenue: number | null;
}

export interface PersonnelCostsResult {
  total: number;
  payroll: number;
  employer_tax: number;
  holiday_pay: number;
  pension: number;
  other_personnel: number;
  period: { start: Date; end: Date };
}

export interface ProfitAnalysisResult {
  revenue: number;
  cogs: number;
  gross_profit: number;
  gross_margin: number | null;
  personnel_costs: PersonnelCostsResult;
  operating_expenses: number;
  operating_profit: number;
  operating_margin: number | null;
  financial_income: number;
  financial_expenses: number;
  profit_before_tax: number;
  period: { start: Date; end: Date };
  comparison: ProfitAnalysisResult | null;
  changeDrivers: ProfitChangeDriver[] | null;
}

export interface ProfitChangeDriver {
  category: string;
  categoryNameNb: string;
  currentAmount: number;
  previousAmount: number;
  impact: number;
}

export interface FinancialSummaryResult {
  period: { start: Date; end: Date };
  revenue: RevenueResult;
  profit: ProfitAnalysisResult;
  costs: CostBreakdownItem[];
  cashPosition: number;
  confidence: ConfidenceLevel;
  calculatedAt: string;
}

// ─── Category key constants ───────────────────────────────────────────────

const REVENUE_CATEGORIES = ["REVENUE", "OTHER_REVENUE"] as const;
const COGS_CATEGORIES = ["COGS"] as const;
const PERSONNEL_CATEGORIES = [
  "PAYROLL",
  "EMPLOYER_TAX",
  "PENSION",
  "OTHER_PERSONNEL",
] as const;
const FINANCIAL_INCOME_CATEGORIES = ["INTEREST_INCOME"] as const;
const FINANCIAL_EXPENSE_CATEGORIES = ["INTEREST"] as const;

// Norwegian standard: revenue accounts are 3000-3999
const REVENUE_ACCOUNT_MIN = 3000;
const REVENUE_ACCOUNT_MAX = 3999;

// Cash and bank accounts: 1900-1999
const CASH_ACCOUNT_MIN = 1900;
const CASH_ACCOUNT_MAX = 1999;

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function safePercent(
  numerator: number,
  denominator: number
): number | null {
  if (denominator === 0) return null;
  return (numerator / denominator) * 100;
}

// ─── FinancialEngine class ────────────────────────────────────────────────

export class FinancialEngine {
  private supabase: SupabaseClient<Database>;
  private companyId: string;

  constructor(supabase: SupabaseClient<Database>, companyId: string) {
    this.supabase = supabase;
    this.companyId = companyId;
  }

  /**
   * Sum transactions on revenue accounts (3000-3999 range) for a period.
   *
   * Revenue amounts in the GL are typically posted as negative (credit side).
   * We negate them to return a positive revenue figure.
   */
  async getRevenue(
    periodStart: Date,
    periodEnd: Date
  ): Promise<RevenueResult> {
    // Strategy: use account_mappings joined with account_transactions to find
    // transactions mapped to REVENUE/OTHER_REVENUE categories. Fall back to
    // account number ranges when mappings are absent.
    const { data: transactions, error } = await this.supabase
      .from("account_transactions")
      .select("account_number, amount, gl_account_id")
      .eq("company_id", this.companyId)
      .gte("transaction_date", formatDate(periodStart))
      .lte("transaction_date", formatDate(periodEnd));

    if (error) {
      throw new Error(`Failed to fetch transactions: ${error.message}`);
    }

    // Load account mappings for category identification
    const categoryMap = await this.loadCategoryMap();

    // Load GL account names for breakdown
    const accountNames = await this.loadAccountNames();

    // Aggregate by account
    const breakdown = new Map<
      string,
      { accountName: string; amount: number }
    >();

    let total = 0;

    for (const tx of transactions || []) {
      const category = this.resolveCategory(
        tx.account_number,
        tx.gl_account_id,
        categoryMap
      );
      if (!this.isRevenueCategory(category, tx.account_number)) continue;

      // Revenue is stored as negative (credit). Negate to get positive revenue.
      const revenueAmount = -tx.amount;

      total += revenueAmount;

      const existing = breakdown.get(tx.account_number);
      if (existing) {
        existing.amount += revenueAmount;
      } else {
        breakdown.set(tx.account_number, {
          accountName:
            accountNames.get(tx.account_number) || tx.account_number,
          amount: revenueAmount,
        });
      }
    }

    const accountBreakdown = Array.from(breakdown.entries())
      .map(([accountNumber, data]) => ({
        accountNumber,
        accountName: data.accountName,
        amount: data.amount,
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      amount: total,
      period: { start: periodStart, end: periodEnd },
      accountBreakdown,
    };
  }

  /**
   * Calculate revenue growth between two periods.
   */
  async getRevenueGrowth(
    periodStart: Date,
    periodEnd: Date,
    comparisonStart: Date,
    comparisonEnd: Date
  ): Promise<RevenueGrowthResult> {
    const [current, previous] = await Promise.all([
      this.getRevenue(periodStart, periodEnd),
      this.getRevenue(comparisonStart, comparisonEnd),
    ]);

    const changeAmount = current.amount - previous.amount;
    const changePercent = safePercent(changeAmount, previous.amount);

    return {
      currentRevenue: current.amount,
      previousRevenue: previous.amount,
      changeAmount,
      changePercent,
      currentPeriod: { start: periodStart, end: periodEnd },
      previousPeriod: { start: comparisonStart, end: comparisonEnd },
    };
  }

  /**
   * Break down costs by account_category for a period.
   * Returns array sorted by amount descending.
   */
  async getCostAnalysis(
    periodStart: Date,
    periodEnd: Date
  ): Promise<CostBreakdownItem[]> {
    const { data: transactions, error } = await this.supabase
      .from("account_transactions")
      .select("account_number, amount, gl_account_id")
      .eq("company_id", this.companyId)
      .gte("transaction_date", formatDate(periodStart))
      .lte("transaction_date", formatDate(periodEnd));

    if (error) {
      throw new Error(`Failed to fetch transactions: ${error.message}`);
    }

    const categoryMap = await this.loadCategoryMap();
    const categoryNames = await this.loadCategoryNames();

    // Calculate revenue for percent-of-revenue
    const revenue = await this.getRevenue(periodStart, periodEnd);

    // Aggregate by category (only cost/expense categories)
    const costByCategory = new Map<string, number>();

    for (const tx of transactions || []) {
      const category = this.resolveCategory(
        tx.account_number,
        tx.gl_account_id,
        categoryMap
      );
      if (!category) continue;
      // Skip revenue, assets, liabilities, equity categories
      if (this.isRevenueCategory(category, tx.account_number)) continue;
      if (this.isBalanceSheetCategory(category)) continue;

      // Cost amounts are positive (debit side)
      const existing = costByCategory.get(category) || 0;
      costByCategory.set(category, existing + tx.amount);
    }

    return Array.from(costByCategory.entries())
      .map(([category, amount]) => ({
        category,
        categoryNameNb: categoryNames.get(category) || category,
        amount,
        percentOfRevenue: safePercent(amount, revenue.amount),
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  /**
   * Full profit analysis with optional comparison period.
   */
  async getProfitAnalysis(
    periodStart: Date,
    periodEnd: Date,
    comparisonStart?: Date,
    comparisonEnd?: Date
  ): Promise<ProfitAnalysisResult> {
    const result = await this.calculateProfitForPeriod(
      periodStart,
      periodEnd
    );

    let comparison: ProfitAnalysisResult | null = null;
    let changeDrivers: ProfitChangeDriver[] | null = null;

    if (comparisonStart && comparisonEnd) {
      comparison = await this.calculateProfitForPeriod(
        comparisonStart,
        comparisonEnd
      );
      changeDrivers = await this.explainProfitChange(
        periodStart,
        periodEnd,
        comparisonStart,
        comparisonEnd
      );
    }

    return {
      ...result,
      comparison,
      changeDrivers,
    };
  }

  /**
   * Break down personnel costs for a period.
   */
  async getPersonnelCosts(
    periodStart: Date,
    periodEnd: Date
  ): Promise<PersonnelCostsResult> {
    const { data: transactions, error } = await this.supabase
      .from("account_transactions")
      .select("account_number, amount, gl_account_id")
      .eq("company_id", this.companyId)
      .gte("transaction_date", formatDate(periodStart))
      .lte("transaction_date", formatDate(periodEnd));

    if (error) {
      throw new Error(`Failed to fetch transactions: ${error.message}`);
    }

    const categoryMap = await this.loadCategoryMap();

    let payroll = 0;
    let employerTax = 0;
    let holidayPay = 0;
    let pension = 0;
    let otherPersonnel = 0;

    for (const tx of transactions || []) {
      const category = this.resolveCategory(
        tx.account_number,
        tx.gl_account_id,
        categoryMap
      );
      const acctNum = parseInt(tx.account_number, 10);

      switch (category) {
        case "PAYROLL":
          // Separate holiday pay: typically accounts 5200-5299 in Norway
          if (acctNum >= 5200 && acctNum <= 5299) {
            holidayPay += tx.amount;
          } else {
            payroll += tx.amount;
          }
          break;
        case "EMPLOYER_TAX":
          employerTax += tx.amount;
          break;
        case "PENSION":
          pension += tx.amount;
          break;
        case "OTHER_PERSONNEL":
          otherPersonnel += tx.amount;
          break;
        default:
          // Check by account number range if no mapping exists
          if (category === null && acctNum >= 5000 && acctNum <= 5999) {
            if (acctNum >= 5000 && acctNum <= 5199) payroll += tx.amount;
            else if (acctNum >= 5200 && acctNum <= 5299) holidayPay += tx.amount;
            else if (acctNum >= 5300 && acctNum <= 5399) pension += tx.amount;
            else if (acctNum >= 5400 && acctNum <= 5499) employerTax += tx.amount;
            else otherPersonnel += tx.amount;
          }
          break;
      }
    }

    return {
      total: payroll + employerTax + holidayPay + pension + otherPersonnel,
      payroll,
      employer_tax: employerTax,
      holiday_pay: holidayPay,
      pension,
      other_personnel: otherPersonnel,
      period: { start: periodStart, end: periodEnd },
    };
  }

  /**
   * Combined financial summary: "how is the business doing?"
   */
  async getFinancialSummary(
    periodStart: Date,
    periodEnd: Date
  ): Promise<FinancialSummaryResult> {
    const [revenue, profit, costs, cashPosition] = await Promise.all([
      this.getRevenue(periodStart, periodEnd),
      this.getProfitAnalysis(periodStart, periodEnd),
      this.getCostAnalysis(periodStart, periodEnd),
      this.getCashPosition(),
    ]);

    return {
      period: { start: periodStart, end: periodEnd },
      revenue,
      profit,
      costs,
      cashPosition,
      confidence: "estimated",
      calculatedAt: new Date().toISOString(),
    };
  }

  /**
   * Section 13: Explain what drove the change in profit between two periods.
   * Returns drivers sorted by absolute impact (largest first).
   */
  async explainProfitChange(
    periodStart: Date,
    periodEnd: Date,
    comparisonStart: Date,
    comparisonEnd: Date
  ): Promise<ProfitChangeDriver[]> {
    const [currentTxs, previousTxs] = await Promise.all([
      this.fetchTransactions(periodStart, periodEnd),
      this.fetchTransactions(comparisonStart, comparisonEnd),
    ]);

    const categoryMap = await this.loadCategoryMap();
    const categoryNames = await this.loadCategoryNames();

    // Aggregate both periods by category
    const currentByCategory = this.aggregateByCategory(
      currentTxs,
      categoryMap
    );
    const previousByCategory = this.aggregateByCategory(
      previousTxs,
      categoryMap
    );

    // Collect all categories from both periods
    const allCategories = new Set([
      ...currentByCategory.keys(),
      ...previousByCategory.keys(),
    ]);

    const drivers: ProfitChangeDriver[] = [];

    for (const category of allCategories) {
      // Skip balance sheet categories
      if (this.isBalanceSheetCategory(category)) continue;

      const currentAmount = currentByCategory.get(category) || 0;
      const previousAmount = previousByCategory.get(category) || 0;

      if (currentAmount === previousAmount) continue;

      // For revenue categories, negate to show positive revenue
      const isRevenue = REVENUE_CATEGORIES.includes(
        category as (typeof REVENUE_CATEGORIES)[number]
      );
      const displayCurrent = isRevenue ? -currentAmount : currentAmount;
      const displayPrevious = isRevenue ? -previousAmount : previousAmount;

      // Impact on profit: revenue increase helps, cost increase hurts
      let impact: number;
      if (isRevenue) {
        impact = displayCurrent - displayPrevious; // Revenue increase = positive impact
      } else {
        impact = -(currentAmount - previousAmount); // Cost increase = negative impact
      }

      drivers.push({
        category,
        categoryNameNb: categoryNames.get(category) || category,
        currentAmount: displayCurrent,
        previousAmount: displayPrevious,
        impact,
      });
    }

    // Sort by absolute impact, largest first
    return drivers.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private async calculateProfitForPeriod(
    periodStart: Date,
    periodEnd: Date
  ): Promise<ProfitAnalysisResult> {
    const transactions = await this.fetchTransactions(
      periodStart,
      periodEnd
    );
    const categoryMap = await this.loadCategoryMap();

    // Aggregate by category
    const byCategory = this.aggregateByCategory(transactions, categoryMap);

    // Revenue (negate: GL credits are negative)
    let revenue = 0;
    for (const cat of REVENUE_CATEGORIES) {
      revenue += -(byCategory.get(cat) || 0);
    }

    // COGS
    let cogs = 0;
    for (const cat of COGS_CATEGORIES) {
      cogs += byCategory.get(cat) || 0;
    }

    const grossProfit = revenue - cogs;
    const grossMargin = safePercent(grossProfit, revenue);

    // Personnel costs
    const personnelCosts = await this.getPersonnelCosts(
      periodStart,
      periodEnd
    );

    // Other operating expenses (everything that is not revenue, COGS,
    // personnel, financial, tax, or balance sheet)
    let operatingExpenses = 0;
    for (const [category, amount] of byCategory.entries()) {
      if (REVENUE_CATEGORIES.includes(category as (typeof REVENUE_CATEGORIES)[number])) continue;
      if (COGS_CATEGORIES.includes(category as (typeof COGS_CATEGORIES)[number])) continue;
      if (PERSONNEL_CATEGORIES.includes(category as (typeof PERSONNEL_CATEGORIES)[number])) continue;
      if (FINANCIAL_INCOME_CATEGORIES.includes(category as (typeof FINANCIAL_INCOME_CATEGORIES)[number])) continue;
      if (FINANCIAL_EXPENSE_CATEGORIES.includes(category as (typeof FINANCIAL_EXPENSE_CATEGORIES)[number])) continue;
      if (category === "TAX") continue;
      if (this.isBalanceSheetCategory(category)) continue;
      operatingExpenses += amount;
    }

    const operatingProfit =
      grossProfit - personnelCosts.total - operatingExpenses;
    const operatingMargin = safePercent(operatingProfit, revenue);

    // Financial items
    let financialIncome = 0;
    for (const cat of FINANCIAL_INCOME_CATEGORIES) {
      financialIncome += -(byCategory.get(cat) || 0);
    }
    let financialExpenses = 0;
    for (const cat of FINANCIAL_EXPENSE_CATEGORIES) {
      financialExpenses += byCategory.get(cat) || 0;
    }

    const profitBeforeTax =
      operatingProfit + financialIncome - financialExpenses;

    return {
      revenue,
      cogs,
      gross_profit: grossProfit,
      gross_margin: grossMargin,
      personnel_costs: personnelCosts,
      operating_expenses: operatingExpenses,
      operating_profit: operatingProfit,
      operating_margin: operatingMargin,
      financial_income: financialIncome,
      financial_expenses: financialExpenses,
      profit_before_tax: profitBeforeTax,
      period: { start: periodStart, end: periodEnd },
      comparison: null,
      changeDrivers: null,
    };
  }

  private async fetchTransactions(
    periodStart: Date,
    periodEnd: Date
  ): Promise<
    Array<{
      account_number: string;
      amount: number;
      gl_account_id: string | null;
    }>
  > {
    const { data, error } = await this.supabase
      .from("account_transactions")
      .select("account_number, amount, gl_account_id")
      .eq("company_id", this.companyId)
      .gte("transaction_date", formatDate(periodStart))
      .lte("transaction_date", formatDate(periodEnd));

    if (error) {
      throw new Error(`Failed to fetch transactions: ${error.message}`);
    }

    return data || [];
  }

  private aggregateByCategory(
    transactions: Array<{
      account_number: string;
      amount: number;
      gl_account_id: string | null;
    }>,
    categoryMap: Map<string, string>
  ): Map<string, number> {
    const result = new Map<string, number>();

    for (const tx of transactions) {
      const category = this.resolveCategory(
        tx.account_number,
        tx.gl_account_id,
        categoryMap
      );
      if (!category) continue;

      const existing = result.get(category) || 0;
      result.set(category, existing + tx.amount);
    }

    return result;
  }

  /**
   * Get current cash position from bank/cash GL accounts (1900-1999).
   * Uses the most recent trial balance snapshot, or calculates from transactions.
   */
  private async getCashPosition(): Promise<number> {
    // Try trial balance snapshots first (most efficient)
    const { data: snapshots, error: snapError } = await this.supabase
      .from("trial_balance_snapshots")
      .select("account_number, closing_balance")
      .eq("company_id", this.companyId)
      .gte("account_number", String(CASH_ACCOUNT_MIN))
      .lte("account_number", String(CASH_ACCOUNT_MAX))
      .order("snapshot_date", { ascending: false })
      .limit(100);

    if (!snapError && snapshots && snapshots.length > 0) {
      // Group by account and take the latest snapshot per account
      const latestByAccount = new Map<string, number>();
      for (const s of snapshots) {
        if (!latestByAccount.has(s.account_number)) {
          latestByAccount.set(s.account_number, s.closing_balance);
        }
      }
      let total = 0;
      for (const balance of latestByAccount.values()) {
        total += balance;
      }
      return total;
    }

    // Fallback: sum all transactions on cash accounts
    const { data: transactions, error: txError } = await this.supabase
      .from("account_transactions")
      .select("amount")
      .eq("company_id", this.companyId)
      .gte("account_number", String(CASH_ACCOUNT_MIN))
      .lte("account_number", String(CASH_ACCOUNT_MAX));

    if (txError) {
      throw new Error(`Failed to fetch cash transactions: ${txError.message}`);
    }

    let total = 0;
    for (const tx of transactions || []) {
      total += tx.amount;
    }
    return total;
  }

  /**
   * Load account mappings: gl_account_id -> category_key
   */
  private async loadCategoryMap(): Promise<Map<string, string>> {
    const { data, error } = await this.supabase
      .from("account_mappings")
      .select("gl_account_id, category_key")
      .eq("company_id", this.companyId);

    if (error) {
      throw new Error(`Failed to load account mappings: ${error.message}`);
    }

    const map = new Map<string, string>();
    for (const row of data || []) {
      map.set(row.gl_account_id, row.category_key);
    }
    return map;
  }

  /**
   * Load GL account names: account_number -> name
   */
  private async loadAccountNames(): Promise<Map<string, string>> {
    const { data, error } = await this.supabase
      .from("gl_accounts")
      .select("account_number, name")
      .eq("company_id", this.companyId);

    if (error) {
      throw new Error(`Failed to load GL accounts: ${error.message}`);
    }

    const map = new Map<string, string>();
    for (const row of data || []) {
      map.set(row.account_number, row.name);
    }
    return map;
  }

  /**
   * Load category display names: key -> name_nb
   */
  private async loadCategoryNames(): Promise<Map<string, string>> {
    const { data, error } = await this.supabase
      .from("account_categories")
      .select("key, name_nb");

    if (error) {
      throw new Error(`Failed to load account categories: ${error.message}`);
    }

    const map = new Map<string, string>();
    for (const row of data || []) {
      map.set(row.key, row.name_nb);
    }
    return map;
  }

  /**
   * Resolve category for a transaction. Uses mapping table first, falls back
   * to account number range heuristic.
   */
  private resolveCategory(
    accountNumber: string,
    glAccountId: string | null,
    categoryMap: Map<string, string>
  ): string | null {
    // First: try explicit mapping by gl_account_id
    if (glAccountId) {
      const mapped = categoryMap.get(glAccountId);
      if (mapped) return mapped;
    }

    // Fallback: derive from account number (Norwegian standard)
    const num = parseInt(accountNumber, 10);
    if (isNaN(num)) return null;

    if (num >= 3000 && num <= 3899) return "REVENUE";
    if (num >= 3900 && num <= 3999) return "OTHER_REVENUE";
    if (num >= 4000 && num <= 4999) return "COGS";
    if (num >= 5000 && num <= 5199) return "PAYROLL";
    if (num >= 5200 && num <= 5299) return "PAYROLL"; // holiday pay sub-bucket
    if (num >= 5300 && num <= 5399) return "PENSION";
    if (num >= 5400 && num <= 5499) return "EMPLOYER_TAX";
    if (num >= 5500 && num <= 5999) return "OTHER_PERSONNEL";
    if (num >= 6000 && num <= 6099) return "DEPRECIATION";
    if (num >= 6200 && num <= 6399) return "RENT";
    if (num >= 6400 && num <= 6699) return "OFFICE";
    if (num >= 6700 && num <= 6799) return "CONSULTANTS";
    if (num >= 6800 && num <= 6899) return "TELECOM";
    if (num >= 7000 && num <= 7099) return "VEHICLE";
    if (num >= 7100 && num <= 7299) return "TRAVEL";
    if (num >= 7300 && num <= 7399) return "MARKETING";
    if (num >= 7400 && num <= 7499) return "SOFTWARE_IT";
    if (num >= 7500 && num <= 7599) return "INSURANCE";
    if (num >= 6100 && num <= 6199) return "OTHER_EXPENSE";
    if (num >= 6900 && num <= 6999) return "OTHER_EXPENSE";
    if (num >= 7600 && num <= 7999) return "OTHER_EXPENSE";
    if (num >= 8000 && num <= 8049) return "INTEREST_INCOME";
    if (num >= 8050 && num <= 8199) return "INTEREST";
    if (num >= 8800 && num <= 8899) return "TAX";
    if (num >= 8200 && num <= 8799) return "OTHER_EXPENSE";
    if (num >= 8900 && num <= 8999) return "OTHER_EXPENSE";

    // Balance sheet ranges
    if (num >= 1900 && num <= 1999) return "CASH";
    if (num >= 1500 && num <= 1599) return "ACCOUNTS_RECEIVABLE";
    if (num >= 2400 && num <= 2499) return "ACCOUNTS_PAYABLE";
    if (num >= 2000 && num <= 2099) return "EQUITY";
    if (num >= 1000 && num <= 1499) return "OTHER_ASSET";
    if (num >= 1600 && num <= 1899) return "OTHER_ASSET";
    if (num >= 2100 && num <= 2399) return "OTHER_LIABILITY";
    if (num >= 2500 && num <= 2999) return "OTHER_LIABILITY";

    return null;
  }

  private isRevenueCategory(
    category: string | null,
    accountNumber: string
  ): boolean {
    if (category && REVENUE_CATEGORIES.includes(category as (typeof REVENUE_CATEGORIES)[number])) {
      return true;
    }
    // Fallback: check account number range
    if (category === null) {
      const num = parseInt(accountNumber, 10);
      return !isNaN(num) && num >= REVENUE_ACCOUNT_MIN && num <= REVENUE_ACCOUNT_MAX;
    }
    return false;
  }

  private isBalanceSheetCategory(category: string): boolean {
    return [
      "CASH",
      "ACCOUNTS_RECEIVABLE",
      "ACCOUNTS_PAYABLE",
      "EQUITY",
      "OTHER_ASSET",
      "OTHER_LIABILITY",
    ].includes(category);
  }
}
