/**
 * Describing a spreadsheet's columns without shipping its contents.
 *
 * To work out what a column means, a model needs to see what is in it. But the
 * contents are the customer list, and there is no reason to send it anywhere.
 *
 * So each column is profiled instead: its header, what type its values are,
 * how many distinct values it holds, and examples — verbatim only where the
 * column is a small set of codes ("Månedlig", "Aktiv", "Sendt"), which is
 * exactly where the examples decide the answer. A column of free text is
 * described by its shape and given masked samples, which is enough to
 * recognise a name column and tells an outside service nothing about who the
 * customers are.
 */

import { parseDate, parseNumber, text, type CellValue } from "./read";

export interface ColumnProfile {
  index: number;
  header: string;
  /** number | date | boolean | code | text | empty */
  type: string;
  filled_ratio: number;
  distinct_count: number;
  /** Verbatim only for low-cardinality code columns. */
  examples: string[];
  /** Set for numeric columns, so an amount is distinguishable from a count. */
  numeric_range?: { min: number; max: number; has_decimals: boolean };
}

/** Above this many distinct values, a column is treated as free text. */
const CODE_CARDINALITY = 25;

/**
 * Headers that mean the column holds someone's identity. Masked whatever their
 * cardinality: a company with eight customers would otherwise have its entire
 * customer list sent out because the column happened to be short, and a column
 * of sellers is staff names.
 */
const IDENTITY_HEADERS = [
  "navn", "name", "kunde", "customer", "client", "selger", "seller",
  "ansvarlig", "owner", "kontakt", "contact", "adresse", "address",
  "e-post", "epost", "email", "mail", "telefon", "phone", "mobil",
  "person", "ansatt", "employee", "mottaker", "recipient",
];

function looksLikeIdentity(header: string): boolean {
  const value = header.toLowerCase();
  return IDENTITY_HEADERS.some((h) => value.includes(h));
}

export function profileColumns(
  headers: string[],
  rows: CellValue[][],
  sampleSize = 300
): ColumnProfile[] {
  const sample = rows.slice(0, sampleSize);

  return headers.map((header, index) => {
    const values = sample.map((r) => r[index] ?? null);
    const present = values.filter((v) => text(v) !== "");
    const distinct = new Set(present.map((v) => text(v)));

    const filled = present.length / Math.max(sample.length, 1);

    if (present.length === 0) {
      return {
        index,
        header,
        type: "empty",
        filled_ratio: 0,
        distinct_count: 0,
        examples: [],
      };
    }

    const numbers = present
      .map((v) => parseNumber(v))
      .filter((n): n is number => n != null);
    const dates = present.filter((v) => parseDate(v) != null);
    const booleans = present.filter((v) =>
      ["ja", "nei", "yes", "no", "true", "false", "x"].includes(
        text(v).toLowerCase()
      )
    );

    let type = "text";
    if (numbers.length / present.length > 0.9) type = "number";
    else if (dates.length / present.length > 0.9) type = "date";
    else if (booleans.length / present.length > 0.9) type = "boolean";
    else if (distinct.size <= CODE_CARDINALITY) type = "code";

    // A value is only sent verbatim when it is plainly a code: it repeats
    // across rows, the header does not name a person or company, and there are
    // few enough distinct values to be an enumeration. A near-unique text
    // column is an identifier however short the file is.
    const repeats = distinct.size / present.length <= 0.8;
    const isCode =
      distinct.size <= CODE_CARDINALITY &&
      repeats &&
      !looksLikeIdentity(header);

    const profile: ColumnProfile = {
      index,
      header,
      type,
      filled_ratio: Math.round(filled * 100) / 100,
      distinct_count: distinct.size,
      examples: isCode
        ? [...distinct].slice(0, CODE_CARDINALITY)
        : maskedExamples([...distinct].slice(0, 3)),
    };

    if (type === "number" && numbers.length > 0) {
      profile.numeric_range = {
        min: Math.round(Math.min(...numbers) * 100) / 100,
        max: Math.round(Math.max(...numbers) * 100) / 100,
        has_decimals: numbers.some((n) => !Number.isInteger(n)),
      };
    }

    return profile;
  });
}

/**
 * Keeps the shape of a value while dropping its content: length, character
 * classes and the first character. Enough to tell a company name from a
 * postcode; useless to anyone wanting the customer list.
 */
function maskedExamples(values: string[]): string[] {
  return values.map((value) => {
    const first = value.slice(0, 1);
    const rest = value
      .slice(1)
      .replace(/\p{Lu}/gu, "A")
      .replace(/\p{Ll}/gu, "a")
      .replace(/\d/g, "9");
    return `${first}${rest}`.slice(0, 30);
  });
}
