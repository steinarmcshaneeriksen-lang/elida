import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";
import type { ReportDataset } from "@/lib/reports/dataset";
import type { ReportConfiguration } from "@/lib/reports/types";

/**
 * A stored report is served from its snapshot, never recomputed. That is the
 * whole point of storing it: reopening July's board pack in December must show
 * what the board actually saw.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; reportId: string }> }
) {
  try {
    const { id: companyId, reportId } = await params;
    const auth = await verifyCompanyAccess(companyId);
    if (auth instanceof NextResponse) return auth;

    const supabase = await createClient();

    const { data: report } = await supabase
      .from("reports")
      .select("*")
      .eq("id", reportId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (!report) {
      return NextResponse.json({ error: "Fant ikke rapporten" }, { status: 404 });
    }

    return NextResponse.json({
      id: report.id,
      title: report.title,
      report_type: report.report_type,
      period_start: report.period_start,
      period_end: report.period_end,
      generated_at: report.generated_at,
      configuration: report.configuration as unknown as ReportConfiguration,
      dataset: report.dataset as unknown as ReportDataset,
    });
  } catch (error) {
    console.error("Report fetch error:", error);
    return errorResponse("Kunne ikke hente rapporten");
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; reportId: string }> }
) {
  try {
    const { id: companyId, reportId } = await params;
    const auth = await verifyCompanyAccess(companyId);
    if (auth instanceof NextResponse) return auth;

    const supabase = await createClient();
    const { error } = await supabase
      .from("reports")
      .delete()
      .eq("id", reportId)
      .eq("company_id", companyId);

    if (error) return errorResponse("Kunne ikke slette rapporten");

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Report delete error:", error);
    return errorResponse("Kunne ikke slette rapporten");
  }
}
