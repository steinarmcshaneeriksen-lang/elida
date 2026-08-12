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

    // No real data -- return mock
    return NextResponse.json({ customers: getMockCustomers() });
  } catch (error) {
    console.error("Customers API error:", error);
    return errorResponse("Failed to load customer data");
  }
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function getMockCustomers() {
  return [
    {
      id: "cust-1",
      name: "Nordfjord Consulting AS",
      customer_number: "10001",
      org_number: "912 345 678",
      email: "faktura@nordfjord.no",
      is_active: true,
      outstanding: 285_000,
      overdue: 185_000,
      total_invoiced_ytd: 1_420_000,
      avg_payment_days: 42,
      late_payment_ratio: 0.55,
      risk_score: 72,
      payment_trend: "worsening",
      last_payment_date: "2026-07-15",
    },
    {
      id: "cust-2",
      name: "Bergen Energi AS",
      customer_number: "10002",
      org_number: "923 456 789",
      email: "regnskap@bergenenergi.no",
      is_active: true,
      outstanding: 520_000,
      overdue: 120_000,
      total_invoiced_ytd: 2_180_000,
      avg_payment_days: 35,
      late_payment_ratio: 0.25,
      risk_score: 38,
      payment_trend: "stable",
      last_payment_date: "2026-08-02",
    },
    {
      id: "cust-3",
      name: "Stavanger Tech Solutions",
      customer_number: "10003",
      org_number: "934 567 890",
      email: "betaling@stavangertech.no",
      is_active: true,
      outstanding: 340_000,
      overdue: 0,
      total_invoiced_ytd: 1_650_000,
      avg_payment_days: 28,
      late_payment_ratio: 0.1,
      risk_score: 15,
      payment_trend: "improving",
      last_payment_date: "2026-08-06",
    },
    {
      id: "cust-4",
      name: "Tromso Digital AS",
      customer_number: "10004",
      org_number: "945 678 901",
      email: "post@tromsodigital.no",
      is_active: true,
      outstanding: 180_000,
      overdue: 65_000,
      total_invoiced_ytd: 890_000,
      avg_payment_days: 38,
      late_payment_ratio: 0.33,
      risk_score: 48,
      payment_trend: "stable",
      last_payment_date: "2026-07-28",
    },
    {
      id: "cust-5",
      name: "Oslo Innovations AS",
      customer_number: "10005",
      org_number: "956 789 012",
      email: "faktura@osloinnovations.no",
      is_active: true,
      outstanding: 410_000,
      overdue: 50_000,
      total_invoiced_ytd: 1_920_000,
      avg_payment_days: 32,
      late_payment_ratio: 0.14,
      risk_score: 22,
      payment_trend: "stable",
      last_payment_date: "2026-08-11",
    },
    {
      id: "cust-6",
      name: "Kristiansand Maritime",
      customer_number: "10006",
      org_number: "967 890 123",
      email: "okonomi@krs-maritime.no",
      is_active: true,
      outstanding: 135_000,
      overdue: 0,
      total_invoiced_ytd: 990_000,
      avg_payment_days: 26,
      late_payment_ratio: 0.05,
      risk_score: 8,
      payment_trend: "improving",
      last_payment_date: "2026-08-09",
    },
  ];
}
