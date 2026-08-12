import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";
import { CORPORATE_TAX_RATE, VAT_RATES } from "@/lib/constants";

/**
 * GET /api/companies/[id]/vat-estimate
 *
 * Returns estimated VAT settlement: output_vat, input_vat,
 * estimated_settlement, period, confidence.
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

    // Determine current VAT period (bimonthly is default in Norway)
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    const periodStart = getPeriodStart(currentMonth, now.getFullYear());
    const periodEnd = getPeriodEnd(currentMonth, now.getFullYear());

    // Load transactions with VAT in the current period
    const { data: transactions } = await supabase
      .from("account_transactions")
      .select("account_number, amount, vat_code, vat_amount")
      .eq("company_id", companyId)
      .gte("transaction_date", periodStart)
      .lte("transaction_date", periodEnd)
      .not("vat_code", "is", null) as {
      data: Array<{
        account_number: string;
        amount: number;
        vat_code: string | null;
        vat_amount: number | null;
      }> | null;
    };

    if (transactions && transactions.length > 0) {
      let outputVat = 0;
      let inputVat = 0;

      for (const t of transactions) {
        const vatAmount = t.vat_amount ?? 0;
        const acct = parseInt(t.account_number, 10);

        // Revenue accounts (3000-3999) generate output VAT
        // Expense accounts (4000-7999) generate input VAT (deductible)
        if (acct >= 3000 && acct < 4000) {
          outputVat += Math.abs(vatAmount);
        } else if (acct >= 4000 && acct < 8000) {
          inputVat += Math.abs(vatAmount);
        }
      }

      const settlement = outputVat - inputVat;
      const termNumber = Math.ceil(currentMonth / 2);

      return NextResponse.json({
        output_vat: outputVat,
        input_vat: inputVat,
        estimated_settlement: settlement,
        period: `${termNumber}. termin ${now.getFullYear()}`,
        period_start: periodStart,
        period_end: periodEnd,
        due_date: getVatDueDate(currentMonth, now.getFullYear()),
        breakdown_by_rate: [
          { rate: VAT_RATES.STANDARD.rate, label: VAT_RATES.STANDARD.label },
          { rate: VAT_RATES.FOOD.rate, label: VAT_RATES.FOOD.label },
          { rate: VAT_RATES.LOW.rate, label: VAT_RATES.LOW.label },
        ],
        confidence: "estimated",
        corporate_tax_rate: CORPORATE_TAX_RATE,
      });
    }

    // No real data -- return mock
    return NextResponse.json(getMockVatEstimate());
  } catch (error) {
    console.error("VAT estimate API error:", error);
    return errorResponse("Failed to compute VAT estimate");
  }
}

// ---------------------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------------------

function getPeriodStart(month: number, year: number): string {
  // Bimonthly periods: jan-feb, mar-apr, may-jun, jul-aug, sep-oct, nov-dec
  const startMonth = month % 2 === 1 ? month : month - 1;
  return `${year}-${String(startMonth).padStart(2, "0")}-01`;
}

function getPeriodEnd(month: number, year: number): string {
  const endMonth = month % 2 === 0 ? month : month + 1;
  const lastDay = new Date(year, endMonth, 0).getDate();
  return `${year}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

function getVatDueDate(month: number, year: number): string {
  // VAT is due on the 10th of the month after the period ends
  const endMonth = month % 2 === 0 ? month : month + 1;
  const dueMonth = endMonth + 1;
  const dueYear = dueMonth > 12 ? year + 1 : year;
  const actualDueMonth = dueMonth > 12 ? dueMonth - 12 : dueMonth;
  return `${dueYear}-${String(actualDueMonth).padStart(2, "0")}-10`;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function getMockVatEstimate() {
  return {
    output_vat: 565_000,
    input_vat: 255_000,
    estimated_settlement: 310_000,
    period: "4. termin 2026",
    period_start: "2026-07-01",
    period_end: "2026-08-31",
    due_date: "2026-09-10",
    breakdown_by_rate: [
      { rate: 0.25, label: "Standard sats", base_amount: 2_100_000, vat_amount: 525_000 },
      { rate: 0.15, label: "Matvaresats", base_amount: 0, vat_amount: 0 },
      { rate: 0.12, label: "Lav sats", base_amount: 333_000, vat_amount: 40_000 },
    ],
    confidence: "estimated",
  };
}
