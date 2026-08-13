/**
 * The observations behind "Dette bør du vite nå".
 *
 * The dashboard has always read `financial_insights`, and nothing has ever
 * written to it — three call sites read the table, none filled it, so the
 * panel said "ingen observasjoner å vise ennå" no matter what the books held.
 *
 * Every rule here is derived from figures the ledger already states, and every
 * one names the numbers it fired on. Nothing is estimated, nothing is guessed
 * from posting text, and a rule that cannot be evaluated from the data present
 * stays silent rather than filling the panel with something vague.
 *
 * Kept free of Supabase so the thresholds can be tested directly.
 */

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export interface Insight {
  type: string;
  severity: Severity;
  title: string;
  description: string;
  /** The figure the rule fired on, and what it was measured against. */
  current: number | null;
  reference: number | null;
  /** Human-readable period, e.g. "1. januar–13. august 2026". */
  period: string;
  evidence: string[];
}

export interface InsightInput {
  period: { start: string; end: string };
  /** Same span of the previous year, when a previous year is held. */
  comparisonPeriod: { start: string; end: string } | null;
  revenue: number;
  previousRevenue: number | null;
  costs: number;
  previousCosts: number | null;
  cash: number | null;
  receivables: number | null;
  /** Complete months inside the period, oldest first. */
  months: Array<{ month: string; revenue: number; costs: number }>;
  /** Revenue per customer over the whole ledger, largest first. */
  customers: Array<{ name: string; revenue: number }>;
  /** Months holding only forward-dated entries, left outside the period. */
  trailingMonths: string[];
  trailingPostings: number;
}

// ---------------------------------------------------------------------------
// Thresholds
//
// Chosen to fire on something a person would want to be told and to stay quiet
// otherwise. A panel that comments on every 2 % movement is one nobody reads.
// ---------------------------------------------------------------------------

/** Revenue movement worth remarking on, against the same period last year. */
const REVENUE_MOVE = 10;
/** Margin movement, in percentage points. */
const MARGIN_MOVE = 3;
/** Costs growing this many points faster than revenue. */
const COST_GAP = 5;
/** Months of running costs the bank balance covers. */
const RUNWAY_CRITICAL = 3;
const RUNWAY_LOW = 6;
/** A single customer's share of revenue. */
const CONCENTRATION_HIGH = 40;
const CONCENTRATION_MEDIUM = 25;
/** Days of sales tied up in unpaid invoices. */
const DSO_HIGH = 75;
const DSO_MEDIUM = 45;
/** A month this far below the average of the months before it. */
const MONTH_DIP = 30;
/** Standard VAT, for turning net revenue into what was actually invoiced. */
const VAT_RATE = 0.25;

export function deriveInsights(input: InsightInput): Insight[] {
  const period = formatPeriod(input.period.start, input.period.end);
  const out: Insight[] = [];

  const push = (i: Insight) => out.push(i);

  revenueTrend(input, period, push);
  marginShift(input, period, push);
  costGrowth(input, period, push);
  runway(input, period, push);
  concentration(input, period, push);
  collection(input, period, push);
  monthDip(input, period, push);
  forwardDated(input, period, push);
  noComparison(input, period, push);

  // Most serious first, so the panel opens with what matters.
  const rank: Record<Severity, number> = {
    critical: 0, high: 1, medium: 2, low: 3, info: 4,
  };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

type Push = (i: Insight) => void;

/** Revenue against the same span of last year — never against a full year. */
function revenueTrend(input: InsightInput, period: string, push: Push): void {
  const { previousRevenue, revenue, comparisonPeriod } = input;
  if (previousRevenue == null || previousRevenue <= 0 || !comparisonPeriod) return;

  const change = ((revenue - previousRevenue) / previousRevenue) * 100;
  if (Math.abs(change) < REVENUE_MOVE) return;

  const down = change < 0;
  const comparison = formatPeriod(comparisonPeriod.start, comparisonPeriod.end);

  push({
    type: "revenue_trend",
    severity: down ? (change <= -25 ? "high" : "medium") : "low",
    title: down
      ? `Omsetningen er ${fmtPercent(Math.abs(change))} lavere enn i fjor`
      : `Omsetningen er ${fmtPercent(change)} høyere enn i fjor`,
    description:
      `${money(revenue)} i perioden ${period}, mot ${money(previousRevenue)} i ${comparison}. ` +
      `Det er ${money(Math.abs(revenue - previousRevenue))} ${down ? "mindre" : "mer"}. ` +
      "Periodene er like lange, så tallene er sammenlignbare.",
    current: round(revenue),
    reference: round(previousRevenue),
    period,
    evidence: [
      `Omsetning ${period}: ${money(revenue)}`,
      `Omsetning ${comparison}: ${money(previousRevenue)}`,
    ],
  });
}

/** Operating margin, which moves in percentage points rather than percent. */
function marginShift(input: InsightInput, period: string, push: Push): void {
  const { revenue, costs, previousRevenue, previousCosts } = input;
  if (revenue <= 0 || previousRevenue == null || previousCosts == null) return;
  if (previousRevenue <= 0) return;

  const margin = ((revenue - costs) / revenue) * 100;
  const previous = ((previousRevenue - previousCosts) / previousRevenue) * 100;
  const move = margin - previous;
  if (Math.abs(move) < MARGIN_MOVE) return;

  const down = move < 0;

  push({
    type: "margin_shift",
    severity: down ? (margin < 0 ? "high" : "medium") : "low",
    title: down
      ? `Driftsmarginen har falt ${fmtPoints(Math.abs(move))}`
      : `Driftsmarginen har steget ${fmtPoints(move)}`,
    description:
      `${fmtPercent(margin)} i perioden ${period}, mot ${fmtPercent(previous)} samme periode i fjor. ` +
      (margin < 0
        ? "Driften går med underskudd i perioden."
        : `Av hver hundrelapp i omsetning sitter det igjen ${Math.round(margin)} kroner før finansposter og skatt.`),
    current: round(margin),
    reference: round(previous),
    period,
    evidence: [
      `Driftsresultat ${period}: ${money(revenue - costs)}`,
      `Omsetning ${period}: ${money(revenue)}`,
    ],
  });
}

/** Costs outgrowing revenue is the thing that eats a margin quietly. */
function costGrowth(input: InsightInput, period: string, push: Push): void {
  const { revenue, costs, previousRevenue, previousCosts } = input;
  if (previousRevenue == null || previousCosts == null) return;
  if (previousRevenue <= 0 || previousCosts <= 0) return;

  const revenueChange = ((revenue - previousRevenue) / previousRevenue) * 100;
  const costChange = ((costs - previousCosts) / previousCosts) * 100;
  const gap = costChange - revenueChange;
  if (gap < COST_GAP || costChange <= 0) return;

  push({
    type: "cost_growth",
    severity: revenueChange < 0 ? "high" : "medium",
    title: "Kostnadene vokser raskere enn omsetningen",
    description:
      `Kostnadene er ${fmtPercent(costChange)} ${costChange > 0 ? "opp" : "ned"} mot i fjor, ` +
      `mens omsetningen er ${fmtPercent(Math.abs(revenueChange))} ${revenueChange < 0 ? "ned" : "opp"}. ` +
      `Forskjellen er ${fmtPoints(gap)}. ` +
      (revenueChange < 0
        ? "Kostnadene har ikke fulgt med omsetningen ned."
        : "Veksten koster mer enn den drar inn."),
    current: round(costs),
    reference: round(previousCosts),
    period,
    evidence: [
      `Kostnader ${period}: ${money(costs)}`,
      `Kostnader samme periode i fjor: ${money(previousCosts)}`,
    ],
  });
}

/** How long the bank balance covers running costs at the present rate. */
function runway(input: InsightInput, period: string, push: Push): void {
  const { cash, months } = input;
  if (cash == null || months.length < 3) return;

  const monthlyCosts =
    months.reduce((t, m) => t + m.costs, 0) / months.length;
  if (monthlyCosts <= 0) return;

  const monthsCovered = cash / monthlyCosts;
  if (monthsCovered >= RUNWAY_LOW) return;

  push({
    type: "liquidity_runway",
    severity: monthsCovered < RUNWAY_CRITICAL ? "high" : "medium",
    title: `Bankbeholdningen dekker ${fmtMonths(monthsCovered)} med drift`,
    description:
      `${money(cash)} på bok mot ${money(monthlyCosts)} i gjennomsnittlige månedskostnader. ` +
      "Tallet er bokført saldo ved periodens slutt, ikke live banksaldo, og tar ikke hensyn til " +
      "penger som er på vei inn fra kunder.",
    current: round(cash),
    reference: round(monthlyCosts),
    period,
    evidence: [
      `Bokført bankbeholdning: ${money(cash)}`,
      `Snittkostnad per måned over ${months.length} måneder: ${money(monthlyCosts)}`,
    ],
  });
}

/** One customer carrying too much of the revenue. */
function concentration(input: InsightInput, period: string, push: Push): void {
  const total = input.customers.reduce((t, c) => t + Math.max(0, c.revenue), 0);
  if (total <= 0 || input.customers.length < 2) return;

  const top = input.customers[0];
  if (top.revenue <= 0) return;

  const share = (top.revenue / total) * 100;
  if (share < CONCENTRATION_MEDIUM) return;

  const topThree = input.customers.slice(0, 3);
  const threeShare =
    (topThree.reduce((t, c) => t + c.revenue, 0) / total) * 100;

  push({
    type: "customer_concentration",
    severity: share >= CONCENTRATION_HIGH ? "high" : "medium",
    title: `${top.name} står for ${fmtPercent(share)} av omsetningen`,
    description:
      `${money(top.revenue)} av ${money(total)} kommer fra én kunde. ` +
      (topThree.length === 3
        ? `De tre største står til sammen for ${fmtPercent(threeShare)}. `
        : "") +
      "Om denne kunden faller fra, forsvinner en tilsvarende andel av inntektene.",
    current: round(share),
    reference: null,
    period,
    evidence: topThree.map(
      (c) => `${c.name}: ${money(c.revenue)} (${fmtPercent((c.revenue / total) * 100)})`
    ),
  });
}

/** Money invoiced but not collected, expressed as days of sales. */
function collection(input: InsightInput, period: string, push: Push): void {
  const { receivables, revenue, period: range } = input;
  if (receivables == null || receivables <= 0 || revenue <= 0) return;

  const days = daysBetween(range.start, range.end);
  if (days < 60) return;

  // Receivables carry VAT; revenue does not. Comparing them without grossing
  // up would overstate how long invoices go unpaid by a quarter.
  const grossPerDay = (revenue * (1 + VAT_RATE)) / days;
  const dso = receivables / grossPerDay;
  if (dso < DSO_MEDIUM) return;

  push({
    type: "receivables_pressure",
    severity: dso >= DSO_HIGH ? "high" : "medium",
    title: `Kundene bruker i snitt ${Math.round(dso)} dager på å betale`,
    description:
      `${money(receivables)} står ute i ubetalte fakturaer. Målt mot fakturert omsetning ` +
      `i perioden tilsvarer det ${Math.round(dso)} dagers salg. ` +
      "Beløpet er inkl. mva, slik det ble fakturert.",
    current: round(dso),
    reference: round(receivables),
    period,
    evidence: [
      `Utestående kundefordringer: ${money(receivables)}`,
      `Omsetning i perioden: ${money(revenue)} eks. mva`,
    ],
  });
}

/** The last complete month falling well below the ones before it. */
function monthDip(input: InsightInput, period: string, push: Push): void {
  const { months } = input;
  if (months.length < 4) return;

  const last = months[months.length - 1];
  const earlier = months.slice(0, -1);
  const average = earlier.reduce((t, m) => t + m.revenue, 0) / earlier.length;
  if (average <= 0) return;

  const drop = ((average - last.revenue) / average) * 100;
  if (drop < MONTH_DIP) return;

  push({
    type: "month_dip",
    severity: drop >= 50 ? "medium" : "low",
    title: `${monthName(last.month)} ligger ${fmtPercent(drop)} under snittet`,
    description:
      `${money(last.revenue)} i ${monthName(last.month)}, mot ${money(average)} i snitt for ` +
      `de ${earlier.length} foregående månedene. ` +
      "Sjekk om noe er fakturert i ettertid eller om måneden er reelt svakere.",
    current: round(last.revenue),
    reference: round(average),
    period,
    evidence: [
      `${monthName(last.month)}: ${money(last.revenue)}`,
      `Snitt foregående måneder: ${money(average)}`,
    ],
  });
}

/** Why the period stops before the last posting in the books. */
function forwardDated(input: InsightInput, period: string, push: Push): void {
  if (input.trailingMonths.length === 0) return;

  push({
    type: "forward_dated_postings",
    severity: "info",
    title: `${input.trailingPostings} posteringer ligger etter periodeslutt`,
    description:
      `Regnskapet har posteringer i ${input.trailingMonths.map(monthName).join(", ")} — ` +
      "typisk forhåndsbetalte kostnader og periodiseringer. De er ikke måneder med drift, " +
      `så tallene stopper ${period.split("–")[1] ?? period} og sammenlignes med samme periode i fjor.`,
    current: input.trailingPostings,
    reference: null,
    period,
    evidence: input.trailingMonths.map(monthName),
  });
}

/** Without a previous year there is nothing to measure against. */
function noComparison(input: InsightInput, period: string, push: Push): void {
  if (input.comparisonPeriod) return;

  push({
    type: "no_comparison",
    severity: "info",
    title: "Ingen fjorårstall å sammenligne med",
    description:
      "Bare ett regnskapsår er importert, så utvikling mot i fjor kan ikke beregnes. " +
      "Last opp SAF-T-filen for foregående år under «Importer data», så fylles " +
      "sammenligningene inn på alle sider.",
    current: null,
    reference: null,
    period,
    evidence: [],
  });
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const MONTHS = [
  "januar", "februar", "mars", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "desember",
];

function money(n: number): string {
  return `${Math.round(n).toLocaleString("nb-NO")} kr`;
}

function fmtPercent(n: number): string {
  return `${n.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} %`;
}

function fmtPoints(n: number): string {
  return `${n.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} prosentpoeng`;
}

function fmtMonths(n: number): string {
  if (n < 1) return "under én måned";
  return `${n.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} måneder`;
}

/** "2026-08" → "august". */
export function monthName(yyyymm: string): string {
  const [, m] = yyyymm.split("-").map(Number);
  return MONTHS[m - 1] ?? yyyymm;
}

/** "1. januar–13. august 2026". */
function formatPeriod(start: string, end: string): string {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const from = `${sd}. ${MONTHS[sm - 1]}`;
  const to = `${ed}. ${MONTHS[em - 1]} ${ey}`;
  return sy === ey ? `${from}–${to}` : `${from} ${sy}–${to}`;
}

function daysBetween(start: string, end: string): number {
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
