/**
 * The Report Engine.
 *
 * Every report — month report, board pack, liquidity, growth, budget — is a
 * view over one structure computed here. Nothing downstream calculates a
 * figure: the templates, the Excel export and the narrative all read this
 * object. That is what keeps a PDF and the screen agreeing, and what stops a
 * language model from arriving at its own version of the numbers.
 *
 * The dataset is stored alongside the report when it is generated, so a board
 * pack from July still says in December what it said in July.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/supabase/paginate";
import {
  CATEGORIES,
  PAYROLL_CATEGORY_KEYS,
  categoryForAccount,
  signedAmount,
  type Category,
} from "./categories";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

const PAGE_SIZE = 1000;

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export interface Period {
  start: string;
  end: string;
  label: string;
}

export interface CategoryFigure {
  key: string;
  label: string;
  kind: "revenue" | "cost";
  amount: number;
  comparison: number | null;
  change: number | null;
  change_percent: number | null;
  share_of_revenue: number | null;
}

export interface MonthFigure {
  month: string;
  revenue: number;
  costs: number;
  operating_profit: number;
  /** False for a month the ledger only partly covers. */
  is_complete: boolean;
}

export interface PartyFigure {
  id: string;
  name: string;
  amount: number;
  share: number | null;
}

export interface BridgeStep {
  label: string;
  amount: number;
  /** start and end are the anchored bars of a waterfall. */
  kind: "start" | "change" | "end";
}

export interface Kpi {
  key: string;
  label: string;
  value: number;
  unit: "NOK" | "percent" | "days" | "count";
  comparison: number | null;
  change_percent: number | null;
  /** Whether an increase is good, so the template colours it correctly. */
  higher_is_better: boolean;
}

export interface ReportInsight {
  id: string;
  severity: "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  /** What the observation was computed from, so it can be checked. */
  basis: string | null;
}

export interface BudgetComparisonLine {
  key: string;
  label: string;
  actual: number;
  budget: number;
  variance: number;
  variance_percent: number | null;
}

export interface ReportDataset {
  report_type: string;
  generated_at: string;
  dataset_version: string;

  company: {
    id: string;
    name: string;
    org_number: string | null;
  };

  period: Period;
  comparison: (Period & { type: string }) | null;

  financial_summary: {
    revenue: number;
    costs: number;
    operating_profit: number;
    operating_margin: number | null;
    gross_profit: number;
    gross_margin: number | null;
    comparison: {
      revenue: number;
      costs: number;
      operating_profit: number;
      operating_margin: number | null;
    } | null;
    change: {
      revenue: number;
      revenue_percent: number | null;
      operating_profit: number;
      operating_profit_percent: number | null;
      margin_points: number | null;
    } | null;
  };

  revenue: {
    total: number;
    by_category: CategoryFigure[];
    by_month: MonthFigure[];
    by_customer: PartyFigure[];
    concentration: {
      top_1_share: number | null;
      top_3_share: number | null;
      top_5_share: number | null;
      customer_count: number;
    };
    recurring: {
      mrr: number | null;
      arr: number | null;
      share_of_revenue: number | null;
      based_on_product_list: boolean;
    } | null;
  };

  expenses: {
    total: number;
    by_category: CategoryFigure[];
    largest_increases: CategoryFigure[];
    largest_accounts: Array<{
      account_number: string;
      name: string | null;
      amount: number;
      comparison: number | null;
      change: number | null;
    }>;
    by_supplier: PartyFigure[];
  };

  payroll: {
    total: number;
    comparison: number | null;
    change_percent: number | null;
    share_of_revenue: number | null;
    /** Payroll growth minus revenue growth, in percentage points. */
    growth_gap_points: number | null;
  };

  cash: {
    booked: number | null;
    is_stated: boolean;
    by_month: Array<{ month: string; movement: number; balance: number }>;
    lowest_point: { month: string; balance: number } | null;
    accounts: Array<{ account_number: string; name: string | null; balance: number }>;
  };

  receivables: {
    total: number | null;
    is_stated: boolean;
    top: PartyFigure[];
    /** SAF-T carries no invoice due dates, so ageing cannot be derived. */
    ageing_available: boolean;
  };

  payables: {
    total: number | null;
    is_stated: boolean;
    top: PartyFigure[];
    ageing_available: boolean;
  };

  bridge: BridgeStep[];

  budget: {
    budget_id: string;
    name: string;
    lines: BudgetComparisonLine[];
    total_actual: number;
    total_budget: number;
  } | null;

  forecast: {
    /** Actuals so far plus the remaining budget for the year. */
    full_year_revenue: number;
    full_year_profit: number;
    actual_months: number;
    method: string;
  } | null;

  kpis: Kpi[];
  insights: ReportInsight[];

  data_quality: {
    books_cover: { start: string; end: string } | null;
    last_import: string | null;
    transaction_count: number;
    /** Days between the last posting and today. */
    days_since_last_posting: number | null;
    notes: string[];
  };
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface DatasetRequest {
  companyId: string;
  reportType: string;
  periodStart: string;
  periodEnd: string;
  comparisonType: "previous_period" | "same_period_last_year" | "budget" | "none";
  budgetId?: string | null;
}

interface Posting {
  account_number: string;
  amount: number;
  transaction_date: string;
  customer_id: string | null;
  supplier_id: string | null;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function buildReportDataset(
  supabase: DB,
  request: DatasetRequest
): Promise<ReportDataset> {
  const { companyId, periodStart, periodEnd } = request;

  const comparisonPeriod = resolveComparison(request);

  // Balances belong to an accounting year. A report about 2025 must show the
  // 2025 closing balances, not whatever the latest import left on the parent
  // tables — which is how a 2025 file once made the 2026 dashboard show 2025's
  // bank balance.
  const reportYear = Number(periodEnd.slice(0, 4));

  // One read covers both periods; splitting them would double the round trips
  // for no benefit, and the comparison range is always adjacent or a year back.
  const readFrom =
    comparisonPeriod && comparisonPeriod.start < periodStart
      ? comparisonPeriod.start
      : periodStart;
  const readTo =
    comparisonPeriod && comparisonPeriod.end > periodEnd
      ? comparisonPeriod.end
      : periodEnd;

  const [
    company,
    postings,
    accounts,
    customers,
    suppliers,
    insights,
    coverage,
    mrr,
    budget,
  ] = await Promise.all([
    loadCompany(supabase, companyId),
    loadPostings(supabase, companyId, readFrom, readTo),
    loadAccounts(supabase, companyId, reportYear),
    loadParties(supabase, companyId, "customers", reportYear),
    loadParties(supabase, companyId, "suppliers", reportYear),
    loadInsights(supabase, companyId),
    loadCoverage(supabase, companyId),
    loadMrr(supabase, companyId),
    request.budgetId ? loadBudget(supabase, request.budgetId) : null,
  ]);

  const inPeriod = postings.filter(
    (p) => p.transaction_date >= periodStart && p.transaction_date <= periodEnd
  );
  const inComparison = comparisonPeriod
    ? postings.filter(
        (p) =>
          p.transaction_date >= comparisonPeriod.start &&
          p.transaction_date <= comparisonPeriod.end
      )
    : [];

  const current = summarise(inPeriod);
  const previous = comparisonPeriod ? summarise(inComparison) : null;

  const accountNames = new Map(accounts.map((a) => [a.account_number, a.name]));
  const customerNames = new Map(customers.map((c) => [c.id, c.name]));
  const supplierNames = new Map(suppliers.map((s) => [s.id, s.name]));

  const revenueTotal = current.revenue;
  const byCategory = buildCategoryFigures(current, previous, revenueTotal);

  const revenueCategories = byCategory.filter((c) => c.kind === "revenue");
  const costCategories = byCategory.filter((c) => c.kind === "cost");

  const grossProfit = revenueTotal - (current.byCategory.get("cogs") ?? 0);
  // Total personnel cost is every payroll category netted together, including
  // the refunds that reduce it. Summing only pay and employer's contribution
  // would overstate what the staff actually cost.
  const sumPayroll = (s: Summary) =>
    PAYROLL_CATEGORY_KEYS.reduce((t, key) => t + (s.byCategory.get(key) ?? 0), 0);

  const payrollTotal = sumPayroll(current);
  const payrollComparison = previous ? sumPayroll(previous) : null;

  const revenueGrowth = previous ? percentChange(revenueTotal, previous.revenue) : null;
  const payrollGrowth =
    payrollComparison != null ? percentChange(payrollTotal, payrollComparison) : null;

  const byCustomer = rankParties(current.byCustomer, customerNames, revenueTotal);
  const bySupplier = rankParties(current.bySupplier, supplierNames, current.costs);

  const cash = buildCash(accounts, postings, periodStart, periodEnd);
  const receivables = buildParty(customers, "receivable");
  const payables = buildParty(suppliers, "payable");

  const budgetComparison = budget
    ? buildBudgetComparison(budget, current, periodStart, periodEnd)
    : null;

  const dataset: ReportDataset = {
    report_type: request.reportType,
    generated_at: new Date().toISOString(),
    dataset_version: "1",

    company: {
      id: companyId,
      name: company?.name ?? "Ukjent selskap",
      org_number: company?.org_number ?? null,
    },

    period: {
      start: periodStart,
      end: periodEnd,
      label: periodLabel(periodStart, periodEnd),
    },
    comparison: comparisonPeriod
      ? {
          ...comparisonPeriod,
          label: periodLabel(comparisonPeriod.start, comparisonPeriod.end),
        }
      : null,

    financial_summary: {
      revenue: round(revenueTotal),
      costs: round(current.costs),
      operating_profit: round(current.operatingProfit),
      operating_margin: ratio(current.operatingProfit, revenueTotal),
      gross_profit: round(grossProfit),
      gross_margin: ratio(grossProfit, revenueTotal),
      comparison: previous
        ? {
            revenue: round(previous.revenue),
            costs: round(previous.costs),
            operating_profit: round(previous.operatingProfit),
            operating_margin: ratio(previous.operatingProfit, previous.revenue),
          }
        : null,
      change: previous
        ? {
            revenue: round(revenueTotal - previous.revenue),
            revenue_percent: revenueGrowth,
            operating_profit: round(
              current.operatingProfit - previous.operatingProfit
            ),
            operating_profit_percent: percentChange(
              current.operatingProfit,
              previous.operatingProfit
            ),
            margin_points: marginPoints(current, previous),
          }
        : null,
    },

    revenue: {
      total: round(revenueTotal),
      by_category: revenueCategories,
      by_month: buildMonthly(inPeriod, periodStart, periodEnd, coverage.last_date),
      by_customer: byCustomer.slice(0, 15),
      concentration: {
        top_1_share: shareOf(byCustomer, 1, revenueTotal),
        top_3_share: shareOf(byCustomer, 3, revenueTotal),
        top_5_share: shareOf(byCustomer, 5, revenueTotal),
        customer_count: byCustomer.length,
      },
      recurring: mrr,
    },

    expenses: {
      total: round(current.costs),
      by_category: costCategories,
      largest_increases: costCategories
        .filter((c) => c.change != null && c.change > 0)
        .sort((a, b) => (b.change ?? 0) - (a.change ?? 0))
        .slice(0, 5),
      largest_accounts: buildAccountFigures(current, previous, accountNames),
      by_supplier: bySupplier.slice(0, 15),
    },

    payroll: {
      total: round(payrollTotal),
      comparison: payrollComparison == null ? null : round(payrollComparison),
      change_percent: payrollGrowth,
      share_of_revenue: ratio(payrollTotal, revenueTotal),
      growth_gap_points:
        payrollGrowth != null && revenueGrowth != null
          ? round(payrollGrowth - revenueGrowth)
          : null,
    },

    cash,
    receivables,
    payables,

    bridge: previous
      ? buildBridge(current, previous, byCategory)
      : [],

    budget: budgetComparison,
    forecast: budgetComparison
      ? buildForecast(budget!, current, periodEnd)
      : null,

    kpis: buildKpis({
      revenueTotal,
      previous,
      current,
      payrollTotal,
      payrollComparison,
      cash,
      receivables,
      mrr,
    }),

    insights,

    data_quality: {
      books_cover:
        coverage.first_date && coverage.last_date
          ? { start: coverage.first_date, end: coverage.last_date }
          : null,
      last_import: coverage.last_import,
      transaction_count: inPeriod.length,
      days_since_last_posting: coverage.last_date
        ? Math.floor(
            (Date.now() - new Date(coverage.last_date).getTime()) / 86_400_000
          )
        : null,
      notes: buildQualityNotes(coverage, periodStart, periodEnd, previous != null),
    },
  };

  return dataset;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

interface Summary {
  revenue: number;
  costs: number;
  operatingProfit: number;
  byCategory: Map<string, number>;
  byAccount: Map<string, number>;
  byCustomer: Map<string, number>;
  bySupplier: Map<string, number>;
}

function summarise(postings: Posting[]): Summary {
  const byCategory = new Map<string, number>();
  const byAccount = new Map<string, number>();
  const byCustomer = new Map<string, number>();
  const bySupplier = new Map<string, number>();

  let revenue = 0;
  let costs = 0;

  for (const p of postings) {
    const category = categoryForAccount(p.account_number);
    if (!category) continue;

    const amount = signedAmount(category, Number(p.amount));

    byCategory.set(category.key, (byCategory.get(category.key) ?? 0) + amount);
    byAccount.set(p.account_number, (byAccount.get(p.account_number) ?? 0) + amount);

    if (category.kind === "revenue") {
      revenue += amount;
      if (p.customer_id) {
        byCustomer.set(p.customer_id, (byCustomer.get(p.customer_id) ?? 0) + amount);
      }
    } else {
      costs += amount;
      if (p.supplier_id) {
        bySupplier.set(p.supplier_id, (bySupplier.get(p.supplier_id) ?? 0) + amount);
      }
    }
  }

  return {
    revenue,
    costs,
    operatingProfit: revenue - costs,
    byCategory,
    byAccount,
    byCustomer,
    bySupplier,
  };
}

function buildCategoryFigures(
  current: Summary,
  previous: Summary | null,
  revenueTotal: number
): CategoryFigure[] {
  return CATEGORIES.map((category: Category) => {
    const amount = current.byCategory.get(category.key) ?? 0;
    const comparison = previous
      ? (previous.byCategory.get(category.key) ?? 0)
      : null;

    return {
      key: category.key,
      label: category.label,
      kind: category.kind,
      amount: round(amount),
      comparison: comparison == null ? null : round(comparison),
      change: comparison == null ? null : round(amount - comparison),
      change_percent: comparison == null ? null : percentChange(amount, comparison),
      share_of_revenue: ratio(amount, revenueTotal),
    };
  }).filter((c) => c.amount !== 0 || (c.comparison ?? 0) !== 0);
}

function buildAccountFigures(
  current: Summary,
  previous: Summary | null,
  names: Map<string, string | null>
) {
  return [...current.byAccount.entries()]
    .filter(([accountNumber]) => {
      const account = parseInt(accountNumber, 10);
      return account >= 4000 && account <= 7999;
    })
    .map(([accountNumber, amount]) => {
      const comparison = previous ? (previous.byAccount.get(accountNumber) ?? 0) : null;
      return {
        account_number: accountNumber,
        name: names.get(accountNumber) ?? null,
        amount: round(amount),
        comparison: comparison == null ? null : round(comparison),
        change: comparison == null ? null : round(amount - comparison),
      };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 20);
}

function buildMonthly(
  postings: Posting[],
  periodStart: string,
  periodEnd: string,
  lastPosting: string | null
): MonthFigure[] {
  const months = new Map<string, { revenue: number; costs: number }>();

  for (
    let cursor = periodStart.slice(0, 7);
    cursor <= periodEnd.slice(0, 7);
    cursor = nextMonth(cursor)
  ) {
    months.set(cursor, { revenue: 0, costs: 0 });
  }

  for (const p of postings) {
    const category = categoryForAccount(p.account_number);
    if (!category) continue;
    const bucket = months.get(p.transaction_date.slice(0, 7));
    if (!bucket) continue;

    const amount = signedAmount(category, Number(p.amount));
    if (category.kind === "revenue") bucket.revenue += amount;
    else bucket.costs += amount;
  }

  // A month the ledger only partly covers must not be read as a collapse.
  const lastCompleteMonth = lastPosting ? lastMonthFullyCovered(lastPosting) : null;

  return [...months.entries()].map(([month, v]) => ({
    month,
    revenue: round(v.revenue),
    costs: round(v.costs),
    operating_profit: round(v.revenue - v.costs),
    is_complete: lastCompleteMonth == null || month <= lastCompleteMonth,
  }));
}

function rankParties(
  totals: Map<string, number>,
  names: Map<string, string>,
  base: number
): PartyFigure[] {
  return [...totals.entries()]
    .map(([id, amount]) => ({
      id,
      name: names.get(id) ?? "Ukjent",
      amount: round(amount),
      share: ratio(amount, base),
    }))
    .sort((a, b) => b.amount - a.amount);
}

function shareOf(parties: PartyFigure[], n: number, base: number): number | null {
  if (parties.length === 0 || base === 0) return null;
  const sum = parties.slice(0, n).reduce((t, p) => t + p.amount, 0);
  return ratio(sum, base);
}

/**
 * A waterfall explaining the change in operating profit: revenue first, then
 * each cost category that moved, largest first. Small movements are folded
 * into a remainder so the chart stays readable.
 */
function buildBridge(
  current: Summary,
  previous: Summary,
  categories: CategoryFigure[]
): BridgeStep[] {
  const steps: BridgeStep[] = [
    { label: "Resultat i sammenligningsperioden", amount: round(previous.operatingProfit), kind: "start" },
  ];

  const revenueChange = current.revenue - previous.revenue;
  if (Math.abs(revenueChange) >= 1) {
    steps.push({
      label: revenueChange > 0 ? "Høyere omsetning" : "Lavere omsetning",
      amount: round(revenueChange),
      kind: "change",
    });
  }

  const costMoves = categories
    .filter((c) => c.kind === "cost" && c.change != null && Math.abs(c.change) >= 1)
    // A cost increase reduces profit, so the sign is flipped for the bridge.
    .map((c) => ({ label: c.label, amount: round(-(c.change ?? 0)) }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  const shown = costMoves.slice(0, 6);
  const rest = costMoves.slice(6).reduce((t, c) => t + c.amount, 0);

  for (const move of shown) {
    steps.push({
      label: move.amount < 0 ? `Høyere ${move.label.toLowerCase()}` : `Lavere ${move.label.toLowerCase()}`,
      amount: move.amount,
      kind: "change",
    });
  }

  if (Math.abs(rest) >= 1) {
    steps.push({ label: "Andre forhold", amount: round(rest), kind: "change" });
  }

  steps.push({
    label: "Resultat i perioden",
    amount: round(current.operatingProfit),
    kind: "end",
  });

  return steps;
}

function buildCash(
  accounts: AccountRow[],
  postings: Posting[],
  periodStart: string,
  periodEnd: string
): ReportDataset["cash"] {
  const bank = accounts.filter((a) => {
    const n = parseInt(a.account_number, 10);
    return n >= 1900 && n <= 1999;
  });

  const stated = bank.some((a) => a.closing_balance != null);
  const closing = bank.reduce((t, a) => t + Number(a.closing_balance ?? 0), 0);
  const opening = bank.reduce((t, a) => t + Number(a.opening_balance ?? 0), 0);

  // The balance at each month end is the opening balance plus everything posted
  // to a bank account up to that point — not the month's movement.
  const movements = new Map<string, number>();
  for (
    let cursor = periodStart.slice(0, 7);
    cursor <= periodEnd.slice(0, 7);
    cursor = nextMonth(cursor)
  ) {
    movements.set(cursor, 0);
  }

  let beforePeriod = 0;
  for (const p of postings) {
    const n = parseInt(p.account_number, 10);
    if (!(n >= 1900 && n <= 1999)) continue;
    if (p.transaction_date < periodStart) {
      beforePeriod += Number(p.amount);
      continue;
    }
    const key = p.transaction_date.slice(0, 7);
    if (movements.has(key)) {
      movements.set(key, (movements.get(key) ?? 0) + Number(p.amount));
    }
  }

  let running = opening + beforePeriod;
  const byMonth = [...movements.entries()].map(([month, movement]) => {
    running += movement;
    return { month, movement: round(movement), balance: round(running) };
  });

  const lowest = byMonth.reduce<{ month: string; balance: number } | null>(
    (low, m) => (low == null || m.balance < low.balance ? { month: m.month, balance: m.balance } : low),
    null
  );

  return {
    booked: stated ? round(closing) : null,
    is_stated: stated,
    by_month: byMonth,
    lowest_point: lowest,
    accounts: bank.map((a) => ({
      account_number: a.account_number,
      name: a.name,
      balance: round(Number(a.closing_balance ?? 0)),
    })),
  };
}

function buildParty(
  parties: PartyRow[],
  kind: "receivable" | "payable"
): ReportDataset["receivables"] {
  const stated = parties.some((p) => p.closing_balance != null);

  const withBalance = parties
    .filter((p) => (p.closing_balance ?? 0) !== 0)
    .map((p) => ({ id: p.id, name: p.name, amount: round(Number(p.closing_balance)) }))
    .sort((a, b) => b.amount - a.amount);

  const total = withBalance.reduce((t, p) => t + p.amount, 0);

  return {
    total: stated ? round(total) : null,
    is_stated: stated,
    top: withBalance.slice(0, 10).map((p) => ({ ...p, share: ratio(p.amount, total) })),
    // SAF-T states a balance per party, never the invoices behind it, so there
    // is no due date to age against. Saying so beats inventing buckets.
    ageing_available: false,
    ...(kind === "payable" ? {} : {}),
  };
}

// ---------------------------------------------------------------------------
// Budget and forecast
// ---------------------------------------------------------------------------

interface BudgetRow {
  id: string;
  name: string;
  year: number;
  lines: Array<{ category_key: string; month: number; amount: number }>;
}

function buildBudgetComparison(
  budget: BudgetRow,
  current: Summary,
  periodStart: string,
  periodEnd: string
): ReportDataset["budget"] {
  const fromMonth = Number(periodStart.slice(5, 7));
  const toMonth = Number(periodEnd.slice(5, 7));
  const sameYear = Number(periodStart.slice(0, 4)) === budget.year;

  const budgetByCategory = new Map<string, number>();
  for (const line of budget.lines) {
    if (sameYear && (line.month < fromMonth || line.month > toMonth)) continue;
    budgetByCategory.set(
      line.category_key,
      (budgetByCategory.get(line.category_key) ?? 0) + Number(line.amount)
    );
  }

  const keys = new Set([...current.byCategory.keys(), ...budgetByCategory.keys()]);

  const lines: BudgetComparisonLine[] = [...keys]
    .map((key) => {
      const category = CATEGORIES.find((c) => c.key === key);
      const actual = round(current.byCategory.get(key) ?? 0);
      const budgeted = round(budgetByCategory.get(key) ?? 0);
      // For revenue, above budget is favourable; for a cost, below budget is.
      const variance =
        category?.kind === "revenue" ? actual - budgeted : budgeted - actual;

      return {
        key,
        label: category?.label ?? key,
        actual,
        budget: budgeted,
        variance: round(variance),
        variance_percent: budgeted === 0 ? null : round((variance / Math.abs(budgeted)) * 100),
      };
    })
    .filter((l) => l.actual !== 0 || l.budget !== 0);

  return {
    budget_id: budget.id,
    name: budget.name,
    lines,
    total_actual: round(current.operatingProfit),
    total_budget: round(
      lines.reduce((t, l) => {
        const category = CATEGORIES.find((c) => c.key === l.key);
        return category?.kind === "revenue" ? t + l.budget : t - l.budget;
      }, 0)
    ),
  };
}

/**
 * The simplest honest forecast: what has actually happened, plus the budget for
 * the months that have not. Stated as such rather than dressed up as a model.
 */
function buildForecast(
  budget: BudgetRow,
  current: Summary,
  periodEnd: string
): ReportDataset["forecast"] {
  const lastActualMonth = Number(periodEnd.slice(5, 7));

  let remainingRevenue = 0;
  let remainingCosts = 0;

  for (const line of budget.lines) {
    if (line.month <= lastActualMonth) continue;
    const category = CATEGORIES.find((c) => c.key === line.category_key);
    if (!category) continue;
    if (category.kind === "revenue") remainingRevenue += Number(line.amount);
    else remainingCosts += Number(line.amount);
  }

  return {
    full_year_revenue: round(current.revenue + remainingRevenue),
    full_year_profit: round(
      current.operatingProfit + (remainingRevenue - remainingCosts)
    ),
    actual_months: lastActualMonth,
    method: "Faktiske tall hittil pluss budsjett for resten av året",
  };
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

function buildKpis(input: {
  revenueTotal: number;
  current: Summary;
  previous: Summary | null;
  payrollTotal: number;
  payrollComparison: number | null;
  cash: ReportDataset["cash"];
  receivables: ReportDataset["receivables"];
  mrr: ReportDataset["revenue"]["recurring"];
}): Kpi[] {
  const { revenueTotal, current, previous, payrollTotal, cash, receivables, mrr } =
    input;

  const kpis: Kpi[] = [
    {
      key: "revenue",
      label: "Omsetning",
      value: round(revenueTotal),
      unit: "NOK",
      comparison: previous ? round(previous.revenue) : null,
      change_percent: previous ? percentChange(revenueTotal, previous.revenue) : null,
      higher_is_better: true,
    },
    {
      key: "operating_profit",
      label: "Driftsresultat",
      value: round(current.operatingProfit),
      unit: "NOK",
      comparison: previous ? round(previous.operatingProfit) : null,
      change_percent: previous
        ? percentChange(current.operatingProfit, previous.operatingProfit)
        : null,
      higher_is_better: true,
    },
    {
      key: "operating_margin",
      label: "Driftsmargin",
      value: ratio(current.operatingProfit, revenueTotal) ?? 0,
      unit: "percent",
      comparison: previous ? ratio(previous.operatingProfit, previous.revenue) : null,
      change_percent: null,
      higher_is_better: true,
    },
    {
      key: "payroll_share",
      label: "Lønnsandel av omsetning",
      value: ratio(payrollTotal, revenueTotal) ?? 0,
      unit: "percent",
      comparison: input.payrollComparison != null && previous
        ? ratio(input.payrollComparison, previous.revenue)
        : null,
      change_percent: null,
      higher_is_better: false,
    },
  ];

  if (cash.booked != null) {
    kpis.push({
      key: "cash",
      label: "Bokført likviditet",
      value: cash.booked,
      unit: "NOK",
      comparison: null,
      change_percent: null,
      higher_is_better: true,
    });
  }

  if (receivables.total != null) {
    kpis.push({
      key: "receivables",
      label: "Utestående kundefordringer",
      value: receivables.total,
      unit: "NOK",
      comparison: null,
      change_percent: null,
      higher_is_better: false,
    });
  }

  if (mrr?.mrr != null) {
    kpis.push({
      key: "mrr",
      label: "Gjentakende inntekter (MRR)",
      value: mrr.mrr,
      unit: "NOK",
      comparison: null,
      change_percent: null,
      higher_is_better: true,
    });
  }

  return kpis;
}

function buildQualityNotes(
  coverage: CoverageRow,
  periodStart: string,
  periodEnd: string,
  hasComparison: boolean
): string[] {
  const notes: string[] = [];

  if (coverage.first_date && periodStart < coverage.first_date) {
    notes.push(
      `Regnskapet starter ${formatDate(coverage.first_date)}. Perioden før dette inneholder ingen posteringer.`
    );
  }

  if (coverage.last_date && periodEnd > coverage.last_date) {
    notes.push(
      `Siste bokførte postering er ${formatDate(coverage.last_date)}. Perioden etter dette er uten data.`
    );
  }

  if (!hasComparison) {
    notes.push(
      "Sammenligningsperioden er ikke importert, så endringstall er utelatt."
    );
  }

  if (coverage.last_date) {
    const days = Math.floor(
      (Date.now() - new Date(coverage.last_date).getTime()) / 86_400_000
    );
    if (days > 14) {
      notes.push(
        `Det er ${days} dager siden siste bokførte transaksjon. Rapporten kan være ufullstendig.`
      );
    }
  }

  return notes;
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

function resolveComparison(
  request: DatasetRequest
): { start: string; end: string; type: string } | null {
  const { periodStart, periodEnd, comparisonType } = request;

  if (comparisonType === "none" || comparisonType === "budget") return null;

  if (comparisonType === "same_period_last_year") {
    return {
      start: shiftYear(periodStart, -1),
      end: shiftYear(periodEnd, -1),
      type: "same_period_last_year",
    };
  }

  // Previous period of the same length, ending the day before this one starts.
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const lengthMs = end.getTime() - start.getTime();

  const prevEnd = new Date(start.getTime() - 86_400_000);
  const prevStart = new Date(prevEnd.getTime() - lengthMs);

  return {
    start: iso(prevStart),
    end: iso(prevEnd),
    type: "previous_period",
  };
}

const MONTHS = [
  "januar", "februar", "mars", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "desember",
];

export function periodLabel(start: string, end: string): string {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);

  const wholeMonths = sd === 1 && ed === daysInMonth(ey, em);

  if (wholeMonths && sy === ey && sm === em) return `${MONTHS[sm - 1]} ${sy}`;
  if (wholeMonths && sy === ey) return `${MONTHS[sm - 1]}–${MONTHS[em - 1]} ${sy}`;
  if (sy === ey) return `${sd}. ${MONTHS[sm - 1]} – ${ed}. ${MONTHS[em - 1]} ${sy}`;
  return `${sd}. ${MONTHS[sm - 1]} ${sy} – ${ed}. ${MONTHS[em - 1]} ${ey}`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}. ${MONTHS[m - 1]} ${y}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function nextMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  return m === 12
    ? `${y + 1}-01`
    : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** The last month the ledger covers in full; a part-month is not comparable. */
function lastMonthFullyCovered(lastPosting: string): string {
  const [y, m, d] = lastPosting.split("-").map(Number);
  if (d >= daysInMonth(y, m)) return `${y}-${String(m).padStart(2, "0")}`;
  return m === 1
    ? `${y - 1}-12`
    : `${y}-${String(m - 1).padStart(2, "0")}`;
}

function shiftYear(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const targetYear = y + delta;
  const isLeap =
    (targetYear % 4 === 0 && targetYear % 100 !== 0) || targetYear % 400 === 0;
  const day = m === 2 && d === 29 && !isLeap ? 28 : d;
  return `${targetYear}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

function round(n: number): number {
  return Math.round(n);
}

/** Percentage of a base, to one decimal. Null when the base is zero. */
function ratio(value: number, base: number): number | null {
  if (base === 0) return null;
  return Math.round((value / base) * 1000) / 10;
}

/**
 * A percentage change against a zero or negative base is not meaningful — a
 * swing from a loss to a profit has no sensible percentage — so it is left
 * unset rather than reported as a misleading figure.
 */
function percentChange(value: number, base: number): number | null {
  if (base <= 0) return null;
  return Math.round(((value - base) / base) * 1000) / 10;
}

function marginPoints(current: Summary, previous: Summary): number | null {
  const now = ratio(current.operatingProfit, current.revenue);
  const then = ratio(previous.operatingProfit, previous.revenue);
  if (now == null || then == null) return null;
  return Math.round((now - then) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

interface AccountRow {
  account_number: string;
  name: string | null;
  opening_balance: number | null;
  closing_balance: number | null;
}

interface PartyRow {
  id: string;
  name: string;
  closing_balance: number | null;
}

interface CoverageRow {
  first_date: string | null;
  last_date: string | null;
  last_import: string | null;
}

async function loadCompany(supabase: DB, companyId: string) {
  const { data } = await supabase
    .from("companies")
    .select("name, org_number")
    .eq("id", companyId)
    .maybeSingle();
  return data as { name: string; org_number: string | null } | null;
}

async function loadPostings(
  supabase: DB,
  companyId: string,
  from: string,
  to: string
): Promise<Posting[]> {
  const all: Posting[] = [];

  for (let page = 0; ; page++) {
    const { data, error } = (await supabase
      .from("account_transactions")
      .select("account_number, amount, transaction_date, customer_id, supplier_id")
      .eq("company_id", companyId)
      .gte("transaction_date", from)
      .lte("transaction_date", to)
      .order("transaction_date", { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)) as {
      data: Posting[] | null;
      error: { message: string } | null;
    };

    if (error) throw new Error(`Kunne ikke lese posteringer: ${error.message}`);
    if (!data || data.length === 0) break;

    all.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  return all;
}

async function loadAccounts(
  supabase: DB,
  companyId: string,
  year: number
): Promise<AccountRow[]> {
  type NameRow = { account_number: string; name: string | null };
  type BalanceRow = {
    entity_key: string;
    opening_balance: number | null;
    closing_balance: number | null;
  };

  const [accounts, balances] = await Promise.all([
    fetchAll<NameRow>(
      (from, to) =>
        supabase
          .from("gl_accounts")
          .select("account_number, name")
          .eq("company_id", companyId)
          .order("account_number", { ascending: true })
          .range(from, to) as PromiseLike<{
          data: NameRow[] | null;
          error: { message: string } | null;
        }>,
      { label: "kontoer" }
    ),
    fetchAll<BalanceRow>(
      (from, to) =>
        supabase
          .from("entity_balances")
          .select("entity_key, opening_balance, closing_balance")
          .eq("company_id", companyId)
          .eq("entity_type", "account")
          .eq("year", year)
          .order("entity_key", { ascending: true })
          .range(from, to) as PromiseLike<{
          data: BalanceRow[] | null;
          error: { message: string } | null;
        }>,
      { label: "kontosaldoer" }
    ),
  ]);

  const byKey = new Map(balances.map((b) => [b.entity_key, b]));

  return accounts.map(
    (a) => ({
      account_number: a.account_number,
      name: a.name,
      opening_balance: byKey.get(a.account_number)?.opening_balance ?? null,
      closing_balance: byKey.get(a.account_number)?.closing_balance ?? null,
    })
  );
}

async function loadParties(
  supabase: DB,
  companyId: string,
  table: "customers" | "suppliers",
  year: number
): Promise<PartyRow[]> {
  type NameRow = { id: string; name: string };
  type BalanceRow = { entity_key: string; closing_balance: number | null };

  const [parties, balances] = await Promise.all([
    fetchAll<NameRow>(
      (from, to) =>
        supabase
          .from(table)
          .select("id, name")
          .eq("company_id", companyId)
          .order("id", { ascending: true })
          .range(from, to) as PromiseLike<{
          data: NameRow[] | null;
          error: { message: string } | null;
        }>,
      { label: table === "customers" ? "kunder" : "leverandører" }
    ),
    fetchAll<BalanceRow>(
      (from, to) =>
        supabase
          .from("entity_balances")
          .select("entity_key, closing_balance")
          .eq("company_id", companyId)
          .eq("entity_type", table === "customers" ? "customer" : "supplier")
          .eq("year", year)
          .order("entity_key", { ascending: true })
          .range(from, to) as PromiseLike<{
          data: BalanceRow[] | null;
          error: { message: string } | null;
        }>,
      { label: "partssaldoer" }
    ),
  ]);

  const byId = new Map(balances.map((b) => [b.entity_key, b.closing_balance]));

  return parties.map((p) => ({
    id: p.id,
    name: p.name,
    closing_balance: byId.get(p.id) ?? null,
  }));
}

async function loadInsights(
  supabase: DB,
  companyId: string
): Promise<ReportInsight[]> {
  const { data } = await supabase
    .from("financial_insights")
    .select("id, severity, title_nb, description_nb, metric_current, metric_reference, period")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(12);

  return (data ?? []).map((i) => ({
    id: i.id,
    severity: (i.severity ?? "info") as ReportInsight["severity"],
    title: i.title_nb,
    description: i.description_nb,
    basis: i.period ?? null,
  }));
}

async function loadCoverage(supabase: DB, companyId: string): Promise<CoverageRow> {
  const [first, last, imported] = await Promise.all([
    supabase
      .from("account_transactions")
      .select("transaction_date")
      .eq("company_id", companyId)
      .order("transaction_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("account_transactions")
      .select("transaction_date")
      .eq("company_id", companyId)
      .order("transaction_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("import_runs")
      .select("started_at")
      .eq("company_id", companyId)
      .eq("status", "completed")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    first_date: first.data?.transaction_date ?? null,
    last_date: last.data?.transaction_date ?? null,
    last_import: imported.data?.started_at ?? null,
  };
}

async function loadMrr(
  supabase: DB,
  companyId: string
): Promise<ReportDataset["revenue"]["recurring"]> {
  const [{ data }, products] = await Promise.all([
    supabase.rpc("company_mrr", { p_company_id: companyId }) as unknown as Promise<{
      data: Array<{
        month: string;
        normalised_mrr: number;
        total: number;
        is_complete: boolean;
      }> | null;
    }>,
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("is_recurring", true),
  ]);

  const complete = (data ?? []).filter((m) => m.is_complete);
  const latest = complete[complete.length - 1];
  if (!latest) return null;

  const mrr = Math.round(Number(latest.normalised_mrr));

  return {
    mrr,
    arr: mrr * 12,
    share_of_revenue: ratio(mrr, Number(latest.total)),
    based_on_product_list: (products.count ?? 0) > 0,
  };
}

async function loadBudget(supabase: DB, budgetId: string): Promise<BudgetRow | null> {
  type LineRow = { category_key: string; month: number; amount: number };

  const [{ data: budget }, lines] = await Promise.all([
    supabase.from("budgets").select("id, name, year").eq("id", budgetId).maybeSingle(),
    fetchAll<LineRow>(
      (from, to) =>
        supabase
          .from("budget_lines")
          .select("category_key, month, amount")
          .eq("budget_id", budgetId)
          .order("id", { ascending: true })
          .range(from, to) as PromiseLike<{
          data: LineRow[] | null;
          error: { message: string } | null;
        }>,
      { label: "budsjettlinjer" }
    ),
  ]);

  if (!budget) return null;

  return { id: budget.id, name: budget.name, year: budget.year, lines };
}
