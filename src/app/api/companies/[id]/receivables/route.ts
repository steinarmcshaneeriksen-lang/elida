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

    // Nothing imported yet — return an honest empty state.
    return NextResponse.json({
      has_data: false,
      total_outstanding: 0,
      total_overdue: 0,
      count_outstanding: 0,
      count_overdue: 0,
      top_customers: [],
      overdue_invoices: [],
      payment_profiles: [],
    });
  } catch (error) {
    console.error("Receivables API error:", error);
    return errorResponse("Failed to load receivables data");
  }
}
