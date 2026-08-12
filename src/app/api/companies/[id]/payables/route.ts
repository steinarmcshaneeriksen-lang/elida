import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";
import type {
  IncomingInvoice,
  RecurringCostPattern,
} from "@/lib/types/database";

type InvoiceWithSupplier = IncomingInvoice & {
  suppliers: { name: string; supplier_number: string | null } | null;
};

/**
 * GET /api/companies/[id]/payables
 *
 * Returns:
 * - Total payables
 * - Upcoming payments by date
 * - Supplier breakdown
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

    // Load open incoming invoices (payables)
    const { data: invoices } = await supabase
      .from("incoming_invoices")
      .select("*, suppliers(name, supplier_number)")
      .eq("company_id", companyId)
      .gt("remaining_amount", 0) as { data: InvoiceWithSupplier[] | null };

    // Load recurring cost patterns for upcoming obligations
    const { data: recurring } = await supabase
      .from("recurring_cost_patterns")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true) as { data: RecurringCostPattern[] | null };

    if (invoices && invoices.length > 0) {
      const todayDate = new Date(today);

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

      // Group by supplier
      const bySupplier: Record<
        string,
        { name: string; outstanding: number; invoices: typeof invoices }
      > = {};
      for (const inv of invoices) {
        const suppId = inv.supplier_id ?? "unknown";
        const suppName =
          (inv.suppliers as { name: string } | null)?.name ?? "Ukjent";
        if (!bySupplier[suppId]) {
          bySupplier[suppId] = { name: suppName, outstanding: 0, invoices: [] };
        }
        bySupplier[suppId].outstanding += inv.remaining_amount ?? 0;
        bySupplier[suppId].invoices.push(inv);
      }

      const supplierBreakdown = Object.entries(bySupplier)
        .map(([id, data]) => ({
          supplier_id: id,
          supplier_name: data.name,
          outstanding: data.outstanding,
          invoice_count: data.invoices.length,
        }))
        .sort((a, b) => b.outstanding - a.outstanding);

      // Upcoming payments (next 30 days)
      const thirtyDaysLater = new Date(todayDate);
      thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

      const upcoming = invoices
        .filter(
          (inv) =>
            inv.due_date &&
            new Date(inv.due_date) >= todayDate &&
            new Date(inv.due_date) <= thirtyDaysLater
        )
        .sort(
          (a, b) =>
            new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime()
        )
        .map((inv) => ({
          id: inv.id,
          invoice_number: inv.invoice_number,
          supplier_name:
            (inv.suppliers as { name: string } | null)?.name ?? "Ukjent",
          amount: inv.remaining_amount,
          due_date: inv.due_date,
        }));

      return NextResponse.json({
        total_outstanding: totalOutstanding,
        total_overdue: totalOverdue,
        count_outstanding: invoices.length,
        count_overdue: overdueInvoices.length,
        supplier_breakdown: supplierBreakdown,
        upcoming_payments: upcoming,
        recurring_costs: (recurring ?? []).map((r) => ({
          id: r.id,
          supplier_name: r.supplier_name,
          description: r.description,
          avg_amount: r.avg_amount,
          frequency: r.frequency,
          next_expected_date: r.next_expected_date,
          confidence: r.confidence,
        })),
      });
    }

    // No real data -- return mock
    return NextResponse.json({
      has_data: false,
      total_outstanding: 0,
      total_overdue: 0,
      count_outstanding: 0,
      count_overdue: 0,
      supplier_breakdown: [],
      upcoming_payments: [],
      recurring_costs: [],
    });
  } catch (error) {
    console.error("Payables API error:", error);
    return errorResponse("Failed to load payables data");
  }
}
