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
    return NextResponse.json(getMockInsights());
  } catch (error) {
    console.error("Insights API error:", error);
    return errorResponse("Failed to load insights");
  }
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function getMockInsights() {
  const now = new Date().toISOString();
  return {
    insights: [
      {
        id: "mock-ins-1",
        type: "overdue_receivable",
        severity: "high",
        title: "Stor kundefordring 45 dager forbi forfall",
        description:
          "Nordfjord Consulting AS har en faktura på 185 000 kr (faktura #2024-0087) som er 45 dager forbi forfall. Historisk sett betaler de i snitt 12 dager etter forfall. Vurder purring.",
        metric_current: 185_000,
        metric_reference: null,
        period: null,
        evidence: [
          {
            type: "invoice",
            reference: "Faktura #2024-0087",
            detail: "Forfalt 28. juni 2026",
          },
        ],
        created_at: now,
        expires_at: null,
      },
      {
        id: "mock-ins-2",
        type: "cost_increase",
        severity: "medium",
        title: "Kontorkostnader har økt 23 % siste kvartal",
        description:
          "Kontorkostnader (konto 6300-6399) var 148 000 kr i Q2 mot 120 000 kr i Q1. Største bidragsyter er økt bruk av programvarelisenser.",
        metric_current: 148_000,
        metric_reference: 120_000,
        period: "Q2 2026",
        evidence: [
          {
            type: "comparison",
            reference: "Regnskap Q1 vs Q2 2026",
            detail: "Kontokategori 6300-6399",
          },
        ],
        created_at: now,
        expires_at: null,
      },
      {
        id: "mock-ins-3",
        type: "vat_reminder",
        severity: "medium",
        title: "MVA-termin 10. september nærmer seg",
        description:
          "Estimert MVA-betaling for 4. termin (jul-aug) er ca. 310 000 kr. Sørg for at det er nok likviditet. Forrige termin var betalingen 285 000 kr.",
        metric_current: 310_000,
        metric_reference: 285_000,
        period: "4. termin (jul-aug)",
        evidence: [
          {
            type: "calculation",
            reference: "Beregnet fra bokførte transaksjoner",
            detail: "Termin 3 var 285 000 kr",
          },
        ],
        created_at: now,
        expires_at: null,
      },
      {
        id: "mock-ins-4",
        type: "revenue_highlight",
        severity: "info",
        title: "Beste måned hittil: Mai 2026",
        description:
          "Mai hadde den høyeste omsetningen hittil i år med 1 620 000 kr, 18 % over gjennomsnittet. To store prosjektleveranser bidro til resultatet.",
        metric_current: 1_620_000,
        metric_reference: 1_370_000,
        period: "Mai 2026",
        evidence: [],
        created_at: now,
        expires_at: null,
      },
    ],
    count: 4,
  };
}
