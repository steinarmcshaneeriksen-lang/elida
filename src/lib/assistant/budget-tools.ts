/**
 * Budget handlers for the assistant.
 *
 * The assistant reads the budget freely, works out what a change would do, and
 * — once the user has said yes — carries it out.
 *
 * It could not before. `propose_budget_change` returned `applied: false` in
 * every branch, nothing in the interface offered to confirm anything, and no
 * tool could create a budget at all, so "lag et budsjett som viser dette" had
 * no path to a budget. The assistant could describe work it was unable to do.
 *
 * Two lines keep that from becoming a chat window quietly rewriting the
 * numbers a board decision rests on:
 *
 *   A change is applied only when the caller passes `confirmed: true`, which
 *   the model is told to set only after the user has agreed to a proposal it
 *   has already shown them.
 *
 *   Approved budgets are never written to, confirmed or not. An approved
 *   budget has been agreed by someone; changing it is a new version, made
 *   deliberately, not a side effect of a sentence.
 *
 * The arithmetic is the budget engine's, not the model's, so a hire costs what
 * the rules say it costs and a target ramps the way the engine ramps it.
 */

import { createClient } from "@/lib/supabase/server";
import { readGrid, writeGrid } from "@/lib/budget/store";
import {
  addEmployee,
  addRecurringCost,
  adjustCategory,
  computeBudgetResult,
  computeCashEffect,
  computeEmployeeCost,
  distributeAnnual,
  generateBudgetGrid,
  rampToTarget,
  type BudgetGrid,
} from "@/lib/budget/engine";
import { CATEGORIES, categoryByKey } from "@/lib/reports/categories";
import { fetchAll } from "@/lib/supabase/paginate";

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
  type BankRow = { closing_balance: number | null };

  const data = await fetchAll<BankRow>(
    (from, to) =>
      supabase
        .from("gl_accounts")
        .select("closing_balance")
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

    case "reach_target": {
      if (!categoryKey || !categoryByKey(categoryKey)) {
        return { error: `Ukjent kategori: ${categoryKey}` };
      }
      const monthly = Number(params.amount);
      if (!Number.isFinite(monthly)) {
        return { error: "Mangler månedlig målbeløp." };
      }
      const targetMonth = clampMonth(params.target_month ?? 12);
      if (targetMonth < fromMonth) {
        return {
          error:
            "Målmåneden ligger før startmåneden. Et mål kan ikke nås før " +
            "opptrappingen begynner.",
        };
      }

      after = rampToTarget(before, categoryKey, monthly, fromMonth, targetMonth);
      description =
        `${categoryByKey(categoryKey)!.label} trappes opp til ${format(monthly)} ` +
        `per måned innen utgangen av ${MONTH_LONG[targetMonth - 1]}, ` +
        `med jevn økning fra ${MONTH_LONG[fromMonth - 1]}`;
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

  /*
   * Written only on an explicit yes, and never to an approved budget.
   *
   * An approved budget has been agreed by someone. Changing it is a new
   * version, made deliberately in the budget screen — not something a sentence
   * in a chat window does on the way past.
   */
  const confirmed = params.confirmed === true;
  const locked = budget.status === "approved";

  if (confirmed && !locked) {
    await writeGrid(supabase, budget.id, after);
  }

  return {
    applied: confirmed && !locked,
    requires_confirmation: !confirmed,
    budget: {
      id: budget.id,
      name: budget.name,
      year: budget.year,
      status: budget.status,
    },
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
    note: locked
      ? "Budsjettet er GODKJENT og kan ikke endres herfra. Tallene over viser " +
        "hva endringen ville gjort. Si at brukeren må lage en ny versjon " +
        "under «Budsjett» hvis den skal gjennomføres."
      : confirmed
        ? "Endringen er GJENNOMFØRT og budsjettet er lagret. Oppsummer hva " +
          "som ble endret og hva det gjorde med resultatet."
        : "Dette er et FORSLAG. Budsjettet er IKKE endret. Vis effekten og " +
          "spør om den skal gjennomføres. Kall verktøyet på nytt med " +
          "confirmed: true først når brukeren har sagt ja. Ikke påstå at " +
          "budsjettet er oppdatert.",
    data_source: "budget",
  };
};

/**
 * Creates a budget, so "lag et budsjett som viser dette" has somewhere to go.
 *
 * A draft, always: the year's figures start from what the company actually did
 * and the user edits from there. Nothing here can touch an existing budget.
 */
export const createBudget = async (
  companyId: string,
  params: ToolParams
): Promise<ToolResult> => {
  const confirmed = params.confirmed === true;
  const year = Number(params.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { error: "Mangler et gyldig årstall for budsjettet." };
  }

  const name = String(params.name ?? `Budsjett ${year}`).slice(0, 120);
  const basedOn = String(params.based_on ?? "last_12_months");

  if (!confirmed) {
    return {
      created: false,
      requires_confirmation: true,
      would_create: { name, year, based_on: basedOn },
      note:
        "Dette er et FORSLAG. Budsjettet er ikke opprettet. Bekreft med " +
        "brukeren og kall verktøyet på nytt med confirmed: true.",
      data_source: "budget",
    };
  }

  const supabase = await createClient();

  const { data: budget, error } = (await supabase
    .from("budgets")
    .insert({
      company_id: companyId,
      name,
      year,
      status: "draft",
      scenario: String(params.scenario ?? "base"),
      based_on: basedOn,
    } as never)
    .select("id, name, year, status")
    .single()) as {
    data: { id: string; name: string; year: number; status: string } | null;
    error: { code?: string; message: string } | null;
  };

  if (error || !budget) {
    return {
      created: false,
      error:
        error?.code === "23505"
          ? `Det finnes allerede et budsjett som heter «${name}».`
          : "Kunne ikke opprette budsjettet.",
    };
  }

  const generated = await generateBudgetGrid(supabase, {
    companyId,
    year,
    basedOn,
  });

  await writeGrid(supabase, budget.id, generated.grid);

  if (generated.basis) {
    await supabase
      .from("budgets")
      .update({
        basis_start: generated.basis.start,
        basis_end: generated.basis.end,
        basis_gap_months: generated.gapMonths,
      } as never)
      .eq("id", budget.id);
  }

  const result = computeBudgetResult(generated.grid);

  return {
    created: true,
    budget: {
      id: budget.id,
      name: budget.name,
      year: budget.year,
      status: budget.status,
    },
    basis: generated.basis,
    // Months the basis said nothing about, filled from the rest of the year.
    basis_gap_months: generated.gapMonths,
    annual: result.annual,
    note:
      "Budsjettet er opprettet som UTKAST og fylt med tallene fra " +
      "grunnlagsperioden. Si hvilken periode det bygger på. Bruk " +
      "propose_budget_change med denne budsjett-id-en for å legge inn mål " +
      "eller endringer.",
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
