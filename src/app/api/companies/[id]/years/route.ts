import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";
import { fetchAll } from "@/lib/supabase/paginate";
import {
  resolveDataWindow,
  trailingNote,
  type MonthActivity,
} from "@/lib/data-window";

/**
 * GET /api/companies/[id]/years
 *
 * Which accounting years the company holds, and how far each one runs.
 *
 * Every period selector in the app was anchored to today's date, so after
 * importing a file for a previous year there was nowhere to look at it — the
 * import had worked, but nothing on screen changed. The pages now build their
 * period options from this.
 *
 * A year ends where its bookkeeping ends, not at its last posting: an export
 * taken in August carries forward-dated periodisations into December, and
 * treating those as months of trading made eight months of one year compare
 * against eleven of another.
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
      .order("year", { ascending: false })
      .limit(100);

    if (!years || years.length === 0) {
      return NextResponse.json({ has_data: false, years: [] });
    }

    // One row per month, so the end of each year can be judged by how busy its
    // months are rather than by the last stray posting.
    const activity = await fetchAll<{
      transaction_date: string;
    }>(
      (from, to) =>
        supabase
          .from("account_transactions")
          .select("transaction_date")
          .eq("company_id", companyId)
          .order("transaction_date", { ascending: true })
          .range(from, to) as PromiseLike<{
          data: Array<{ transaction_date: string }> | null;
          error: { message: string } | null;
        }>,
      { label: "posteringer" }
    );

    const byMonth = new Map<string, { count: number; lastDate: string }>();
    for (const row of activity) {
      const month = row.transaction_date.slice(0, 7);
      const entry = byMonth.get(month) ?? { count: 0, lastDate: row.transaction_date };
      entry.count++;
      if (row.transaction_date > entry.lastDate) entry.lastDate = row.transaction_date;
      byMonth.set(month, entry);
    }

    const bounds = years.map((y) => {
      const months: MonthActivity[] = [...byMonth.entries()]
        .filter(([month]) => month.startsWith(String(y.year)))
        .map(([month, v]) => ({
          month,
          postingCount: v.count,
          lastDate: v.lastDate,
        }));

      const window = resolveDataWindow(months);
      const first = months.sort((a, b) => a.month.localeCompare(b.month))[0];

      return {
        year: y.year,
        start: first ? `${y.year}-01-01` : y.start_date,
        end: window?.end ?? y.end_date,
        is_complete: (window?.end ?? "") >= `${y.year}-12-31`,
        // Forward-dated postings beyond the end, so a page can say why the
        // period stops where it does rather than looking as if data is missing.
        trailing_months: window?.trailingMonths ?? [],
        trailing_postings: window?.trailingPostings ?? 0,
        note: window ? trailingNote(window) : null,
      };
    });

    return NextResponse.json({
      has_data: true,
      years: bounds.filter((b) => b.start && b.end),
    });
  } catch (error) {
    console.error("Years API error:", error);
    return errorResponse("Kunne ikke hente regnskapsår");
  }
}
