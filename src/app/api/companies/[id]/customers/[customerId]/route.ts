import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";

/**
 * GET /api/companies/[id]/customers/[customerId]
 *
 * Built from the ledger. The previous version read customer_payment_profiles,
 * outgoing_invoices and customer_ledger_entries, none of which a SAF-T import
 * populates, so every field came back empty.
 *
 * Outstanding is only a true balance when the file states one per customer.
 * SAF-T files often omit that, in which case the figure below is the movement
 * within the period — an invoice raised last year and paid this year shows
 * only the payment — and is flagged so the page does not present it as a debt.
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

    const { data: customer } = (await supabase
      .from("customers")
      .select("*")
      .eq("id", customerId)
      .eq("company_id", companyId)
      .maybeSingle()) as {
      data: {
        id: string;
        name: string;
        customer_number: string | null;
        org_number: string | null;
        email: string | null;
        phone: string | null;
        address: string | null;
        closing_balance: number | null;
      } | null;
    };

    if (!customer) {
      return NextResponse.json({ error: "Fant ikke kunden" }, { status: 404 });
    }

    // Every posting that names this customer, plus the revenue lines sharing
    // its vouchers — SAF-T names the party on the receivable line only.
    const { data: postings } = (await supabase
      .from("account_transactions")
      .select(
        "id, transaction_date, account_number, amount, description, voucher_id, gl_accounts(name)"
      )
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .order("transaction_date", { ascending: false })
      .limit(500)) as {
      data: Array<{
        id: string;
        transaction_date: string;
        account_number: string;
        amount: number;
        description: string | null;
        voucher_id: string | null;
        gl_accounts: { name: string | null } | null;
      }> | null;
    };

    const rows = postings ?? [];
    const voucherIds = [
      ...new Set(rows.map((r) => r.voucher_id).filter(Boolean)),
    ] as string[];

    let revenueRows: Array<{
      transaction_date: string;
      amount: number;
      description: string | null;
    }> = [];

    if (voucherIds.length > 0) {
      const { data } = (await supabase
        .from("account_transactions")
        .select("transaction_date, amount, description, account_number")
        .eq("company_id", companyId)
        .in("voucher_id", voucherIds.slice(0, 200))
        .gte("account_number", "3000")
        .lt("account_number", "4000")) as {
        data: Array<{
          transaction_date: string;
          amount: number;
          description: string | null;
        }> | null;
      };
      revenueRows = data ?? [];
    }

    const revenue = revenueRows.reduce((t, r) => t - r.amount, 0);

    // Revenue per month, so a customer's trend is visible.
    const byMonth = new Map<string, number>();
    for (const r of revenueRows) {
      const month = r.transaction_date.slice(0, 7);
      byMonth.set(month, (byMonth.get(month) ?? 0) - r.amount);
    }

    // What they buy, largest first.
    const byProduct = new Map<string, { amount: number; count: number }>();
    for (const r of revenueRows) {
      const key = r.description?.trim() || "(uten beskrivelse)";
      const entry = byProduct.get(key) ?? { amount: 0, count: 0 };
      entry.amount -= r.amount;
      entry.count++;
      byProduct.set(key, entry);
    }

    const movement = rows
      .filter((r) => {
        const account = parseInt(r.account_number, 10);
        return account >= 1500 && account <= 1599;
      })
      .reduce((t, r) => t + r.amount, 0);

    return NextResponse.json({
      profile: {
        id: customer.id,
        name: customer.name,
        customer_number: customer.customer_number,
        org_number: customer.org_number,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
      },
      outstanding: customer.closing_balance ?? movement,
      outstanding_is_stated: customer.closing_balance != null,
      revenue,
      posting_count: rows.length,
      last_activity: rows[0]?.transaction_date ?? null,
      monthly_revenue: [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, amount]) => ({ month, amount: Math.round(amount) })),
      products: [...byProduct.entries()]
        .map(([description, v]) => ({
          description,
          amount: Math.round(v.amount),
          count: v.count,
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 15),
      postings: rows.slice(0, 50).map((r) => ({
        id: r.id,
        date: r.transaction_date,
        account_number: r.account_number,
        account_name: r.gl_accounts?.name ?? null,
        amount: r.amount,
        description: r.description,
      })),
    });
  } catch (error) {
    console.error("Customer detail API error:", error);
    return errorResponse("Kunne ikke hente kundedetaljer");
  }
}
