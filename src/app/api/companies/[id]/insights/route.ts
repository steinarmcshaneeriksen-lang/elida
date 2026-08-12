import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";
import type { FinancialInsight } from "@/lib/types/database";

/**
 * GET /api/companies/[id]/insights
 *
 * Returns active financial insights for the company.
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

    // Load active insights, excluding expired
    const { data: insights } = await supabase
      .from("financial_insights")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order("created_at", { ascending: false }) as {
      data: FinancialInsight[] | null;
    };

    if (insights && insights.length > 0) {
      return NextResponse.json({
        insights: insights.map((i) => ({
          id: i.id,
          type: i.insight_type,
          severity: i.severity,
          title: i.title_nb,
          description: i.description_nb,
          metric_current: i.metric_current,
          metric_reference: i.metric_reference,
          period: i.period,
          evidence: i.evidence,
          created_at: i.created_at,
          expires_at: i.expires_at,
        })),
        count: insights.length,
      });
    }

    // No real data -- return mock
    return NextResponse.json({ insights: [], count: 0 });
  } catch (error) {
    console.error("Insights API error:", error);
    return errorResponse("Failed to load insights");
  }
}
