/**
 * Norwegian VAT filing deadlines.
 *
 * "Når er neste mva-innlevering?" has a fixed answer set by law, the same for
 * every business on the same scheme. Asked it, the assistant ran four tools —
 * a VAT estimate, a coverage check, an obligations lookup and a search of the
 * accounting rules — each paging through the ledger, spent a minute or so, and
 * answered that it did not know. It could not know: the deadline is not in the
 * ledger. `get_upcoming_obligations` reports what SAF-T states about supplier
 * invoices, and SAF-T states no due dates at all.
 *
 * So this is a calendar, not a query. No database, no model, no ledger. The
 * dates come from skatteforvaltningsforskriften § 8-3 and are stated here
 * once.
 *
 * Terms (skatteforvaltningsforskriften § 8-3-1 to § 8-3-3):
 *
 *   Alminnelige terminer — six two-month periods, the default for a
 *   VAT-registered business. Deadline is one month and ten days after the
 *   period ends, except the third term, which runs to 31 August because of the
 *   summer holiday.
 *
 *   Årstermin — one annual return, for turnover under one million kroner and
 *   only when the tax authority has approved it. Deadline 10 March.
 *
 *   Månedlige terminer — monthly, for businesses in a persistent refund
 *   position, and again only on approval. One month and ten days.
 *
 * A deadline landing on a Saturday, Sunday or public holiday moves to the next
 * working day. Norwegian public holidays are fixed dates plus five that hang
 * off Easter, so Easter is computed rather than tabulated.
 */

export type VatScheme = "bimonthly" | "annual" | "monthly";

export interface VatTerm {
  /** 1–6 for two-month terms, 1–12 for monthly, 1 for the annual return. */
  term: number;
  /** Human label, e.g. "3. termin (mai–juni)". */
  label: string;
  periodStart: string;
  periodEnd: string;
  /** The statutory date, before the weekend and holiday rule. */
  statutoryDeadline: string;
  /** The date it is actually due. */
  deadline: string;
  /** Set when the statutory date fell on a weekend or public holiday. */
  movedFrom: string | null;
}

const MONTHS = [
  "januar", "februar", "mars", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "desember",
];

/**
 * The six ordinary terms. `deadlineMonth` is relative to the term's own year;
 * term 6 files in February of the following year.
 */
const BIMONTHLY: Array<{
  term: number;
  fromMonth: number;
  toMonth: number;
  deadlineMonth: number;
  deadlineDay: number;
  deadlineNextYear: boolean;
}> = [
  { term: 1, fromMonth: 1, toMonth: 2, deadlineMonth: 4, deadlineDay: 10, deadlineNextYear: false },
  { term: 2, fromMonth: 3, toMonth: 4, deadlineMonth: 6, deadlineDay: 10, deadlineNextYear: false },
  // Not 10 July: the third term is given until the end of August.
  { term: 3, fromMonth: 5, toMonth: 6, deadlineMonth: 8, deadlineDay: 31, deadlineNextYear: false },
  { term: 4, fromMonth: 7, toMonth: 8, deadlineMonth: 10, deadlineDay: 10, deadlineNextYear: false },
  { term: 5, fromMonth: 9, toMonth: 10, deadlineMonth: 12, deadlineDay: 10, deadlineNextYear: false },
  { term: 6, fromMonth: 11, toMonth: 12, deadlineMonth: 2, deadlineDay: 10, deadlineNextYear: true },
];

/**
 * Every VAT term whose deadline falls on or after `from`, soonest first.
 *
 * `from` is an ISO date, passed in rather than read from the clock so the
 * result is reproducible and testable.
 */
export function upcomingVatTerms(
  from: string,
  scheme: VatScheme = "bimonthly",
  count = 3
): VatTerm[] {
  const year = Number(from.slice(0, 4));
  const terms: VatTerm[] = [];

  // Four years of candidates, unconditionally. A count-based guard was wrong
  // here: the first year alone produces six terms, all of which may already
  // have passed, and the loop stopped before generating any that had not.
  for (let y = year - 1; y <= year + 2; y++) {
    terms.push(...termsForYear(y, scheme));
  }

  return terms
    .filter((t) => t.deadline >= from)
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
    .slice(0, count);
}

/** The next deadline, or null if none could be built. */
export function nextVatTerm(
  from: string,
  scheme: VatScheme = "bimonthly"
): VatTerm | null {
  return upcomingVatTerms(from, scheme, 1)[0] ?? null;
}

/** Whole days from one ISO date to another. */
export function daysUntil(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
  );
}

// ---------------------------------------------------------------------------
// Building terms
// ---------------------------------------------------------------------------

function termsForYear(year: number, scheme: VatScheme): VatTerm[] {
  if (scheme === "annual") {
    // One return for the whole year, filed by 10 March the year after.
    return [
      build({
        term: 1,
        label: `Årstermin ${year}`,
        periodStart: `${year}-01-01`,
        periodEnd: `${year}-12-31`,
        statutory: `${year + 1}-03-10`,
      }),
    ];
  }

  if (scheme === "monthly") {
    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const deadlineMonth = month === 12 ? 1 : month + 1;
      const deadlineYear = month === 12 ? year + 1 : year;
      return build({
        term: month,
        label: `${MONTHS[i]} ${year}`,
        periodStart: iso(year, month, 1),
        periodEnd: iso(year, month, daysInMonth(year, month)),
        statutory: iso(deadlineYear, deadlineMonth, 10),
      });
    });
  }

  return BIMONTHLY.map((t) =>
    build({
      term: t.term,
      label: `${t.term}. termin (${MONTHS[t.fromMonth - 1]}–${MONTHS[t.toMonth - 1]}) ${year}`,
      periodStart: iso(year, t.fromMonth, 1),
      periodEnd: iso(year, t.toMonth, daysInMonth(year, t.toMonth)),
      statutory: iso(
        t.deadlineNextYear ? year + 1 : year,
        t.deadlineMonth,
        t.deadlineDay
      ),
    })
  );
}

function build(input: {
  term: number;
  label: string;
  periodStart: string;
  periodEnd: string;
  statutory: string;
}): VatTerm {
  const deadline = nextWorkingDay(input.statutory);
  return {
    term: input.term,
    label: input.label,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    statutoryDeadline: input.statutory,
    deadline,
    movedFrom: deadline === input.statutory ? null : input.statutory,
  };
}

// ---------------------------------------------------------------------------
// Working days
// ---------------------------------------------------------------------------

/** Moves a date forward past weekends and public holidays. */
function nextWorkingDay(iso: string): string {
  let date = iso;
  // A deadline never has to move more than a few days; the bound is a guard.
  for (let i = 0; i < 10; i++) {
    if (!isWeekend(date) && !isPublicHoliday(date)) return date;
    date = addDays(date, 1);
  }
  return date;
}

function isWeekend(isoDate: string): boolean {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Norwegian public holidays (lov om helligdager og helligdagsfred § 2).
 * Five are fixed; the rest hang off Easter Sunday.
 */
function isPublicHoliday(isoDate: string): boolean {
  const year = Number(isoDate.slice(0, 4));
  const fixed = [
    `${year}-01-01`, // Første nyttårsdag
    `${year}-05-01`, // Offentlig høytidsdag
    `${year}-05-17`, // Grunnlovsdagen
    `${year}-12-25`, // Første juledag
    `${year}-12-26`, // Andre juledag
  ];
  if (fixed.includes(isoDate)) return true;

  const easter = easterSunday(year);
  const movable = [
    addDays(easter, -3), // Skjærtorsdag
    addDays(easter, -2), // Langfredag
    addDays(easter, 1), // Andre påskedag
    addDays(easter, 39), // Kristi himmelfartsdag
    addDays(easter, 50), // Andre pinsedag
  ];

  return movable.includes(isoDate);
}

/** Easter Sunday by the anonymous Gregorian algorithm. */
function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(year, month, day);
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDays(isoDate: string, days: number): string {
  const t = Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** "10. oktober 2026" */
export function formatDeadline(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${d}. ${MONTHS[m - 1]} ${y}`;
}
