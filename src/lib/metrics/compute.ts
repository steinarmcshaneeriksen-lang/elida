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
 *      Where the data ends is a judgement, not the last posting date: an
 *      export taken in August carries forward-dated periodisations into
 *      December, and treating those as months of trading compared eight
 *      months of one year against eleven of another — reported as revenue
 *      down 38 % for a company that had not fallen at all. See
 *      `resolveDataWindow`.
 *
 *   2. Recompute everything, every time. Uploading last year's file after
 *      this year's must backfill the comparison on the year already imported,
 *      so metrics for all years are rebuilt after each import.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ACCOUNT_CLASSES } from "@/lib/constants";
import { fetchAll } from "@/lib/supabase/paginate";
import { resolveDataWindow, type MonthActivity } from "@/lib/data-window";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

/** Rows are fetched in pages; a year of postings can be large. */
const PAGE_SIZE = 1000;

export interface ComputedMetrics {
  years: number[];
  metricsWritten: number;
  /** Years that gained a comparison because an earlier year was present. */
  yearsWithComparison: number[];
  /** Figures that came out disagreeing with their own source. */
  warnings: string[];
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
    return { years: [], metricsWritten: 0, yearsWithComparison: [], warnings: [] };
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

    // The period runs to where the bookkeeping ends, not to 31 December and
    // not to the last stray posting, so a partial year is neither treated as
    // a full one nor stretched by forward-dated entries.
    const window = resolveDataWindow(monthActivity(yearPostings));
    const periodStart = `${year}-01-01`;
    const periodEnd =
      window?.end ??
      yearPostings.map((p) => p.transaction_date).reduce((a, b) => (a > b ? a : b));

    // Postings after that end exist — they are real — but they fall outside
    // the period being reported, so they must not be counted on one side of a
    // comparison whose other side is cut at the same date a year earlier.
    const inPeriod = yearPostings.filter((p) => p.transaction_date <= periodEnd);

    // Balance-sheet figures come from the balances recorded for THIS year, not
    // from whichever file was imported last. A closing balance is a fact about
    // a date, so summing the year's postings would give the movement instead.
    const current = summarise(inPeriod, balances.get(year));

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

    // Carried so a page can explain why the period stops where it does,
    // rather than looking as though months are missing.
    const metadata = {
      trailing_months: window?.trailingMonths ?? [],
      trailing_postings: window?.trailingPostings ?? 0,
      last_posting: yearPostings
        .map((p) => p.transaction_date)
        .reduce((a, b) => (a > b ? a : b)),
    };

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
          metadata,
        })
      );
    }
  }

  await replaceSnapshots(supabase, companyId, rows);

  // The dashboard reads these snapshots while the customer page reads the
  // party balances directly. They describe the same thing and must agree; a
  // short read once made them differ by more than a million kroner without
  // anything failing. Checked here so a mismatch surfaces at import.
  const warnings = await checkAgainstPartyBalances(supabase, companyId, rows);

  return { years, metricsWritten: rows.length, yearsWithComparison, warnings };
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

/** Postings bucketed per calendar month, for judging where the year ends. */
function monthActivity(postings: Posting[]): MonthActivity[] {
  const byMonth = new Map<string, { count: number; lastDate: string }>();

  for (const p of postings) {
    const month = p.transaction_date.slice(0, 7);
    const entry = byMonth.get(month) ?? { count: 0, lastDate: p.transaction_date };
    entry.count++;
    if (p.transaction_date > entry.lastDate) entry.lastDate = p.transaction_date;
    byMonth.set(month, entry);
  }

  return [...byMonth.entries()].map(([month, v]) => ({
    month,
    postingCount: v.count,
    lastDate: v.lastDate,
  }));
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
  metadata?: Record<string, unknown>;
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
    metadata: input.metadata ?? {},
  };
}

/**
 * Writes the freshly computed set and removes what it replaces.
 *
 * The snapshot key includes the period, so a recomputation that moves a
 * period end writes new rows and leaves the old ones behind. The dashboard
 * reads whichever period ends last, so a superseded period kept winning: the
 * year read to 6 December — a date reached only by forward-dated
 * periodisations — long after the figures had been corrected to end in
 * August.
 */
async function replaceSnapshots(
  supabase: DB,
  companyId: string,
  rows: Record<string, unknown>[]
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("financial_metric_snapshots")
    .delete()
    .eq("company_id", companyId)
    .eq("period_type", "ytd");

  if (deleteError) {
    throw new Error(`Kunne ikke rydde nøkkeltall: ${deleteError.message}`);
  }

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
  type BalanceRow = {
    entity_type: string;
    entity_key: string;
    year: number;
    closing_balance: number | null;
  };

  // Paged: one row per entity per year runs past 1000 as soon as a second
  // year is imported, and a short read would drop a year's balances entirely.
  const data = await fetchAll<BalanceRow>(
    (from, to) =>
      supabase
        .from("entity_balances")
        .select("entity_type, entity_key, year, closing_balance")
        .eq("company_id", companyId)
        .order("id", { ascending: true })
        .range(from, to) as PromiseLike<{
        data: BalanceRow[] | null;
        error: { message: string } | null;
      }>,
    { label: "saldoer" }
  );

  const byYear = new Map<number, YearBalances>();

  const bucket = (year: number) => {
    let entry = byYear.get(year);
    if (!entry) {
      entry = { cash: null, customerReceivables: null, accountReceivables: null };
      byYear.set(year, entry);
    }
    return entry;
  };

  for (const row of data) {
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

/**
 * Cross-checks each written receivables figure against the sum of the customer
 * balances for the same year — the number the customer page shows. They are
 * computed by different code from the same facts, so a difference means one of
 * them is wrong, and saying so beats two pages quietly disagreeing.
 */
async function checkAgainstPartyBalances(
  supabase: DB,
  companyId: string,
  rows: Record<string, unknown>[]
): Promise<string[]> {
  const written = rows.filter((r) => r.metric === "receivables_total");
  if (written.length === 0) return [];

  const balances = await fetchAll<{ year: number; closing_balance: number | null }>(
    (from, to) =>
      supabase
        .from("entity_balances")
        .select("year, closing_balance")
        .eq("company_id", companyId)
        .eq("entity_type", "customer")
        .order("entity_key", { ascending: true })
        .range(from, to) as PromiseLike<{
        data: Array<{ year: number; closing_balance: number | null }> | null;
        error: { message: string } | null;
      }>,
    { label: "kundesaldoer" }
  );

  if (balances.length === 0) return [];

  const byYear = new Map<number, number>();
  for (const b of balances) {
    if (b.closing_balance == null) continue;
    byYear.set(b.year, (byYear.get(b.year) ?? 0) + Number(b.closing_balance));
  }

  const warnings: string[] = [];

  for (const row of written) {
    const year = Number(String(row.period_end).slice(0, 4));
    const expected = byYear.get(year);
    if (expected == null) continue;

    const difference = Math.abs(Number(row.value) - expected);
    // Rounding across a few hundred customers, not a real break.
    if (difference < 1) continue;

    warnings.push(
      `Kundefordringer for ${year} ble beregnet til ${format(Number(row.value))}, ` +
        `mens summen av kundesaldoene er ${format(expected)}. ` +
        "Tallet på oversikten og kundesiden vil avvike. Kontakt support."
    );
  }

  return warnings;
}

function format(n: number): string {
  return `${Math.round(n).toLocaleString("nb-NO")} kr`;
}
