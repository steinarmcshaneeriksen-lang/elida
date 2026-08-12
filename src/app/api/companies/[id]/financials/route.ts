import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";
import { ACCOUNT_CLASSES } from "@/lib/constants";

/**
 * GET /api/companies/[id]/financials?period_start=&period_end=&comparison_start=&comparison_end=
 *
 * Returns detailed financial data: revenue breakdown, cost breakdown
 * by category, profit analysis, and margins.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;
    const auth = await verifyCompanyAccess(companyId);
    if (auth instanceof NextResponse) return auth;

    const searchParams = request.nextUrl.searchParams;
    const now = new Date();
    const periodStart =
      searchParams.get("period_start") ?? `${now.getFullYear()}-01-01`;
    const periodEnd =
      searchParams.get("period_end") ??
      now.toISOString().split("T")[0];
    const comparisonStart =
      searchParams.get("comparison_start") ??
      `${now.getFullYear() - 1}-01-01`;
    const comparisonEnd =
      searchParams.get("comparison_end") ??
      `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const supabase = await createClient();

    // Load transactions for the current period
    const { data: transactions } = await supabase
      .from("account_transactions")
      .select("account_number, amount, description, transaction_date")
      .eq("company_id", companyId)
      .gte("transaction_date", periodStart)
      .lte("transaction_date", periodEnd) as {
      data: TxRow[] | null;
    };

    // Load transactions for the comparison period
    const { data: compTransactions } = await supabase
      .from("account_transactions")
      .select("account_number, amount")
      .eq("company_id", companyId)
      .gte("transaction_date", comparisonStart)
      .lte("transaction_date", comparisonEnd) as {
      data: TxRow[] | null;
    };

    if (transactions && transactions.length > 0) {
      const result = buildFinancialsFromTransactions(
        transactions,
        compTransactions ?? []
      );
      return NextResponse.json({
        period_start: periodStart,
        period_end: periodEnd,
        comparison_start: comparisonStart,
        comparison_end: comparisonEnd,
        ...result,
      });
    }

    // No real data -- return mock financials
    return NextResponse.json(
      getMockFinancials(periodStart, periodEnd, comparisonStart, comparisonEnd)
    );
  } catch (error) {
    console.error("Financials API error:", error);
    return errorResponse("Failed to load financial data");
  }
}

// ---------------------------------------------------------------------------
// Real data processing
// ---------------------------------------------------------------------------

interface TxRow {
  account_number: string;
  amount: number;
  description?: string | null;
  transaction_date?: string;
}

function buildFinancialsFromTransactions(
  transactions: TxRow[],
  compTransactions: TxRow[]
) {
  const sumByRange = (
    txs: TxRow[],
    from: number,
    to: number
  ) =>
    txs
      .filter((t) => {
        const acct = parseInt(t.account_number, 10);
        return acct >= from && acct <= to;
      })
      .reduce((sum, t) => sum + t.amount, 0);

  // Revenue is accounts 3000-3999 (credit-normal, so amounts are negative in debit-based ledger)
  const revenue = Math.abs(
    sumByRange(transactions, ACCOUNT_CLASSES.REVENUE.from, ACCOUNT_CLASSES.REVENUE.to)
  );
  const compRevenue = Math.abs(
    sumByRange(compTransactions, ACCOUNT_CLASSES.REVENUE.from, ACCOUNT_CLASSES.REVENUE.to)
  );

  // Cost of goods: 4000-4999
  const cogs = Math.abs(
    sumByRange(transactions, ACCOUNT_CLASSES.COST_OF_GOODS.from, ACCOUNT_CLASSES.COST_OF_GOODS.to)
  );

  // Payroll: 5000-5999
  const payroll = Math.abs(
    sumByRange(transactions, ACCOUNT_CLASSES.PAYROLL.from, ACCOUNT_CLASSES.PAYROLL.to)
  );

  // Other operating: 6000-7999
  const otherOperating = Math.abs(
    sumByRange(
      transactions,
      ACCOUNT_CLASSES.OTHER_OPERATING.from,
      ACCOUNT_CLASSES.OTHER_OPERATING.to
    )
  );

  const totalCosts = cogs + payroll + otherOperating;
  const compTotalCosts = Math.abs(
    sumByRange(compTransactions, ACCOUNT_CLASSES.COST_OF_GOODS.from, ACCOUNT_CLASSES.COST_OF_GOODS.to)
  ) + Math.abs(
    sumByRange(compTransactions, ACCOUNT_CLASSES.PAYROLL.from, ACCOUNT_CLASSES.PAYROLL.to)
  ) + Math.abs(
    sumByRange(compTransactions, ACCOUNT_CLASSES.OTHER_OPERATING.from, ACCOUNT_CLASSES.OTHER_OPERATING.to)
  );

  const grossProfit = revenue - cogs;
  const operatingProfit = revenue - totalCosts;

  // Financial items: 8000-8999
  const financialNet = sumByRange(
    transactions,
    ACCOUNT_CLASSES.FINANCIAL.from,
    ACCOUNT_CLASSES.FINANCIAL.to
  );
  const netProfit = operatingProfit + financialNet;
  const compNetProfit = compRevenue - compTotalCosts;

  // Build cost breakdown by category using account number ranges
  const costBreakdown: Record<string, number> = {};
  for (const t of transactions) {
    const acct = parseInt(t.account_number, 10);
    if (acct >= 4000 && acct < 8000) {
      const category = getCostCategory(acct);
      costBreakdown[category] =
        (costBreakdown[category] ?? 0) + Math.abs(t.amount);
    }
  }

  return {
    revenue: {
      total: revenue,
      previous_period_total: compRevenue,
      change_percent: compRevenue
        ? ((revenue - compRevenue) / compRevenue) * 100
        : null,
    },
    costs: {
      total: totalCosts,
      cost_of_goods: cogs,
      payroll: payroll,
      other_operating: otherOperating,
      by_category: costBreakdown,
      previous_period_total: compTotalCosts,
      change_percent: compTotalCosts
        ? ((totalCosts - compTotalCosts) / compTotalCosts) * 100
        : null,
    },
    profit: {
      gross_profit: grossProfit,
      gross_margin_percent: revenue ? (grossProfit / revenue) * 100 : 0,
      operating_profit: operatingProfit,
      operating_margin_percent: revenue
        ? (operatingProfit / revenue) * 100
        : 0,
      net_profit: netProfit,
      net_margin_percent: revenue ? (netProfit / revenue) * 100 : 0,
      previous_period_net_profit: compNetProfit,
      change_percent: compNetProfit
        ? ((netProfit - compNetProfit) / compNetProfit) * 100
        : null,
    },
  };
}

function getCostCategory(accountNumber: number): string {
  if (accountNumber >= 4000 && accountNumber < 5000) return "Varekostnad";
  if (accountNumber >= 5000 && accountNumber < 5200) return "Lønnskostnad";
  if (accountNumber >= 5200 && accountNumber < 6000) return "Andre personalkostnader";
  if (accountNumber >= 6000 && accountNumber < 6100) return "Avskrivning";
  if (accountNumber >= 6100 && accountNumber < 6200) return "Leiekostnader";
  if (accountNumber >= 6200 && accountNumber < 6300) return "Strøm og oppvarming";
  if (accountNumber >= 6300 && accountNumber < 6500) return "Kontorkostnader";
  if (accountNumber >= 6500 && accountNumber < 6700) return "Utstyr og verktøy";
  if (accountNumber >= 6700 && accountNumber < 6900) return "IT og programvare";
  if (accountNumber >= 6900 && accountNumber < 7100) return "Telefon og porto";
  if (accountNumber >= 7100 && accountNumber < 7200) return "Reisekostnader";
  if (accountNumber >= 7200 && accountNumber < 7400) return "Markedsforing";
  if (accountNumber >= 7400 && accountNumber < 7500) return "Forsikring";
  if (accountNumber >= 7500 && accountNumber < 8000) return "Andre driftskostnader";
  return "Uspesifisert";
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function getMockFinancials(
  periodStart: string,
  periodEnd: string,
  comparisonStart: string,
  comparisonEnd: string
) {
  return {
    period_start: periodStart,
    period_end: periodEnd,
    comparison_start: comparisonStart,
    comparison_end: comparisonEnd,
    revenue: {
      total: 9_050_000,
      previous_period_total: 8_230_000,
      change_percent: 10.0,
    },
    costs: {
      total: 7_660_000,
      cost_of_goods: 0,
      payroll: 4_760_000,
      other_operating: 2_900_000,
      by_category: {
        Lonnskostnader: 4_760_000,
        Kontorleie: 455_000,
        "IT og programvare": 905_000,
        Markedsforing: 210_000,
        "Reise og transport": 185_000,
        Forsikring: 112_000,
        "Regnskap og revisjon": 180_000,
        "Andre driftskostnader": 853_000,
      },
      previous_period_total: 7_156_000,
      change_percent: 7.0,
    },
    profit: {
      gross_profit: 9_050_000,
      gross_margin_percent: 100.0,
      operating_profit: 1_284_000,
      operating_margin_percent: 14.2,
      net_profit: 1_240_000,
      net_margin_percent: 13.7,
      previous_period_net_profit: 1_074_000,
      change_percent: 15.5,
    },
    monthly: [
      { month: "2026-01", revenue: 1_120_000, costs: 920_000, profit: 200_000 },
      { month: "2026-02", revenue: 1_080_000, costs: 880_000, profit: 200_000 },
      { month: "2026-03", revenue: 1_250_000, costs: 960_000, profit: 290_000 },
      { month: "2026-04", revenue: 1_180_000, costs: 950_000, profit: 230_000 },
      { month: "2026-05", revenue: 1_620_000, costs: 1_050_000, profit: 570_000 },
      { month: "2026-06", revenue: 1_380_000, costs: 1_020_000, profit: 360_000 },
      { month: "2026-07", revenue: 1_420_000, costs: 1_080_000, profit: 340_000 },
    ],
  };
}
