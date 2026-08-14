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
import { confirmationCode, mayApply, refusalNote } from "./confirm";

type ToolParams = Record<string, unknown>;
type ToolResult = Record<string, unknown>;

const MONTH_LONG = [
  "januar", "februar", "mars", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "desember",
];

interface BudgetRow {
  id: string;
  name: string;
  year: number;
  status: string;
  scenario: string;
}

/**
 * Which budget this is about.
 *
 * "Det nyeste" was the rule, and it silently picked one. A user asked for a
 * plan running to December 2026, no 2026 budget existed, and the change landed
 * on the 2027 draft — the only budget in the company — without the year ever
 * being said out loud. The wrong year is not a detail in a budget.
 *
 * So a single budget is still used without asking, because there is nothing to
 * confuse it with. Where there are several, or where the caller named a year
 * the company has no budget for, nothing is chosen: the list comes back and
 * the user picks.
 */
async function resolveBudget(
  companyId: string,
  budgetId?: unknown,
  year?: unknown
): Promise<
  | { budget: BudgetRow; choices?: undefined }
  | { budget?: undefined; choices: BudgetRow[]; reason: "none" | "ambiguous" | "no_such_year" }
> {
  const supabase = await createClient();

  const { data } = (await supabase
    .from("budgets")
    .select("id, name, year, status, scenario")
    .eq("company_id", companyId)
    .order("year", { ascending: false })
    .order("created_at", { ascending: false })) as { data: BudgetRow[] | null };

  const all = data ?? [];
  if (all.length === 0) return { choices: [], reason: "none" };

  if (budgetId) {
    const named = all.find((b) => b.id === String(budgetId));
    return named ? { budget: named } : { choices: all, reason: "no_such_year" };
  }

  const wanted = Number(year);
  if (Number.isInteger(wanted)) {
    const forYear = all.filter((b) => b.year === wanted);
    if (forYear.length === 0) return { choices: all, reason: "no_such_year" };
    if (forYear.length > 1) return { choices: forYear, reason: "ambiguous" };
    return { budget: forYear[0] };
  }

  if (all.length > 1) return { choices: all, reason: "ambiguous" };
  return { budget: all[0] };
}

/** What to say when no single budget could be settled on. */
function budgetChoiceResult(
  choices: BudgetRow[],
  reason: "none" | "ambiguous" | "no_such_year"
): ToolResult {
  if (reason === "none") {
    return {
      has_budget: false,
      note:
        "Selskapet har ingen budsjetter ennå. Foreslå å lage ett — Elida " +
        "fyller det første utkastet med tallene fra de siste tolv månedene " +
        "med reell drift. Ikke oppgi budsjettall.",
    };
  }

  return {
    has_budget: true,
    needs_choice: true,
    budgets: choices.map((b) => ({
      id: b.id,
      name: b.name,
      year: b.year,
      status: b.status === "approved" ? "godkjent" : "utkast",
    })),
    note:
      reason === "no_such_year"
        ? "Selskapet har ikke noe budsjett for det året. Si hvilke år det " +
          "finnes budsjett for, og spør hvilket brukeren mener — eller om " +
          "det skal lages et nytt for året de spurte om. Ikke bruk et annet " +
          "år uten å si det."
        : "Selskapet har flere budsjetter. Spør hvilket det gjelder, og oppgi " +
          "år og navn. Ikke velg selv.",
    data_source: "budget",
  };
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
  const chosen = await resolveBudget(companyId, params.budget_id, params.year);
  if (!chosen.budget) return budgetChoiceResult(chosen.choices, chosen.reason);
  const budget = chosen.budget;

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
      // Norwegian, because the model reads this back to the user. "draft"
      // came straight out of the column and straight into the answer.
      status: budget.status === "approved" ? "godkjent" : "utkast",
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
  const chosen = await resolveBudget(companyId, params.budget_id, params.year);
  if (!chosen.budget) {
    return { applied: false, ...budgetChoiceResult(chosen.choices, chosen.reason) };
  }
  const budget = chosen.budget;

  const supabase = await createClient();
  const before = await readGrid(supabase, budget.id);
  const opening = await openingCash(companyId);

  const changeType = String(params.change_type ?? "");
  const categoryKey = params.category_key ? String(params.category_key) : null;
  const fromMonth = clampMonth(params.from_month);

  let after: BudgetGrid;
  let description: string;
  let employeeCost: ReturnType<typeof computeEmployeeCost> | null = null;
  let target: TargetMove | null = null;

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
      target = describeTarget(before, categoryKey, monthly, fromMonth, targetMonth);

      description =
        `${categoryByKey(categoryKey)!.label} ${target.direction === "ned" ? "trappes ned" : "trappes opp"} ` +
        `til ${format(monthly)} per måned innen utgangen av ` +
        `${MONTH_LONG[targetMonth - 1]}, med jevn endring fra ` +
        `${MONTH_LONG[fromMonth - 1]}`;
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
   * Written only against a proposal the user has actually been shown, and
   * never to an approved budget.
   *
   * The flag on its own was the whole guard, and a first call that set it got
   * the write — which is how a budget came to be rewritten under an answer
   * saying "ingenting er lagret eller endret". The code is computed over the
   * figures this proposal was made against, so it can only come from a previous
   * call, and it stops matching if those figures move.
   */
  const facts = {
    budget: budget.id,
    change: changeType,
    category: categoryKey,
    from: fromMonth,
    to: clampMonth(params.target_month ?? 12),
    amount: Number(params.amount),
    percent: Number(params.percent),
    // The state the proposal was read off, so a stale one cannot be applied.
    before: resultBefore.annual,
  };

  const code = confirmationCode("budget_change", facts);
  const locked = budget.status === "approved";
  const applied = !locked && mayApply(params, "budget_change", facts);

  if (applied) {
    await writeGrid(supabase, budget.id, after);
  }

  return {
    applied,
    requires_confirmation: !applied && !locked,
    // Handed back so the next call can prove the user saw this proposal.
    confirm_code: applied ? undefined : code,
    budget: {
      id: budget.id,
      name: budget.name,
      year: budget.year,
      status: budget.status === "approved" ? "godkjent" : "utkast",
    },
    change: {
      // Norwegian, because whatever is written here ends up in the answer. The
      // reader is a business owner, not someone reading a function name.
      what: CHANGE_LABELS[changeType] ?? "Budsjettendring",
      description,
      category: categoryKey ? categoryByKey(categoryKey)?.label ?? null : null,
      from_month: MONTH_LONG[fromMonth - 1],
    },
    target: target && {
      direction: target.direction,
      from_level: target.fromLevel,
      to_level: target.toLevel,
      warning: target.warning,
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
      : applied
        ? "Endringen er GJENNOMFØRT og budsjettet er lagret. Si hvilket " +
          "budsjett og hvilket år, og hva endringen gjorde med resultatet."
        : [
            "Dette er et FORSLAG. Budsjettet er IKKE endret.",
            `Det gjelder ${budget.name} (${budget.year}) — si hvilket år, slik at`,
            "brukeren kan si fra hvis det er feil budsjett.",
            refusalNote(typeof params.confirm_code === "string"),
            target?.warning ?? "",
          ]
            .filter(Boolean)
            .join(" "),
    data_source: "budget",
  };
};

/** What each kind of change is called in the answer. */
export const CHANGE_LABELS: Record<string, string> = {
  adjust_percent: "Prosentjustering av en kategori",
  set_annual: "Nytt årsbeløp for en kategori",
  reach_target: "Opptrapping mot et månedlig mål",
  add_cost: "Ny fast månedlig kostnad",
  add_employee: "Ny ansatt",
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
  const year = Number(params.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { error: "Mangler et gyldig årstall for budsjettet." };
  }

  const name = String(params.name ?? `Budsjett ${year}`).slice(0, 120);
  const basedOn = String(params.based_on ?? "last_12_months");

  const facts = { company: companyId, name, year, based_on: basedOn };

  if (!mayApply(params, "create_budget", facts)) {
    return {
      created: false,
      requires_confirmation: true,
      confirm_code: confirmationCode("create_budget", facts),
      would_create: {
        name,
        year,
        grunnlag:
          basedOn === "last_12_months"
            ? "de siste tolv månedene med reell drift"
            : basedOn,
      },
      note:
        "Dette er et FORSLAG. Budsjettet er ikke opprettet. Si hvilket år det " +
        "gjelder og hva det bygger på, spør om det skal lages, og kall " +
        "verktøyet på nytt med samme «confirm_code» først når brukeren har " +
        "sagt ja.",
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
      status: "utkast",
    },
    basis: generated.basis,
    // Months the basis said nothing about, filled from the rest of the year.
    basis_gap_months: generated.gapMonths,
    annual: result.annual,
    note:
      "Budsjettet er opprettet som UTKAST. Det er et HELT driftsbudsjett: " +
      "alle inntekts- og kostnadslinjene fra grunnlagsperioden er kopiert inn " +
      "som de var, ikke bare den linjen brukeren spurte om. Si dette, og si " +
      "hvilken periode det bygger på — ellers ser brukeren en skjerm full av " +
      "poster hen ikke har bedt om. " +
      "INGEN vekst, mål eller endring er lagt inn ennå. Ba brukeren om et " +
      "vekstbudsjett, er dette bare utgangspunktet: neste steg er å legge inn " +
      "endringen på riktig linje, og det må bekreftes for seg. Ikke si at " +
      "veksten er med.",
    data_source: "budget",
  };
};

interface TargetMove {
  direction: "opp" | "ned" | "uendret";
  fromLevel: number;
  toLevel: number;
  warning: string | null;
}

/**
 * Which way a target actually moves the budget.
 *
 * A ramp to a monthly figure is not by itself an increase, and it was treated
 * as one. "Øk til 400 000 i måneden" was applied to a revenue line already
 * budgeting 717 000 a month, and the ramp obediently walked it *down* — a 25 %
 * cut, described back to the user as an increase, with the annual total falling
 * and nobody saying so.
 *
 * Two things are worth saying out loud here. That the target is below where the
 * budget already stands. And that recurring revenue is not the same thing as
 * revenue: MRR is the part that comes back every month by contract, and a
 * target for MRR set against the whole revenue line is a target against the
 * wrong number.
 */
function describeTarget(
  grid: BudgetGrid,
  categoryKey: string,
  monthlyTarget: number,
  fromMonth: number,
  targetMonth: number
): TargetMove {
  const months = grid[categoryKey] ?? new Array(12).fill(0);
  // The level the climb starts from: the last month before the ramp begins.
  const fromLevel = Math.round(fromMonth > 1 ? months[fromMonth - 2] : months[0]);
  const toLevel = Math.round(monthlyTarget);

  const direction = toLevel > fromLevel ? "opp" : toLevel < fromLevel ? "ned" : "uendret";

  let warning: string | null = null;

  if (direction === "ned") {
    const cut = fromLevel - toLevel;
    warning =
      `Målet på ${format(toLevel)} per måned er LAVERE enn nivået budsjettet ` +
      `allerede ligger på i ${MONTH_LONG[Math.max(fromMonth - 2, 0)]} ` +
      `(${format(fromLevel)}). Endringen SENKER ` +
      `${categoryByKey(categoryKey)!.label.toLowerCase()} med ${format(cut)} per ` +
      `måned, den øker den ikke. Si dette rett ut før du spør om noe skal ` +
      `gjennomføres. Hvis brukeren mente gjentakende inntekt (MRR), er det ikke ` +
      `det samme tallet som samlet omsetning: MRR er den delen som kommer igjen ` +
      `hver måned, og er lavere. Hent den med get_recurring_revenue og regn om ` +
      `målet, framfor å sette det mot hele omsetningen.`;
  } else if (direction === "uendret") {
    warning =
      `Budsjettet ligger allerede på ${format(toLevel)} per måned fra denne ` +
      `måneden. Endringen gjør ingenting. Sjekk om den allerede er utført.`;
  } else if (categoryKey === "revenue" && targetMonth - fromMonth < 3) {
    warning =
      `Opptrappingen har bare ${targetMonth - fromMonth + 1} måneder på seg. ` +
      `Si hvor bratt den er per måned, så brukeren ser hva som må til.`;
  }

  return { direction, fromLevel, toLevel, warning };
}

function clampMonth(value: unknown): number {
  const month = Number(value);
  if (!Number.isInteger(month) || month < 1 || month > 12) return 1;
  return month;
}

function format(n: number): string {
  return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(n)} kr`;
}
