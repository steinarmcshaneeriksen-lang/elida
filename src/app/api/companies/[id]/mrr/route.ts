import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";
import { intervalLabel } from "@/lib/import/spreadsheet/columns";

/**
 * GET /api/companies/[id]/mrr
 *
 * Monthly recurring revenue, excluding VAT.
 *
 * There are two possible sources and they are not equal. A recurring-invoice
 * list states each contract outright — amount, interval, whether it is live —
 * and is therefore the answer. Inferring the same figure from posting text
 * counts one-off work whose description happens to read like a subscription;
 * on this company's ledger that overstated MRR by 40 000 a month.
 *
 * So contracts win where they exist, and the ledger is the fallback with the
 * uncertainty stated. The ledger series is returned either way, since it is
 * what shows the trend over past months.
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

    const [{ data: series }, { data: contracts }] = await Promise.all([
      supabase.rpc("company_mrr" as never, {
        p_company_id: companyId,
      } as never) as unknown as Promise<{
        data: Array<{
          month: string;
          recurring: number;
          one_off: number;
          total: number;
          is_complete: boolean;
          normalised_mrr: number;
        }> | null;
      }>,
      supabase
        .from("recurring_contracts")
        .select("interval_months, net_amount, gross_amount, is_active, is_draft")
        .eq("company_id", companyId),
    ]);

    const months = (series ?? []).map((m) => ({
      month: m.month,
      // Billed in the month, before spreading non-monthly contracts.
      recurring: Number(m.recurring),
      // Each contract divided by the interval at which it is invoiced, which
      // is the figure a subscription business calls MRR.
      normalised: Number(m.normalised_mrr),
      one_off: Number(m.one_off),
      total: Number(m.total),
      is_complete: m.is_complete,
    }));

    const counted = (contracts ?? []).filter((c) => c.is_active && !c.is_draft);

    if (counted.length > 0) {
      return NextResponse.json(
        fromContracts(counted, contracts ?? [], months)
      );
    }

    return NextResponse.json(fromLedger(months, await hasProductList(supabase, companyId)));
  } catch (error) {
    console.error("MRR API error:", error);
    return errorResponse("Kunne ikke beregne MRR");
  }
}

interface ContractRow {
  interval_months: number;
  net_amount: number;
  gross_amount: number | null;
  is_active: boolean;
  is_draft: boolean;
}

interface MonthRow {
  month: string;
  recurring: number;
  normalised: number;
  one_off: number;
  total: number;
  is_complete: boolean;
}

function fromContracts(
  counted: ContractRow[],
  all: ContractRow[],
  months: MonthRow[]
) {
  const net = counted.reduce(
    (t, c) => t + Number(c.net_amount) / c.interval_months,
    0
  );

  // Gross is shown as a secondary figure. Where a contract states no gross
  // amount, standard VAT is assumed rather than dropping it from the total.
  const gross = counted.reduce((t, c) => {
    const value =
      c.gross_amount != null ? Number(c.gross_amount) : Number(c.net_amount) * 1.25;
    return t + value / c.interval_months;
  }, 0);

  const byInterval = new Map<number, { count: number; mrr: number }>();
  for (const c of counted) {
    const entry = byInterval.get(c.interval_months) ?? { count: 0, mrr: 0 };
    entry.count++;
    entry.mrr += Number(c.net_amount) / c.interval_months;
    byInterval.set(c.interval_months, entry);
  }

  const mrr = Math.round(net);
  const lastComplete = months.filter((m) => m.is_complete).at(-1) ?? null;

  return {
    has_data: true,
    source: "contracts" as const,
    mrr: {
      // The run rate is a standing figure, not a figure for a past month.
      month: null,
      value: mrr,
      value_gross: Math.round(gross),
      billed_value: lastComplete?.recurring ?? mrr,
      based_on_product_list: true,
      previous_value: null,
      change_percent: null,
      arr: mrr * 12,
      arr_gross: Math.round(gross) * 12,
      average_3m: mrr,
      // Measured against the last complete month's revenue, which is the only
      // revenue figure there is to compare a run rate against.
      recurring_share:
        lastComplete && lastComplete.total > 0
          ? Math.round((mrr / lastComplete.total) * 100)
          : null,
    },
    contracts: {
      total: all.length,
      counted: counted.length,
      drafts: all.filter((c) => c.is_draft).length,
      inactive: all.filter((c) => !c.is_active).length,
      by_interval: [...byInterval.entries()]
        .sort(([a], [b]) => a - b)
        .map(([monthsPer, v]) => ({
          months: monthsPer,
          label: intervalLabel(monthsPer),
          count: v.count,
          mrr: Math.round(v.mrr),
        })),
    },
    months,
  };
}

function fromLedger(months: MonthRow[], basedOnProductList: boolean) {
  const complete = months.filter((m) => m.is_complete);

  if (complete.length === 0) {
    return { has_data: false, source: "ledger" as const, mrr: null, months };
  }

  const current = complete[complete.length - 1];
  const previous = complete[complete.length - 2] ?? null;

  const change =
    previous && previous.normalised > 0
      ? ((current.normalised - previous.normalised) / previous.normalised) * 100
      : null;

  // Averaging the last three complete months damps the month-to-month noise a
  // single billing run can cause.
  const window = complete.slice(-3);
  const average = window.reduce((t, m) => t + m.normalised, 0) / window.length;

  return {
    has_data: true,
    source: "ledger" as const,
    mrr: {
      month: current.month,
      value: current.normalised,
      value_gross: null,
      billed_value: current.recurring,
      based_on_product_list: basedOnProductList,
      previous_value: previous?.normalised ?? null,
      change_percent: change != null ? Math.round(change * 10) / 10 : null,
      arr: current.normalised * 12,
      arr_gross: null,
      average_3m: Math.round(average),
      recurring_share:
        current.total > 0
          ? Math.round((current.normalised / current.total) * 100)
          : 0,
    },
    contracts: null,
    months,
  };
}

async function hasProductList(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string
): Promise<boolean> {
  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("is_recurring", true);

  return (count ?? 0) > 0;
}
