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
    return NextResponse.json(getMockPayables());
  } catch (error) {
    console.error("Payables API error:", error);
    return errorResponse("Failed to load payables data");
  }
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function getMockPayables() {
  return {
    total_outstanding: 259_000,
    total_overdue: 0,
    count_outstanding: 4,
    count_overdue: 0,
    supplier_breakdown: [
      {
        supplier_id: "sup-1",
        supplier_name: "Tekna Systems AS",
        outstanding: 89_000,
        invoice_count: 1,
      },
      {
        supplier_id: "sup-3",
        supplier_name: "Kontorpartner AS",
        outstanding: 65_000,
        invoice_count: 1,
      },
      {
        supplier_id: "sup-2",
        supplier_name: "CloudHost Norge",
        outstanding: 42_000,
        invoice_count: 1,
      },
      {
        supplier_id: "sup-7",
        supplier_name: "Digital Marketing Oslo",
        outstanding: 35_000,
        invoice_count: 1,
      },
      {
        supplier_id: "sup-5",
        supplier_name: "Trygg Forsikring",
        outstanding: 28_000,
        invoice_count: 1,
      },
    ],
    upcoming_payments: [
      {
        id: "pay-1",
        invoice_number: "TK-2026-0891",
        supplier_name: "Tekna Systems AS",
        amount: 89_000,
        due_date: "2026-08-18",
      },
      {
        id: "pay-2",
        invoice_number: "CH-2026-08",
        supplier_name: "CloudHost Norge",
        amount: 42_000,
        due_date: "2026-08-20",
      },
      {
        id: "pay-3",
        invoice_number: "DM-2026-044",
        supplier_name: "Digital Marketing Oslo",
        amount: 35_000,
        due_date: "2026-08-28",
      },
      {
        id: "pay-4",
        invoice_number: "KP-2026-09",
        supplier_name: "Kontorpartner AS",
        amount: 65_000,
        due_date: "2026-09-01",
      },
      {
        id: "pay-5",
        invoice_number: "TF-2026-Q3",
        supplier_name: "Trygg Forsikring",
        amount: 28_000,
        due_date: "2026-09-01",
      },
    ],
    recurring_costs: [
      {
        id: "rec-1",
        supplier_name: "Kontorpartner AS",
        description: "Kontorleie",
        avg_amount: 65_000,
        frequency: "monthly",
        next_expected_date: "2026-09-01",
        confidence: "high_confidence",
      },
      {
        id: "rec-2",
        supplier_name: "CloudHost Norge",
        description: "Hosting og skyinfrastruktur",
        avg_amount: 42_000,
        frequency: "monthly",
        next_expected_date: "2026-09-20",
        confidence: "high_confidence",
      },
      {
        id: "rec-3",
        supplier_name: "Trygg Forsikring",
        description: "Forsikringspremie",
        avg_amount: 28_000,
        frequency: "quarterly",
        next_expected_date: "2026-12-01",
        confidence: "high_confidence",
      },
      {
        id: "rec-4",
        supplier_name: "Tekna Systems AS",
        description: "Systemvedlikehold",
        avg_amount: 89_000,
        frequency: "monthly",
        next_expected_date: "2026-09-15",
        confidence: "estimated",
      },
    ],
  };
}
