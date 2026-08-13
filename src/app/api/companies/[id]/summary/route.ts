import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";
import type {
  FinancialMetricSnapshot,
  FinancialInsight,
  IntegrationSyncState,
} from "@/lib/types/database";

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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;
    const auth = await verifyCompanyAccess(companyId);
    if (auth instanceof NextResponse) return auth;

    const supabase = await createClient();

    // Show the most recent period the company actually holds data for.
    // Filtering to the current calendar year would show nothing at all to
    // someone who has only uploaded last year's file.
    const { data: allMetrics } = await supabase
      .from("financial_metric_snapshots")
      .select("*")
      .eq("company_id", companyId)
      .eq("period_type", "ytd")
      .order("period_end", { ascending: false })
      .limit(2000) as {
      data: FinancialMetricSnapshot[] | null;
    };

    const latestPeriodEnd = allMetrics?.[0]?.period_end ?? null;
    const metrics = (allMetrics ?? []).filter(
      (m) => m.period_end === latestPeriodEnd
    );

    // Load active insights
    const { data: insights } = await supabase
      .from("financial_insights")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(10) as { data: FinancialInsight[] | null };

    // Load sync state for data quality
    const { data: syncStates } = await supabase
      .from("integration_sync_state")
      .select("*")
      .eq("company_id", companyId)
      .order("last_sync_completed_at", { ascending: false }) as {
      data: IntegrationSyncState[] | null;
    };

    const revenueMetric = metrics.find((m) => m.metric === "revenue_ytd");
    const profitMetric = metrics.find(
      (m) => m.metric === "operating_profit_ytd"
    );

    if (revenueMetric && profitMetric) {
      const cashMetric = metrics.find((m) => m.metric === "cash_balance");
      const receivablesMetric = metrics.find(
        (m) => m.metric === "receivables_total"
      );

      const lastSync = syncStates?.[0]?.last_sync_completed_at ?? null;

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
        },
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

function mapInsights(insights: FinancialInsight[] | null) {
  return (insights ?? []).map((i) => ({
    id: i.id,
    type: i.insight_type,
    severity: i.severity,
    title: i.title_nb,
    description: i.description_nb,
    metric_current: i.metric_current,
    metric_reference: i.metric_reference,
    period: i.period,
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

function computeCompleteness(
  syncStates: IntegrationSyncState[]
): string {
  if (syncStates.length === 0) return "no_data";
  const completed = syncStates.filter(
    (s) => s.sync_status === "completed"
  ).length;
  const ratio = completed / syncStates.length;
  if (ratio >= 0.9) return "complete";
  if (ratio >= 0.5) return "partial";
  return "incomplete";
}
