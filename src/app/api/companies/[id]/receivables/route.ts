import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";
import { AGING_BUCKETS } from "@/lib/constants";
import type {
  OutgoingInvoice,
  CustomerPaymentProfile,
} from "@/lib/types/database";

type InvoiceWithCustomer = OutgoingInvoice & {
  customers: { name: string; customer_number: string | null } | null;
};
type ProfileWithCustomer = CustomerPaymentProfile & {
  customers: { name: string; customer_number: string | null } | null;
};

/**
 * GET /api/companies/[id]/receivables
 *
 * Returns:
 * - Total receivables with aging buckets
 * - Top customers by outstanding amount
 * - Overdue invoices list
 * - Customer payment profiles
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
    const today = new Date().toISOString().split("T")[0];

    // Load open outgoing invoices
    const { data: invoices } = await supabase
      .from("outgoing_invoices")
      .select("*, customers(name, customer_number)")
      .eq("company_id", companyId)
      .gt("remaining_amount", 0) as { data: InvoiceWithCustomer[] | null };

    // Load customer payment profiles
    const { data: profiles } = await supabase
      .from("customer_payment_profiles")
      .select("*, customers(name, customer_number)")
      .eq("company_id", companyId) as { data: ProfileWithCustomer[] | null };

    if (invoices && invoices.length > 0) {
      const todayDate = new Date(today);

      // Build aging buckets
      const aging = AGING_BUCKETS.map((bucket) => {
        const matching = invoices.filter((inv) => {
          if (!inv.due_date) return false;
          const dueDate = new Date(inv.due_date);
          const daysPastDue = Math.max(
            0,
            Math.floor(
              (todayDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
            )
          );
          if (bucket.max_days === null) return daysPastDue >= bucket.min_days;
          return daysPastDue >= bucket.min_days && daysPastDue <= bucket.max_days;
        });
        const amount = matching.reduce(
          (sum, inv) => sum + (inv.remaining_amount ?? 0),
          0
        );
        return {
          label: bucket.label,
          min_days: bucket.min_days,
          max_days: bucket.max_days,
          amount,
          count: matching.length,
        };
      });

      const totalOutstanding = invoices.reduce(
        (sum, inv) => sum + (inv.remaining_amount ?? 0),
        0
      );

      const overdueInvoices = invoices.filter(
        (inv) => inv.due_date && new Date(inv.due_date) < todayDate
      );
      const totalOverdue = overdueInvoices.reduce(
        (sum, inv) => sum + (inv.remaining_amount ?? 0),
        0
      );

      // Group by customer
      const byCustomer: Record<
        string,
        { name: string; outstanding: number; overdue: number }
      > = {};
      for (const inv of invoices) {
        const custId = inv.customer_id ?? "unknown";
        const custName =
          (inv.customers as { name: string } | null)?.name ?? "Ukjent";
        if (!byCustomer[custId]) {
          byCustomer[custId] = { name: custName, outstanding: 0, overdue: 0 };
        }
        byCustomer[custId].outstanding += inv.remaining_amount ?? 0;
        if (inv.due_date && new Date(inv.due_date) < todayDate) {
          byCustomer[custId].overdue += inv.remaining_amount ?? 0;
        }
      }

      const topCustomers = Object.entries(byCustomer)
        .map(([id, data]) => ({
          customer_id: id,
          customer_name: data.name,
          outstanding: data.outstanding,
          overdue: data.overdue,
        }))
        .sort((a, b) => b.outstanding - a.outstanding)
        .slice(0, 10);

      return NextResponse.json({
        total_outstanding: totalOutstanding,
        total_overdue: totalOverdue,
        count_outstanding: invoices.length,
        count_overdue: overdueInvoices.length,
        aging,
        top_customers: topCustomers,
        overdue_invoices: overdueInvoices
          .sort(
            (a, b) =>
              new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime()
          )
          .map((inv) => ({
            id: inv.id,
            invoice_number: inv.invoice_number,
            customer_name:
              (inv.customers as { name: string } | null)?.name ?? "Ukjent",
            amount: inv.total_amount,
            remaining: inv.remaining_amount,
            due_date: inv.due_date,
            days_overdue: Math.floor(
              (todayDate.getTime() - new Date(inv.due_date!).getTime()) /
                (1000 * 60 * 60 * 24)
            ),
          })),
        payment_profiles: (profiles ?? []).map((p) => ({
          customer_id: p.customer_id,
          customer_name:
            (p.customers as { name: string } | null)?.name ?? "Ukjent",
          total_invoices: p.total_invoices,
          avg_payment_days: p.avg_actual_payment_days,
          late_payment_ratio: p.late_payment_ratio,
          risk_score: p.payment_risk_score,
          payment_trend: p.payment_trend,
        })),
      });
    }

    // No real data -- return mock
    return NextResponse.json(getMockReceivables());
  } catch (error) {
    console.error("Receivables API error:", error);
    return errorResponse("Failed to load receivables data");
  }
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function getMockReceivables() {
  return {
    total_outstanding: 1_870_000,
    total_overdue: 420_000,
    count_outstanding: 12,
    count_overdue: 4,
    aging: [
      { label: "Current", min_days: 0, max_days: 0, amount: 1_110_000, count: 5 },
      { label: "1-30 days", min_days: 1, max_days: 30, amount: 340_000, count: 3 },
      { label: "31-60 days", min_days: 31, max_days: 60, amount: 235_000, count: 2 },
      { label: "61-90 days", min_days: 61, max_days: 90, amount: 185_000, count: 1 },
      { label: "90+ days", min_days: 91, max_days: null, amount: 0, count: 0 },
    ],
    top_customers: [
      { customer_id: "cust-2", customer_name: "Bergen Energi AS", outstanding: 520_000, overdue: 120_000 },
      { customer_id: "cust-5", customer_name: "Oslo Innovations AS", outstanding: 410_000, overdue: 50_000 },
      { customer_id: "cust-3", customer_name: "Stavanger Tech Solutions", outstanding: 340_000, overdue: 0 },
      { customer_id: "cust-1", customer_name: "Nordfjord Consulting AS", outstanding: 285_000, overdue: 185_000 },
      { customer_id: "cust-4", customer_name: "Tromso Digital AS", outstanding: 180_000, overdue: 65_000 },
      { customer_id: "cust-6", customer_name: "Kristiansand Maritime", outstanding: 135_000, overdue: 0 },
    ],
    overdue_invoices: [
      {
        id: "inv-1",
        invoice_number: "2024-0087",
        customer_name: "Nordfjord Consulting AS",
        amount: 185_000,
        remaining: 185_000,
        due_date: "2026-06-28",
        days_overdue: 45,
      },
      {
        id: "inv-2",
        invoice_number: "2026-0122",
        customer_name: "Bergen Energi AS",
        amount: 120_000,
        remaining: 120_000,
        due_date: "2026-07-25",
        days_overdue: 18,
      },
      {
        id: "inv-3",
        invoice_number: "2026-0131",
        customer_name: "Tromso Digital AS",
        amount: 65_000,
        remaining: 65_000,
        due_date: "2026-07-21",
        days_overdue: 22,
      },
      {
        id: "inv-4",
        invoice_number: "2026-0139",
        customer_name: "Oslo Innovations AS",
        amount: 50_000,
        remaining: 50_000,
        due_date: "2026-08-04",
        days_overdue: 8,
      },
    ],
    payment_profiles: [
      {
        customer_id: "cust-1",
        customer_name: "Nordfjord Consulting AS",
        total_invoices: 18,
        avg_payment_days: 42,
        late_payment_ratio: 0.55,
        risk_score: 72,
        payment_trend: "worsening",
      },
      {
        customer_id: "cust-2",
        customer_name: "Bergen Energi AS",
        total_invoices: 24,
        avg_payment_days: 35,
        late_payment_ratio: 0.25,
        risk_score: 38,
        payment_trend: "stable",
      },
      {
        customer_id: "cust-3",
        customer_name: "Stavanger Tech Solutions",
        total_invoices: 20,
        avg_payment_days: 28,
        late_payment_ratio: 0.1,
        risk_score: 15,
        payment_trend: "improving",
      },
      {
        customer_id: "cust-4",
        customer_name: "Tromso Digital AS",
        total_invoices: 12,
        avg_payment_days: 38,
        late_payment_ratio: 0.33,
        risk_score: 48,
        payment_trend: "stable",
      },
      {
        customer_id: "cust-5",
        customer_name: "Oslo Innovations AS",
        total_invoices: 22,
        avg_payment_days: 32,
        late_payment_ratio: 0.14,
        risk_score: 22,
        payment_trend: "stable",
      },
      {
        customer_id: "cust-6",
        customer_name: "Kristiansand Maritime",
        total_invoices: 10,
        avg_payment_days: 26,
        late_payment_ratio: 0.05,
        risk_score: 8,
        payment_trend: "improving",
      },
    ],
  };
}
