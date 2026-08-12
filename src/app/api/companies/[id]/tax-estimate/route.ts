import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";
import { CORPORATE_TAX_RATE, ACCOUNT_CLASSES } from "@/lib/constants";

/**
 * GET /api/companies/[id]/tax-estimate
 *
 * Returns estimated corporate tax: profit_before_tax, estimated_tax,
 * rate, confidence.
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
    const now = new Date();
    const yearStart = `${now.getFullYear()}-01-01`;
    const today = now.toISOString().split("T")[0];

    // Load YTD transactions to compute profit
    const { data: transactions } = await supabase
      .from("account_transactions")
      .select("account_number, amount")
      .eq("company_id", companyId)
      .gte("transaction_date", yearStart)
      .lte("transaction_date", today) as {
      data: Array<{ account_number: string; amount: number }> | null;
    };

    if (transactions && transactions.length > 0) {
      const sumByRange = (from: number, to: number) =>
        transactions
          .filter((t) => {
            const acct = parseInt(t.account_number, 10);
            return acct >= from && acct <= to;
          })
          .reduce((sum, t) => sum + t.amount, 0);

      const revenue = Math.abs(
        sumByRange(ACCOUNT_CLASSES.REVENUE.from, ACCOUNT_CLASSES.REVENUE.to)
      );
      const costs =
        Math.abs(
          sumByRange(
            ACCOUNT_CLASSES.COST_OF_GOODS.from,
            ACCOUNT_CLASSES.COST_OF_GOODS.to
          )
        ) +
        Math.abs(
          sumByRange(
            ACCOUNT_CLASSES.PAYROLL.from,
            ACCOUNT_CLASSES.PAYROLL.to
          )
        ) +
        Math.abs(
          sumByRange(
            ACCOUNT_CLASSES.OTHER_OPERATING.from,
            ACCOUNT_CLASSES.OTHER_OPERATING.to
          )
        );

      const financialNet = sumByRange(
        ACCOUNT_CLASSES.FINANCIAL.from,
        ACCOUNT_CLASSES.FINANCIAL.to
      );

      const profitBeforeTax = revenue - costs + financialNet;

      // Annualize based on elapsed fraction of year
      const dayOfYear = Math.floor(
        (now.getTime() - new Date(yearStart).getTime()) / (1000 * 60 * 60 * 24)
      );
      const annualizationFactor = 365 / Math.max(dayOfYear, 1);
      const annualizedProfit = profitBeforeTax * annualizationFactor;

      const estimatedTax = Math.max(0, annualizedProfit * CORPORATE_TAX_RATE);

      return NextResponse.json({
        profit_before_tax: profitBeforeTax,
        annualized_profit: annualizedProfit,
        estimated_tax: estimatedTax,
        rate: CORPORATE_TAX_RATE,
        tax_year: now.getFullYear(),
        ytd_revenue: revenue,
        ytd_costs: costs,
        ytd_financial_net: financialNet,
        confidence: dayOfYear > 180 ? "estimated" : "rough_estimate",
      });
    }

    // No real data -- return mock
    return NextResponse.json(getMockTaxEstimate());
  } catch (error) {
    console.error("Tax estimate API error:", error);
    return errorResponse("Failed to compute tax estimate");
  }
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function getMockTaxEstimate() {
  const profitBeforeTax = 1_240_000;
  // Annualized from ~7.3 months of data
  const annualizationFactor = 365 / 224;
  const annualizedProfit = profitBeforeTax * annualizationFactor;
  const estimatedTax = annualizedProfit * CORPORATE_TAX_RATE;

  return {
    profit_before_tax: profitBeforeTax,
    annualized_profit: Math.round(annualizedProfit),
    estimated_tax: Math.round(estimatedTax),
    rate: CORPORATE_TAX_RATE,
    tax_year: 2026,
    ytd_revenue: 9_050_000,
    ytd_costs: 7_766_000,
    ytd_financial_net: -44_000,
    confidence: "estimated",
  };
}
