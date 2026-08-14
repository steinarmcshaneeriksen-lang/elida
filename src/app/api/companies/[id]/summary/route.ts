import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";
import type {
  FinancialMetricSnapshot,
  FinancialInsight,
  IntegrationSyncState,
} from "@/lib/types/database";
import { trailingNote } from "@/lib/data-window";
import { fetchAll } from "@/lib/supabase/paginate";

/**
 * GET /api/companies/[id]/summary
 *
 * Returns the "six questions" dashboard data:
 * - Revenue YTD vs comparison
 * - Profit YTD vs comparison
 * - Cash position + 60-day forecast minimum
 * - Receivables total
 * - Active insights
 *
 * Overdue receivables and upcoming obligations were carried as fields that were
 * always null: SAF-T states a balance per customer, never the invoices behind
 * it, so neither can be derived. Removed rather than left as permanent nulls
 * for something to be wired up to.
 * - Data quality indicators
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: companyId } = await params;
    const auth = await verifyCompanyAccess(companyId);
    if (auth instanceof NextResponse) return auth;

    const supabase = await createClient();

    // Show the most recent period the company actually holds data for.
    // Filtering to the current calendar year would show nothing at all to
    // someone who has only uploaded last year's file.
    const { data: allMetrics } = (await supabase
      .from("financial_metric_snapshots")
      .select("*")
      .eq("company_id", companyId)
      .eq("period_type", "ytd")
      .order("period_end", { ascending: false })
      .limit(2000)) as {
      data: FinancialMetricSnapshot[] | null;
    };

    const latestPeriodEnd = allMetrics?.[0]?.period_end ?? null;
    const metrics = (allMetrics ?? []).filter(
      (m) => m.period_end === latestPeriodEnd,
    );

    // Load active insights
    const { data: insights } = (await supabase
      .from("financial_insights")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(10)) as { data: FinancialInsight[] | null };

    // Load sync state for data quality
    const { data: syncStates } = (await supabase
      .from("integration_sync_state")
      .select("*")
      .eq("company_id", companyId)
      .order("last_sync_completed_at", { ascending: false })) as {
      data: IntegrationSyncState[] | null;
    };

    const revenueMetric = metrics.find((m) => m.metric === "revenue_ytd");
    const profitMetric = metrics.find(
      (m) => m.metric === "operating_profit_ytd",
    );

    if (revenueMetric && profitMetric) {
      const cashMetric = metrics.find((m) => m.metric === "cash_balance");
      const receivablesMetric = metrics.find(
        (m) => m.metric === "receivables_total",
      );

      const lastSync = syncStates?.[0]?.last_sync_completed_at ?? null;

      // The shape of the period behind each headline figure. The cards state
      // the amount and the movement; this is the path between them.
      const monthly = await loadMonthly(
        supabase,
        companyId,
        revenueMetric.period_start,
        revenueMetric.period_end
      );

      // A metric with no comparison means the previous year has not been
      // imported. Report that as absent rather than as zero, which would
      // render as a 100% collapse.
      const withComparison = (m: FinancialMetricSnapshot) => ({
        ytd: m.value,
        comparison_ytd: m.comparison_value,
        change_percent: m.change_percent,
        has_comparison: m.comparison_value != null,
      });

      return NextResponse.json({
        has_data: true,
        period: {
          start: revenueMetric.period_start,
          end: revenueMetric.period_end,
          comparison_start: revenueMetric.comparison_period_start,
          comparison_end: revenueMetric.comparison_period_end,
          // Set when the period was cut short of the last posting because
          // what follows is forward-dated periodisation rather than trading.
          note: periodNote(revenueMetric),
        },
        monthly,
        revenue: withComparison(revenueMetric),
        profit: withComparison(profitMetric),
        cash: cashMetric ? { current: cashMetric.value } : null,
        receivables: receivablesMetric
          ? { total: receivablesMetric.value }
          : null,
        insights: mapInsights(insights),
        data_quality: {
          last_sync: lastSync,
          freshness: computeFreshness(lastSync),
          completeness: computeCompleteness(syncStates ?? []),
        },
      });
    }

    // No financial data synced yet — return an honest empty state.
    // The UI shows a "connect your accounting system" prompt for this.
    const lastSync = syncStates?.[0]?.last_sync_completed_at ?? null;

    return NextResponse.json({
      has_data: false,
      revenue: null,
      profit: null,
      cash: null,
      receivables: null,
      insights: mapInsights(insights),
      data_quality: {
        last_sync: lastSync,
        freshness: computeFreshness(lastSync),
        completeness: computeCompleteness(syncStates ?? []),
      },
    });
  } catch (error) {
    console.error("Summary API error:", error);
    return errorResponse("Failed to load summary");
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MonthRow {
  month: string;
  revenue: number;
  profit: number;
  margin: number;
}

/**
 * Revenue and operating profit per month inside the period.
 *
 * Amounts are stored debit-positive, so revenue accounts — which are
 * credit-normal — are flipped to read as income.
 */
async function loadMonthly(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  companyId: string,
  start: string,
  end: string
): Promise<MonthRow[]> {
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

  return [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => ({
      month,
      revenue: Math.round(v.revenue),
      profit: Math.round(v.revenue - v.costs),
      margin: v.revenue > 0 ? Math.round(((v.revenue - v.costs) / v.revenue) * 1000) / 10 : 0,
    }));
}

/**
 * The metrics carry what was left outside the period. Rebuilt into the
 * sentence the dashboard shows, so a shortened period explains itself instead
 * of looking like months of missing data.
 */
function periodNote(metric: FinancialMetricSnapshot): string | null {
  const meta = metric.metadata as {
    trailing_months?: string[];
    trailing_postings?: number;
  } | null;

  if (!meta?.trailing_months?.length) return null;

  return trailingNote({
    end: metric.period_end,
    trailingMonths: meta.trailing_months,
    trailingPostings: meta.trailing_postings ?? 0,
  });
}

/** Most serious first — created_at is the same second for the whole set. */
const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

function mapInsights(insights: FinancialInsight[] | null) {
  return (insights ?? [])
    .slice()
    .sort(
      (a, b) =>
        (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9),
    )
    .map((i) => ({
      id: i.id,
      type: i.insight_type,
      severity: i.severity,
      title: i.title_nb,
      description: i.description_nb,
      metric_current: i.metric_current,
      metric_reference: i.metric_reference,
      period: i.period,
      // The figures the rule fired on, so the reader can check it rather than
      // take the sentence on trust.
      evidence: Array.isArray(i.evidence) ? (i.evidence as string[]) : [],
      created_at: i.created_at,
    }));
}

function computeFreshness(lastSync: string | null): string {
  if (!lastSync) return "no_data";
  const diffMs = Date.now() - new Date(lastSync).getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours < 1) return "live";
  if (diffHours < 24) return "recent";
  if (diffHours < 72) return "stale";
  return "outdated";
}

function computeCompleteness(syncStates: IntegrationSyncState[]): string {
  if (syncStates.length === 0) return "no_data";
  const completed = syncStates.filter(
    (s) => s.sync_status === "completed",
  ).length;
  const ratio = completed / syncStates.length;
  if (ratio >= 0.9) return "complete";
  if (ratio >= 0.5) return "partial";
  return "incomplete";
}
