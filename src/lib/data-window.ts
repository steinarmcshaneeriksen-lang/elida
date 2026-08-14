/**
 * Where a year's bookkeeping actually ends, and where it can honestly be cut.
 *
 * Two things get in the way of a straight answer, and they are different.
 *
 * A SAF-T export taken in August can carry postings dated December: an
 * accountant books a year's insurance, rent or periodisation forward the day
 * the contract is signed. Those are real postings, but they are not a month of
 * trading. Taking the last posting date as the end of the data stretched the
 * period past the point the books are complete and then compared it against
 * the same stretch of a finished year — eight months of 2026 measured against
 * eleven of 2025, reported as revenue down 38 %. The company had not fallen;
 * the periods were not comparable.
 *
 * And the month the export was taken in is itself half-booked. A period ending
 * "13. august" is not an accounting period — it is the date somebody pressed
 * export. Nobody plans, compares or reports in 1 January to 13 August, and
 * pairing it with 1 January to 13 August of last year is precise about
 * something arbitrary: two different weekdays, two different stretches of
 * invoicing, in the middle of a month.
 *
 * So the window carries both. `end` is the last date the books hold anything
 * worth counting. `completeEnd` is the last whole month, which is the period
 * anything gets reported or compared over. What falls outside either is named
 * rather than silently included or silently dropped.
 */

export interface MonthActivity {
  /** "2026-08" */
  month: string;
  postingCount: number;
  /** Last posting date within the month. */
  lastDate: string;
}

export interface PartialMonth {
  /** "2026-08" */
  month: string;
  /** Last posting in it — the day the books stop. */
  lastDate: string;
  postingCount: number;
}

export interface DataWindow {
  /** Last date the books hold ordinary bookkeeping. */
  end: string;
  /**
   * Last day of the last WHOLE month. Periods and comparisons run to here, so
   * they are always a round number of months against the same months a year
   * earlier. Equal to `end` when the books stop at a month boundary.
   */
  completeEnd: string;
  /** The half-booked month left outside, when there is one. */
  partial: PartialMonth | null;
  /** Months held beyond the end, carrying only forward-dated entries. */
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

/**
 * How close to month-end the last posting has to fall for the month to count
 * as finished. A December whose final entry lands on the 28th is a complete
 * December; an August that stops on the 13th is an export taken mid-month.
 * Five days covers a weekend plus a day either side.
 */
const MONTH_END_TOLERANCE = 5;

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

  const last = present[lastReal];
  const trailing = present.slice(lastReal + 1);

  // The last month of bookkeeping may itself be half-booked. Only then is it
  // held back — and only if there is an earlier month to fall back to, since a
  // company one month into its first year has nothing else to report.
  const finished = reachesMonthEnd(last.lastDate);
  const partial =
    finished || lastReal === 0
      ? null
      : {
          month: last.month,
          lastDate: last.lastDate,
          postingCount: last.postingCount,
        };

  const completeEnd = partial
    ? endOfMonth(present[lastReal - 1].month)
    : endOfMonth(last.month);

  return {
    end: last.lastDate,
    completeEnd,
    partial,
    trailingMonths: trailing.map((m) => m.month),
    trailingPostings: trailing.reduce((total, m) => total + m.postingCount, 0),
  };
}

/**
 * The sentence to show when the reported period stops short of what the ledger
 * holds — because the last month is half-booked, because postings are dated
 * ahead, or both.
 */
export function trailingNote(window: DataWindow): string | null {
  const parts: string[] = [];

  if (window.partial) {
    parts.push(
      `${monthName(window.partial.month)} er påbegynt — regnskapet stopper ` +
        `${formatDate(window.partial.lastDate)}, med ${window.partial.postingCount} ` +
        "posteringer så langt. En halv måned kan ikke sammenlignes med en hel, " +
        "så tallene gjelder til og med forrige månedsslutt."
    );
  }

  if (window.trailingMonths.length > 0) {
    parts.push(
      `Regnskapet har ${window.trailingPostings} framdaterte posteringer i ` +
        `${window.trailingMonths.map(monthName).join(", ")} — typisk ` +
        "forhåndsbetalte kostnader og periodiseringer. De er ikke måneder med " +
        "drift og teller ikke med."
    );
  }

  return parts.length > 0 ? parts.join(" ") : null;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTHS = [
  "januar", "februar", "mars", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "desember",
];

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** True when a date falls close enough to month-end to call the month done. */
function reachesMonthEnd(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  return d >= daysInMonth(y, m) - MONTH_END_TOLERANCE;
}

/** "2026-07" → "2026-07-31". */
function endOfMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  return `${yyyymm}-${String(daysInMonth(y, m)).padStart(2, "0")}`;
}

function monthName(yyyymm: string): string {
  const [, m] = yyyymm.split("-").map(Number);
  return MONTHS[m - 1] ?? yyyymm;
}

function formatDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d}. ${MONTHS[m - 1]}`;
}
