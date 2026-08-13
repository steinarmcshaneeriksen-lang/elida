/**
 * Recurring invoice contracts from a spreadsheet.
 *
 * MRR was being inferred from posting text, which counted one-off work whose
 * description happened to read like a subscription: 398 880 against an actual
 * 358 188. A recurring-invoice export states each contract — customer, amount,
 * how often, whether it is live — so where one exists nothing has to be
 * guessed.
 *
 * The columns are identified by meaning rather than position, so an export
 * with its own column order, extra columns or a title above the table imports
 * without being reshaped first.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mapColumns,
  parseContractStatus,
  parseInterval,
  shapes,
  intervalLabel,
  type ColumnMap,
  type FieldSpec,
} from "./columns";
import { resolveColumns, resolveInterval, type ResolvedColumns } from "./resolve";
import type { AiFieldSpec } from "./ai-mapper";
import { fetchAll } from "@/lib/supabase/paginate";
import {
  parseBoolean,
  parseDate,
  parseNumber,
  text,
  type CellValue,
  type Sheet,
} from "./read";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

const FIELDS: FieldSpec[] = [
  {
    key: "customer_name",
    names: ["kundenavn", "kunde", "customer name", "customer", "navn", "client"],
    excludes: ["kundenr", "kundenummer", "customer no", "selger"],
    shape: shapes.name,
  },
  {
    key: "customer_number",
    names: ["kundenr", "kundenummer", "customer no", "customer number", "kunde nr"],
  },
  {
    key: "org_number",
    names: ["organisasjonsnr", "orgnr", "org nr", "organisasjonsnummer", "vat number"],
    shape: shapes.orgNumber,
  },
  {
    key: "interval",
    names: ["repeterer", "intervall", "frekvens", "gjentakelse", "interval", "frequency", "recurrence", "periode"],
    shape: shapes.interval,
  },
  {
    // Net is the figure MRR is built on: run rate is quoted excluding VAT.
    key: "net_amount",
    names: ["nettobelop", "netto belop", "netto", "net amount", "belop eks mva", "eks mva", "net"],
    excludes: ["bruttofortjeneste", "fortjeneste", "margin", "kostpris", "cost"],
    shape: shapes.amount,
  },
  {
    key: "gross_amount",
    names: ["total", "bruttobelop", "brutto", "gross", "sum", "belop inkl mva", "inkl mva"],
    excludes: ["bruttofortjeneste", "fortjeneste", "margin"],
    shape: shapes.amount,
  },
  {
    key: "active",
    names: ["aktiv", "active", "status aktiv", "er aktiv"],
    shape: shapes.boolean,
  },
  {
    key: "invoice_status",
    names: ["faktura vil bli", "fakturastatus", "status", "invoice status"],
  },
  {
    key: "next_invoice_date",
    names: ["neste fakturadato", "neste faktura", "next invoice", "neste dato", "fakturadato"],
    shape: shapes.date,
  },
  {
    key: "description",
    names: ["beskrivelse", "produkt", "tekst", "description", "product", "vare", "varenavn"],
    // Reference numbers identify a contract, they do not describe it.
    excludes: ["nr", "nummer", "no"],
  },
  { key: "seller", names: ["selger", "seller", "ansvarlig", "account manager"] },
  { key: "department", names: ["avdeling", "avdelingsnavn", "department"] },
];

/**
 * The same fields, described so a model can recognise them in an export whose
 * wording no synonym list anticipated — a Fiken, Tripletex or English-language
 * file. Descriptions say what the column means, not what it is called.
 */
const AI_FIELDS: AiFieldSpec[] = [
  {
    key: "customer_name",
    description: "Navnet på kunden avtalen gjelder. Ikke selger eller kontaktperson.",
    required: true,
    expect: "text",
  },
  { key: "customer_number", description: "Kundenummer eller kundekode.", expect: "text" },
  { key: "org_number", description: "Kundens organisasjonsnummer, ni siffer.", expect: "text" },
  {
    key: "interval",
    description:
      "Hvor ofte avtalen faktureres: månedlig, kvartalsvis, årlig, hver tredje måned og så videre.",
    required: true,
    expect: "interval",
  },
  {
    key: "net_amount",
    description:
      "Beløpet som faktureres hver gang, EKSKLUSIV merverdiavgift. Ikke fortjeneste, margin, kostpris eller dekningsbidrag.",
    required: true,
    expect: "number",
  },
  {
    key: "gross_amount",
    description: "Samme beløp inklusiv merverdiavgift, hvis filen har det.",
    expect: "number",
  },
  {
    key: "active",
    description: "Om avtalen er aktiv eller avsluttet. Typisk ja/nei.",
    expect: "boolean",
  },
  {
    key: "invoice_status",
    description:
      "Om fakturaen sendes automatisk eller lages som utkast. Utkast betyr at den ikke faktureres av seg selv.",
    expect: "text",
  },
  {
    key: "next_invoice_date",
    description: "Neste gang avtalen skal faktureres.",
    expect: "date",
  },
  {
    key: "description",
    description: "Hva avtalen gjelder — produkt, tjeneste eller abonnement. Ikke et referansenummer.",
    expect: "text",
  },
  { key: "seller", description: "Selger eller kundeansvarlig.", expect: "text" },
  { key: "department", description: "Avdeling eller sted avtalen hører til.", expect: "text" },
];

export interface RecurringContract {
  customerName: string;
  customerNumber: string | null;
  orgNumber: string | null;
  description: string | null;
  intervalMonths: number;
  netAmount: number;
  grossAmount: number | null;
  isActive: boolean;
  isDraft: boolean;
  nextInvoiceDate: string | null;
  seller: string | null;
  department: string | null;
  sourceId: string;
}

export interface RecurringParseResult {
  contracts: RecurringContract[];
  /** Which column each field was read from, so the import can be explained. */
  mapping: Record<string, string>;
  skipped: Array<{ row: number; reason: string }>;
  mrr: number;
  byInterval: Array<{ label: string; months: number; count: number; mrr: number }>;
  /** How the columns were identified, and anything the model was unsure of. */
  interpretation: {
    method: ResolvedColumns["method"];
    documentKind: string | null;
    notes: string[];
    rejected: string[];
  };
}

/**
 * How strongly a sheet looks like a list of recurring contracts. Used to pick
 * the right sheet and to refuse a file that is something else entirely.
 */
export function scoreRecurringSheet(sheet: Sheet): number {
  const map = mapColumns(sheet.headers, sheet.rows, FIELDS);

  let score = 0;
  if (map.interval !== undefined) score += 3;
  if (map.net_amount !== undefined || map.gross_amount !== undefined) score += 2;
  if (map.customer_name !== undefined) score += 2;
  if (map.next_invoice_date !== undefined) score += 1;

  // The interval column has to actually parse, not merely be named plausibly.
  if (map.interval !== undefined) {
    const parsed = sheet.rows.filter(
      (r) => parseInterval(text(r[map.interval!])) != null
    ).length;
    score += (parsed / Math.max(sheet.rows.length, 1)) * 3;
  }

  return score;
}

/**
 * Reads a sheet into contracts.
 *
 * Column identification goes through the resolver, which tries the synonym
 * rules first and only asks the model when they fall short — so a familiar
 * export costs nothing and an unfamiliar one still imports.
 */
export async function parseRecurringSheet(
  sheet: Sheet
): Promise<RecurringParseResult> {
  const resolved = await resolveColumns(sheet, {
    fields: FIELDS,
    aiFields: AI_FIELDS,
    required: ["customer_name", "interval", "net_amount"],
    documentHint:
      "en liste over gjentakende eller repeterende fakturaer, én rad per avtale",
  });

  const map: ColumnMap = resolved.map;

  const contracts: RecurringContract[] = [];
  const skipped: Array<{ row: number; reason: string }> = [];

  const cell = (row: CellValue[], field: string): CellValue =>
    map[field] === undefined ? null : (row[map[field]!] ?? null);

  sheet.rows.forEach((row, index) => {
    const rowNumber = sheet.headerRowIndex + 2 + index;

    const customerName = text(cell(row, "customer_name"));
    if (!customerName) {
      skipped.push({ row: rowNumber, reason: "Mangler kundenavn" });
      return;
    }

    const intervalMonths = resolveInterval(
      cell(row, "interval"),
      resolved.intervalMonths
    );
    if (intervalMonths == null) {
      skipped.push({
        row: rowNumber,
        reason: `Forsto ikke intervallet «${text(cell(row, "interval"))}»`,
      });
      return;
    }

    const gross = parseNumber(cell(row, "gross_amount"));
    let net = parseNumber(cell(row, "net_amount"));

    // Some exports give only the gross figure. Standard VAT is the honest
    // assumption, and the caller is told it was made.
    if (net == null && gross != null) net = gross / 1.25;

    if (net == null) {
      skipped.push({ row: rowNumber, reason: "Mangler beløp" });
      return;
    }

    const active = parseBoolean(cell(row, "active"));
    const status = parseContractStatus(text(cell(row, "invoice_status")));

    contracts.push({
      customerName,
      customerNumber: text(cell(row, "customer_number")) || null,
      orgNumber: text(cell(row, "org_number")).replace(/\s/g, "") || null,
      description: text(cell(row, "description")) || null,
      intervalMonths,
      netAmount: Math.round(net * 100) / 100,
      grossAmount: gross == null ? null : Math.round(gross * 100) / 100,
      // Absent an "active" column, the status column decides; absent both, a
      // listed contract is taken as active. Some systems mark a stopped
      // contract only in the status column, and counting those would inflate
      // the run rate.
      isActive: active ?? status !== "inactive",
      // A contract that produces a draft is not invoiced until someone sends
      // it, so it is held out of the run rate too.
      isDraft: status === "draft",
      nextInvoiceDate: parseDate(cell(row, "next_invoice_date")),
      seller: text(cell(row, "seller")) || null,
      department: text(cell(row, "department")) || null,
      sourceId: buildSourceId(customerName, row, map, index),
    });
  });

  const counted = contracts.filter((c) => c.isActive && !c.isDraft);
  const mrr = counted.reduce((t, c) => t + c.netAmount / c.intervalMonths, 0);

  const grouped = new Map<number, { count: number; mrr: number }>();
  for (const c of counted) {
    const entry = grouped.get(c.intervalMonths) ?? { count: 0, mrr: 0 };
    entry.count++;
    entry.mrr += c.netAmount / c.intervalMonths;
    grouped.set(c.intervalMonths, entry);
  }

  const mapping: Record<string, string> = {};
  for (const [field, column] of Object.entries(map)) {
    if (column !== undefined) mapping[field] = sheet.headers[column] || `Kolonne ${column + 1}`;
  }

  return {
    contracts,
    mapping,
    skipped,
    mrr: Math.round(mrr),
    byInterval: [...grouped.entries()]
      .sort(([a], [b]) => a - b)
      .map(([months, v]) => ({
        months,
        label: intervalLabel(months),
        count: v.count,
        mrr: Math.round(v.mrr),
      })),
    interpretation: {
      method: resolved.method,
      documentKind: resolved.documentKind,
      notes: resolved.notes,
      rejected: resolved.rejected,
    },
  };
}

/**
 * A stable identity for a contract so re-importing updates rather than
 * duplicates. The export carries no contract id, so the identity is built from
 * the fields that distinguish one line from another — a customer can hold
 * several contracts differing only by department or amount.
 */
function buildSourceId(
  customerName: string,
  row: CellValue[],
  map: ColumnMap,
  index: number
): string {
  const parts = [
    customerName,
    map.customer_number !== undefined ? text(row[map.customer_number]) : "",
    map.department !== undefined ? text(row[map.department]) : "",
    map.description !== undefined ? text(row[map.description]) : "",
    map.interval !== undefined ? text(row[map.interval]) : "",
    map.net_amount !== undefined ? text(row[map.net_amount]) : "",
  ]
    .map((p) => p.trim())
    .filter(Boolean);

  // Two identical lines would otherwise collapse into one.
  return `${parts.join("|")}#${index}`;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export interface RecurringImportResult extends RecurringParseResult {
  written: number;
  matchedCustomers: number;
  removed: number;
}

export async function importRecurringContracts(
  supabase: DB,
  companyId: string,
  parsed: RecurringParseResult
): Promise<RecurringImportResult> {
  // Contracts are matched to customers so the customer page can show what a
  // customer pays every month, not only what they have been invoiced.
  type CustomerRow = {
    id: string;
    name: string;
    customer_number: string | null;
    org_number: string | null;
  };

  const customers = await fetchAll<CustomerRow>(
    (from, to) =>
      supabase
        .from("customers")
        .select("id, name, customer_number, org_number")
        .eq("company_id", companyId)
        .order("id", { ascending: true })
        .range(from, to) as PromiseLike<{
        data: CustomerRow[] | null;
        error: { message: string } | null;
      }>,
    { label: "kunder" }
  );

  const byOrg = new Map<string, string>();
  const byNumber = new Map<string, string>();
  const byName = new Map<string, string>();

  for (const c of customers) {
    if (c.org_number) byOrg.set(c.org_number.replace(/\s/g, ""), c.id);
    if (c.customer_number) byNumber.set(c.customer_number.trim(), c.id);
    byName.set(c.name.trim().toLowerCase(), c.id);
  }

  let matched = 0;

  const rows = parsed.contracts.map((c) => {
    const customerId =
      (c.orgNumber ? byOrg.get(c.orgNumber) : undefined) ??
      (c.customerNumber ? byNumber.get(c.customerNumber) : undefined) ??
      byName.get(c.customerName.trim().toLowerCase()) ??
      null;

    if (customerId) matched++;

    return {
      company_id: companyId,
      customer_id: customerId,
      customer_name: c.customerName,
      customer_number: c.customerNumber,
      org_number: c.orgNumber,
      description: c.description,
      interval_months: c.intervalMonths,
      net_amount: c.netAmount,
      gross_amount: c.grossAmount,
      is_active: c.isActive,
      is_draft: c.isDraft,
      next_invoice_date: c.nextInvoiceDate,
      seller: c.seller,
      department: c.department,
      source_system: "spreadsheet",
      source_id: c.sourceId,
      imported_at: new Date().toISOString(),
    };
  });

  // The uploaded list is the whole truth about what recurs today: a contract
  // that has ended is absent from it, and must not linger in the run rate.
  const { count: before } = await supabase
    .from("recurring_contracts")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);

  await supabase
    .from("recurring_contracts")
    .delete()
    .eq("company_id", companyId)
    .eq("source_system", "spreadsheet");

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from("recurring_contracts")
      .insert(rows.slice(i, i + 500) as never);

    if (error) {
      throw new Error(`Kunne ikke lagre kontraktene: ${error.message}`);
    }
  }

  return {
    ...parsed,
    written: rows.length,
    matchedCustomers: matched,
    removed: Math.max((before ?? 0) - rows.length, 0),
  };
}
