/**
 * Period metrics and year-over-year comparison.
 *
 * Nothing populated `financial_metric_snapshots` before, so the dashboard and
 * three assistant tools read an empty table and reported "no data" even after
 * a successful import. This module derives those metrics from the imported
 * ledger.
 *
 * Comparison is the point of the exercise. Two rules make it honest:
 *
 *   1. Like for like. A year with data through June is compared against
 *      January–June of the previous year, never against the full previous
 *      year, which would otherwise read as a collapse in revenue.
 *
 *   2. Recompute everything, every time. Uploading last year's file after
 *      this year's must backfill the comparison on the year already imported,
 *      so metrics for all years are rebuilt after each import.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ACCOUNT_CLASSES } from "@/lib/constants";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

/** Rows are fetched in pages; a year of postings can be large. */
const PAGE_SIZE = 1000;

export interface ComputedMetrics {
  years: number[];
  metricsWritten: number;
  /** Years that gained a comparison because an earlier year was present. */
  yearsWithComparison: number[];
}

interface Posting {
  account_number: string;
  amount: number;
  transaction_date: string;
}

// ---------------------------------------------------------------------------
// Account classification
// ---------------------------------------------------------------------------

/** Bank and cash accounts (1900–1999) in the Norwegian standard chart. */
const CASH_RANGE = { from: 1900, to: 1999 };
/** Trade receivables (1500–1599). */
const RECEIVABLES_RANGE = { from: 1500, to: 1599 };

function inRange(account: number, range: { from: number; to: number }): boolean {
  return account >= range.from && account <= range.to;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function computeCompanyMetrics(
  supabase: DB,
  companyId: string
): Promise<ComputedMetrics> {
  const postings = await loadPostings(supabase, companyId);

  if (postings.length === 0) {
    return { years: [], metricsWritten: 0, yearsWithComparison: [] };
  }

  // Group by calendar year. Norwegian financial years follow the calendar
  // year unless a company has an approved deviating year; SAF-T does not
  // state which, so calendar year is the defensible default.
  const byYear = new Map<number, Posting[]>();
  for (const p of postings) {
    const year = Number(p.transaction_date.slice(0, 4));
    if (!Number.isFinite(year)) continue;
    const bucket = byYear.get(year);
    if (bucket) bucket.push(p);
    else byYear.set(year, [p]);
  }

  const years = [...byYear.keys()].sort();
  await upsertFinancialYears(supabase, companyId, byYear);

  const rows: Record<string, unknown>[] = [];
  const yearsWithComparison: number[] = [];
  const calculatedAt = new Date().toISOString();

  for (const year of years) {
    const yearPostings = byYear.get(year)!;

    // The period runs to the last posting, not to 31 December, so a partial
    // year is not treated as a full one.
    const lastDate = yearPostings
      .map((p) => p.transaction_date)
      .reduce((a, b) => (a > b ? a : b));
    const periodStart = `${year}-01-01`;
    const periodEnd = lastDate;

    const current = summarise(yearPostings);

    // Same slice of the previous year, so the comparison is like for like.
    const previousPostings = byYear.get(year - 1);
    const hasComparison = previousPostings != null;
    const comparisonStart = `${year - 1}-01-01`;
    const comparisonEnd = shiftYear(periodEnd, -1);
    const previous = hasComparison
      ? summarise(
          previousPostings.filter((p) => p.transaction_date <= comparisonEnd)
        )
      : null;

    if (hasComparison) yearsWithComparison.push(year);

    for (const [metric, value] of Object.entries(current)) {
      const comparisonValue = previous
        ? previous[metric as keyof typeof previous]
        : null;

      rows.push(
        buildSnapshot({
          companyId,
          metric,
          value,
          periodStart,
          periodEnd,
          comparisonValue,
          comparisonStart: hasComparison ? comparisonStart : null,
          comparisonEnd: hasComparison ? comparisonEnd : null,
          calculatedAt,
        })
      );
    }
  }

  await replaceSnapshots(supabase, rows);

  return { years, metricsWritten: rows.length, yearsWithComparison };
}

// ---------------------------------------------------------------------------
// Metric derivation
// ---------------------------------------------------------------------------

interface PeriodMetrics {
  revenue_ytd: number;
  operating_profit_ytd: number;
  total_costs_ytd: number;
  cash_balance: number;
  receivables_total: number;
  [key: string]: number;
}

/**
 * Amounts are stored debit-positive. Revenue accounts are credit-normal, so
 * their sum is negative and is flipped to read as income.
 */
function summarise(postings: Posting[]): PeriodMetrics {
  let revenue = 0;
  let costs = 0;
  let cash = 0;
  let receivables = 0;

  for (const p of postings) {
    const account = parseInt(p.account_number, 10);
    if (!Number.isFinite(account)) continue;

    if (
      account >= ACCOUNT_CLASSES.REVENUE.from &&
      account <= ACCOUNT_CLASSES.REVENUE.to
    ) {
      revenue -= p.amount;
    } else if (
      account >= ACCOUNT_CLASSES.COST_OF_GOODS.from &&
      account <= ACCOUNT_CLASSES.OTHER_OPERATING.to
    ) {
      costs += p.amount;
    }

    // Balance-sheet figures are running totals, not period sums; the postings
    // passed in already stop at the period end.
    if (inRange(account, CASH_RANGE)) cash += p.amount;
    if (inRange(account, RECEIVABLES_RANGE)) receivables += p.amount;
  }

  return {
    revenue_ytd: round(revenue),
    total_costs_ytd: round(costs),
    operating_profit_ytd: round(revenue - costs),
    cash_balance: round(cash),
    receivables_total: round(receivables),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Shifts an ISO date by whole years, clamping 29 February to the 28th. */
function shiftYear(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const targetYear = y + delta;
  const isLeap =
    (targetYear % 4 === 0 && targetYear % 100 !== 0) || targetYear % 400 === 0;
  const day = m === 2 && d === 29 && !isLeap ? 28 : d;
  return `${targetYear}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function buildSnapshot(input: {
  companyId: string;
  metric: string;
  value: number;
  periodStart: string;
  periodEnd: string;
  comparisonValue: number | null;
  comparisonStart: string | null;
  comparisonEnd: string | null;
  calculatedAt: string;
}): Record<string, unknown> {
  const changeAmount =
    input.comparisonValue != null ? input.value - input.comparisonValue : null;

  // A percentage against a zero or negative base is not meaningful — a swing
  // from a loss to a profit has no sensible percentage — so it is left unset
  // rather than reported as a misleading number.
  const changePercent =
    input.comparisonValue != null && input.comparisonValue > 0
      ? round(((input.value - input.comparisonValue) / input.comparisonValue) * 100)
      : null;

  return {
    company_id: input.companyId,
    metric: input.metric,
    period_type: "ytd",
    period_start: input.periodStart,
    period_end: input.periodEnd,
    value: input.value,
    comparison_value: input.comparisonValue,
    comparison_period_start: input.comparisonStart,
    comparison_period_end: input.comparisonEnd,
    change_amount: changeAmount,
    change_percent: changePercent,
    // Derived directly from posted transactions, not estimated.
    confidence: "confirmed",
    calculated_at: input.calculatedAt,
    calculation_version: "1",
    metadata: {},
  };
}

async function replaceSnapshots(
  supabase: DB,
  rows: Record<string, unknown>[]
): Promise<void> {
  for (let i = 0; i < rows.length; i += PAGE_SIZE) {
    const { error } = await supabase
      .from("financial_metric_snapshots")
      .upsert(rows.slice(i, i + PAGE_SIZE) as never, {
        onConflict: "company_id,metric,period_type,period_start,period_end",
      });

    if (error) {
      throw new Error(`Kunne ikke lagre nøkkeltall: ${error.message}`);
    }
  }
}

async function upsertFinancialYears(
  supabase: DB,
  companyId: string,
  byYear: Map<number, Posting[]>
): Promise<void> {
  const rows = [...byYear.keys()].map((year) => ({
    company_id: companyId,
    year,
    start_date: `${year}-01-01`,
    end_date: `${year}-12-31`,
    // A year is treated as closed once a later year has postings.
    is_closed: byYear.has(year + 1),
    source_system: "saft",
    source_id: String(year),
  }));

  const { error } = await supabase
    .from("financial_years")
    .upsert(rows as never, { onConflict: "company_id,year" });

  if (error) {
    throw new Error(`Kunne ikke lagre regnskapsår: ${error.message}`);
  }
}

async function loadPostings(
  supabase: DB,
  companyId: string
): Promise<Posting[]> {
  const all: Posting[] = [];

  for (let page = 0; ; page++) {
    const { data, error } = (await supabase
      .from("account_transactions")
      .select("account_number, amount, transaction_date")
      .eq("company_id", companyId)
      .order("transaction_date", { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)) as {
      data: Posting[] | null;
      error: { message: string } | null;
    };

    if (error) {
      throw new Error(`Kunne ikke lese posteringer: ${error.message}`);
    }
    if (!data || data.length === 0) break;

    all.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  return all;
}
