/**
 * Working out what each column means.
 *
 * Two signals, because either alone is unreliable. The header name is the
 * stronger one when it is recognisable — "Nettobeløp" is unambiguous. But
 * exports rename things, translate them, or leave a column unlabelled, so the
 * values are read too: a column of organisation numbers looks like nothing
 * else, and neither does a column that says "Månedlig" nine rows out of ten.
 *
 * Each field takes the best-scoring column, and no column is used twice.
 */

import {
  isNumeric,
  parseBoolean,
  parseDate,
  parseNumber,
  text,
  type CellValue,
} from "./read";

export interface FieldSpec {
  key: string;
  /** Header words that identify this column, lowercased and accent-folded. */
  names: string[];
  /** Header words that rule a column out even when a name matches. */
  excludes?: string[];
  /** How well the column's values fit, 0 to 1. */
  shape?: (values: CellValue[]) => number;
}

export type ColumnMap = Record<string, number | undefined>;

/** Folds case, accents and punctuation so header matching is forgiving. */
export function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[æ]/g, "ae")
    .replace(/[ø]/g, "o")
    .replace(/[å]/g, "a")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Assigns columns to fields, best match first, so a strong signal claims its
 * column before a weaker field can take it. "Nettobeløp" and "Bruttofortjeneste"
 * both contain "beløp"-like words; resolving in score order stops the wrong one
 * winning.
 */
export function mapColumns(
  headers: string[],
  rows: CellValue[][],
  fields: FieldSpec[]
): ColumnMap {
  const normalisedHeaders = headers.map(normalise);
  const columnValues = headers.map((_, i) =>
    rows.slice(0, 200).map((r) => r[i] ?? null)
  );

  const candidates: Array<{ field: string; column: number; score: number }> = [];

  for (const field of fields) {
    for (let column = 0; column < headers.length; column++) {
      const header = normalisedHeaders[column];
      const values = columnValues[column];

      if (field.excludes?.some((e) => header.includes(normalise(e)))) continue;

      const nameScore = headerScore(header, field.names);
      const shapeScore = field.shape ? field.shape(values) : 0;

      // A column has to look right, be named right, or both. A shape match
      // alone is only trusted when it is strong, since several columns can
      // hold plausible numbers.
      const score =
        nameScore > 0
          ? nameScore * 3 + shapeScore
          : shapeScore > 0.85
            ? shapeScore
            : 0;

      if (score > 0) candidates.push({ field: field.key, column, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const map: ColumnMap = {};
  const takenColumns = new Set<number>();

  for (const c of candidates) {
    if (map[c.field] !== undefined || takenColumns.has(c.column)) continue;
    map[c.field] = c.column;
    takenColumns.add(c.column);
  }

  return map;
}

function headerScore(header: string, names: string[]): number {
  if (!header) return 0;

  for (const name of names) {
    const n = normalise(name);
    if (header === n) return 1;
    if (header.startsWith(n) || header.endsWith(n)) return 0.8;
    if (header.includes(n)) return 0.6;
  }

  return 0;
}

// ---------------------------------------------------------------------------
// Value shapes
// ---------------------------------------------------------------------------

function ratio(values: CellValue[], test: (v: CellValue) => boolean): number {
  const present = values.filter((v) => text(v) !== "");
  if (present.length < 3) return 0;
  return present.filter(test).length / present.length;
}

export const shapes = {
  number: (values: CellValue[]) =>
    ratio(values, (v) => parseNumber(v) != null) * 0.9,

  /** Amounts are numbers that are not all small integers. */
  amount: (values: CellValue[]) => {
    const numbers = values
      .map((v) => parseNumber(v))
      .filter((n): n is number => n != null);
    if (numbers.length < 3) return 0;

    const looksLikeMoney = numbers.filter(
      (n) => Math.abs(n) >= 50 || !Number.isInteger(n)
    ).length;

    return (looksLikeMoney / numbers.length) * 0.9;
  },

  date: (values: CellValue[]) => ratio(values, (v) => parseDate(v) != null),

  boolean: (values: CellValue[]) => ratio(values, (v) => parseBoolean(v) != null),

  /** Norwegian organisation numbers are nine digits. */
  orgNumber: (values: CellValue[]) =>
    ratio(values, (v) => /^\d{9}$/.test(text(v).replace(/\s/g, ""))),

  /** A name column is text, mostly distinct, and not numeric. */
  name: (values: CellValue[]) => {
    const present = values.map((v) => text(v)).filter(Boolean);
    if (present.length < 3) return 0;

    const textual = present.filter((v) => !isNumeric(v) && v.length > 2).length;
    const distinct = new Set(present).size / present.length;

    return (textual / present.length) * 0.6 + distinct * 0.3;
  },

  /** A column of billing intervals: monthly, quarterly, every 3 months. */
  interval: (values: CellValue[]) =>
    ratio(values, (v) => parseInterval(text(v)) != null),
};

// ---------------------------------------------------------------------------
// Billing interval
// ---------------------------------------------------------------------------

/**
 * How many months a contract's interval spans.
 *
 * Written many ways even inside one system — this export says "Månedlig",
 * "Hver 3 måned", "Hver 6 måned" and "Årlig" in the same column — so the
 * phrasing is parsed rather than matched against a fixed list.
 */
export function parseInterval(raw: string): number | null {
  const value = normalise(raw);
  if (!value) return null;

  // "hver 3 maned", "hver 6 maneder", "every 3 months"
  const everyMonths = value.match(/(?:hver|every|per)\s*(\d+)\s*(?:maned|manad|month)/);
  if (everyMonths) return Number(everyMonths[1]);

  const everyYears = value.match(/(?:hver|hvert|every)\s*(\d+)\s*(?:ar|year)/);
  if (everyYears) return Number(everyYears[1]) * 12;

  if (/^manedlig|^monthly|^per maned|^pr maned|^mnd|^maned$/.test(value)) return 1;
  if (/^kvartal|quarterly|per kvartal|pr kvartal/.test(value)) return 3;
  if (/^tertial/.test(value)) return 4;
  if (/halvar|half year|semi annual|biannual/.test(value)) return 6;
  if (/^arlig|^annual|^yearly|^per ar|^pr ar|^hvert ar|^ar$/.test(value)) return 12;
  if (/^ukentlig|^weekly/.test(value)) return null; // Not a monthly cadence.

  // A bare number in an interval column means months.
  const bare = value.match(/^(\d+)$/);
  if (bare) {
    const n = Number(bare[1]);
    return n >= 1 && n <= 24 ? n : null;
  }

  return null;
}

export const INTERVAL_LABELS: Record<number, string> = {
  1: "Månedlig",
  2: "Annenhver måned",
  3: "Kvartalsvis",
  4: "Hver 4. måned",
  6: "Halvårlig",
  12: "Årlig",
  24: "Hvert andre år",
};

export function intervalLabel(months: number): string {
  return INTERVAL_LABELS[months] ?? `Hver ${months}. måned`;
}

// ---------------------------------------------------------------------------
// Contract status
// ---------------------------------------------------------------------------

export type ContractStatus = "active" | "draft" | "inactive";

/**
 * What a status column is saying about a contract.
 *
 * A draft is not invoiced until someone sends it; a paused or cancelled
 * contract is not invoiced at all. Both are outside the run rate, and a list
 * that marks them only in a status column — with no separate "active" flag —
 * would otherwise have them counted.
 */
export function parseContractStatus(raw: string): ContractStatus | null {
  const value = normalise(raw);
  if (!value) return null;

  if (/utkast|draft|kladd|ikke sendt|not sent|pending approval/.test(value)) {
    return "draft";
  }

  if (
    /paused|pause|stoppet|stopped|avsluttet|ended|cancelled|canceled|kansellert|inaktiv|inactive|terminated|expired|utlopt|arkivert|archived|on hold/.test(
      value
    )
  ) {
    return "inactive";
  }

  if (/sendt|sent|aktiv|active|live|running|lopende|ongoing|ok/.test(value)) {
    return "active";
  }

  return null;
}
