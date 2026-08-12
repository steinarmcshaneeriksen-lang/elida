import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";
import type {
  Customer,
  CustomerPaymentProfile,
  OutgoingInvoice,
  CustomerLedgerEntry,
} from "@/lib/types/database";

/**
 * GET /api/companies/[id]/customers/[customerId]
 *
 * Returns detailed customer info: profile, payment history, invoices, trend.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; customerId: string }> }
) {
  try {
    const { id: companyId, customerId } = await params;
    const auth = await verifyCompanyAccess(companyId);
    if (auth instanceof NextResponse) return auth;

    const supabase = await createClient();

    // Load customer record
    const { data: customer } = await supabase
      .from("customers")
      .select("*")
      .eq("id", customerId)
      .eq("company_id", companyId)
      .single() as { data: Customer | null };

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    // Load payment profile
    const { data: profile } = await supabase
      .from("customer_payment_profiles")
      .select("*")
      .eq("customer_id", customerId)
      .eq("company_id", companyId)
      .single() as { data: CustomerPaymentProfile | null };

    // Load open invoices
    const { data: invoices } = await supabase
      .from("outgoing_invoices")
      .select("*")
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .order("invoice_date", { ascending: false })
      .limit(50) as { data: OutgoingInvoice[] | null };

    // Load recent ledger entries for payment history
    const { data: ledgerEntries } = await supabase
      .from("customer_ledger_entries")
      .select("*")
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .order("entry_date", { ascending: false })
      .limit(50) as { data: CustomerLedgerEntry[] | null };

    // Compute monthly revenue trend
    const monthlyTrend: Record<string, number> = {};
    for (const inv of invoices ?? []) {
      if (inv.invoice_date && inv.total_amount) {
        const month = inv.invoice_date.substring(0, 7);
        monthlyTrend[month] = (monthlyTrend[month] ?? 0) + inv.total_amount;
      }
    }

    return NextResponse.json({
      profile: {
        id: customer.id,
        name: customer.name,
        customer_number: customer.customer_number,
        org_number: customer.org_number,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        is_active: customer.is_active,
      },
      payment_profile: profile
        ? {
            total_invoices: profile.total_invoices,
            total_invoiced_amount: profile.total_invoiced_amount,
            current_outstanding: profile.current_outstanding,
            current_overdue: profile.current_overdue,
            avg_agreed_terms_days: profile.avg_agreed_terms_days,
            avg_actual_payment_days: profile.avg_actual_payment_days,
            avg_days_after_due: profile.avg_days_after_due,
            late_payment_ratio: profile.late_payment_ratio,
            max_delay_days: profile.max_delay_days,
            risk_score: profile.payment_risk_score,
            payment_trend: profile.payment_trend,
            last_payment_date: profile.last_payment_date,
          }
        : null,
      invoices: (invoices ?? []).map((inv) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        due_date: inv.due_date,
        total_amount: inv.total_amount,
        remaining_amount: inv.remaining_amount,
        status: inv.status,
      })),
      payment_history: (ledgerEntries ?? []).map((e) => ({
        id: e.id,
        date: e.entry_date,
        type: e.entry_type,
        invoice_number: e.invoice_number,
        amount: e.amount,
        remaining: e.remaining_amount,
        is_open: e.is_open,
      })),
      monthly_revenue_trend: Object.entries(monthlyTrend)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, amount]) => ({ month, amount })),
    });
  } catch (error) {
    console.error("Customer detail API error:", error);
    return errorResponse("Failed to load customer details");
  }
}
