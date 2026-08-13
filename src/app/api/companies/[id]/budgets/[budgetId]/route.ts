import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";
import { readGrid, writeGrid } from "@/lib/budget/store";
import {
  addEmployee,
  addRecurringCost,
  adjustCategory,
  applyMonthlyGrowth,
  computeBudgetResult,
  computeCashEffect,
  computeEmployeeCost,
  distributeAnnual,
  type BudgetGrid,
} from "@/lib/budget/engine";
import { CATEGORIES, categoryForAccount, signedAmount } from "@/lib/reports/categories";
import { fetchAll } from "@/lib/supabase/paginate";

export const maxDuration = 60;

/**
 * The budget itself: the grid, what the company has actually posted against it
 * so far, the resulting figures, and the cash effect.
 *
 * Actuals are aggregated into the same categories the budget is written in, so
 * the comparison needs no mapping step that could drift.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; budgetId: string }> }
) {
  try {
    const { id: companyId, budgetId } = await params;
    const auth = await verifyCompanyAccess(companyId);
    if (auth instanceof NextResponse) return auth;

    const supabase = await createClient();

    const { data: budget } = await supabase
      .from("budgets")
      .select("*")
      .eq("id", budgetId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (!budget) {
      return NextResponse.json({ error: "Fant ikke budsjettet" }, { status: 404 });
    }

    const [grid, actuals, assumptions, opening] = await Promise.all([
      readGrid(supabase, budgetId),
      loadActuals(supabase, companyId, budget.year),
      supabase
        .from("budget_assumptions")
        .select("*")
        .eq("budget_id", budgetId)
        .order("created_at"),
      loadOpeningCash(supabase, companyId),
    ]);

    const result = computeBudgetResult(grid);
    const cash = computeCashEffect(grid, opening);

    return NextResponse.json({
      budget: {
        id: budget.id,
        name: budget.name,
        year: budget.year,
        status: budget.status,
        scenario: budget.scenario,
        based_on: budget.based_on,
        version: budget.version,
      },
      grid,
      actuals: actuals.grid,
      actual_months: actuals.months,
      result,
      cash: { ...cash, opening_balance: Math.round(opening) },
      assumptions: assumptions.data ?? [],
      categories: CATEGORIES.map((c) => ({
        key: c.key,
        label: c.label,
        kind: c.kind,
        is_primary: c.isPrimary,
      })),
    });
  } catch (error) {
    console.error("Budget fetch error:", error);
    return errorResponse("Kunne ikke hente budsjettet");
  }
}

/**
 * PATCH applies one change at a time and returns the whole recomputed budget.
 *
 * Adjustments are named operations rather than a raw grid write so the same
 * rules apply whether the change came from the grid, a percentage box, or the
 * assistant — and so an employer cost is always computed by the engine.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; budgetId: string }> }
) {
  try {
    const { id: companyId, budgetId } = await params;
    const auth = await verifyCompanyAccess(companyId);
    if (auth instanceof NextResponse) return auth;

    const body = (await request.json()) as BudgetOperation;
    const supabase = await createClient();

    const { data: budget } = await supabase
      .from("budgets")
      .select("id, status, year")
      .eq("id", budgetId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (!budget) {
      return NextResponse.json({ error: "Fant ikke budsjettet" }, { status: 404 });
    }

    if (budget.status === "approved" && body.operation !== "set_status") {
      return NextResponse.json(
        {
          error:
            "Budsjettet er godkjent og kan ikke endres. Lag et scenario eller en ny versjon for å jobbe videre.",
        },
        { status: 409 }
      );
    }

    let grid = await readGrid(supabase, budgetId);

    switch (body.operation) {
      case "set_cell": {
        if (!isValidMonth(body.month)) {
          return NextResponse.json({ error: "Ugyldig måned" }, { status: 400 });
        }
        if (!grid[body.category_key]) {
          return NextResponse.json({ error: "Ukjent kategori" }, { status: 400 });
        }
        grid[body.category_key][body.month - 1] = Math.round(Number(body.amount) || 0);
        break;
      }

      case "adjust_percent":
        grid = adjustCategory(grid, body.category_key, Number(body.percent) || 0);
        break;

      case "monthly_growth":
        grid = applyMonthlyGrowth(grid, body.category_key, Number(body.percent) || 0);
        break;

      case "set_annual":
        grid = distributeAnnual(grid, body.category_key, Number(body.amount) || 0);
        break;

      case "add_cost": {
        const from = isValidMonth(body.from_month) ? body.from_month : 1;
        grid = addRecurringCost(
          grid,
          body.category_key,
          Number(body.monthly_amount) || 0,
          from
        );
        await supabase.from("budget_assumptions").insert({
          budget_id: budgetId,
          type: "cost",
          name: body.name ?? "Ny kostnad",
          value: Number(body.monthly_amount) || 0,
          effective_from: `${budget.year}-${String(from).padStart(2, "0")}-01`,
          metadata: { category_key: body.category_key, monthly: true },
        });
        break;
      }

      case "add_employee": {
        const from = isValidMonth(body.start_month) ? body.start_month : 1;
        const cost = computeEmployeeCost({
          annualSalary: Number(body.annual_salary) || 0,
          startMonth: from,
          employerTaxZone: body.employer_tax_zone,
          holidayPayRate: body.holiday_pay_rate,
          pensionRate: body.pension_rate,
          otherMonthlyCost: body.other_monthly_cost,
        });

        grid = addEmployee(grid, {
          annualSalary: Number(body.annual_salary) || 0,
          startMonth: from,
          employerTaxZone: body.employer_tax_zone,
          holidayPayRate: body.holiday_pay_rate,
          pensionRate: body.pension_rate,
          otherMonthlyCost: body.other_monthly_cost,
        });

        await supabase.from("budget_assumptions").insert({
          budget_id: budgetId,
          type: "employee",
          name: body.name ?? "Ny ansatt",
          value: cost.total_annual,
          effective_from: `${budget.year}-${String(from).padStart(2, "0")}-01`,
          metadata: { ...cost },
        });
        break;
      }

      case "add_investment": {
        // Kept out of the profit-and-loss grid on purpose: an investment is a
        // balance-sheet item, and building a fixed-asset register to derive
        // depreciation is beyond what this is for. It is recorded as an
        // assumption so the cash view and the report can account for it.
        await supabase.from("budget_assumptions").insert({
          budget_id: budgetId,
          type: "investment",
          name: body.name ?? "Investering",
          value: Number(body.amount) || 0,
          effective_from: `${budget.year}-${String(isValidMonth(body.month) ? body.month : 1).padStart(2, "0")}-01`,
          metadata: { payment: body.payment ?? "cash" },
        });
        break;
      }

      case "set_status": {
        await supabase
          .from("budgets")
          .update({
            status: body.status,
            approved_at: body.status === "approved" ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", budgetId);
        break;
      }

      case "rename": {
        await supabase
          .from("budgets")
          .update({ name: body.name, updated_at: new Date().toISOString() })
          .eq("id", budgetId);
        break;
      }

      default:
        return NextResponse.json({ error: "Ukjent operasjon" }, { status: 400 });
    }

    if (body.operation !== "set_status" && body.operation !== "rename") {
      await writeGrid(supabase, budgetId, grid);
      await supabase
        .from("budgets")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", budgetId);
    }

    const opening = await loadOpeningCash(supabase, companyId);

    return NextResponse.json({
      grid,
      result: computeBudgetResult(grid),
      cash: {
        ...computeCashEffect(grid, opening),
        opening_balance: Math.round(opening),
      },
    });
  } catch (error) {
    console.error("Budget update error:", error);
    return errorResponse("Kunne ikke oppdatere budsjettet");
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; budgetId: string }> }
) {
  try {
    const { id: companyId, budgetId } = await params;
    const auth = await verifyCompanyAccess(companyId);
    if (auth instanceof NextResponse) return auth;

    const supabase = await createClient();
    const { error } = await supabase
      .from("budgets")
      .delete()
      .eq("id", budgetId)
      .eq("company_id", companyId);

    if (error) return errorResponse("Kunne ikke slette budsjettet");
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Budget delete error:", error);
    return errorResponse("Kunne ikke slette budsjettet");
  }
}

// ---------------------------------------------------------------------------

type BudgetOperation =
  | { operation: "set_cell"; category_key: string; month: number; amount: number }
  | { operation: "adjust_percent"; category_key: string; percent: number }
  | { operation: "monthly_growth"; category_key: string; percent: number }
  | { operation: "set_annual"; category_key: string; amount: number }
  | {
      operation: "add_cost";
      category_key: string;
      monthly_amount: number;
      from_month: number;
      name?: string;
    }
  | {
      operation: "add_employee";
      annual_salary: number;
      start_month: number;
      employer_tax_zone?: string;
      holiday_pay_rate?: number;
      pension_rate?: number;
      other_monthly_cost?: number;
      name?: string;
    }
  | {
      operation: "add_investment";
      amount: number;
      month: number;
      payment?: string;
      name?: string;
    }
  | { operation: "set_status"; status: string }
  | { operation: "rename"; name: string };

function isValidMonth(month: unknown): month is number {
  return Number.isInteger(month) && (month as number) >= 1 && (month as number) <= 12;
}

/**
 * What has actually been posted in the budget year, aggregated into the same
 * categories, so budget-versus-actual is a straight subtraction.
 */
async function loadActuals(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  year: number
): Promise<{ grid: BudgetGrid; months: number }> {
  const grid: BudgetGrid = {};
  for (const category of CATEGORIES) grid[category.key] = new Array(12).fill(0);

  const seen = new Set<number>();

  type ActualRow = {
    account_number: string;
    amount: number;
    transaction_date: string;
  };

  const rows = await fetchAll<ActualRow>(
    (from, to) =>
      supabase
        .from("account_transactions")
        .select("account_number, amount, transaction_date")
        .eq("company_id", companyId)
        .gte("transaction_date", `${year}-01-01`)
        .lte("transaction_date", `${year}-12-31`)
        .gte("account_number", "3000")
        .lt("account_number", "8000")
        .order("id", { ascending: true })
        .range(from, to) as PromiseLike<{
        data: ActualRow[] | null;
        error: { message: string } | null;
      }>,
    { label: "posteringer" }
  );

  for (const p of rows) {
    const category = categoryForAccount(p.account_number);
    if (!category) continue;
    const month = Number(p.transaction_date.slice(5, 7));
    seen.add(month);
    grid[category.key][month - 1] += signedAmount(category, Number(p.amount));
  }

  for (const key of Object.keys(grid)) {
    grid[key] = grid[key].map((v) => Math.round(v));
  }

  return { grid, months: seen.size === 0 ? 0 : Math.max(...seen) };
}

/** Bank balance the budget year starts from, for the cash view. */
async function loadOpeningCash(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string
): Promise<number> {
  type BankRow = { account_number: string; closing_balance: number | null };

  const data = await fetchAll<BankRow>(
    (from, to) =>
      supabase
        .from("gl_accounts")
        .select("account_number, closing_balance")
        .eq("company_id", companyId)
        .gte("account_number", "1900")
        .lt("account_number", "2000")
        .order("account_number", { ascending: true })
        .range(from, to) as PromiseLike<{
        data: BankRow[] | null;
        error: { message: string } | null;
      }>,
    { label: "bankkontoer" }
  );

  return data.reduce((t, a) => t + Number(a.closing_balance ?? 0), 0);
}
