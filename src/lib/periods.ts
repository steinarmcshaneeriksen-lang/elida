/**
 * Period selection.
 *
 * Every period option is anchored to the accounting year being viewed, never
 * to today's date. Anchored to today, "denne måneden" on a closed year meant a
 * month that year does not contain, and a past year could not be looked at at
 * all.
 *
 * A partial year ends at its last posting rather than at 31 December, so a
 * range never reaches past the data and claims a total for months the books do
 * not cover.
 */

export type PeriodKey = "month" | "quarter" | "ytd" | "rolling12";

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  month: "Måned",
  quarter: "Kvartal",
  ytd: "Hittil i år",
  rolling12: "Siste 12 mnd",
};

export interface YearBounds {
  year: number;
  /** First posting in the year. */
  start: string;
  /** Last posting in the year, which for the current year is not 31 December. */
  end: string;
  is_complete: boolean;
}

export interface DateRange {
  start: string;
  end: string;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function periodRange(period: PeriodKey, bounds: YearBounds): DateRange {
  const { year, start: firstDay, end: lastDay } = bounds;
  const last = new Date(lastDay);

  switch (period) {
    case "month":
      // The last month the books reach, not the current calendar month.
      return {
        start: iso(new Date(last.getFullYear(), last.getMonth(), 1)),
        end: lastDay,
      };

    case "quarter": {
      const quarterStart = Math.floor(last.getMonth() / 3) * 3;
      return {
        start: iso(new Date(last.getFullYear(), quarterStart, 1)),
        end: lastDay,
      };
    }

    case "rolling12":
      // Twelve months ending with the last month held, so the window is a full
      // year of data rather than a year back from today.
      return {
        start: iso(new Date(last.getFullYear() - 1, last.getMonth() + 1, 1)),
        end: lastDay,
      };

    case "ytd":
    default:
      return { start: `${year}-01-01`, end: lastDay || firstDay };
  }
}

/**
 * The same slice of the previous year, so a comparison is like for like. A
 * year-to-date figure through August must be compared with January to August,
 * never with the whole of the previous year.
 */
export function comparisonRange(range: DateRange): DateRange {
  return { start: shiftYear(range.start, -1), end: shiftYear(range.end, -1) };
}

export function shiftYear(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const targetYear = y + delta;
  const isLeap =
    (targetYear % 4 === 0 && targetYear % 100 !== 0) || targetYear % 400 === 0;
  const day = m === 2 && d === 29 && !isLeap ? 28 : d;
  return `${targetYear}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
