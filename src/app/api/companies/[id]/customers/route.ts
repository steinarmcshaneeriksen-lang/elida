import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";

/**
 * GET /api/companies/[id]/customers
 *
 * Figures come from two places, in order of authority:
 *
 *   closing_balance — stated by the accounting system in the SAF-T file, so
 *   it is what the customer actually owes.
 *
 *   revenue and activity — aggregated from the postings attributed to the
 *   customer, which the file supplies through CustomerID on ledger lines.
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

    const [{ data: rows }, { data: summary }] = await Promise.all([
      supabase
        .from("customers")
        .select("id, name, customer_number, org_number, email, closing_balance")
        .eq("company_id", companyId)
        .eq("is_active", true),
      supabase.rpc("company_customer_summary" as never, {
        p_company_id: companyId,
      } as never) as unknown as Promise<{
        data:
          | Array<{
              customer_id: string;
              revenue: number;
              outstanding: number;
              outstanding_is_stated: boolean;
              posting_count: number;
              last_activity: string | null;
            }>
          | null;
      }>,
    ]);

    const byId = new Map(
      (summary ?? []).map((s) => [s.customer_id, s])
    );

    const customers = (rows ?? []).map((c) => {
      const agg = byId.get(c.id);
      return {
        id: c.id,
        name: c.name,
        customer_number: c.customer_number,
        org_number: c.org_number,
        email: c.email,
        // Only report an outstanding amount when the file actually states
        // one. The alternative is the movement within the period, which is
        // not a debt and misleads if shown as one.
        outstanding: c.closing_balance ?? null,
        outstanding_is_stated: c.closing_balance != null,
        // Kept separately so the detail page can still show the movement,
        // clearly named, without it standing in for a balance.
        period_movement: Number(agg?.outstanding ?? 0),
        revenue: Number(agg?.revenue ?? 0),
        posting_count: Number(agg?.posting_count ?? 0),
        last_activity: agg?.last_activity ?? null,
      };
    });

    // Sort by what is actually known. Where balances are stated, largest
    // debtor first answers the question the page exists for; otherwise
    // revenue is the meaningful ranking.
    const anyStated = customers.some((c) => c.outstanding_is_stated);
    customers.sort((a, b) =>
      anyStated
        ? (b.outstanding ?? 0) - (a.outstanding ?? 0)
        : b.revenue - a.revenue
    );

    return NextResponse.json({ customers });
  } catch (error) {
    console.error("Customers API error:", error);
    return errorResponse("Kunne ikke hente kundedata");
  }
}
