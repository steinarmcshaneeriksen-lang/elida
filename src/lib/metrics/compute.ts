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
/**
 * Trade receivables. 1570 and up are other short-term receivables — staff
 * loans, prepayments — which are not what a customer owes, so they are left
 * out of the figure the dashboard labels "utestående kundefordringer".
 */
const RECEIVABLES_RANGE = { from: 1500, to: 1569 };

function inRange(account: number, range: { from: number; to: number }): boolean {
  return account >= range.from && account <= range.to;
}

interface YearBalances {
  /** Closing balance on bank and cash accounts at the year's period end. */
  cash: number | null;
  /** Sum of the per-customer closing balances, when the file states them. */
  customerReceivables: number | null;
  /** Fallback: the trade-receivable account range. */
  accountReceivables: number | null;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function computeCompanyMetrics(
  supabase: DB,
  companyId: string
): Promise<ComputedMetrics> {
  const [postings, balances] = await Promise.all([
    loadPostings(supabase, companyId),
    loadYearBalances(supabase, companyId),
  ]);

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

    // Balance-sheet figures come from the balances recorded for THIS year, not
    // from whichever file was imported last. A closing balance is a fact about
    // a date, so summing the year's postings would give the movement instead.
    const current = summarise(yearPostings, balances.get(year));

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
      if (value == null) continue;
      const comparisonValue = previous?.[metric] ?? null;

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
  cash_balance?: number;
  receivables_total?: number;
  [key: string]: number | undefined;
}

/**
 * Amounts are stored debit-positive. Revenue accounts are credit-normal, so
 * their sum is negative and is flipped to read as income.
 *
 * Profit and loss are period sums. A balance is not: it is a fact about a
 * date, and is read from the balances recorded for that year rather than
 * derived by adding up the period's postings — which gives the movement, and
 * once reported receivables of -320 283 for a company owed 1 417 909.
 */
function summarise(
  postings: Posting[],
  balances?: YearBalances
): PeriodMetrics {
  let revenue = 0;
  let costs = 0;

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
  }

  const metrics: PeriodMetrics = {
    revenue_ytd: round(revenue),
    total_costs_ytd: round(costs),
    operating_profit_ytd: round(revenue - costs),
  };

  if (balances?.cash != null) metrics.cash_balance = round(balances.cash);

  // "Utestående kundefordringer" on the dashboard links through to the
  // customer list, so it must be the total that list shows: the sum of the
  // per-customer balances. The account range also sweeps in intercompany and
  // staff receivables, which would make the two pages disagree, so it is only
  // the fallback for files that state no party balances.
  const receivables = balances?.customerReceivables ?? balances?.accountReceivables;
  if (receivables != null) metrics.receivables_total = round(receivables);

  return metrics;
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

/**
 * The opening and closing balances the accounting system states per account.
 * A SAF-T file carries these alongside the postings; without them a balance
 * cannot be reconstructed from an export that starts mid-history.
 */
/**
 * Balances per year, read from entity_balances.
 *
 * Before this existed, a file for an earlier year overwrote the later year's
 * balances on gl_accounts and customers, and the dashboard presented the older
 * figures as current.
 */
async function loadYearBalances(
  supabase: DB,
  companyId: string
): Promise<Map<number, YearBalances>> {
  const { data } = (await supabase
    .from("entity_balances")
    .select("entity_type, entity_key, year, closing_balance")
    .eq("company_id", companyId)) as {
    data: Array<{
      entity_type: string;
      entity_key: string;
      year: number;
      closing_balance: number | null;
    }> | null;
  };

  const byYear = new Map<number, YearBalances>();

  const bucket = (year: number) => {
    let entry = byYear.get(year);
    if (!entry) {
      entry = { cash: null, customerReceivables: null, accountReceivables: null };
      byYear.set(year, entry);
    }
    return entry;
  };

  for (const row of data ?? []) {
    if (row.closing_balance == null) continue;
    const value = Number(row.closing_balance);
    const entry = bucket(row.year);

    if (row.entity_type === "customer") {
      entry.customerReceivables = (entry.customerReceivables ?? 0) + value;
      continue;
    }

    if (row.entity_type !== "account") continue;

    const account = parseInt(row.entity_key, 10);
    if (!Number.isFinite(account)) continue;

    if (inRange(account, CASH_RANGE)) entry.cash = (entry.cash ?? 0) + value;
    if (inRange(account, RECEIVABLES_RANGE)) {
      entry.accountReceivables = (entry.accountReceivables ?? 0) + value;
    }
  }

  return byYear;
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
