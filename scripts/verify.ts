import { fetchAll } from "@/lib/supabase/paginate";
import {
  buildFinancialsFromTransactions,
  type TxRow,
} from "@/app/api/companies/[id]/financials/route";
import { computeBudgetResult, computeCashEffect, computeEmployeeCost, emptyGrid, adjustCategory, distributeAnnual } from "@/lib/budget/engine";
import { categoryForAccount, signedAmount, CATEGORIES, PAYROLL_CATEGORY_KEYS } from "@/lib/reports/categories";
import { comparisonRange, periodRange, type YearBounds } from "@/lib/periods";
import { resolveDataWindow, trailingNote } from "@/lib/data-window";

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
check("Framdaterte måneder rapporteres", window2026?.trailingMonths,
  ["2026-09", "2026-10", "2026-11", "2026-12"]);
check("Framdaterte posteringer telles", window2026?.trailingPostings, 30);
check("Avkortet periode forklares", trailingNote(window2026!)?.includes("30 framdaterte"), true);

// A finished year keeps all twelve months and gets no note.
const twentyFive = Array.from({ length: 12 }, (_, i) => ({
  month: `2025-${String(i + 1).padStart(2, "0")}`,
  postingCount: 1100 + i,
  lastDate: `2025-${String(i + 1).padStart(2, "0")}-31`,
}));
const window2025 = resolveDataWindow(twentyFive);
check("Fullt år beholder desember", window2025?.end, "2025-12-31");
check("Fullt år får ingen forklaring", trailingNote(window2025!), null);

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

console.log(failures === 0 ? "\nALLE KONTROLLER OK" : `\n${failures} KONTROLLER FEILET`);
process.exit(failures === 0 ? 0 : 1);
});
