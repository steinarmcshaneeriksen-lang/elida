import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";

/**
 * GET /api/companies/[id]/suppliers
 *
 * Mirrors the customers route: the balance stated in the SAF-T file is what
 * we owe the supplier, and cost and activity are aggregated from the postings
 * attributed to them via SupplierID.
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
        .from("suppliers")
        .select(
          "id, name, supplier_number, org_number, closing_balance, is_possible_private_person"
        )
        .eq("company_id", companyId)
        .eq("is_active", true),
      supabase.rpc("company_supplier_summary" as never, {
        p_company_id: companyId,
      } as never) as unknown as Promise<{
        data:
          | Array<{
              supplier_id: string;
              cost: number;
              outstanding: number;
              outstanding_is_stated: boolean;
              posting_count: number;
              last_activity: string | null;
            }>
          | null;
      }>,
    ]);

    const byId = new Map((summary ?? []).map((s) => [s.supplier_id, s]));

    const suppliers = (rows ?? []).map((s) => {
      const agg = byId.get(s.id);
      return {
        id: s.id,
        name: s.name,
        supplier_number: s.supplier_number,
        org_number: s.org_number,
        is_possible_private_person: s.is_possible_private_person,
        outstanding: s.closing_balance ?? agg?.outstanding ?? 0,
        outstanding_is_stated:
          s.closing_balance != null || (agg?.outstanding_is_stated ?? false),
        cost: Number(agg?.cost ?? 0),
        posting_count: Number(agg?.posting_count ?? 0),
        last_activity: agg?.last_activity ?? null,
      };
    });

    // Biggest spend first.
    suppliers.sort((a, b) => b.cost - a.cost);

    return NextResponse.json({ suppliers });
  } catch (error) {
    console.error("Suppliers API error:", error);
    return errorResponse("Kunne ikke hente leverandørdata");
  }
}
