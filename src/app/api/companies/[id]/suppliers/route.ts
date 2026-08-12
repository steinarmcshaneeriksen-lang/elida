import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";
import type { Supplier } from "@/lib/types/database";

/**
 * GET /api/companies/[id]/suppliers
 *
 * Returns supplier list with YTD costs and changes.
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

    // Load suppliers
    const { data: suppliers } = await supabase
      .from("suppliers")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("name", { ascending: true }) as { data: Supplier[] | null };

    if (suppliers && suppliers.length > 0) {
      const now = new Date();
      const yearStart = `${now.getFullYear()}-01-01`;
      const today = now.toISOString().split("T")[0];

      // Load YTD transactions per supplier (via supplier_ledger_entries)
      const { data: ledgerEntries } = await supabase
        .from("supplier_ledger_entries")
        .select("supplier_id, amount, entry_date")
        .eq("company_id", companyId)
        .gte("entry_date", yearStart)
        .lte("entry_date", today) as {
        data: Array<{ supplier_id: string | null; amount: number; entry_date: string }> | null;
      };

      // Load comparison year
      const prevYearStart = `${now.getFullYear() - 1}-01-01`;
      const prevYearEnd = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

      const { data: prevLedgerEntries } = await supabase
        .from("supplier_ledger_entries")
        .select("supplier_id, amount")
        .eq("company_id", companyId)
        .gte("entry_date", prevYearStart)
        .lte("entry_date", prevYearEnd) as {
        data: Array<{ supplier_id: string | null; amount: number }> | null;
      };

      // Compute YTD cost per supplier
      const ytdCosts: Record<string, number> = {};
      for (const e of ledgerEntries ?? []) {
        if (e.supplier_id) {
          ytdCosts[e.supplier_id] =
            (ytdCosts[e.supplier_id] ?? 0) + Math.abs(e.amount);
        }
      }

      const prevCosts: Record<string, number> = {};
      for (const e of prevLedgerEntries ?? []) {
        if (e.supplier_id) {
          prevCosts[e.supplier_id] =
            (prevCosts[e.supplier_id] ?? 0) + Math.abs(e.amount);
        }
      }

      // Load open payables
      const { data: openInvoices } = await supabase
        .from("incoming_invoices")
        .select("supplier_id, remaining_amount, due_date")
        .eq("company_id", companyId)
        .gt("remaining_amount", 0) as {
        data: Array<{
          supplier_id: string | null;
          remaining_amount: number | null;
          due_date: string | null;
        }> | null;
      };

      const openPayables: Record<
        string,
        { outstanding: number; nextDue: string | null; nextDueAmount: number | null }
      > = {};
      for (const inv of openInvoices ?? []) {
        if (inv.supplier_id) {
          if (!openPayables[inv.supplier_id]) {
            openPayables[inv.supplier_id] = {
              outstanding: 0,
              nextDue: null,
              nextDueAmount: null,
            };
          }
          openPayables[inv.supplier_id].outstanding +=
            inv.remaining_amount ?? 0;
          if (
            inv.due_date &&
            (!openPayables[inv.supplier_id].nextDue ||
              inv.due_date < openPayables[inv.supplier_id].nextDue!)
          ) {
            openPayables[inv.supplier_id].nextDue = inv.due_date;
            openPayables[inv.supplier_id].nextDueAmount =
              inv.remaining_amount;
          }
        }
      }

      const result = suppliers.map((s) => {
        const ytd = ytdCosts[s.id] ?? 0;
        const prev = prevCosts[s.id] ?? 0;
        const payable = openPayables[s.id];

        return {
          id: s.id,
          name: s.name,
          supplier_number: s.supplier_number,
          org_number: s.org_number,
          cost_ytd: ytd,
          cost_ytd_change_percent: prev > 0 ? ((ytd - prev) / prev) * 100 : null,
          outstanding: payable?.outstanding ?? 0,
          next_due_date: payable?.nextDue ?? null,
          next_due_amount: payable?.nextDueAmount ?? null,
        };
      });

      return NextResponse.json({ suppliers: result });
    }

    // No real data -- return mock
    return NextResponse.json({ suppliers: [] });
  } catch (error) {
    console.error("Suppliers API error:", error);
    return errorResponse("Failed to load supplier data");
  }
}
