import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";
import { fetchAll } from "@/lib/supabase/paginate";

interface VoucherLine {
  voucher_id: string | null;
  transaction_date: string;
  amount: number;
  description: string | null;
  account_number: string;
  vouchers: { voucher_number: number | null; voucher_date: string | null } | null;
}

export interface LedgerEvent {
  voucher_id: string | null;
  voucher_number: number | null;
  date: string;
  type: "invoice" | "credit_note" | "payment" | "other";
  /** What was sold, or how the payment settled. */
  summary: string;
  lines: string[];
  /** Movement on the receivable: positive raises it, negative settles it. */
  amount: number;
  settles_count: number;
}

/**
 * Turns raw ledger lines into the events a person recognises — an invoice for
 * something, a credit note, a payment covering several invoices.
 *
 * The account and a placeholder description repeated on every row say nothing.
 * What the voucher contains does: revenue lines name what was sold, a bank
 * line means money arrived, and the number of receivable lines in a payment
 * says how many invoices it cleared.
 */
function buildLedgerEvents(
  receivableRows: Array<{ voucher_id: string | null; transaction_date: string; amount: number }>,
  allLines: VoucherLine[]
): LedgerEvent[] {
  const byVoucher = new Map<string, VoucherLine[]>();
  for (const line of allLines) {
    if (!line.voucher_id) continue;
    const bucket = byVoucher.get(line.voucher_id);
    if (bucket) bucket.push(line);
    else byVoucher.set(line.voucher_id, [line]);
  }

  const events = new Map<string, LedgerEvent>();

  for (const row of receivableRows) {
    if (!row.voucher_id) continue;

    const existing = events.get(row.voucher_id);
    if (existing) {
      existing.amount += row.amount;
      existing.settles_count++;
      continue;
    }

    const lines = byVoucher.get(row.voucher_id) ?? [];
    const inRange = (line: VoucherLine, from: number, to: number) => {
      const account = parseInt(line.account_number, 10);
      return account >= from && account <= to;
    };

    const revenue = lines.filter((l) => inRange(l, 3000, 3999));
    const bank = lines.filter((l) => inRange(l, 1900, 1999));

    // Revenue credited raises an invoice; revenue debited reverses one.
    const revenueTotal = revenue.reduce((t, l) => t + l.amount, 0);

    let type: LedgerEvent["type"] = "other";
    if (revenue.length > 0 && revenueTotal < 0) type = "invoice";
    else if (revenue.length > 0 && revenueTotal > 0) type = "credit_note";
    else if (bank.length > 0) type = "payment";

    const soldItems = [
      ...new Set(
        revenue
          .map((l) => l.description?.trim())
          .filter((d): d is string => Boolean(d))
      ),
    ];

    const voucher = lines.find((l) => l.vouchers)?.vouchers ?? null;

    events.set(row.voucher_id, {
      voucher_id: row.voucher_id,
      voucher_number: voucher?.voucher_number ?? null,
      date: row.transaction_date,
      type,
      summary:
        soldItems.length > 0
          ? soldItems.join(", ")
          : type === "payment"
            ? "Innbetaling"
            : "—",
      lines: soldItems,
      amount: row.amount,
      settles_count: 1,
    });
  }

  return [...events.values()].sort((a, b) => b.date.localeCompare(a.date));
}

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
    // Paged rather than capped: a 500-row limit silently understated revenue
    // for any customer with a longer history than that.
    type PostingRow = {
      id: string;
      transaction_date: string;
      account_number: string;
      amount: number;
      description: string | null;
      voucher_id: string | null;
    };

    const rows = await fetchAll<PostingRow>(
      (from, to) =>
        supabase
          .from("account_transactions")
          .select(
            "id, transaction_date, account_number, amount, description, voucher_id"
          )
          .eq("company_id", companyId)
          .eq("customer_id", customerId)
          .order("transaction_date", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to) as PromiseLike<{
          data: PostingRow[] | null;
          error: { message: string } | null;
        }>,
      { label: "posteringer" }
    );
    const voucherIds = [
      ...new Set(rows.map((r) => r.voucher_id).filter(Boolean)),
    ] as string[];

    // Every line on the customer's vouchers, so an event can be told apart:
    // an invoice carries revenue lines, a payment carries a bank line.
    const voucherLines: VoucherLine[] = [];

    // Vouchers are fetched in batches: an "in" list of thousands of ids would
    // exceed the URL length, and the response would be capped at 1000 lines.
    for (let i = 0; i < voucherIds.length; i += 200) {
      const batch = voucherIds.slice(i, i + 200);
      const lines = await fetchAll<VoucherLine>(
        (from, to) =>
          supabase
            .from("account_transactions")
            .select(
              "voucher_id, transaction_date, amount, description, account_number, vouchers(voucher_number, voucher_date)"
            )
            .eq("company_id", companyId)
            .in("voucher_id", batch)
            .order("id", { ascending: true })
            .range(from, to) as PromiseLike<{
            data: VoucherLine[] | null;
            error: { message: string } | null;
          }>,
        { label: "bilagslinjer" }
      );
      voucherLines.push(...lines);
    }

    const revenueRows = voucherLines.filter((l) => {
      const account = parseInt(l.account_number, 10);
      return account >= 3000 && account <= 3999;
    });

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
      outstanding: customer.closing_balance ?? null,
      outstanding_is_stated: customer.closing_balance != null,
      period_movement: movement,
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
      events: buildLedgerEvents(rows, voucherLines),
    });
  } catch (error) {
    console.error("Customer detail API error:", error);
    return errorResponse("Kunne ikke hente kundedetaljer");
  }
}
