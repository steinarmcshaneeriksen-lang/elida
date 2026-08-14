/**
 * Gathers what the rules in `derive.ts` need and stores what they find.
 *
 * Run after the metrics at every import, so the observations are recomputed
 * from the same facts the dashboard shows rather than accumulating over time.
 * They are derived, not authored: the stored set is replaced, never appended
 * to, so an observation cannot outlive the figure that produced it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/supabase/paginate";
import { deriveInsights, type Insight, type InsightInput } from "./derive";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

/** More than this and the panel stops being something anyone reads. */
const MAX_INSIGHTS = 6;

export async function generateCompanyInsights(
  supabase: DB,
  companyId: string
): Promise<{ written: number }> {
  const input = await collect(supabase, companyId);
  if (!input) {
    await replace(supabase, companyId, []);
    return { written: 0 };
  }

  const insights = deriveInsights(input).slice(0, MAX_INSIGHTS);
  await replace(supabase, companyId, insights);

  return { written: insights.length };
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

interface SnapshotRow {
  metric: string;
  period_start: string;
  period_end: string;
  value: number;
  comparison_value: number | null;
  comparison_period_start: string | null;
  comparison_period_end: string | null;
  metadata: { trailing_months?: string[]; trailing_postings?: number } | null;
}

async function collect(
  supabase: DB,
  companyId: string
): Promise<InsightInput | null> {
  const { data: snapshots } = (await supabase
    .from("financial_metric_snapshots")
    .select(
      "metric, period_start, period_end, value, comparison_value, comparison_period_start, comparison_period_end, metadata"
    )
    .eq("company_id", companyId)
    .eq("period_type", "ytd")
    .order("period_end", { ascending: false })
    .limit(200)) as { data: SnapshotRow[] | null };

  if (!snapshots || snapshots.length === 0) return null;

  // The most recent period, which is what the dashboard reports on.
  const latest = snapshots[0].period_end;
  const current = snapshots.filter((s) => s.period_end === latest);

  const find = (metric: string) => current.find((s) => s.metric === metric);
  const revenue = find("revenue_ytd");
  const costs = find("total_costs_ytd");
  if (!revenue || !costs) return null;

  const [months, customers] = await Promise.all([
    monthlyTotals(supabase, companyId, revenue.period_start, revenue.period_end),
    topCustomers(supabase, companyId),
  ]);

  const meta = revenue.metadata ?? {};

  return {
    period: { start: revenue.period_start, end: revenue.period_end },
    comparisonPeriod:
      revenue.comparison_period_start && revenue.comparison_period_end
        ? {
            start: revenue.comparison_period_start,
            end: revenue.comparison_period_end,
          }
        : null,
    revenue: Number(revenue.value),
    previousRevenue:
      revenue.comparison_value != null ? Number(revenue.comparison_value) : null,
    costs: Number(costs.value),
    previousCosts:
      costs.comparison_value != null ? Number(costs.comparison_value) : null,
    cash: numberOrNull(find("cash_balance")?.value),
    receivables: numberOrNull(find("receivables_total")?.value),
    months,
    customers,
    trailingMonths: meta.trailing_months ?? [],
    trailingPostings: meta.trailing_postings ?? 0,
  };
}

/**
 * Revenue and costs per month inside the period.
 *
 * Only whole months count: a period ending mid-month would otherwise make the
 * last month look like a collapse, and a rule about a weak month firing on a
 * half-finished one is worse than no rule.
 */
async function monthlyTotals(
  supabase: DB,
  companyId: string,
  start: string,
  end: string
): Promise<Array<{ month: string; revenue: number; costs: number }>> {
  type Row = { account_number: string; amount: number; transaction_date: string };

  const rows = await fetchAll<Row>(
    (from, to) =>
      supabase
        .from("account_transactions")
        .select("account_number, amount, transaction_date")
        .eq("company_id", companyId)
        .gte("transaction_date", start)
        .lte("transaction_date", end)
        .order("transaction_date", { ascending: true })
        .range(from, to) as PromiseLike<{
        data: Row[] | null;
        error: { message: string } | null;
      }>,
    { label: "posteringer" }
  );

  const byMonth = new Map<string, { revenue: number; costs: number }>();

  for (const row of rows) {
    const account = parseInt(row.account_number, 10);
    if (!Number.isFinite(account)) continue;

    const month = row.transaction_date.slice(0, 7);
    const entry = byMonth.get(month) ?? { revenue: 0, costs: 0 };

    if (account >= 3000 && account <= 3999) entry.revenue -= Number(row.amount);
    else if (account >= 4000 && account <= 7999) entry.costs += Number(row.amount);

    byMonth.set(month, entry);
  }

  const lastComplete = endsMonth(end) ? end.slice(0, 7) : previousMonth(end);

  return [...byMonth.entries()]
    .filter(([month]) => month <= lastComplete)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => ({ month, revenue: v.revenue, costs: v.costs }));
}

/**
 * Revenue per customer, via the stored procedure the customer page uses, so
 * an observation about concentration cannot disagree with the list behind it.
 */
async function topCustomers(
  supabase: DB,
  companyId: string
): Promise<Array<{ name: string; revenue: number }>> {
  const { data, error } = (await supabase.rpc("company_customer_summary" as never, {
    p_company_id: companyId,
  } as never)) as unknown as {
    data: Array<{ name: string; revenue: number }> | null;
    error: { message: string } | null;
  };

  if (error || !data) return [];

  return data
    .map((c) => ({ name: c.name, revenue: Number(c.revenue) || 0 }))
    .filter((c) => c.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function replace(
  supabase: DB,
  companyId: string,
  insights: Insight[]
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("financial_insights")
    .delete()
    .eq("company_id", companyId);

  if (deleteError) {
    throw new Error(`Kunne ikke rydde observasjoner: ${deleteError.message}`);
  }

  if (insights.length === 0) return;

  const { error } = await supabase.from("financial_insights").insert(
    insights.map((i) => ({
      company_id: companyId,
      insight_type: i.type,
      severity: i.severity,
      title_nb: i.title,
      description_nb: i.description,
      metric_current: i.current,
      metric_reference: i.reference,
      period: i.period,
      evidence: i.evidence,
      is_active: true,
    })) as never
  );

  if (error) {
    throw new Error(`Kunne ikke lagre observasjoner: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

function numberOrNull(value: number | undefined): number | null {
  return value == null ? null : Number(value);
}

/** True when the date is the last day of its month. */
function endsMonth(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  return d === new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "2026-08-13" → "2026-07". */
function previousMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const year = m === 1 ? y - 1 : y;
  const month = m === 1 ? 12 : m - 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}
