/**
 * The Budget Engine.
 *
 * Built for an owner, not a controller. The starting point is what the company
 * actually did — twelve months of postings, category by category, month by
 * month — because a budget that begins as a blank grid never gets filled in.
 *
 * Two things matter for it to be useful rather than merely present:
 *
 *   Seasonality is preserved. A company with a quiet January and a heavy
 *   November must keep that shape when the year is raised 15 %, otherwise the
 *   monthly figures are wrong even when the annual total is right.
 *
 *   Employer cost is computed, never guessed. Salary plus holiday pay plus
 *   employer's contribution plus pension is a rule, and rules belong in code.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { CATEGORIES, categoryForAccount, signedAmount } from "@/lib/reports/categories";
import { EMPLOYER_TAX_RATES } from "@/lib/constants";
import { resolveDataWindow, type MonthActivity } from "@/lib/data-window";
import { fetchAll } from "@/lib/supabase/paginate";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

const PAGE_SIZE = 1000;

export interface BudgetGrid {
  /** category key → 12 monthly amounts, index 0 = January. */
  [categoryKey: string]: number[];
}

export interface GenerateOptions {
  companyId: string;
  year: number;
  /** last_12_months | previous_year | empty */
  basedOn: string;
  /** Applied to revenue categories after the base is built. */
  revenueGrowthPercent?: number;
  /** Applied to cost categories after the base is built. */
  costGrowthPercent?: number;
}

export interface GeneratedBudget {
  grid: BudgetGrid;
  basis: { start: string; end: string } | null;
  /** Basis months with no postings, filled from the rest of the year. */
  gapMonths: string[];
}

interface Posting {
  account_number: string;
  amount: number;
  transaction_date: string;
}

// ---------------------------------------------------------------------------
// Generating a starting budget
// ---------------------------------------------------------------------------

export async function generateBudgetGrid(
  supabase: DB,
  options: GenerateOptions
): Promise<GeneratedBudget> {
  const empty = emptyGrid();

  if (options.basedOn === "empty") {
    return { grid: empty, basis: null, gapMonths: [] };
  }

  const basis = await resolveBasisPeriod(supabase, options);
  if (!basis) return { grid: empty, basis: null, gapMonths: [] };

  const postings = await loadPostings(supabase, options.companyId, basis.start, basis.end);
  if (postings.length === 0) return { grid: empty, basis, gapMonths: [] };

  // Sum by category and by the month of the basis period. The basis period may
  // not start in January, so months are mapped back onto a calendar year by
  // their position in the period rather than by their calendar month.
  const monthKeys = monthsBetween(basis.start, basis.end);
  const indexOfMonth = new Map(monthKeys.map((m, i) => [m, i]));

  const grid = emptyGrid();
  // How much the basis actually says about each of its months. A month nothing
  // was booked in is a hole in the record, not a month of no trading.
  const postingsPerMonth = new Array(monthKeys.length).fill(0);

  for (const p of postings) {
    const monthIndex = indexOfMonth.get(p.transaction_date.slice(0, 7));
    if (monthIndex == null) continue;
    postingsPerMonth[monthIndex]++;

    const category = categoryForAccount(p.account_number);
    if (!category) continue;

    // A 12-month basis maps one-to-one; a shorter one is spread evenly.
    const slot = monthKeys.length === 12 ? monthIndex % 12 : null;
    const amount = signedAmount(category, Number(p.amount));

    if (slot != null) {
      grid[category.key][slot] += amount;
    } else {
      for (let i = 0; i < 12; i++) {
        grid[category.key][i] += amount / 12;
      }
    }
  }

  const gapMonths = fillGaps(grid, monthKeys, postingsPerMonth);

  // A basis that does not start in January leaves the calendar months rotated;
  // rotate them back so January in the budget is January in the basis.
  if (monthKeys.length === 12) {
    const startMonth = Number(basis.start.slice(5, 7)) - 1;
    if (startMonth !== 0) {
      for (const key of Object.keys(grid)) {
        grid[key] = rotate(grid[key], startMonth);
      }
    }
  }

  for (const category of CATEGORIES) {
    const percent =
      category.kind === "revenue"
        ? (options.revenueGrowthPercent ?? 0)
        : (options.costGrowthPercent ?? 0);

    grid[category.key] = grid[category.key].map((v) =>
      round(v * (1 + percent / 100))
    );
  }

  return { grid, basis, gapMonths };
}

/**
 * Replaces months the basis says nothing about with the average of the months
 * it does.
 *
 * A budgeted zero is a forecast: no sales in September. A month with no
 * postings in the basis is not that — it is a gap in the record, and copying
 * it forward states something the ledger never said. It happened here because
 * the basis period reached into months holding only forward-dated
 * periodisations, but the same hole appears in a company that started
 * mid-year, changed accounting system, or is simply behind on its bookkeeping.
 *
 * A category that is genuinely zero in a month the basis does cover is left
 * alone — an annual insurance premium booked every January must stay in
 * January and must not be smeared across the year.
 *
 * Returns the months that were filled, so the budget can say so rather than
 * presenting an inference as a figure.
 */
export function fillGaps(
  grid: BudgetGrid,
  monthKeys: string[],
  postingsPerMonth: number[]
): string[] {
  if (monthKeys.length !== 12) return [];

  const empty: number[] = [];
  for (let i = 0; i < 12; i++) {
    if (postingsPerMonth[i] === 0) empty.push(i);
  }

  // Nothing to fill, or nothing to fill it from.
  if (empty.length === 0 || empty.length === 12) return [];

  for (const key of Object.keys(grid)) {
    const known = grid[key].filter((_, i) => postingsPerMonth[i] > 0);
    const mean = known.reduce((total, v) => total + v, 0) / known.length;
    for (const i of empty) grid[key][i] = round(mean);
  }

  return empty.map((i) => monthKeys[i]);
}

export function emptyGrid(): BudgetGrid {
  const grid: BudgetGrid = {};
  for (const category of CATEGORIES) {
    grid[category.key] = new Array(12).fill(0);
  }
  return grid;
}

/**
 * Rotates a 12-slot array so index `by` becomes index 0. Used when the basis
 * period runs, say, August to July.
 */
function rotate(values: number[], by: number): number[] {
  const out = new Array(12).fill(0);
  for (let i = 0; i < 12; i++) {
    out[(i + by) % 12] = values[i];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Adjustments
// ---------------------------------------------------------------------------

/**
 * Raises or lowers a category by a percentage, keeping its monthly shape. This
 * is the adjustment an owner reaches for most: "sales up 12 %".
 */
export function adjustCategory(
  grid: BudgetGrid,
  categoryKey: string,
  percent: number
): BudgetGrid {
  const next = { ...grid };
  next[categoryKey] = (grid[categoryKey] ?? new Array(12).fill(0)).map((v) =>
    round(v * (1 + percent / 100))
  );
  return next;
}

/**
 * Compounds growth month on month rather than applying one flat uplift, for
 * "+1 % per måned".
 */
export function applyMonthlyGrowth(
  grid: BudgetGrid,
  categoryKey: string,
  percentPerMonth: number
): BudgetGrid {
  const next = { ...grid };
  const base = grid[categoryKey] ?? new Array(12).fill(0);
  next[categoryKey] = base.map((v, i) =>
    round(v * Math.pow(1 + percentPerMonth / 100, i))
  );
  return next;
}

/**
 * Spreads an annual total across the year using the seasonal shape already in
 * the category. Falls back to an even split when there is no history to
 * borrow a shape from.
 */
export function distributeAnnual(
  grid: BudgetGrid,
  categoryKey: string,
  annualTotal: number
): BudgetGrid {
  const base = grid[categoryKey] ?? new Array(12).fill(0);
  const sum = base.reduce((t, v) => t + v, 0);
  const next = { ...grid };

  next[categoryKey] =
    sum === 0
      ? new Array(12).fill(round(annualTotal / 12))
      : base.map((v) => round((v / sum) * annualTotal));

  return next;
}

/**
 * Grows a category from where it is now to a stated monthly level by a stated
 * month, and holds it there.
 *
 * "Få MRR opp til 400 000 innen 31.12" is a target with a date, and neither a
 * percentage uplift nor an annual total expresses it: the first does not know
 * where to stop, the second says nothing about when. The ramp is linear
 * because a plan that claims to know the curve of its own growth is claiming
 * more than anyone knows — an even climb is a target divided by the months
 * available, which is what a person means by it.
 *
 * Months before `fromMonth` are left alone. They are usually already booked,
 * and a plan cannot change what has happened.
 */
export function rampToTarget(
  grid: BudgetGrid,
  categoryKey: string,
  monthlyTarget: number,
  fromMonth: number,
  targetMonth: number
): BudgetGrid {
  const base = [...(grid[categoryKey] ?? new Array(12).fill(0))];
  const from = Math.min(Math.max(fromMonth, 1), 12);
  const target = Math.min(Math.max(targetMonth, from), 12);

  // Where the climb starts: the last month before the ramp that has a figure,
  // or the target itself if there is no history to climb from.
  const start = from > 1 ? base[from - 2] : base[0];
  const steps = target - from + 1;

  for (let month = from; month <= 12; month++) {
    if (month <= target) {
      const progress = steps === 1 ? 1 : (month - from + 1) / steps;
      base[month - 1] = round(start + (monthlyTarget - start) * progress);
    } else {
      // Past the target month the level is held, not extrapolated.
      base[month - 1] = round(monthlyTarget);
    }
  }

  return { ...grid, [categoryKey]: base };
}

/** Adds a fixed monthly cost from a given month onwards. */
export function addRecurringCost(
  grid: BudgetGrid,
  categoryKey: string,
  monthlyAmount: number,
  fromMonth: number
): BudgetGrid {
  const next = { ...grid };
  const base = [...(grid[categoryKey] ?? new Array(12).fill(0))];

  for (let i = fromMonth - 1; i < 12; i++) {
    base[i] = round(base[i] + monthlyAmount);
  }

  next[categoryKey] = base;
  return next;
}

// ---------------------------------------------------------------------------
// Employer cost
// ---------------------------------------------------------------------------

export interface EmployeeInput {
  annualSalary: number;
  startMonth: number;
  /** Employer's contribution zone; defaults to the general rate. */
  employerTaxZone?: string;
  /** Holiday pay rate, 12 % for five weeks' holiday. */
  holidayPayRate?: number;
  /** Mandatory occupational pension is at least 2 % of salary. */
  pensionRate?: number;
  otherMonthlyCost?: number;
}

export interface EmployeeCost {
  annual_salary: number;
  holiday_pay: number;
  employer_tax: number;
  pension: number;
  other: number;
  total_annual: number;
  total_monthly: number;
  /** What lands in the budget this year, given the start month. */
  months_this_year: number;
  cost_this_year: number;
  breakdown_note: string;
}

/**
 * Total employer cost of a salary.
 *
 * Employer's contribution is charged on holiday pay and on the pension premium
 * as well as on the salary itself, which is the part most people leave out and
 * the reason a hire always costs more than the offer letter says.
 */
export function computeEmployeeCost(input: EmployeeInput): EmployeeCost {
  const salary = Math.max(0, input.annualSalary);
  const holidayRate = input.holidayPayRate ?? 0.12;
  const pensionRate = input.pensionRate ?? 0.02;
  const zone = input.employerTaxZone ?? "1";
  const employerRate = EMPLOYER_TAX_RATES[zone]?.rate ?? EMPLOYER_TAX_RATES["1"].rate;

  const holidayPay = salary * holidayRate;
  const pension = salary * pensionRate;
  const employerTax = (salary + holidayPay + pension) * employerRate;
  const other = (input.otherMonthlyCost ?? 0) * 12;

  const totalAnnual = salary + holidayPay + pension + employerTax + other;

  const startMonth = Math.min(Math.max(input.startMonth, 1), 12);
  const monthsThisYear = 12 - startMonth + 1;

  return {
    annual_salary: round(salary),
    holiday_pay: round(holidayPay),
    employer_tax: round(employerTax),
    pension: round(pension),
    other: round(other),
    total_annual: round(totalAnnual),
    total_monthly: round(totalAnnual / 12),
    months_this_year: monthsThisYear,
    cost_this_year: round((totalAnnual / 12) * monthsThisYear),
    breakdown_note:
      `Årslønn ${format(salary)}, feriepenger ${(holidayRate * 100).toFixed(0)} %, ` +
      `pensjon ${(pensionRate * 100).toFixed(0)} %, arbeidsgiveravgift ` +
      `${(employerRate * 100).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} % ` +
      `(sone ${zone}) beregnet av lønn, feriepenger og pensjon.`,
  };
}

/**
 * Puts a hire into the grid: salary on the salary line, everything the
 * employer pays on top on the employer-cost line, so the two read separately
 * in the budget the way they do in the accounts.
 */
export function addEmployee(grid: BudgetGrid, input: EmployeeInput): BudgetGrid {
  const cost = computeEmployeeCost(input);

  const monthlySalary = (cost.annual_salary + cost.holiday_pay) / 12;
  const monthlyEmployerCost =
    (cost.employer_tax + cost.pension + cost.other) / 12;

  let next = addRecurringCost(grid, "payroll", monthlySalary, input.startMonth);
  next = addRecurringCost(next, "employer_costs", monthlyEmployerCost, input.startMonth);

  return next;
}

// ---------------------------------------------------------------------------
// Result and cash effect
// ---------------------------------------------------------------------------

export interface BudgetResult {
  months: Array<{
    month: number;
    revenue: number;
    costs: number;
    operating_profit: number;
  }>;
  annual: {
    revenue: number;
    costs: number;
    operating_profit: number;
    margin: number | null;
  };
}

export function computeBudgetResult(grid: BudgetGrid): BudgetResult {
  const months = [];

  let annualRevenue = 0;
  let annualCosts = 0;

  for (let m = 0; m < 12; m++) {
    let revenue = 0;
    let costs = 0;

    for (const category of CATEGORIES) {
      const value = grid[category.key]?.[m] ?? 0;
      if (category.kind === "revenue") revenue += value;
      else costs += value;
    }

    annualRevenue += revenue;
    annualCosts += costs;

    months.push({
      month: m + 1,
      revenue: round(revenue),
      costs: round(costs),
      operating_profit: round(revenue - costs),
    });
  }

  return {
    months,
    annual: {
      revenue: round(annualRevenue),
      costs: round(annualCosts),
      operating_profit: round(annualRevenue - annualCosts),
      margin:
        annualRevenue === 0
          ? null
          : Math.round(((annualRevenue - annualCosts) / annualRevenue) * 1000) / 10,
    },
  };
}

export interface CashEffect {
  months: Array<{ month: number; balance: number }>;
  lowest: { month: number; balance: number };
  closing: number;
}

/**
 * A rough cash view of the budget, and stated as rough.
 *
 * Revenue is collected on payment terms rather than in the month it is
 * invoiced, and costs are paid a little later than they are incurred. That is
 * enough to show the timing gap a budget alone hides — which month the money
 * actually gets tight — without pretending to be a cash-flow model.
 */
export function computeCashEffect(
  grid: BudgetGrid,
  openingBalance: number,
  options: { customerPaymentDays?: number; supplierPaymentDays?: number } = {}
): CashEffect {
  const inflowLag = Math.round((options.customerPaymentDays ?? 30) / 30);
  const outflowLag = Math.round((options.supplierPaymentDays ?? 15) / 30);

  const inflow = new Array(12).fill(0);
  const outflow = new Array(12).fill(0);

  for (const category of CATEGORIES) {
    const line = grid[category.key] ?? [];
    for (let m = 0; m < 12; m++) {
      const value = line[m] ?? 0;
      if (value === 0) continue;

      if (category.kind === "revenue") {
        const target = m + inflowLag;
        if (target < 12) inflow[target] += value;
      } else {
        // Payroll leaves the account in the month it is earned, unlike a
        // supplier invoice that sits on payment terms first.
        const lag = category.group === "payroll" ? 0 : outflowLag;
        const target = m + lag;
        if (target < 12) outflow[target] += value;
      }
    }
  }

  let balance = openingBalance;
  const months = [];
  let lowest = { month: 1, balance: openingBalance };

  for (let m = 0; m < 12; m++) {
    balance += inflow[m] - outflow[m];
    const entry = { month: m + 1, balance: round(balance) };
    months.push(entry);
    if (entry.balance < lowest.balance) lowest = entry;
  }

  return { months, lowest, closing: round(balance) };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/**
 * The period the starting budget is built from.
 *
 * Anchored on where the bookkeeping ends, not on the last posting.
 *
 * This is the same trap the reporting periods fell into, and it showed up here
 * as a budget with empty months: the ledger's last posting was 6 December, so
 * "the last twelve months" ran to 30 November and swept in September, October
 * and November — months holding a handful of forward-dated periodisations and
 * no trading at all. The budget dutifully proposed nothing for them.
 *
 * `resolveDataWindow` decides where the books actually stop, and the twelve
 * months are counted back from there.
 */
export function basisFromActivity(
  activity: MonthActivity[],
  options: { year: number; basedOn: string }
): { start: string; end: string } | null {
  if (activity.length === 0) return null;

  if (options.basedOn === "previous_year") {
    const year = options.year - 1;
    const months = activity.filter((a) => a.month.startsWith(String(year)));
    if (months.length === 0) return null;

    // A year still running has no December to end at. Ending at its last month
    // of real bookkeeping gives a shorter basis, which is spread evenly across
    // the budget year — seasonality is lost, but no month comes out empty.
    // To the end of the last month of bookkeeping, not to its last posting.
    // A complete year whose final entry falls on 28 December would otherwise
    // leave the 29th to the 31st out of the basis.
    const window = resolveDataWindow(months);
    return {
      start: `${year}-01-01`,
      end: window ? endOfMonth(window.end) : `${year}-12-31`,
    };
  }

  // The last twelve whole months of bookkeeping.
  const byYear = new Map<number, MonthActivity[]>();
  for (const a of activity) {
    const year = Number(a.month.slice(0, 4));
    byYear.set(year, [...(byYear.get(year) ?? []), a]);
  }

  const latestYear = Math.max(...byYear.keys());
  const window = resolveDataWindow(byYear.get(latestYear)!);
  const lastDate = window?.end ?? activity[activity.length - 1].lastDate;

  const [y, m, d] = lastDate.split("-").map(Number);
  const lastComplete =
    d >= new Date(y, m, 0).getDate()
      ? { year: y, month: m }
      : m === 1
        ? { year: y - 1, month: 12 }
        : { year: y, month: m - 1 };

  const end = `${lastComplete.year}-${String(lastComplete.month).padStart(2, "0")}-${String(
    new Date(lastComplete.year, lastComplete.month, 0).getDate()
  ).padStart(2, "0")}`;

  const startDate = new Date(lastComplete.year, lastComplete.month - 12, 1);
  const start = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-01`;

  return { start, end };
}

async function resolveBasisPeriod(
  supabase: DB,
  options: GenerateOptions
): Promise<{ start: string; end: string } | null> {
  return basisFromActivity(
    await loadMonthActivity(supabase, options.companyId),
    options
  );
}

/** The last day of the month the given date falls in. */
function endOfMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const day = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** One row per month the ledger holds postings in, oldest first. */
async function loadMonthActivity(
  supabase: DB,
  companyId: string
): Promise<MonthActivity[]> {
  const rows = await fetchAll<{ transaction_date: string }>(
    (from, to) =>
      supabase
        .from("account_transactions")
        .select("transaction_date")
        .eq("company_id", companyId)
        .order("transaction_date", { ascending: true })
        .range(from, to) as PromiseLike<{
        data: Array<{ transaction_date: string }> | null;
        error: { message: string } | null;
      }>,
    { label: "posteringer" }
  );

  const byMonth = new Map<string, { count: number; lastDate: string }>();
  for (const row of rows) {
    const month = row.transaction_date.slice(0, 7);
    const entry = byMonth.get(month) ?? { count: 0, lastDate: row.transaction_date };
    entry.count++;
    if (row.transaction_date > entry.lastDate) entry.lastDate = row.transaction_date;
    byMonth.set(month, entry);
  }

  return [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => ({
      month,
      postingCount: v.count,
      lastDate: v.lastDate,
    }));
}

async function loadPostings(
  supabase: DB,
  companyId: string,
  from: string,
  to: string
): Promise<Posting[]> {
  const all: Posting[] = [];

  for (let page = 0; ; page++) {
    const { data } = (await supabase
      .from("account_transactions")
      .select("account_number, amount, transaction_date")
      .eq("company_id", companyId)
      .gte("transaction_date", from)
      .lte("transaction_date", to)
      .gte("account_number", "3000")
      .lt("account_number", "8000")
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)) as {
      data: Posting[] | null;
    };

    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  return all;
}

function monthsBetween(start: string, end: string): string[] {
  const months: string[] = [];
  let cursor = start.slice(0, 7);
  const last = end.slice(0, 7);

  while (cursor <= last && months.length < 36) {
    months.push(cursor);
    const [y, m] = cursor.split("-").map(Number);
    cursor = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }

  return months;
}

function round(n: number): number {
  return Math.round(n);
}

function format(n: number): string {
  return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(n)} kr`;
}
