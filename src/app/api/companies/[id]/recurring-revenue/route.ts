import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";
import { fetchAll } from "@/lib/supabase/paginate";
import { intervalLabel } from "@/lib/import/spreadsheet/columns";

/**
 * GET /api/companies/[id]/recurring-revenue
 *
 * An uploaded contract list states what recurs, so where one exists it is the
 * answer and nothing is inferred. This page and the dashboard's MRR card must
 * agree; they read the same source for the same reason.
 *
 * Without a contract list, SAF-T does not mark revenue as recurring, so it is
 * inferred from the posting text and from how regularly a line repeats. The
 * two signals are kept separate rather than merged into one verdict:
 *
 *   licensed — the text names a licence, subscription or monthly price
 *   regular  — appears in three or more distinct months, without saying so
 *   one_off  — neither
 *
 * The middle group matters: a product subscription is often booked under its
 * product name alone, which no keyword would catch.
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

    type ContractRow = {
      customer_name: string;
      description: string | null;
      interval_months: number;
      net_amount: number;
      is_active: boolean;
      is_draft: boolean;
    };

    const contracts = await fetchAll<ContractRow>(
      (from, to) =>
        supabase
          .from("recurring_contracts")
          .select(
            "customer_name, description, interval_months, net_amount, is_active, is_draft"
          )
          .eq("company_id", companyId)
          .order("id", { ascending: true })
          .range(from, to) as PromiseLike<{
          data: ContractRow[] | null;
          error: { message: string } | null;
        }>,
      { label: "avtaler" }
    );

    const counted = contracts.filter((c) => c.is_active && !c.is_draft);

    if (counted.length > 0) {
      return NextResponse.json(fromContracts(counted, contracts.length));
    }

    const { data } = (await supabase.rpc(
      "company_recurring_revenue" as never,
      { p_company_id: companyId } as never
    )) as unknown as {
      data: Array<{
        description: string;
        months_active: number;
        total: number;
        avg_per_month: number;
        posting_count: number;
        first_month: string;
        last_month: string;
        has_keyword: boolean;
        has_cadence: boolean;
        matched_product: string | null;
      }> | null;
    };

    const rows = (data ?? []).map((r) => ({
      description: r.description,
      months_active: r.months_active,
      total: Number(r.total),
      avg_per_month: Number(r.avg_per_month),
      posting_count: Number(r.posting_count),
      first_month: r.first_month,
      last_month: r.last_month,
      matched_product: r.matched_product,
      // A product-list match is the seller's own classification and outranks
      // anything inferred from the text.
      category: r.matched_product
        ? ("product" as const)
        : r.has_keyword
          ? ("licensed" as const)
          : r.has_cadence
            ? ("regular" as const)
            : ("one_off" as const),
    }));

    if (rows.length === 0) {
      return NextResponse.json({ has_data: false, totals: null, items: [] });
    }

    const sumOf = (category: string) =>
      rows.filter((r) => r.category === category).reduce((t, r) => t + r.total, 0);

    const product = sumOf("product");
    const licensed = sumOf("licensed");
    const regular = sumOf("regular");
    const oneOff = sumOf("one_off");
    const total = product + licensed + regular + oneOff;

    return NextResponse.json({
      has_data: true,
      source: "ledger" as const,
      totals: {
        product,
        licensed,
        regular,
        one_off: oneOff,
        total,
        // Share of revenue that repeats, on either signal.
        recurring_share:
          total > 0
            ? Math.round(((product + licensed + regular) / total) * 100)
            : 0,
        // True once a product list has been imported, so the UI can say
        // whether the split is stated or inferred.
        has_product_list: product > 0,
      },
      items: rows,
    });
  } catch (error) {
    console.error("Recurring revenue API error:", error);
    return errorResponse("Kunne ikke analysere gjentakende inntekter");
  }
}

/**
 * Built from the contract list: one row per agreement, with the monthly value
 * each contributes. The categories the inferred view uses do not apply — every
 * one of these is stated to recur — so they all sit in "product".
 */
function fromContracts(
  counted: Array<{
    customer_name: string;
    description: string | null;
    interval_months: number;
    net_amount: number;
  }>,
  total: number
) {
  const items = counted
    .map((c) => {
      const monthly = Number(c.net_amount) / c.interval_months;
      return {
        description: c.description?.trim()
          ? `${c.customer_name} — ${c.description.trim()}`
          : c.customer_name,
        months_active: 12 / c.interval_months,
        total: Math.round(monthly * 12),
        avg_per_month: Math.round(monthly),
        posting_count: 1,
        first_month: null,
        last_month: null,
        matched_product: intervalLabel(c.interval_months),
        category: "product" as const,
      };
    })
    .sort((a, b) => b.avg_per_month - a.avg_per_month);

  const mrr = items.reduce((t, i) => t + i.avg_per_month, 0);

  return {
    has_data: true,
    source: "contracts" as const,
    totals: {
      product: Math.round(mrr * 12),
      licensed: 0,
      regular: 0,
      one_off: 0,
      total: Math.round(mrr * 12),
      // Everything in a contract list recurs by definition.
      recurring_share: 100,
      has_product_list: true,
      mrr: Math.round(mrr),
      contract_count: counted.length,
      contracts_total: total,
    },
    items,
  };
}
