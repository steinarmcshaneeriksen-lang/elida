import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";
import { fetchAll } from "@/lib/supabase/paginate";

/**
 * GET /api/companies/[id]/cashflow
 *
 * Booked liquidity, derived from postings on bank and cash accounts
 * (1900-1999), plus what is outstanding on either side.
 *
 * This is history, not a forecast. A forecast needs due dates, which a SAF-T
 * export does not reliably carry, so presenting one here would be invention.
 * What the ledger does support is stated plainly: how the balance has moved,
 * what customers still owe, and what is owed to suppliers.
 */
interface PartyRow {
  id: string;
  name: string;
  closing_balance: number | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;
    const auth = await verifyCompanyAccess(companyId);
    if (auth instanceof NextResponse) return auth;

    const supabase = await createClient();

    const [{ data: series }, { data: totals }, customers, suppliers] =
      await Promise.all([
        supabase.rpc("company_cash_series" as never, {
          p_company_id: companyId,
        } as never) as unknown as Promise<{
          data: Array<{
            month: string;
            movement: number;
            balance: number;
            is_estimated: boolean;
          }> | null;
        }>,
        supabase.rpc("company_balance_totals" as never, {
          p_company_id: companyId,
        } as never) as unknown as Promise<{
          data: Array<{
            cash: number;
            receivables: number;
            payables: number;
            is_stated: boolean;
          }> | null;
        }>,
        fetchAll<PartyRow>(
          (from, to) =>
            supabase
              .from("customers")
              .select("id, name, closing_balance")
              .eq("company_id", companyId)
              .not("closing_balance", "is", null)
              .order("id", { ascending: true })
              .range(from, to) as PromiseLike<{
              data: PartyRow[] | null;
              error: { message: string } | null;
            }>,
          { label: "kunder" }
        ),
        fetchAll<PartyRow>(
          (from, to) =>
            supabase
              .from("suppliers")
              .select("id, name, closing_balance")
              .eq("company_id", companyId)
              .not("closing_balance", "is", null)
              .order("id", { ascending: true })
              .range(from, to) as PromiseLike<{
              data: PartyRow[] | null;
              error: { message: string } | null;
            }>,
          { label: "leverandører" }
        ),
      ]);

    const months = (series ?? []).map((m) => ({
      month: m.month,
      movement: Number(m.movement),
      balance: Number(m.balance),
    }));

    // Balance-sheet figures come from the balances stated in the file. Without
    // them only movement is known, and the page must say so rather than
    // presenting a movement as a bank balance.
    const stated = totals?.[0];
    const balancesAreStated = stated?.is_stated ?? false;

    if (months.length === 0) {
      return NextResponse.json({
        has_data: false,
        balances_are_stated: balancesAreStated,
        current_balance: null,
        monthly: [],
        receivables: { total: 0, top: [] },
        payables: { total: 0, top: [] },
      });
    }

    const receivable = customers
      .map((c) => ({ id: c.id, name: c.name, amount: Number(c.closing_balance) }))
      .filter((c) => c.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    const payable = suppliers
      .map((s) => ({ id: s.id, name: s.name, amount: Number(s.closing_balance) }))
      .filter((s) => s.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    const sum = (rows: { amount: number }[]) =>
      rows.reduce((t, r) => t + r.amount, 0);

    const balances = months.map((m) => m.balance);
    const lowest = months[balances.indexOf(Math.min(...balances))];

    return NextResponse.json({
      has_data: true,
      balances_are_stated: balancesAreStated,
      current_balance: balancesAreStated
        ? Number(stated!.cash)
        : months[months.length - 1].balance,
      period: {
        start: months[0].month,
        end: months[months.length - 1].month,
      },
      lowest_point: { month: lowest.month, balance: lowest.balance },
      monthly: months,
      receivables: {
        total: balancesAreStated ? Number(stated!.receivables) : sum(receivable),
        top: receivable.slice(0, 10),
      },
      payables: {
        total: balancesAreStated ? Number(stated!.payables) : sum(payable),
        top: payable.slice(0, 10),
      },
    });
  } catch (error) {
    console.error("Cashflow API error:", error);
    return errorResponse("Kunne ikke hente likviditetsdata");
  }
}
