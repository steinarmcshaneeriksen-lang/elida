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
 * - Receivables total + overdue
 * - Upcoming obligations (30 days)
 * - Active insights
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

    // Attempt to load real data from financial_metric_snapshots
    const now = new Date();
    const yearStart = `${now.getFullYear()}-01-01`;
    const yearEnd = `${now.getFullYear()}-12-31`;

    const { data: metrics } = await supabase
      .from("financial_metric_snapshots")
      .select("*")
      .eq("company_id", companyId)
      .gte("period_start", yearStart)
      .lte("period_end", yearEnd)
      .order("calculated_at", { ascending: false }) as {
      data: FinancialMetricSnapshot[] | null;
    };

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

    // If we have real metric snapshots, use them
    const revenueMetric = metrics?.find((m) => m.metric === "revenue_ytd");
    const profitMetric = metrics?.find(
      (m) => m.metric === "operating_profit_ytd"
    );

    if (revenueMetric && profitMetric) {
      const cashMetric = metrics?.find((m) => m.metric === "cash_balance");
      const forecastMetric = metrics?.find(
        (m) => m.metric === "cash_forecast_60d_min"
      );
      const receivablesMetric = metrics?.find(
        (m) => m.metric === "receivables_total"
      );
      const overdueMetric = metrics?.find(
        (m) => m.metric === "receivables_overdue"
      );
      const obligationsMetric = metrics?.find(
        (m) => m.metric === "obligations_30d"
      );

      const lastSync = syncStates?.[0]?.last_sync_completed_at ?? null;

      return NextResponse.json({
        has_data: true,
        revenue: {
          ytd: revenueMetric.value,
          comparison_ytd: revenueMetric.comparison_value ?? 0,
          change_percent: revenueMetric.change_percent ?? 0,
        },
        profit: {
          ytd: profitMetric.value,
          comparison_ytd: profitMetric.comparison_value ?? 0,
          change_percent: profitMetric.change_percent ?? 0,
        },
        cash: {
          current: cashMetric?.value ?? 0,
          forecast_60_day_min: forecastMetric?.value ?? 0,
        },
        receivables: {
          total: receivablesMetric?.value ?? 0,
          overdue: overdueMetric?.value ?? 0,
        },
        upcoming_obligations_30d: obligationsMetric?.value ?? 0,
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
      upcoming_obligations_30d: null,
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
