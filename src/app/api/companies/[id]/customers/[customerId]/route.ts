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
      // Check if mock customer
      const mockData = getMockCustomerDetail(customerId);
      if (mockData) return NextResponse.json(mockData);

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

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function getMockCustomerDetail(customerId: string) {
  const mockCustomers: Record<string, object> = {
    "cust-1": {
      profile: {
        id: "cust-1",
        name: "Nordfjord Consulting AS",
        customer_number: "10001",
        org_number: "912 345 678",
        email: "faktura@nordfjord.no",
        phone: "+47 55 12 34 56",
        address: "Strandgata 15, 6800 Forde",
        is_active: true,
      },
      payment_profile: {
        total_invoices: 18,
        total_invoiced_amount: 3_240_000,
        current_outstanding: 285_000,
        current_overdue: 185_000,
        avg_agreed_terms_days: 30,
        avg_actual_payment_days: 42,
        avg_days_after_due: 12,
        late_payment_ratio: 0.55,
        max_delay_days: 45,
        risk_score: 72,
        payment_trend: "worsening",
        last_payment_date: "2026-07-15",
      },
      invoices: [
        { id: "inv-nc-1", invoice_number: "2024-0087", invoice_date: "2026-05-28", due_date: "2026-06-28", total_amount: 185_000, remaining_amount: 185_000, status: "overdue" },
        { id: "inv-nc-2", invoice_number: "2026-0145", invoice_date: "2026-08-02", due_date: "2026-09-02", total_amount: 100_000, remaining_amount: 100_000, status: "sent" },
        { id: "inv-nc-3", invoice_number: "2026-0098", invoice_date: "2026-05-15", due_date: "2026-06-15", total_amount: 220_000, remaining_amount: 0, status: "paid" },
      ],
      payment_history: [
        { id: "le-nc-1", date: "2026-07-15", type: "payment", invoice_number: "2026-0098", amount: -220_000, remaining: 0, is_open: false },
        { id: "le-nc-2", date: "2026-05-28", type: "invoice", invoice_number: "2024-0087", amount: 185_000, remaining: 185_000, is_open: true },
        { id: "le-nc-3", date: "2026-05-15", type: "invoice", invoice_number: "2026-0098", amount: 220_000, remaining: 0, is_open: false },
      ],
      monthly_revenue_trend: [
        { month: "2026-01", amount: 180_000 },
        { month: "2026-02", amount: 195_000 },
        { month: "2026-03", amount: 210_000 },
        { month: "2026-04", amount: 175_000 },
        { month: "2026-05", amount: 405_000 },
        { month: "2026-06", amount: 155_000 },
        { month: "2026-07", amount: 0 },
        { month: "2026-08", amount: 100_000 },
      ],
    },
  };

  return mockCustomers[customerId] ?? null;
}
