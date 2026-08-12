/**
 * Product list import.
 *
 * SAF-T does not say which revenue recurs. A product list exported from the
 * accounting system does: products sit in a group such as "Lisenser", and
 * that grouping is the seller's own statement about what is a subscription.
 *
 * The export is a spreadsheet whose header row is not necessarily the first
 * row — PowerOffice puts a title and the company name above it — so the
 * header is located by looking for the columns rather than assumed.
 */

import * as XLSX from "xlsx";

export interface ParsedProduct {
  code: string | null;
  name: string;
  productGroup: string | null;
  salesAccount: string | null;
  isRecurring: boolean;
}

export interface ProductParseResult {
  products: ParsedProduct[];
  /** Distinct groups found, so the user can see what was classified. */
  groups: string[];
  warnings: string[];
}

export class ProductParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductParseError";
  }
}

/**
 * Product groups that denote recurring revenue. Matched case-insensitively
 * as a substring, so "Lisenser", "Lisens" and "Abonnement" all qualify.
 */
const RECURRING_GROUPS = [
  "lisens",
  "abonnement",
  "subscription",
  "licence",
  "license",
  "saas",
];

export function isRecurringGroup(group: string | null): boolean {
  if (!group) return false;
  const g = group.toLowerCase();
  return RECURRING_GROUPS.some((r) => g.includes(r));
}

/** Column headings as written by Norwegian and English exports. */
const HEADINGS: Record<keyof Omit<ParsedProduct, "isRecurring">, string[]> = {
  code: ["kode", "code", "produktnr", "artikkelnr", "nummer"],
  name: ["navn", "name", "produkt", "produktnavn", "beskrivelse", "description"],
  productGroup: ["produktgruppe", "product group", "gruppe", "group", "kategori"],
  salesAccount: ["salgskonto", "sales account", "konto", "account"],
};

function normalise(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function parseProductWorkbook(buffer: ArrayBuffer): ProductParseResult {
  let rows: unknown[][];

  try {
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("Arbeidsboken har ingen ark");

    rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      blankrows: false,
      defval: "",
    });
  } catch (err) {
    throw new ProductParseError(
      `Kunne ikke lese filen: ${err instanceof Error ? err.message : "ukjent feil"}`
    );
  }

  // Find the header row: the first row carrying a recognisable name column.
  let headerIndex = -1;
  let columns: Partial<Record<keyof typeof HEADINGS, number>> = {};

  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const cells = rows[i].map(normalise);
    const found: Partial<Record<keyof typeof HEADINGS, number>> = {};

    for (const [field, aliases] of Object.entries(HEADINGS) as [
      keyof typeof HEADINGS,
      string[],
    ][]) {
      const index = cells.findIndex((c) => aliases.includes(c));
      if (index !== -1) found[field] = index;
    }

    if (found.name != null) {
      headerIndex = i;
      columns = found;
      break;
    }
  }

  if (headerIndex === -1) {
    throw new ProductParseError(
      "Fant ingen kolonne med produktnavn. Filen bør ha en rad med " +
        "overskriftene «Navn» og «Produktgruppe», slik PowerOffice eksporterer den."
    );
  }

  const warnings: string[] = [];
  if (columns.productGroup == null) {
    warnings.push(
      "Fant ingen «Produktgruppe»-kolonne. Ingen produkter kan merkes som " +
        "gjentakende ut fra gruppe."
    );
  }

  const products: ParsedProduct[] = [];
  const seen = new Set<string>();

  for (const row of rows.slice(headerIndex + 1)) {
    const cell = (index: number | undefined) =>
      index == null ? null : (String(row[index] ?? "").trim() || null);

    const name = cell(columns.name);
    if (!name) continue;

    // The export repeats the group name as a section heading above its rows;
    // such a row has a name but nothing else, so skip it.
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const productGroup = cell(columns.productGroup);

    products.push({
      code: cell(columns.code),
      name,
      productGroup,
      salesAccount: cell(columns.salesAccount),
      isRecurring: isRecurringGroup(productGroup),
    });
  }

  if (products.length === 0) {
    throw new ProductParseError("Fant ingen produkter i filen.");
  }

  const groups = [
    ...new Set(products.map((p) => p.productGroup).filter(Boolean)),
  ] as string[];

  const recurring = products.filter((p) => p.isRecurring).length;
  if (recurring === 0 && groups.length > 0) {
    warnings.push(
      `Ingen av produktgruppene (${groups.join(", ")}) ble gjenkjent som ` +
        "lisens eller abonnement. Gi gruppen et navn som inneholder «lisens» " +
        "eller «abonnement» for at inntektene skal regnes som gjentakende."
    );
  }

  return { products, groups, warnings };
}
