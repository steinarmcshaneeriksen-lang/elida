/**
 * Budget handlers for the assistant.
 *
 * The assistant may read the budget freely and may work out what a change
 * would do, but it never writes one. A budget change arrives as a costed
 * proposal the user confirms — otherwise a sentence in a chat window silently
 * rewrites the numbers a board decision rests on.
 *
 * The arithmetic is the budget engine's, not the model's, so a hire costs what
 * the rules say it costs.
 */

import { createClient } from "@/lib/supabase/server";
import { readGrid } from "@/lib/budget/store";
import {
  addEmployee,
  addRecurringCost,
  adjustCategory,
  computeBudgetResult,
  computeCashEffect,
  computeEmployeeCost,
  distributeAnnual,
  type BudgetGrid,
} from "@/lib/budget/engine";
import { CATEGORIES, categoryByKey } from "@/lib/reports/categories";

type ToolParams = Record<string, unknown>;
type ToolResult = Record<string, unknown>;

const MONTH_LONG = [
  "januar", "februar", "mars", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "desember",
];

async function resolveBudget(companyId: string, budgetId?: unknown) {
  const supabase = await createClient();

  const query = supabase
    .from("budgets")
    .select("id, name, year, status, scenario")
    .eq("company_id", companyId);

  const { data } = budgetId
    ? await query.eq("id", String(budgetId)).maybeSingle()
    : await query
        .order("year", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

  return data;
}

async function openingCash(companyId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("gl_accounts")
    .select("closing_balance")
    .eq("company_id", companyId)
    .gte("account_number", "1900")
    .lt("account_number", "2000");

  return (data ?? []).reduce((t, a) => t + Number(a.closing_balance ?? 0), 0);
}

export const getBudget = async (
  companyId: string,
  params: ToolParams
): Promise<ToolResult> => {
  const budget = await resolveBudget(companyId, params.budget_id);

  if (!budget) {
    return {
      has_budget: false,
      note:
        "Selskapet har ingen budsjetter ennå. Be brukeren lage ett under " +
        "«Budsjett» — Elida lager et førsteutkast fra de siste tolv månedene. " +
        "Ikke oppgi budsjettall.",
    };
  }

  const supabase = await createClient();
  const grid = await readGrid(supabase, budget.id);
  const result = computeBudgetResult(grid);
  const cash = computeCashEffect(grid, await openingCash(companyId));

  return {
    has_budget: true,
    budget: {
      id: budget.id,
      name: budget.name,
      year: budget.year,
      status: budget.status,
      scenario: budget.scenario,
    },
    annual: result.annual,
    by_month: result.months,
    by_category: CATEGORIES.map((c) => ({
      key: c.key,
      label: c.label,
      kind: c.kind,
      annual: (grid[c.key] ?? []).reduce((t, v) => t + v, 0),
      by_month: grid[c.key] ?? [],
    })).filter((c) => c.annual !== 0),
    cash: {
      lowest_balance: cash.lowest.balance,
      lowest_month: MONTH_LONG[cash.lowest.month - 1],
      closing_balance: cash.closing,
    },
    note:
      "Likviditetstallene er et grovt estimat: inntekter regnes inn en måned " +
      "etter fakturering, leverandørkostnader en halv måned etter, lønn i " +
      "samme måned. Presenter dem som estimat.",
    data_source: "budget",
  };
};

export const proposeBudgetChange = async (
  companyId: string,
  params: ToolParams
): Promise<ToolResult> => {
  const budget = await resolveBudget(companyId, params.budget_id);

  if (!budget) {
    return {
      applied: false,
      note:
        "Selskapet har ingen budsjetter ennå, så det er ingenting å endre. Be " +
        "brukeren lage et budsjett først.",
    };
  }

  const supabase = await createClient();
  const before = await readGrid(supabase, budget.id);
  const opening = await openingCash(companyId);

  const changeType = String(params.change_type ?? "");
  const categoryKey = params.category_key ? String(params.category_key) : null;
  const fromMonth = clampMonth(params.from_month);

  let after: BudgetGrid;
  let description: string;
  let employeeCost: ReturnType<typeof computeEmployeeCost> | null = null;

  switch (changeType) {
    case "adjust_percent": {
      if (!categoryKey || !categoryByKey(categoryKey)) {
        return { error: `Ukjent kategori: ${categoryKey}` };
      }
      const percent = Number(params.percent);
      if (!Number.isFinite(percent)) {
        return { error: "Mangler prosent for endringen." };
      }
      after = adjustCategory(before, categoryKey, percent);
      description = `${categoryByKey(categoryKey)!.label} justert ${percent > 0 ? "opp" : "ned"} ${Math.abs(percent)} %`;
      break;
    }

    case "set_annual": {
      if (!categoryKey || !categoryByKey(categoryKey)) {
        return { error: `Ukjent kategori: ${categoryKey}` };
      }
      const amount = Number(params.amount);
      if (!Number.isFinite(amount)) return { error: "Mangler beløp." };
      after = distributeAnnual(before, categoryKey, amount);
      description = `${categoryByKey(categoryKey)!.label} satt til ${format(amount)} for året, fordelt etter sesongmønsteret`;
      break;
    }

    case "add_cost": {
      if (!categoryKey || !categoryByKey(categoryKey)) {
        return { error: `Ukjent kategori: ${categoryKey}` };
      }
      const monthly = Number(params.amount);
      if (!Number.isFinite(monthly)) return { error: "Mangler månedsbeløp." };
      after = addRecurringCost(before, categoryKey, monthly, fromMonth);
      description = `${params.name ?? "Ny kostnad"}: ${format(monthly)} per måned fra ${MONTH_LONG[fromMonth - 1]} under ${categoryByKey(categoryKey)!.label}`;
      break;
    }

    case "add_employee": {
      const salary = Number(params.amount);
      if (!Number.isFinite(salary)) return { error: "Mangler årslønn." };

      employeeCost = computeEmployeeCost({
        annualSalary: salary,
        startMonth: fromMonth,
      });

      after = addEmployee(before, { annualSalary: salary, startMonth: fromMonth });
      description = `${params.name ?? "Ny ansatt"} fra ${MONTH_LONG[fromMonth - 1]} med ${format(salary)} i årslønn`;
      break;
    }

    default:
      return { error: `Ukjent endringstype: ${changeType}` };
  }

  const resultBefore = computeBudgetResult(before);
  const resultAfter = computeBudgetResult(after);
  const cashBefore = computeCashEffect(before, opening);
  const cashAfter = computeCashEffect(after, opening);

  return {
    applied: false,
    requires_confirmation: true,
    budget: { id: budget.id, name: budget.name, year: budget.year },
    change: {
      type: changeType,
      description,
      category_key: categoryKey,
      from_month: fromMonth,
    },
    effect: {
      revenue_before: resultBefore.annual.revenue,
      revenue_after: resultAfter.annual.revenue,
      costs_before: resultBefore.annual.costs,
      costs_after: resultAfter.annual.costs,
      operating_profit_before: resultBefore.annual.operating_profit,
      operating_profit_after: resultAfter.annual.operating_profit,
      operating_profit_change:
        resultAfter.annual.operating_profit - resultBefore.annual.operating_profit,
      lowest_cash_before: cashBefore.lowest.balance,
      lowest_cash_after: cashAfter.lowest.balance,
      lowest_cash_month_after: MONTH_LONG[cashAfter.lowest.month - 1],
    },
    employee_cost: employeeCost,
    note:
      "Dette er et FORSLAG. Budsjettet er ikke endret. Presenter effekten for " +
      "brukeren og spør om endringen skal gjennomføres. Si at de gjør den " +
      "under «Budsjett», eller bekrefter her hvis grensesnittet tilbyr det. " +
      "Ikke påstå at budsjettet er oppdatert.",
    data_source: "budget",
  };
};

function clampMonth(value: unknown): number {
  const month = Number(value);
  if (!Number.isInteger(month) || month < 1 || month > 12) return 1;
  return month;
}

function format(n: number): string {
  return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(n)} kr`;
}
