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

    // No real data -- return mock data for MVP
    return NextResponse.json(
      getMockSummary(insights, syncStates)
    );
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

function getMockSummary(
  insights: FinancialInsight[] | null,
  syncStates: IntegrationSyncState[] | null
) {
  const lastSync = syncStates?.[0]?.last_sync_completed_at ?? null;

  const insightsList =
    insights && insights.length > 0
      ? mapInsights(insights)
      : [
          {
            id: "mock-ins-1",
            type: "overdue_receivable",
            severity: "high",
            title: "Stor kundefordring 45 dager forbi forfall",
            description:
              "Nordfjord Consulting AS har en faktura pa 185 000 kr som er 45 dager forbi forfall.",
            metric_current: 185_000,
            metric_reference: null,
            period: null,
            created_at: new Date().toISOString(),
          },
          {
            id: "mock-ins-2",
            type: "cost_increase",
            severity: "medium",
            title: "Kontorkostnader har okt 23 % siste kvartal",
            description:
              "Kontorkostnader var 148 000 kr i Q2 mot 120 000 kr i Q1.",
            metric_current: 148_000,
            metric_reference: 120_000,
            period: "Q2 2026",
            created_at: new Date().toISOString(),
          },
          {
            id: "mock-ins-3",
            type: "vat_reminder",
            severity: "medium",
            title: "MVA-termin neste maned",
            description:
              "Estimert MVA-betaling for 4. termin er ca. 310 000 kr.",
            metric_current: 310_000,
            metric_reference: 285_000,
            period: "4. termin (jul-aug)",
            created_at: new Date().toISOString(),
          },
        ];

  return {
    revenue: {
      ytd: 9_050_000,
      comparison_ytd: 8_230_000,
      change_percent: 10.0,
    },
    profit: {
      ytd: 1_284_000,
      comparison_ytd: 1_074_000,
      change_percent: 19.6,
    },
    cash: {
      current: 2_340_000,
      forecast_60_day_min: 1_650_000,
    },
    receivables: {
      total: 1_870_000,
      overdue: 420_000,
    },
    upcoming_obligations_30d: 1_920_000,
    insights: insightsList,
    data_quality: {
      last_sync: lastSync,
      freshness: lastSync ? computeFreshness(lastSync) : "mock_data",
      completeness: lastSync
        ? computeCompleteness(syncStates ?? [])
        : "mock_data",
    },
  };
}
