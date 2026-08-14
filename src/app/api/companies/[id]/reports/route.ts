import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";
import { buildReportDataset } from "@/lib/reports/dataset";
import { defaultConfiguration, reportTypeByKey } from "@/lib/reports/types";
import type { Json } from "@/lib/types/database";

export const maxDuration = 60;

/**
 * GET  /api/companies/[id]/reports — the report library.
 * POST /api/companies/[id]/reports — generate and store a report.
 *
 * The dataset is computed once here and stored with the report. A board pack
 * from July must keep saying in December what it said in July, so the stored
 * report is rendered from its own snapshot rather than recomputed against a
 * ledger that has since been corrected.
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

    const [{ data: reports }, { data: templates }] = await Promise.all([
      supabase
        .from("reports")
        .select(
          "id, report_type, title, period_start, period_end, comparison_type, status, generated_at"
        )
        .eq("company_id", companyId)
        .order("generated_at", { ascending: false })
        .limit(50),
      supabase
        .from("report_templates")
        .select("id, name, report_type, configuration")
        .eq("company_id", companyId)
        .order("name"),
    ]);

    return NextResponse.json({
      has_data: true,
      reports: reports ?? [],
      templates: templates ?? [],
    });
  } catch (error) {
    console.error("Reports list error:", error);
    return errorResponse("Kunne ikke hente rapporter");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;
    const auth = await verifyCompanyAccess(companyId);
    if (auth instanceof NextResponse) return auth;

    const body = (await request.json()) as {
      report_type?: string;
      period_start?: string;
      period_end?: string;
      configuration?: Partial<ReturnType<typeof defaultConfiguration>>;
      title?: string;
      save?: boolean;
    };

    const reportType = body.report_type ?? "month";
    const type = reportTypeByKey(reportType);

    if (!isIsoDate(body.period_start) || !isIsoDate(body.period_end)) {
      return NextResponse.json(
        { error: "Ugyldig periode. Oppgi period_start og period_end som ÅÅÅÅ-MM-DD." },
        { status: 400 }
      );
    }

    if (body.period_start! > body.period_end!) {
      return NextResponse.json(
        { error: "Perioden slutter før den starter." },
        { status: 400 }
      );
    }

    const config = {
      ...defaultConfiguration(reportType),
      ...(body.configuration ?? {}),
      branding: {
        ...defaultConfiguration(reportType).branding,
        ...(body.configuration?.branding ?? {}),
      },
    };

    const supabase = await createClient();

    const dataset = await buildReportDataset(supabase, {
      companyId,
      reportType,
      periodStart: body.period_start!,
      periodEnd: body.period_end!,
      comparisonType: config.comparison,
      budgetId: config.budgetId,
    });

    if (dataset.data_quality.transaction_count === 0) {
      return NextResponse.json(
        {
          error: "Ingen posteringer i perioden",
          detail:
            dataset.data_quality.books_cover
              ? `Regnskapet dekker ${dataset.data_quality.books_cover.start} til ${dataset.data_quality.books_cover.end}.`
              : "Ingen regnskapsdata er importert ennå.",
        },
        { status: 422 }
      );
    }

    const title = body.title?.trim() || `${type.title} ${dataset.period.label}`;

    let reportId: string | null = null;

    if (body.save !== false) {
      const { data: saved, error } = await supabase
        .from("reports")
        .insert({
          company_id: companyId,
          created_by: auth.userId,
          report_type: reportType,
          title,
          period_start: body.period_start!,
          period_end: body.period_end!,
          comparison_type: config.comparison,
          configuration: config as unknown as Json,
          dataset: dataset as unknown as Json,
          status: "ready",
        })
        .select("id")
        .single();

      if (error) {
        console.error("Report save error:", error);
      } else {
        reportId = saved.id;
      }
    }

    return NextResponse.json({
      report_id: reportId,
      title,
      configuration: config,
      dataset,
    });
  } catch (error) {
    console.error("Report generation error:", error);
    return errorResponse("Kunne ikke generere rapporten");
  }
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
