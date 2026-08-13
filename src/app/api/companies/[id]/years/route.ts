import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";

/**
 * GET /api/companies/[id]/years
 *
 * Which accounting years the company holds, and how far each one runs.
 *
 * Every period selector in the app was anchored to today's date, so after
 * importing a file for a previous year there was nowhere to look at it — the
 * import had worked, but nothing on screen changed. The pages now build their
 * period options from this.
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

    const { data: years } = await supabase
      .from("financial_years")
      .select("year, start_date, end_date, is_closed")
      .eq("company_id", companyId)
      .order("year", { ascending: false });

    if (!years || years.length === 0) {
      return NextResponse.json({ has_data: false, years: [] });
    }

    // The end of each year's actual data, which for the current year is the
    // last posting rather than 31 December.
    const bounds = await Promise.all(
      years.map(async (y) => {
        const { data: last } = await supabase
          .from("account_transactions")
          .select("transaction_date")
          .eq("company_id", companyId)
          .gte("transaction_date", `${y.year}-01-01`)
          .lte("transaction_date", `${y.year}-12-31`)
          .order("transaction_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data: first } = await supabase
          .from("account_transactions")
          .select("transaction_date")
          .eq("company_id", companyId)
          .gte("transaction_date", `${y.year}-01-01`)
          .lte("transaction_date", `${y.year}-12-31`)
          .order("transaction_date", { ascending: true })
          .limit(1)
          .maybeSingle();

        return {
          year: y.year,
          start: first?.transaction_date ?? y.start_date,
          end: last?.transaction_date ?? y.end_date,
          is_complete: (last?.transaction_date ?? "") >= `${y.year}-12-31`,
        };
      })
    );

    return NextResponse.json({
      has_data: true,
      years: bounds.filter((b) => b.start && b.end),
    });
  } catch (error) {
    console.error("Years API error:", error);
    return errorResponse("Kunne ikke hente regnskapsår");
  }
}
