import { fetchAll } from "@/lib/supabase/paginate";
import {
  buildFinancialsFromTransactions,
  type TxRow,
} from "@/app/api/companies/[id]/financials/route";
import { computeBudgetResult, computeCashEffect, computeEmployeeCost, emptyGrid, adjustCategory, distributeAnnual, basisFromActivity, fillGaps } from "@/lib/budget/engine";
import { categoryForAccount, signedAmount, CATEGORIES, PAYROLL_CATEGORY_KEYS } from "@/lib/reports/categories";
import { comparisonRange, periodRange, type YearBounds } from "@/lib/periods";
import { resolveDataWindow, partialMonthNote, type MonthActivity } from "@/lib/data-window";
import { deriveInsights, type InsightInput } from "@/lib/insights/derive";
import { nextVatTerm, upcomingVatTerms, daysUntil } from "@/lib/tax/vat-terms";
import { classifyIntent } from "@/lib/assistant/intent-classifier";
import { TOOLS, TOOL_LABELS } from "@/lib/assistant/tools";
import { TOOL_HANDLERS } from "@/lib/assistant/tool-handlers";
import { readFileSync } from "node:fs";
import {
  CONTRAST,
  parseRootTokens,
  ratio,
} from "@/lib/design/contrast";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      forventet ${JSON.stringify(expected)}\n      fikk       ${JSON.stringify(actual)}`}`);
}

async function main() {

// --- 1. fetchAll must page past 1000 ---------------------------------------
const source = Array.from({ length: 2543 }, (_, i) => ({ i }));
const paged = await fetchAll<{ i: number }>((from, to) =>
  Promise.resolve({ data: source.slice(from, to + 1), error: null })
);
check("fetchAll henter alle 2543 rader", paged.length, 2543);
check("fetchAll bevarer rekkefølge", paged[2542].i, 2542);

const unpagedLike = await fetchAll<{ i: number }>((from) =>
  // A source that ignores the range, as a capped endpoint would.
  Promise.resolve({ data: from === 0 ? source.slice(0, 1000) : [], error: null })
);
check("fetchAll stopper når kilden er tom", unpagedLike.length, 1000);

// --- 2. The financials figures, on a ledger bigger than one page -----------
// January holds 1240 postings, as the real ledger does; the rest spread over
// seven further months. An unpaged read would have stopped inside January.
const tx: TxRow[] = [];
const monthlyRevenue = [493990, 841780, 774596, 463937, 551613, 791669, 651706, 207585];
const monthlyCosts   = [732435, 711308, 673707, 556347, 313684, 945318, 191072,  20710];
monthlyRevenue.forEach((rev, m) => {
  const month = String(m + 1).padStart(2, "0");
  const rows = m === 0 ? 1240 : 200;
  for (let i = 0; i < rows; i++) {
    tx.push({ account_number: "3000", amount: -rev / rows, transaction_date: `2026-${month}-15` });
    tx.push({ account_number: "6300", amount: monthlyCosts[m] / rows, transaction_date: `2026-${month}-15` });
  }
});

const fin = buildFinancialsFromTransactions(tx, []);
check("Omsetning hittil i år", Math.round(fin.revenue.total), 4776876);
check("Kostnader hittil i år", Math.round(fin.costs.total), 4144581);
check("Antall måneder i grafen", fin.monthly.length, 8);
check("Januar i grafen", Math.round(fin.monthly[0].revenue), 493990);
check("August i grafen", Math.round(fin.monthly[7].revenue), 207585);

// --- 3. Category mapping must cover the whole P&L without overlap ----------
const uncovered: number[] = [];
const doubled: number[] = [];
for (let a = 3000; a <= 7999; a++) {
  const hits = CATEGORIES.filter((c) =>
    c.ranges.some(([f, t]) => a >= f && a <= t)
  );
  if (hits.length === 0) uncovered.push(a);
  if (hits.length > 1) doubled.push(a);
}
check("Ingen konto uten kategori (3000-7999)", uncovered.length, 0);
check("Ingen konto i to kategorier", doubled.length, 0);
check("Inntekt snus til positivt", signedAmount(categoryForAccount("3000")!, -1000), 1000);
check("Kostnad forblir positiv", signedAmount(categoryForAccount("6300")!, 1000), 1000);
check("Lønnsgruppen dekker 5000-5999",
  [5000, 5099, 5100, 5399, 5400, 5499, 5500, 5799, 5800, 5899, 5900, 5999]
    .every((a) => PAYROLL_CATEGORY_KEYS.includes(categoryForAccount(String(a))!.key)),
  true);

// --- 4. Budget arithmetic --------------------------------------------------
let grid = emptyGrid();
grid.revenue = new Array(12).fill(100000);
grid.payroll = new Array(12).fill(40000);
const res = computeBudgetResult(grid);
check("Budsjettert årsomsetning", res.annual.revenue, 1200000);
check("Budsjettert driftsresultat", res.annual.operating_profit, 720000);
check("Budsjettert margin", res.annual.margin, 60);

grid = adjustCategory(grid, "revenue", 10);
check("Prosentjustering beholder månedsform", computeBudgetResult(grid).annual.revenue, 1320000);

grid = distributeAnnual(grid, "revenue", 1200000);
check("Årsbeløp fordeles tilbake", computeBudgetResult(grid).annual.revenue, 1200000);

const cash = computeCashEffect(grid, 500000);
check("Likviditet er 12 måneder", cash.months.length, 12);

const hire = computeEmployeeCost({ annualSalary: 700000, startMonth: 1 });
check("Feriepenger 12 %", hire.holiday_pay, 84000);
check("AGA av lønn + feriepenger + pensjon",
  hire.employer_tax, Math.round((700000 + 84000 + 14000) * 0.141));
check("Full årskostnad", hire.total_annual,
  Math.round(700000 + 84000 + 14000 + (700000 + 84000 + 14000) * 0.141));

}

main().then(() => {
// --- 5. Period selection ---------------------------------------------------
// A closed year and a part year must each resolve to ranges inside themselves.
const closed: YearBounds = { year: 2025, start: "2025-01-01", end: "2025-12-31", is_complete: true };
const partial: YearBounds = { year: 2026, start: "2026-01-01", end: "2026-08-12", is_complete: false };

check("2025 hittil i år", periodRange("ytd", closed), { start: "2025-01-01", end: "2025-12-31" });
check("2025 måned = desember", periodRange("month", closed), { start: "2025-12-01", end: "2025-12-31" });
check("2025 kvartal = Q4", periodRange("quarter", closed), { start: "2025-10-01", end: "2025-12-31" });
check("2025 siste 12 mnd", periodRange("rolling12", closed), { start: "2025-01-01", end: "2025-12-31" });

check("2026 hittil i år", periodRange("ytd", partial), { start: "2026-01-01", end: "2026-08-12" });
check("2026 måned stopper ved siste postering", periodRange("month", partial), { start: "2026-08-01", end: "2026-08-12" });
check("2026 kvartal = Q3, avkortet", periodRange("quarter", partial), { start: "2026-07-01", end: "2026-08-12" });
check("2026 siste 12 mnd", periodRange("rolling12", partial), { start: "2025-09-01", end: "2026-08-12" });

check("Sammenligning er samme periode i fjor",
  comparisonRange(periodRange("ytd", partial)), { start: "2025-01-01", end: "2025-08-12" });
check("Skuddår klemmes til 28.",
  comparisonRange({ start: "2024-02-29", end: "2024-02-29" }), { start: "2023-02-28", end: "2023-02-28" });

// --- 6. Where a year's bookkeeping ends ------------------------------------
// The real shape of 2026 on this ledger: eight busy months, then a handful of
// forward-dated periodisations. The period must stop in August.
const busy = [1240, 1187, 1201, 1096, 1150, 1109, 903, 844];
const twentySix = busy.map((count, i) => ({
  month: `2026-${String(i + 1).padStart(2, "0")}`,
  postingCount: count,
  lastDate: `2026-${String(i + 1).padStart(2, "0")}-28`,
})).concat([
  { month: "2026-09", postingCount: 6, lastDate: "2026-09-30" },
  { month: "2026-10", postingCount: 4, lastDate: "2026-10-31" },
  { month: "2026-11", postingCount: 4, lastDate: "2026-11-30" },
  { month: "2026-12", postingCount: 16, lastDate: "2026-12-06" },
]);

const window2026 = resolveDataWindow(twentySix);
check("Året slutter i august, ikke 6. desember", window2026?.end, "2026-08-28");
// August ends on the 28th here, close enough to month-end to count as done.
check("En måned som når månedsslutt beholdes hel", window2026?.completeEnd, "2026-08-31");
check("Ingen påbegynt måned når bøkene når månedsslutt", window2026?.partial, null);
check("Framdaterte måneder rapporteres", window2026?.trailingMonths,
  ["2026-09", "2026-10", "2026-11", "2026-12"]);
check("Framdaterte posteringer telles", window2026?.trailingPostings, 30);
// Nothing to say: the books reach month-end, so no month is left uncovered.
check("Ferdig måned gir ingen merknad", partialMonthNote(window2026!), null);

// A finished year keeps all twelve months and gets no note.
const twentyFive = Array.from({ length: 12 }, (_, i) => ({
  month: `2025-${String(i + 1).padStart(2, "0")}`,
  postingCount: 1100 + i,
  lastDate: `2025-${String(i + 1).padStart(2, "0")}-31`,
}));
const window2025 = resolveDataWindow(twentyFive);
check("Fullt år beholder desember", window2025?.end, "2025-12-31");
check("Fullt år får ingen merknad", partialMonthNote(window2025!), null);

// A quiet December is still December: only a near-empty month is cut.
const quiet = twentyFive.slice(0, 11).concat([
  { month: "2025-12", postingCount: 400, lastDate: "2025-12-31" },
]);
check("Rolig måned kuttes ikke", resolveDataWindow(quiet)?.end, "2025-12-31");

// A year still in its first month must not cut itself to nothing.
check("Én måned med data beholdes", resolveDataWindow([
  { month: "2027-01", postingCount: 12, lastDate: "2027-01-31" },
])?.end, "2027-01-31");

check("Uten posteringer finnes ingen periode", resolveDataWindow([]), null);

// --- 6b. Den påbegynte måneden -----------------------------------------------
// The real export: eight months, the last of which stops on the 13th. A period
// ending "13. august" is the day somebody pressed export, not an accounting
// period, and pairing it with 13 August last year compares two arbitrary
// stretches of a month. Reporting stops at the last whole month.
const partOfAugust = [1240, 1445, 1430, 1197, 1343, 1606, 1146, 844].map(
  (count, i) => ({
    month: `2026-${String(i + 1).padStart(2, "0")}`,
    postingCount: count,
    lastDate: i === 7 ? "2026-08-13" : `2026-${String(i + 1).padStart(2, "0")}-28`,
  })
);

const cut = resolveDataWindow(partOfAugust);
check("Bøkene stopper 13. august", cut?.end, "2026-08-13");
check("Rapportering stopper ved juli", cut?.completeEnd, "2026-07-31");
check("August rapporteres som påbegynt", cut?.partial,
  { month: "2026-08", lastDate: "2026-08-13", postingCount: 844 });
// One clause, and only the fact a reader can act on: a month exists in the
// books that the figures do not cover. It used to be a paragraph justifying
// the choice of period, which is not the same as informing anyone.
check("Den påbegynte måneden nevnes i én setning",
  partialMonthNote(cut!), "August er påbegynt og teller ikke med.");

// A finished year is untouched: December reaching the 31st is a whole month.
check("Fullt år rapporteres til 31. desember", window2025?.completeEnd, "2025-12-31");
check("Fullt år har ingen påbegynt måned", window2025?.partial, null);

// A company one month into its first year has nothing to fall back to, so the
// part month is all there is and must not be held back to nothing.
const firstMonth = resolveDataWindow([
  { month: "2027-01", postingCount: 40, lastDate: "2027-01-12" },
]);
check("Første måned holdes ikke tilbake", firstMonth?.partial, null);
check("Første måned rapporteres ut måneden", firstMonth?.completeEnd, "2027-01-31");

// --- 7. Observasjoner ------------------------------------------------------
// A healthy company with a comparison year and nothing out of the ordinary
// must produce nothing. A panel that always has something to say is noise.
const calm: InsightInput = {
  period: { start: "2026-01-01", end: "2026-08-31" },
  comparisonPeriod: { start: "2025-01-01", end: "2025-08-31" },
  revenue: 5_000_000,
  previousRevenue: 4_800_000,
  costs: 4_000_000,
  previousCosts: 3_850_000,
  cash: 3_000_000,
  receivables: 600_000,
  months: Array.from({ length: 8 }, (_, i) => ({
    month: `2026-${String(i + 1).padStart(2, "0")}`,
    revenue: 625_000,
    costs: 500_000,
  })),
  customers: [
    { name: "A", revenue: 1_000_000 },
    { name: "B", revenue: 900_000 },
    { name: "C", revenue: 800_000 },
    { name: "D", revenue: 2_300_000 },
  ],
  trailingMonths: [],
  trailingPostings: 0,
};
check("Rolig regnskap gir ingen observasjoner", deriveInsights(calm).length, 0);

const types = (i: InsightInput) => deriveInsights(i).map((x) => x.type).sort();

// Revenue down a quarter, against the same span of last year.
check("Fall i omsetning fanges opp",
  types({ ...calm, revenue: 3_400_000 }).includes("revenue_trend"), true);

// Costs up while revenue is flat.
check("Kostnadsvekst uten inntektsvekst fanges opp",
  types({ ...calm, costs: 4_700_000, previousCosts: 3_850_000 })
    .includes("cost_growth"), true);

// Two months of costs in the bank.
check("Kort likviditetsrekkevidde fanges opp",
  types({ ...calm, cash: 900_000 }).includes("liquidity_runway"), true);

// One customer carrying nearly half the revenue.
check("Kundekonsentrasjon fanges opp",
  types({ ...calm, customers: [
    { name: "Stor kunde", revenue: 4_000_000 },
    { name: "B", revenue: 600_000 },
    { name: "C", revenue: 400_000 },
  ] }).includes("customer_concentration"), true);

// Receivables of a full quarter's invoicing.
check("Treg innbetaling fanges opp",
  types({ ...calm, receivables: 2_400_000 }).includes("receivables_pressure"), true);

// A single year held: say so rather than reporting no movement.
check("Manglende fjorårstall sies fra om",
  types({ ...calm, comparisonPeriod: null, previousRevenue: null, previousCosts: null })
    .includes("no_comparison"), true);

// Forward-dated postings explain themselves.
check("Framdaterte posteringer forklares",
  types({ ...calm, trailingMonths: ["2026-09", "2026-12"], trailingPostings: 30 })
    .includes("forward_dated_postings"), true);

// Most serious first.
// --- 7b. Hvilke tolv måneder et budsjett bygges på ------------------------
// The ledger as it actually stands: 2025 complete, 2026 trading through
// August, then forward-dated periodisations to 6 December. A budget built on
// "the last twelve months" must not reach into those — it proposed nothing
// for September, October and November because it did.
const ledger: MonthActivity[] = [
  ...Array.from({ length: 12 }, (_, i) => ({
    month: `2025-${String(i + 1).padStart(2, "0")}`,
    postingCount: 1100 + i,
    lastDate: `2025-${String(i + 1).padStart(2, "0")}-28`,
  })),
  ...[1240, 1445, 1430, 1197, 1343, 1606, 1146, 844].map((count, i) => ({
    month: `2026-${String(i + 1).padStart(2, "0")}`,
    postingCount: count,
    lastDate: i === 7 ? "2026-08-13" : `2026-${String(i + 1).padStart(2, "0")}-28`,
  })),
  { month: "2026-09", postingCount: 6, lastDate: "2026-09-01" },
  { month: "2026-10", postingCount: 4, lastDate: "2026-10-01" },
  { month: "2026-11", postingCount: 4, lastDate: "2026-11-01" },
  { month: "2026-12", postingCount: 16, lastDate: "2026-12-06" },
];

check("Budsjettgrunnlag stopper før de framdaterte månedene",
  basisFromActivity(ledger, { year: 2027, basedOn: "last_12_months" }),
  { start: "2025-08-01", end: "2026-07-31" });

check("Grunnlaget er tolv hele måneder",
  (() => {
    const b = basisFromActivity(ledger, { year: 2027, basedOn: "last_12_months" })!;
    const [sy, sm] = b.start.split("-").map(Number);
    const [ey, em] = b.end.split("-").map(Number);
    return (ey - sy) * 12 + (em - sm) + 1;
  })(), 12);

// A finished year used as the basis keeps all twelve of its months.
check("Fjoråret som grunnlag når 31. desember",
  basisFromActivity(ledger, { year: 2026, basedOn: "previous_year" }),
  { start: "2025-01-01", end: "2025-12-31" });

// A year still running ends where its bookkeeping does, not at 31 December.
check("Et uavsluttet år som grunnlag stopper etter august",
  basisFromActivity(ledger, { year: 2027, basedOn: "previous_year" }),
  { start: "2026-01-01", end: "2026-08-31" });

check("Uten posteringer finnes ikke noe grunnlag",
  basisFromActivity([], { year: 2027, basedOn: "last_12_months" }), null);

// --- 7c. Hull i grunnlaget --------------------------------------------------
// A month the basis says nothing about is missing data, not a forecast of no
// trading. It must never reach the budget as a zero.
const twelve = (v: number[]) => v;
const gapGrid = {
  revenue: twelve([500, 500, 500, 500, 500, 500, 500, 500, 0, 0, 0, 500]),
  // An annual premium booked every January, and nothing the rest of the year.
  insurance: twelve([1200, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
};
const counts = [900, 900, 900, 900, 900, 900, 900, 900, 0, 0, 0, 900];
const months = Array.from({ length: 12 }, (_, i) =>
  `2026-${String(i + 1).padStart(2, "0")}`
);

const filled = fillGaps(gapGrid, months, counts);
check("De tomme månedene rapporteres", filled, ["2026-09", "2026-10", "2026-11"]);
check("Ingen budsjettmåned står igjen på null",
  gapGrid.revenue.every((v) => v > 0), true);
check("Hullet fylles med snittet av de kjente månedene",
  gapGrid.revenue[8], 500);
check("Kjente måneder røres ikke", gapGrid.revenue[0], 500);

// The January-only premium keeps its shape: the gap months take the mean, but
// the ten real months that are genuinely zero stay zero.
check("Ekte nullmåneder smøres ikke utover",
  gapGrid.insurance.slice(1, 8).every((v) => v === 0), true);
check("Årsavgiften blir stående i januar", gapGrid.insurance[0], 1200);

// Nothing to fill, and nothing to fill from, are both no-ops.
check("Uten hull gjøres ingenting",
  fillGaps({ a: twelve(new Array(12).fill(1)) }, months, new Array(12).fill(5)), []);
check("Et tomt grunnlag fylles ikke fra seg selv",
  fillGaps({ a: twelve(new Array(12).fill(0)) }, months, new Array(12).fill(0)), []);

// --- 7d. Mva-frister ------------------------------------------------------
// Set by skatteforvaltningsforskriften § 8-3, the same for every business on
// the ordinary two-month terms. This is a calendar, so it is checked against
// the calendar rather than against the ledger.
const nextFrom = (d: string) => nextVatTerm(d)!;

check("Etter nyttår er 6. termin neste frist",
  nextFrom("2026-01-15").deadline, "2026-02-10");
check("6. termin dekker november–desember året før",
  [nextFrom("2026-01-15").periodStart, nextFrom("2026-01-15").periodEnd],
  ["2025-11-01", "2025-12-31"]);

check("1. termin forfaller 10. april",
  nextFrom("2026-03-01").deadline, "2026-04-10");
check("2. termin forfaller 10. juni",
  nextFrom("2026-05-01").deadline, "2026-06-10");

// The third term runs to 31 August, not 10 July — the summer exception. It is
// also why the answer on 14 August is 31 August and not October: the term
// covering May and June is still open.
check("3. termin forfaller 31. august, ikke 10. juli",
  nextFrom("2026-07-01").deadline, "2026-08-31");
check("3. termin dekker mai–juni",
  [nextFrom("2026-07-01").periodStart, nextFrom("2026-07-01").periodEnd],
  ["2026-05-01", "2026-06-30"]);

// The real question, asked on the day the screenshot was taken.
const asked = nextFrom("2026-08-14");
check("14. august: neste frist er 31. august", asked.deadline, "2026-08-31");
check("14. august: terminen er mai–juni",
  [asked.periodStart, asked.periodEnd], ["2026-05-01", "2026-06-30"]);
check("14. august: 17 dager igjen", daysUntil("2026-08-14", asked.deadline), 17);

// Terms come back in order, and never a date that has passed. 10 October 2026
// is a Saturday, so the fourth term files on the Monday.
const three = upcomingVatTerms("2026-08-14", "bimonthly", 3);
check("Tre terminer i rekkefølge", three.map((t) => t.deadline),
  ["2026-08-31", "2026-10-12", "2026-12-10"]);
check("Lørdagsfrist flyttes til mandag", three[1].movedFrom, "2026-10-10");

// 10 February 2029 is a Saturday; 10 June 2029 a Sunday.
check("Lørdagsfrist flyttes", nextFrom("2029-01-02").deadline, "2029-02-12");
check("Søndagsfrist flyttes", nextFrom("2029-05-01").deadline, "2029-06-11");

// Public holidays move a deadline too, and Easter can move it several days:
// 10 April 2031 is Maundy Thursday, so the deadline clears Good Friday, the
// weekend and Easter Monday before landing on the Tuesday.
check("Frist på skjærtorsdag flyttes gjennom hele påsken",
  nextFrom("2031-03-01").deadline, "2031-04-15");
// 10 June 2030 is Whit Monday.
check("Frist på andre pinsedag flyttes",
  nextFrom("2030-05-01").deadline, "2030-06-11");

// Other schemes.
check("Årstermin forfaller 10. mars året etter",
  nextVatTerm("2026-08-14", "annual")!.deadline, "2027-03-10");
check("Månedstermin forfaller en måned og ti dager etter",
  nextVatTerm("2026-08-14", "monthly")!.deadline, "2026-09-10");

// The question routes to the calendar alone, not to a sweep of the ledger.
check("«Når er neste mva innlevering?» spør bare kalenderen",
  classifyIntent("Når er neste mva innlevering?").suggestedTools,
  ["get_vat_deadline"]);
check("«Hvor mye mva skylder vi?» går fortsatt til estimatet",
  classifyIntent("Hvor mye mva skylder vi?").suggestedTools
    .includes("get_vat_estimate"), true);
check("Spørsmål om både frist og beløp får begge verktøyene",
  classifyIntent("Når er neste mva-frist og hvor mye blir det?").suggestedTools,
  ["get_vat_deadline", "get_vat_estimate"]);

// The routing has to reach the model. The suggested tools were computed and
// then discarded — every tool went on every turn — so this checks the list is
// short enough to be a real restriction, not just that it exists.
check("Fristspørsmål tilbyr ett verktøy, ikke hele kassen",
  classifyIntent("Når er neste mva innlevering?").suggestedTools.length, 1);

// --- 7e. Verktøyene ---------------------------------------------------------
// Every tool needs a handler and a Norwegian label. The label list used to sit
// in the chat component, drifted, and nine tools fell back to printing their
// own function name at the reader — "get_data_coverage" between two Norwegian
// phrases. It is derived from the definitions now, and checked here.
const toolNames = TOOLS.map((t) => t.function.name);

check("Hvert verktøy har en handler",
  toolNames.filter((n) => !(n in TOOL_HANDLERS)), []);
check("Hver handler har en definisjon",
  Object.keys(TOOL_HANDLERS).filter((n) => !toolNames.includes(n)), []);
check("Hvert verktøy har en norsk etikett",
  toolNames.filter((n) => !TOOL_LABELS[n]), []);
check("Ingen etikett er verktøynavnet",
  toolNames.filter((n) => TOOL_LABELS[n] === n), []);
check("Ingen etikett inneholder understrek",
  toolNames.filter((n) => TOOL_LABELS[n].includes("_")), []);

// The tools the classifier hands out have to exist.
check("Foreslåtte verktøy finnes",
  ["Når er neste mva innlevering?", "Hvor mye tjente vi i fjor?",
   "Lag et budsjett for 2027", "Hvor kan vi kutte kostnader?"]
    .flatMap((q) => classifyIntent(q).suggestedTools)
    .filter((n) => !toolNames.includes(n)), []);

// --- 8. Kontrast --------------------------------------------------------
// Read from the stylesheet, so the palette cannot drift past the threshold
// without a check going red. The muted token once shipped at 2.3:1 on the grey
// it sat on — grey text on a grey ground — and nothing caught it.
const tokens = parseRootTokens(readFileSync("src/app/globals.css", "utf8"));
const token = (name: string) => {
  const value = tokens.get(name);
  if (!value) throw new Error(`Mangler token --${name} i globals.css`);
  return value;
};

const atLeast = (name: string, fg: string, bg: string, min: number) => {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name} — ${r}:1${ok ? "" : `\n      krever minst ${min}:1`}`
  );
};

// Every text token against every surface it is drawn on.
for (const surface of ["surface", "background", "surface-hover"] as const) {
  for (const ink of ["foreground", "foreground-secondary", "foreground-muted"] as const) {
    atLeast(`${ink} på ${surface}`, token(ink), token(surface), CONTRAST.TEXT);
  }
}

const HUES = ["ocean", "teal", "violet", "copper", "rose", "slate"] as const;

// The ink variant is the one allowed to carry a figure or a label.
for (const hue of HUES) {
  atLeast(`${hue}-ink som tekst`, token(`tone-${hue}-ink`), token("surface"), CONTRAST.TONE_TEXT);
}

// The badge: the hue's glyph on the hue's own tinted ground. Checked as text
// rather than as a mark, since an icon at 16px is finer than a bar.
for (const hue of HUES) {
  atLeast(
    `${hue}-ikon på egen brikke`,
    token(`tone-${hue}-ink`),
    token(`tone-${hue}-soft`),
    CONTRAST.TONE_TEXT
  );
}

// The fill has to separate from the track it is drawn on.
for (const hue of HUES) {
  atLeast(
    `${hue}-søyle mot sporet`,
    token(`tone-${hue}`),
    token("surface-hover"),
    CONTRAST.GRAPHIC
  );
}

// The semantic inks, all of which are drawn as text somewhere.
for (const name of ["success", "warning", "danger", "info"] as const) {
  atLeast(`${name} som tekst`, token(name), token("surface"), CONTRAST.TONE_TEXT);
  atLeast(
    `${name} på egen bakgrunn`,
    token(name),
    token(`${name}-light`),
    CONTRAST.TONE_TEXT
  );
}

// White on the navy the buttons are built from, including the hover step.
for (const step of ["primary", "primary-light", "primary-dark"] as const) {
  atLeast(`hvit tekst på ${step}`, "#ffffff", token(step), CONTRAST.TEXT);
}

check("Alvorligste observasjon står først",
  deriveInsights({ ...calm, cash: 400_000, revenue: 5_100_000 })[0].severity, "high");

// Nothing may be reported without the figures behind it.
check("Hver observasjon oppgir tallene den bygger på",
  deriveInsights({ ...calm, revenue: 3_400_000, cash: 900_000 })
    .every((i) => i.evidence.length > 0 || i.type === "no_comparison"), true);

console.log(failures === 0 ? "\nALLE KONTROLLER OK" : `\n${failures} KONTROLLER FEILET`);
process.exit(failures === 0 ? 0 : 1);
});
