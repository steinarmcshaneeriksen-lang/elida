/**
 * Where a year's bookkeeping actually ends.
 *
 * A SAF-T export taken in August can still carry postings dated December: an
 * accountant books a year's insurance, rent or periodisation forward the day
 * the contract is signed. Those are real postings, but they are not a month of
 * trading.
 *
 * Taking the last posting date as the end of the data therefore stretches the
 * period past the point the books are complete — and then compares it against
 * the same stretch of a finished year. On this ledger that meant eight months
 * of 2026 measured against eleven months of 2025, reported as revenue down
 * 38 %. The company had not fallen 38 %; the periods were not comparable.
 *
 * So a year ends at the last month that looks like a month of bookkeeping,
 * measured against how busy that year's months normally are. What follows is
 * reported separately rather than silently included or silently dropped.
 */

export interface MonthActivity {
  /** "2026-08" */
  month: string;
  postingCount: number;
  /** Last posting date within the month. */
  lastDate: string;
}

export interface DataWindow {
  /** Last date the books are complete to. */
  end: string;
  /** Months held beyond that, carrying only forward-dated entries. */
  trailingMonths: string[];
  trailingPostings: number;
}

/**
 * A month counts as bookkeeping if it holds at least this share of what a
 * normal month holds for that year. A tenth is deliberately generous: a quiet
 * month or a half-finished one still counts, while four postings out of a
 * typical twelve hundred does not.
 */
const ACTIVITY_THRESHOLD = 0.1;

export function resolveDataWindow(months: MonthActivity[]): DataWindow | null {
  const present = months
    .filter((m) => m.postingCount > 0)
    .sort((a, b) => a.month.localeCompare(b.month));

  if (present.length === 0) return null;

  const counts = present.map((m) => m.postingCount).sort((a, b) => a - b);
  const median = counts[Math.floor(counts.length / 2)];
  const floor = Math.max(median * ACTIVITY_THRESHOLD, 1);

  // Walk back from the end until a month looks like ordinary bookkeeping.
  let lastReal = present.length - 1;
  while (lastReal > 0 && present[lastReal].postingCount < floor) lastReal--;

  const trailing = present.slice(lastReal + 1);

  return {
    end: present[lastReal].lastDate,
    trailingMonths: trailing.map((m) => m.month),
    trailingPostings: trailing.reduce((t, m) => t + m.postingCount, 0),
  };
}

/** The sentence to show when a period was shortened. */
export function trailingNote(window: DataWindow): string | null {
  if (window.trailingMonths.length === 0) return null;

  const months = window.trailingMonths.map(monthName).join(", ");

  return (
    `Regnskapet har ${window.trailingPostings} framdaterte posteringer i ${months} — ` +
    "typisk forhåndsbetalte kostnader og periodiseringer. De er ikke måneder med " +
    `drift, så perioden slutter ${formatDate(window.end)} og sammenligningen ` +
    "gjelder samme periode i fjor."
  );
}

const MONTHS = [
  "januar", "februar", "mars", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "desember",
];

function monthName(yyyymm: string): string {
  const [, m] = yyyymm.split("-").map(Number);
  return MONTHS[m - 1] ?? yyyymm;
}

function formatDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d}. ${MONTHS[m - 1]}`;
}
