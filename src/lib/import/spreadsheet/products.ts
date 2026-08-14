/**
 * A product list, read out of whatever shape the accounting system exported it
 * in.
 *
 * The import could already read a spreadsheet without being told its column
 * order — the header row is found, the columns identified by meaning, the
 * model asked when the wording is unfamiliar. But it could only ever be one
 * kind of document. Every file went through the recurring-contract parser,
 * which looks for a customer, an amount and a billing interval; a product list
 * has none of those, produced no contracts, and came back as "forsto ikke
 * innholdet i filen". The interpretation was working exactly as built and the
 * file was never the kind it was built for.
 *
 * So the file is classified first — what is this? — and only then are its
 * columns mapped for that kind. A product list is the second kind.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { mapColumns, shapes, type FieldSpec } from "./columns";
import { resolveColumns, type ResolveSpec } from "./resolve";
import { parseNumber, text, type CellValue, type Sheet } from "./read";
import { isRecurringGroup } from "@/lib/import/products/parser";
import { fetchAll } from "@/lib/supabase/paginate";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

export interface ParsedProduct {
  code: string | null;
  name: string;
  productGroup: string | null;
  salesPrice: number | null;
  costPrice: number | null;
  salesAccount: string | null;
  /** Units sold over the period the export covers, when it states them. */
  quantitySold: number | null;
  /** Revenue over that period, when it states it. */
  revenue: number | null;
}

export interface ParsedProducts {
  products: ParsedProduct[];
  mapping: Record<string, string>;
  interpretation: string[];
  skipped: Array<{ row: number; reason: string }>;
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

const FIELDS: FieldSpec[] = [
  {
    key: "name",
    names: ["produkt", "produktnavn", "vare", "varenavn", "beskrivelse", "tekst", "product", "item", "description"],
    shape: shapes.name,
  },
  {
    key: "code",
    names: ["kode", "produktkode", "varenummer", "varenr", "artikkelnr", "artikkelnummer", "nr", "sku", "code", "item no"],
  },
  {
    key: "group",
    names: ["produktgruppe", "varegruppe", "gruppe", "kategori", "product group", "category"],
  },
  {
    // The unit price, not the average achieved over the period: a product
    // record states what the product costs today.
    key: "salesPrice",
    names: [
      "naavaerende enhetspris", "nåværende enhetspris", "enhetspris",
      "salgspris", "utsalgspris", "listepris", "pris",
      "unit price", "list price", "sales price", "price",
    ],
    excludes: ["gj.sn", "gjennomsnitt", "average", "total"],
    shape: shapes.amount,
  },
  {
    // Likewise the unit cost. "Total kostpris" is what the period's sales
    // cost altogether, which is a different number.
    key: "costPrice",
    names: [
      "gj.sn. kostpris", "gjennomsnittlig kostpris", "kostpris",
      "innkjøpspris", "inntakskost", "cost price", "unit cost", "cost",
    ],
    excludes: ["total", "sum"],
    shape: shapes.amount,
  },
  {
    key: "quantity",
    names: ["antall", "antall solgt", "solgt", "kvantum", "mengde", "quantity", "qty", "units sold"],
    shape: shapes.number,
  },
  {
    key: "revenue",
    names: ["total", "sum", "omsetning", "salg", "beløp", "total salg", "revenue", "amount", "net"],
    shape: shapes.amount,
  },
  {
    key: "account",
    names: ["salgskonto", "konto", "standard salgskonto", "hovedbokskonto", "account", "sales account"],
  },
];

const AI_FIELDS = [
  { key: "name", description: "Navnet på produktet eller varen." },
  { key: "code", description: "Produktkode, varenummer eller artikkelnummer." },
  { key: "group", description: "Produktgruppe eller varekategori." },
  { key: "salesPrice", description: "Salgspris eller enhetspris per stk." },
  { key: "costPrice", description: "Kostpris eller innkjøpspris per stk." },
  { key: "quantity", description: "Antall solgte enheter i perioden." },
  { key: "revenue", description: "Samlet salgsbeløp for produktet i perioden." },
  { key: "account", description: "Hovedbokskontoen salget føres på, f.eks. 3000." },
];

const SPEC: ResolveSpec = {
  fields: FIELDS,
  aiFields: AI_FIELDS,
  // A product list is a list of products. Everything else is optional, because
  // exports differ in what they carry — some state stock, some only sales.
  required: ["name"],
  documentHint:
    "En produktliste eller salgsrapport per produkt fra et norsk " +
    "regnskapssystem. Én rad per produkt, med navn og som regel kode, " +
    "produktgruppe, pris og hvor mye som er solgt.",
};

// ---------------------------------------------------------------------------
// Recognising the file
// ---------------------------------------------------------------------------

/**
 * How strongly this sheet looks like a product list.
 *
 * Scored on the same scale as the recurring-contract score so the two can be
 * compared and the higher one wins. A header naming a product and a price is
 * most of it; a quantity or an account number confirms it.
 */
export function scoreProductSheet(sheet: Sheet): number {
  const map = mapColumns(sheet.headers, sheet.rows, FIELDS);

  let score = 0;
  if (map.name !== undefined) score += 3;
  if (map.code !== undefined) score += 2;
  if (map.group !== undefined) score += 2;
  if (map.salesPrice !== undefined) score += 2;
  if (map.quantity !== undefined) score += 1;
  if (map.account !== undefined) score += 1;

  // A product list has no customer and no billing interval. Their absence is
  // what separates it from a contract list, which also has names and amounts.
  const headers = sheet.headers.map((h) => h.toLowerCase()).join(" ");
  if (/kunde|customer|klient/.test(headers)) score -= 3;
  if (/intervall|frekvens|periodisering|interval/.test(headers)) score -= 3;

  return score;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export async function parseProductSheet(sheet: Sheet): Promise<ParsedProducts> {
  const resolved = await resolveColumns(sheet, SPEC);
  const map = resolved.map;

  const products: ParsedProduct[] = [];
  const skipped: Array<{ row: number; reason: string }> = [];

  const cell = (row: CellValue[], key: string): string =>
    map[key] === undefined ? "" : text(row[map[key]!]);

  const amount = (row: CellValue[], key: string): number | null =>
    map[key] === undefined ? null : parseNumber(row[map[key]!]);

  let subtotals = 0;

  for (const [index, row] of sheet.rows.entries()) {
    const name = cell(row, "name").trim();

    // Blank rows are structure, not data: exports put one under the header and
    // between sections. Silently skipped rather than reported as a failure.
    if (!name && row.every((v) => text(v).trim() === "")) continue;

    if (!name) {
      skipped.push({ row: index + 1, reason: "Ingen produktnavn i raden." });
      continue;
    }

    // A subtotal is not a product. This export writes one per group — "Sum
    // Washd" — and counting them doubled the revenue: every sale appeared once
    // on its product and again in its group's total.
    if (isSubtotal(name)) {
      subtotals++;
      continue;
    }

    products.push({
      name,
      code: cell(row, "code").trim() || null,
      productGroup: normaliseGroup(cell(row, "group")),
      salesPrice: amount(row, "salesPrice"),
      costPrice: amount(row, "costPrice"),
      salesAccount: parseAccount(cell(row, "account")),
      quantitySold: amount(row, "quantity"),
      revenue: amount(row, "revenue"),
    });
  }

  return {
    products,
    mapping: describeMapping(sheet, map),
    interpretation: [
      subtotals > 0
        ? `${subtotals} delsummer i filen er hoppet over, så salget ikke telles to ganger.`
        : "",
      resolved.method === "rules"
        ? "Kolonnene ble gjenkjent på navn."
        : resolved.method === "ai"
          ? "Kolonnenavnene var ukjente, så innholdet ble tolket av AI."
          : "Noen kolonner ble gjenkjent på navn, resten tolket av AI.",
      ...resolved.notes,
    ].filter(Boolean),
    skipped,
  };
}

// ---------------------------------------------------------------------------
// Storing
// ---------------------------------------------------------------------------

export interface ProductImportResult {
  written: number;
  /** Products the export states a turnover for. */
  withSales: number;
  /** Their turnover over the period the export covers. */
  totalRevenue: number;
  groups: string[];
  warnings: string[];
}

interface StoredProduct {
  name: string;
  code: string | null;
  product_group: string | null;
  sales_account: string | null;
  sales_price: number | null;
  cost_price: number | null;
  unit: string | null;
  is_recurring: boolean;
  price_updated_at: string | null;
}

/**
 * Writes the products, keeping what the file does not say.
 *
 * A product record is built up from more than one source: a price list carries
 * prices, a sales report carries turnover, and someone may have marked a
 * product as recurring by hand. So a column absent from this file leaves the
 * stored value alone rather than overwriting it with nothing — otherwise every
 * upload would quietly erase whatever the previous one established.
 *
 * The turnover and quantity the export states are period figures, true only of
 * the dates in its heading, and are reported back rather than stored. A number
 * that means "in 2025" would be wrong the moment it sat in a column called
 * sales_price.
 */
export async function importProducts(
  supabase: DB,
  companyId: string,
  parsed: ParsedProducts
): Promise<ProductImportResult> {
  const stored = await fetchAll<StoredProduct>(
    (from, to) =>
      supabase
        .from("products")
        .select(
          "name, code, product_group, sales_account, sales_price, cost_price, unit, is_recurring, price_updated_at"
        )
        .eq("company_id", companyId)
        .order("name", { ascending: true })
        .range(from, to) as PromiseLike<{
        data: StoredProduct[] | null;
        error: { message: string } | null;
      }>,
    { label: "produkter" }
  );

  const existing = new Map(stored.map((p) => [p.name.trim().toLowerCase(), p]));
  const now = new Date().toISOString();

  let added = 0;
  let priceChanged = 0;

  const merged = dedupe(parsed.products);

  const rows = merged.map((p) => {
    const before = existing.get(p.name.trim().toLowerCase()) ?? null;

    const salesPrice = p.salesPrice ?? before?.sales_price ?? null;
    const costPrice = p.costPrice ?? before?.cost_price ?? null;
    const group = p.productGroup ?? before?.product_group ?? null;

    const moved =
      before != null &&
      ((p.salesPrice != null && Number(before.sales_price) !== p.salesPrice) ||
        (p.costPrice != null && Number(before.cost_price) !== p.costPrice));

    if (!before) added++;
    else if (moved) priceChanged++;

    return {
      company_id: companyId,
      name: p.name,
      code: p.code ?? before?.code ?? null,
      product_group: group,
      sales_account: p.salesAccount ?? before?.sales_account ?? null,
      sales_price: salesPrice,
      cost_price: costPrice,
      unit: before?.unit ?? null,
      // A product already marked recurring stays marked: the group name is a
      // guess, and someone who has corrected it should not have to again.
      is_recurring: before?.is_recurring || isRecurringGroup(group),
      is_active: true,
      // Stamped when a price actually moved, so the column records when the
      // price last changed rather than when a file was last read.
      price_updated_at: moved ? now : (before?.price_updated_at ?? now),
      updated_at: now,
      source_system: "spreadsheet",
      source_id: p.code ?? p.name,
    };
  });

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from("products")
      .upsert(rows.slice(i, i + 500) as never, { onConflict: "company_id,name" });

    if (error) {
      throw new Error(`Kunne ikke lagre produktene: ${error.message}`);
    }
  }

  const withSales = merged.filter((p) => (p.revenue ?? 0) !== 0);
  const totalRevenue = withSales.reduce((sum, p) => sum + (p.revenue ?? 0), 0);

  const groups = [
    ...new Set(merged.map((p) => p.productGroup).filter(Boolean)),
  ] as string[];

  const uploaded = new Set(merged.map((p) => p.name.trim().toLowerCase()));
  const missing = [...existing.keys()].filter((n) => !uploaded.has(n));

  return {
    written: rows.length,
    withSales: withSales.length,
    totalRevenue: Math.round(totalRevenue),
    groups,
    warnings: buildWarnings({
      total: rows.length,
      added,
      priceChanged,
      withSales: withSales.length,
      totalRevenue,
      groups,
      recurring: rows.filter((r) => r.is_recurring).length,
      missing: missing.length,
      skipped: parsed.skipped.length,
    }),
  };
}

/**
 * One row per product name.
 *
 * A sales report may list the same product twice — once per group, or once per
 * account it was posted to — and the store holds one row per name. Writing both
 * in the same statement fails outright ("cannot affect row a second time"), so
 * they are merged here, later values filling in what earlier ones left blank.
 */
function dedupe(products: ParsedProduct[]): ParsedProduct[] {
  const byName = new Map<string, ParsedProduct>();

  for (const p of products) {
    const key = p.name.trim().toLowerCase();
    const seen = byName.get(key);

    if (!seen) {
      byName.set(key, p);
      continue;
    }

    byName.set(key, {
      ...seen,
      code: seen.code ?? p.code,
      productGroup: seen.productGroup ?? p.productGroup,
      salesPrice: seen.salesPrice ?? p.salesPrice,
      costPrice: seen.costPrice ?? p.costPrice,
      salesAccount: seen.salesAccount ?? p.salesAccount,
      // Quantities and turnover are of the same product, so they add up.
      quantitySold: add(seen.quantitySold, p.quantitySold),
      revenue: add(seen.revenue, p.revenue),
    });
  }

  return [...byName.values()];
}

function add(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return a + b;
}

function buildWarnings(counts: {
  total: number;
  added: number;
  priceChanged: number;
  withSales: number;
  totalRevenue: number;
  groups: string[];
  recurring: number;
  missing: number;
  skipped: number;
}): string[] {
  const warnings: string[] = [];

  warnings.push(
    `Leste ${counts.total} produkter. ${counts.added} er nye, ` +
      `${counts.priceChanged} har fått ny pris.`
  );

  if (counts.withSales > 0) {
    warnings.push(
      `${counts.withSales} produkter har omsetning i filen, til sammen ` +
        `${format(counts.totalRevenue)}. Beløpet gjelder perioden filen dekker ` +
        "og lagres ikke på produktet — omsetning per produkt hentes fra regnskapet."
    );
  }

  if (counts.recurring > 0) {
    warnings.push(
      `${counts.recurring} produkter er merket som gjentakende og teller med i MRR.`
    );
  } else if (counts.groups.length > 0) {
    warnings.push(
      `Ingen av produktgruppene (${counts.groups.slice(0, 8).join(", ")}) ble ` +
        "gjenkjent som lisens eller abonnement, så ingen av produktene teller " +
        "som gjentakende inntekt."
    );
  }

  if (counts.missing > 0) {
    warnings.push(
      `${counts.missing} produkter fra tidligere står ikke i denne filen. De er ` +
        "beholdt, siden posteringer kan vise til dem."
    );
  }

  if (counts.skipped > 0) {
    warnings.push(`${counts.skipped} rader ble hoppet over.`);
  }

  return warnings;
}

function format(n: number): string {
  return `${Math.round(n).toLocaleString("nb-NO")} kr`;
}

/**
 * A row that sums the rows above it rather than describing a product.
 *
 * Word-bounded on purpose: a product legitimately called "Summer bag" or
 * "Totalstasjon" is not a subtotal, and the boundary is what separates them.
 */
function isSubtotal(name: string): boolean {
  return /^(sum|total|totalt|subtotal|delsum|i alt|sum av)\b/i.test(name.trim());
}

/**
 * "Ingen produktgruppe" and "Default Product Group" are what an export writes
 * when a product has no group. Stored as no group, so the customer page does
 * not show a category nobody chose.
 */
function normaliseGroup(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^(ingen|uten|none|default)\b/i.test(value)) return null;
  return value;
}

/**
 * "3000 (3100)" states the standard account and the VAT-free one. The first is
 * the account the sale is normally posted to.
 */
function parseAccount(raw: string): string | null {
  const match = raw.match(/\d{4}/);
  return match ? match[0] : null;
}

function describeMapping(sheet: Sheet, map: Record<string, number | undefined>) {
  const out: Record<string, string> = {};
  for (const [key, index] of Object.entries(map)) {
    if (index === undefined) continue;
    out[key] = sheet.headers[index] || `Kolonne ${index + 1}`;
  }
  return out;
}
