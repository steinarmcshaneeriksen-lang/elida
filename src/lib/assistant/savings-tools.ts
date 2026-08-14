/**
 * Where the money is going, and what it would be worth to spend less of it.
 *
 * "Lag en anbefaling på besparelse jeg kan gjøre for å øke bunnlinja" is a
 * reasonable thing to ask an accounting assistant, and the honest way to
 * answer it is from the ledger rather than from general advice about cutting
 * subscriptions. Everything here is derived:
 *
 *   Costs that grew faster than revenue. If turnover fell 18 % and a cost line
 *   rose 12 %, that line is now carrying more of a smaller business, and it is
 *   the first place to look.
 *
 *   Suppliers by what they cost. A ranked list is not advice, but it is the
 *   list anyone would start from, and the top five usually carry most of it.
 *
 *   Costs that recur every month. A charge appearing in most months at a
 *   similar amount is a standing commitment — a subscription, a lease, a
 *   retainer — and those are what can actually be cancelled. A one-off is
 *   already gone.
 *
 * Each is stated with what it costs for the year and what a stated reduction
 * would add to the operating result, so the size of the prize is visible
 * rather than implied. The assistant is told to recommend, not to decide: only
 * the reader knows which of these is load-bearing.
 */

import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/paginate";
import { categoryForAccount } from "@/lib/reports/categories";
import { getCoverage } from "./coverage";

type ToolParams = Record<string, unknown>;
type ToolResult = Record<string, unknown>;

interface CostRow {
  account_number: string;
  amount: number;
  transaction_date: string;
  description: string | null;
  supplier_id: string | null;
}

/** A cost has to appear in this share of the period's months to count as fixed. */
const RECURRING_SHARE = 0.6;

/** Below this a line is not worth a recommendation of its own. */
const MATERIAL_SHARE = 0.02;

export const findSavings = async (
  companyId: string,
  params: ToolParams
): Promise<ToolResult> => {
  const coverage = await getCoverage(companyId);
  if (!coverage.has_data) {
    return {
      note:
        "Ingen regnskapsdata er importert, så det finnes ingen kostnader å " +
        "gå gjennom. Be brukeren importere en SAF-T-fil først.",
    };
  }

  const year = Number(params.year);
  const period =
    (Number.isInteger(year) && coverage.years.find((y) => y.year === year)) ||
    coverage.years[0];

  if (!period) return { note: "Ingen regnskapsår funnet." };

  const previous = coverage.years.find((y) => y.year === period.year - 1);

  const supabase = await createClient();

  const [current, comparison, suppliers] = await Promise.all([
    loadCosts(supabase, companyId, period.start, period.end),
    previous
      ? loadCosts(
          supabase,
          companyId,
          `${previous.year}-01-01`,
          shiftYear(period.end)
        )
      : Promise.resolve([] as CostRow[]),
    loadSupplierNames(supabase, companyId),
  ]);

  const total = sum(current);
  if (total <= 0) {
    return { note: `Ingen kostnader bokført i ${period.year}.` };
  }

  const months = monthsIn(period.start, period.end);

  return {
    period: { start: period.start, end: period.end, months },
    total_costs: Math.round(total),
    // Ranked, so the assistant leads with the largest.
    by_category: categoryBreakdown(current, comparison, total),
    top_suppliers: supplierBreakdown(current, suppliers, total),
    recurring_costs: recurringBreakdown(current, months),
    note:
      "Dette er hva regnskapet faktisk viser, ikke generelle råd. Anbefal, " +
      "ikke bestem: bare brukeren vet hvilke av disse som er nødvendige for " +
      "driften. Oppgi beløp og hva en reduksjon er verdt på bunnlinja, og si " +
      "hvis en post har vokst mens omsetningen falt. Ikke foreslå kutt i " +
      "poster du ikke har tall for.",
    data_source: "saft_import",
  };
};

// ---------------------------------------------------------------------------
// Breakdowns
// ---------------------------------------------------------------------------

/** Cost per category, and how it moved against the same period last year. */
function categoryBreakdown(
  current: CostRow[],
  previous: CostRow[],
  total: number
) {
  const now = groupBy(current, (r) => categoryForAccount(r.account_number)?.label ?? "Ukjent");
  const before = groupBy(previous, (r) => categoryForAccount(r.account_number)?.label ?? "Ukjent");

  return [...now.entries()]
    .map(([label, amount]) => {
      const was = before.get(label) ?? null;
      return {
        category: label,
        amount: Math.round(amount),
        share_of_costs: round1((amount / total) * 100),
        previous_amount: was == null ? null : Math.round(was),
        change_percent:
          was != null && was > 0 ? round1(((amount - was) / was) * 100) : null,
        // What trimming it a tenth would add to the operating result.
        saving_at_10_percent: Math.round(amount * 0.1),
      };
    })
    .filter((c) => c.share_of_costs >= MATERIAL_SHARE * 100)
    .sort((a, b) => b.amount - a.amount);
}

function supplierBreakdown(
  rows: CostRow[],
  names: Map<string, string>,
  total: number
) {
  const bySupplier = groupBy(
    rows.filter((r) => r.supplier_id),
    (r) => r.supplier_id!
  );

  return [...bySupplier.entries()]
    .map(([id, amount]) => ({
      supplier: names.get(id) ?? "Ukjent leverandør",
      amount: Math.round(amount),
      share_of_costs: round1((amount / total) * 100),
      saving_at_10_percent: Math.round(amount * 0.1),
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);
}

/**
 * Charges that appear month after month at a similar size.
 *
 * Grouped by posting text, because that is what distinguishes one subscription
 * from another inside the same account. A line has to appear in most of the
 * period's months to qualify: a cost booked once is already spent, and
 * recommending its cancellation is recommending nothing.
 */
function recurringBreakdown(rows: CostRow[], months: number) {
  if (months < 3) return [];

  const byText = new Map<string, { total: number; months: Set<string> }>();

  for (const row of rows) {
    const text = (row.description ?? "").trim().toLowerCase();
    if (!text) continue;

    const entry = byText.get(text) ?? { total: 0, months: new Set<string>() };
    entry.total += Number(row.amount);
    entry.months.add(row.transaction_date.slice(0, 7));
    byText.set(text, entry);
  }

  const floor = Math.max(2, Math.ceil(months * RECURRING_SHARE));

  return [...byText.entries()]
    .filter(([, v]) => v.months.size >= floor && v.total > 0)
    .map(([text, v]) => ({
      description: text,
      months_charged: v.months.size,
      total: Math.round(v.total),
      average_per_month: Math.round(v.total / v.months.size),
      // A standing commitment can be cancelled outright, so the whole annual
      // cost is what is at stake, not a percentage of it.
      annual_run_rate: Math.round((v.total / v.months.size) * 12),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function loadCosts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  companyId: string,
  start: string,
  end: string
): Promise<CostRow[]> {
  return fetchAll<CostRow>(
    (from, to) =>
      supabase
        .from("account_transactions")
        .select("account_number, amount, transaction_date, description, supplier_id")
        .eq("company_id", companyId)
        .gte("transaction_date", start)
        .lte("transaction_date", end)
        .gte("account_number", "4000")
        .lt("account_number", "8000")
        .order("id", { ascending: true })
        .range(from, to) as PromiseLike<{
        data: CostRow[] | null;
        error: { message: string } | null;
      }>,
    { label: "kostnadsposteringer" }
  );
}

async function loadSupplierNames(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  companyId: string
): Promise<Map<string, string>> {
  const rows = await fetchAll<{ id: string; name: string }>(
    (from, to) =>
      supabase
        .from("suppliers")
        .select("id, name")
        .eq("company_id", companyId)
        .order("id", { ascending: true })
        .range(from, to) as PromiseLike<{
        data: Array<{ id: string; name: string }> | null;
        error: { message: string } | null;
      }>,
    { label: "leverandører" }
  );

  return new Map(rows.map((r) => [r.id, r.name]));
}

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

function sum(rows: CostRow[]): number {
  return rows.reduce((total, r) => total + Number(r.amount), 0);
}

function groupBy(rows: CostRow[], key: (r: CostRow) => string): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) {
    out.set(key(row), (out.get(key(row)) ?? 0) + Number(row.amount));
  }
  return out;
}

function monthsIn(start: string, end: string): number {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  return (ey - sy) * 12 + (em - sm) + 1;
}

/** "2026-07-31" → "2025-07-31", so the comparison covers the same months. */
function shiftYear(iso: string): string {
  return `${Number(iso.slice(0, 4)) - 1}${iso.slice(4)}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
