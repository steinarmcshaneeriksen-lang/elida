import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";

/**
 * GET /api/companies/[id]/mrr
 *
 * Monthly recurring revenue.
 *
 * The headline is the last COMPLETE month. An export taken mid-month leaves a
 * partial final month, and reading that as the run rate understates MRR
 * badly — in the ledger this was built against, the part-month was under half
 * a normal month. The partial month is still returned for the trend, marked
 * as incomplete.
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

    const { data } = (await supabase.rpc("company_mrr" as never, {
      p_company_id: companyId,
    } as never)) as unknown as {
      data: Array<{
        month: string;
        recurring: number;
        one_off: number;
        total: number;
        is_complete: boolean;
        normalised_mrr: number;
      }> | null;
    };

    const months = (data ?? []).map((m) => ({
      month: m.month,
      // Billed in the month, before spreading non-monthly contracts.
      recurring: Number(m.recurring),
      // Each contract divided by the interval at which it is invoiced, which
      // is the figure a subscription business calls MRR.
      normalised: Number(m.normalised_mrr),
      one_off: Number(m.one_off),
      total: Number(m.total),
      is_complete: m.is_complete,
    }));

    // Whether the split rests on the company's own product list or on
    // inference decides how much weight the figure carries.
    const { data: productRows } = (await supabase
      .from("products")
      .select("id, is_recurring")
      .eq("company_id", companyId)
      .limit(500)) as {
      data: Array<{ id: string; is_recurring: boolean }> | null;
    };

    const basedOnProductList = (productRows ?? []).some((p) => p.is_recurring);

    const complete = months.filter((m) => m.is_complete);

    if (complete.length === 0) {
      return NextResponse.json({
        has_data: false,
        mrr: null,
        months,
      });
    }

    const current = complete[complete.length - 1];
    const previous = complete[complete.length - 2] ?? null;

    const change =
      previous && previous.normalised > 0
        ? ((current.normalised - previous.normalised) / previous.normalised) * 100
        : null;

    // Averaging the last three complete months damps the month-to-month
    // noise a single billing run can cause.
    const window = complete.slice(-3);
    const average =
      window.reduce((t, m) => t + m.normalised, 0) / window.length;

    return NextResponse.json({
      has_data: true,
      mrr: {
        month: current.month,
        value: current.normalised,
        billed_value: current.recurring,
        based_on_product_list: basedOnProductList,
        previous_value: previous?.normalised ?? null,
        change_percent: change != null ? Math.round(change * 10) / 10 : null,
        // Annual run rate, not booked annual revenue.
        arr: current.normalised * 12,
        average_3m: Math.round(average),
        recurring_share:
          current.total > 0
            ? Math.round((current.normalised / current.total) * 100)
            : 0,
      },
      months,
    });
  } catch (error) {
    console.error("MRR API error:", error);
    return errorResponse("Kunne ikke beregne MRR");
  }
}
