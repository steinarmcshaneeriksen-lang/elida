import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";

/**
 * GET /api/companies/[id]/recurring-revenue
 *
 * SAF-T does not mark revenue as recurring, so it is inferred from the
 * posting text and from how regularly a line repeats. The two signals are
 * kept separate rather than merged into one verdict:
 *
 *   licensed — the text names a licence, subscription or monthly price
 *   regular  — appears in three or more distinct months, without saying so
 *   one_off  — neither
 *
 * The middle group matters: a product subscription is often booked under its
 * product name alone, which no keyword would catch.
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

    const { data } = (await supabase.rpc(
      "company_recurring_revenue" as never,
      { p_company_id: companyId } as never
    )) as unknown as {
      data: Array<{
        description: string;
        months_active: number;
        total: number;
        avg_per_month: number;
        posting_count: number;
        first_month: string;
        last_month: string;
        has_keyword: boolean;
        has_cadence: boolean;
      }> | null;
    };

    const rows = (data ?? []).map((r) => ({
      description: r.description,
      months_active: r.months_active,
      total: Number(r.total),
      avg_per_month: Number(r.avg_per_month),
      posting_count: Number(r.posting_count),
      first_month: r.first_month,
      last_month: r.last_month,
      category: r.has_keyword
        ? ("licensed" as const)
        : r.has_cadence
          ? ("regular" as const)
          : ("one_off" as const),
    }));

    if (rows.length === 0) {
      return NextResponse.json({ has_data: false, totals: null, items: [] });
    }

    const sumOf = (category: string) =>
      rows.filter((r) => r.category === category).reduce((t, r) => t + r.total, 0);

    const licensed = sumOf("licensed");
    const regular = sumOf("regular");
    const oneOff = sumOf("one_off");
    const total = licensed + regular + oneOff;

    return NextResponse.json({
      has_data: true,
      totals: {
        licensed,
        regular,
        one_off: oneOff,
        total,
        // Share of revenue that repeats, on either signal.
        recurring_share:
          total > 0 ? Math.round(((licensed + regular) / total) * 100) : 0,
      },
      items: rows,
    });
  } catch (error) {
    console.error("Recurring revenue API error:", error);
    return errorResponse("Kunne ikke analysere gjentakende inntekter");
  }
}
