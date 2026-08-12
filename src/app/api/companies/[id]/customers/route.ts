import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";
import type {
  Customer,
  CustomerPaymentProfile,
} from "@/lib/types/database";

/**
 * GET /api/companies/[id]/customers
 *
 * Returns customer list with payment profiles and risk scores.
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

    // Load customers with their payment profiles
    const { data: customers } = await supabase
      .from("customers")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("name", { ascending: true }) as { data: Customer[] | null };

    const { data: profiles } = await supabase
      .from("customer_payment_profiles")
      .select("*")
      .eq("company_id", companyId) as { data: CustomerPaymentProfile[] | null };

    if (customers && customers.length > 0) {
      const profileMap = new Map(
        (profiles ?? []).map((p) => [p.customer_id, p])
      );

      const result = customers.map((c) => {
        const profile = profileMap.get(c.id);
        return {
          id: c.id,
          name: c.name,
          customer_number: c.customer_number,
          org_number: c.org_number,
          email: c.email,
          is_active: c.is_active,
          outstanding: profile?.current_outstanding ?? 0,
          overdue: profile?.current_overdue ?? 0,
          total_invoiced_ytd: profile?.total_invoiced_amount ?? 0,
          avg_payment_days: profile?.avg_actual_payment_days ?? null,
          late_payment_ratio: profile?.late_payment_ratio ?? null,
          risk_score: profile?.payment_risk_score ?? null,
          payment_trend: profile?.payment_trend ?? null,
          last_payment_date: profile?.last_payment_date ?? null,
        };
      });

      return NextResponse.json({ customers: result });
    }

    // Nothing imported yet — return an honest empty state.
    return NextResponse.json({ customers: [] });
  } catch (error) {
    console.error("Customers API error:", error);
    return errorResponse("Failed to load customer data");
  }
}
