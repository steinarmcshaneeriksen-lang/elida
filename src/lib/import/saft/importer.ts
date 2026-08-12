/**
 * SAF-T importer
 *
 * Writes a parsed SAF-T file into the company's ledger tables.
 *
 * Everything is upserted on (company_id, source_system, source_id), so
 * re-importing the same file — or a later export covering an overlapping
 * period — updates existing rows instead of duplicating them.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SaftFile,
  SaftImportCounts,
  SaftImportResult,
} from "./types";
import { isDepartmentType, isProjectType } from "./parser";
import { computeCompanyMetrics } from "@/lib/metrics/compute";
import {
  buildKnownNameMatcher,
  isNameBearingAccount,
  looksLikePrivatePerson,
  redactPersonalNames,
} from "./redact";

export const SAFT_SOURCE_SYSTEM = "saft";

/** Supabase rejects very large single statements; insert in batches. */
const BATCH_SIZE = 500;

/**
 * The importer addresses tables by name at runtime, which the generated
 * client types cannot express (they require literal table names). Callers pass
 * a normally-typed client; internally we work through this relaxed view.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

export async function importSaft(
  supabase: DB,
  companyId: string,
  file: SaftFile
): Promise<SaftImportResult> {
  const warnings: string[] = [];
  const counts: SaftImportCounts = {
    accounts: 0,
    customers: 0,
    suppliers: 0,
    taxCodes: 0,
    departments: 0,
    projects: 0,
    vouchers: 0,
    transactions: 0,
  };

  counts.accounts = await importAccounts(supabase, companyId, file);
  counts.customers = await importCustomers(supabase, companyId, file);
  counts.suppliers = await importSuppliers(supabase, companyId, file);
  counts.taxCodes = await importTaxCodes(supabase, companyId, file);

  const { departments, projects } = await importDimensions(
    supabase,
    companyId,
    file,
    warnings
  );
  counts.departments = departments;
  counts.projects = projects;

  reportPartyBalances(file, warnings);
  checkBalance(file, warnings);

  const ledger = await importLedger(supabase, companyId, file, warnings);
  counts.vouchers = ledger.vouchers;
  counts.transactions = ledger.transactions;

  // Recompute across every year held, not just the one just imported, so
  // uploading an earlier year backfills the comparison on years already here.
  const metrics = await computeCompanyMetrics(supabase, companyId);
  const years = metrics.years;

  if (years.length > 0) {
    warnings.push(
      years.length === 1
        ? `Regnskapsdata for ${years[0]} er nå tilgjengelig. Last opp foregående år for å få sammenligning mot i fjor.`
        : `Regnskapsdata for ${years.join(", ")} er nå tilgjengelig. ` +
          `Sammenligning mot foregående år er beregnet for ${metrics.yearsWithComparison.join(", ")}.`
    );
  }

  return { header: file.header, counts, warnings, years };
}

/**
 * Whether the file states a balance per customer and supplier decides whether
 * Elida can answer "what does this customer owe us". Saying so at import time
 * is better than leaving the question to be discovered on an empty column.
 */
function reportPartyBalances(file: SaftFile, warnings: string[]): void {
  const withBalance = (parties: { closingBalance: number | null }[]) =>
    parties.filter((p) => p.closingBalance != null).length;

  const customers = withBalance(file.customers);
  const suppliers = withBalance(file.suppliers);

  if (file.customers.length > 0 && customers === 0) {
    warnings.push(
      "Filen oppgir ingen saldo per kunde, så Elida kan ikke vise hva den " +
        "enkelte kunden skylder. Totalt utestående for selskapet beregnes " +
        "likevel fra kontosaldoene."
    );
  }
  if (file.suppliers.length > 0 && suppliers === 0) {
    warnings.push(
      "Filen oppgir ingen saldo per leverandør. Totalen beregnes fra " +
        "kontosaldoene."
    );
  }
  if (customers > 0 || suppliers > 0) {
    warnings.push(
      `Saldo funnet for ${customers} kunder og ${suppliers} leverandører.`
    );
  }
}

/**
 * A complete SAF-T export is double-entry: debits and credits net to zero.
 * A non-zero sum means the export is partial or truncated, which would make
 * every downstream figure wrong — so say so rather than importing silently.
 */
function checkBalance(file: SaftFile, warnings: string[]): void {
  const lines = file.journals
    .flatMap((j) => j.transactions)
    .flatMap((t) => t.lines);
  if (lines.length === 0) return;

  const sum = lines.reduce((total, line) => total + line.amount, 0);

  // Tolerate ordinary rounding across many lines, not a real imbalance.
  const tolerance = Math.max(1, lines.length * 0.005);
  if (Math.abs(sum) > tolerance) {
    warnings.push(
      `Filen balanserer ikke: debet minus kredit er ${sum.toLocaleString("nb-NO", {
        maximumFractionDigits: 2,
      })} kr (skal være 0). ` +
        "Dette tyder på at eksporten er ufullstendig. Tallene i Elida kan bli feil — " +
        "kontroller eksporten fra regnskapssystemet."
    );
  }
}

// ---------------------------------------------------------------------------
// Master data
// ---------------------------------------------------------------------------

async function importAccounts(
  supabase: DB,
  companyId: string,
  file: SaftFile
): Promise<number> {
  if (file.accounts.length === 0) return 0;

  const rows = file.accounts.map((a) => ({
    company_id: companyId,
    account_number: a.accountId,
    name: a.description ?? a.accountId,
    description: a.standardAccountId
      ? `Standardkonto: ${a.standardAccountId}`
      : null,
    account_type: a.accountType,
    is_active: true,
    opening_balance: a.openingBalance,
    closing_balance: a.closingBalance,
    source_system: SAFT_SOURCE_SYSTEM,
    source_id: a.accountId,
  }));

  await upsertBatched(supabase, "gl_accounts", rows, "company_id,account_number");
  return rows.length;
}

async function importCustomers(
  supabase: DB,
  companyId: string,
  file: SaftFile
): Promise<number> {
  if (file.customers.length === 0) return 0;

  const rows = file.customers.map((c) => ({
    company_id: companyId,
    name: c.name,
    customer_number: c.partyId,
    org_number: c.registrationNumber,
    email: c.email,
    phone: c.phone,
    address: c.address,
    is_active: true,
    // Receivables are debit-normal, so the netted balance is already
    // positive when the customer owes us.
    opening_balance: c.openingBalance,
    closing_balance: c.closingBalance,
    source_system: SAFT_SOURCE_SYSTEM,
    source_id: c.partyId,
  }));

  await upsertBatched(
    supabase,
    "customers",
    rows,
    "company_id,source_system,source_id"
  );
  return rows.length;
}

async function importSuppliers(
  supabase: DB,
  companyId: string,
  file: SaftFile
): Promise<number> {
  if (file.suppliers.length === 0) return 0;

  const rows = file.suppliers.map((s) => ({
    company_id: companyId,
    name: s.name,
    supplier_number: s.partyId,
    org_number: s.registrationNumber,
    email: s.email,
    phone: s.phone,
    address: s.address,
    country: s.country,
    is_active: true,
    // Payables are credit-normal; flip so a positive figure reads as "we
    // owe this supplier", matching how the customer balance reads.
    opening_balance: s.openingBalance == null ? null : -s.openingBalance,
    closing_balance: s.closingBalance == null ? null : -s.closingBalance,
    // Suppliers without a valid organisation number are usually employees
    // registered for expense reimbursement. Flagged for the user to review.
    is_possible_private_person: looksLikePrivatePerson(s.registrationNumber),
    source_system: SAFT_SOURCE_SYSTEM,
    source_id: s.partyId,
  }));

  await upsertBatched(
    supabase,
    "suppliers",
    rows,
    "company_id,source_system,source_id"
  );
  return rows.length;
}

async function importTaxCodes(
  supabase: DB,
  companyId: string,
  file: SaftFile
): Promise<number> {
  if (file.taxCodes.length === 0) return 0;

  const rows = file.taxCodes.map((t) => ({
    company_id: companyId,
    code: t.code,
    name: t.description,
    description: t.description,
    rate: t.percentage,
    saft_code: t.standardCode,
    is_active: true,
    source_system: SAFT_SOURCE_SYSTEM,
    source_id: t.code,
  }));

  await upsertBatched(supabase, "vat_codes", rows, "company_id,code");
  return rows.length;
}

async function importDimensions(
  supabase: DB,
  companyId: string,
  file: SaftFile,
  warnings: string[]
): Promise<{ departments: number; projects: number }> {
  const departments = file.analysisEntries.filter((e) =>
    isDepartmentType(e.analysisType)
  );
  const projects = file.analysisEntries.filter((e) =>
    isProjectType(e.analysisType)
  );

  const unclassified = file.analysisEntries.filter(
    (e) => !isDepartmentType(e.analysisType) && !isProjectType(e.analysisType)
  );
  if (unclassified.length > 0) {
    const types = [...new Set(unclassified.map((e) => e.analysisType))];
    warnings.push(
      `Dimensjonstypene ${types.join(", ")} ble ikke gjenkjent som avdeling eller prosjekt, og er ikke importert.`
    );
  }

  if (departments.length > 0) {
    await upsertBatched(
      supabase,
      "departments",
      departments.map((d) => ({
        company_id: companyId,
        code: d.analysisId,
        name: d.description ?? d.analysisId,
        is_active: true,
        source_system: SAFT_SOURCE_SYSTEM,
        source_id: d.analysisId,
      })),
      "company_id,source_system,source_id"
    );
  }

  if (projects.length > 0) {
    await upsertBatched(
      supabase,
      "projects",
      projects.map((p) => ({
        company_id: companyId,
        code: p.analysisId,
        name: p.description ?? p.analysisId,
        is_active: true,
        source_system: SAFT_SOURCE_SYSTEM,
        source_id: p.analysisId,
      })),
      "company_id,source_system,source_id"
    );
  }

  return { departments: departments.length, projects: projects.length };
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

async function importLedger(
  supabase: DB,
  companyId: string,
  file: SaftFile,
  warnings: string[]
): Promise<{ vouchers: number; transactions: number }> {
  const transactions = file.journals.flatMap((j) =>
    j.transactions.map((t) => ({ journalId: j.journalId, transaction: t }))
  );
  if (transactions.length === 0) {
    warnings.push("Filen inneholder ingen posteringer.");
    return { vouchers: 0, transactions: 0 };
  }

  const knownNamesForVouchers = buildKnownNameMatcher(
    file.suppliers
      .filter((s) => looksLikePrivatePerson(s.registrationNumber))
      .map((s) => s.name)
  );

  // A file may carry several <Transaction> elements sharing one TransactionID
  // within a journal — they describe one voucher, entered in parts. Group them
  // so the voucher is written once and none of its lines are lost.
  const voucherGroups = new Map<
    string,
    { journalId: string | null; transactions: typeof transactions }
  >();

  for (const entry of transactions) {
    const sourceId = voucherSourceId(
      entry.journalId,
      entry.transaction.transactionId
    );
    const group = voucherGroups.get(sourceId);
    if (group) group.transactions.push(entry);
    else
      voucherGroups.set(sourceId, {
        journalId: entry.journalId,
        transactions: [entry],
      });
  }

  const mergedCount = transactions.length - voucherGroups.size;
  if (mergedCount > 0) {
    warnings.push(
      `${mergedCount} posteringsgrupper delte bilagsnummer og er slått sammen ` +
        "til ett bilag hver. Alle linjer er beholdt."
    );
  }

  const voucherRows = [...voucherGroups.entries()].map(([sourceId, group]) => {
    const first = group.transactions[0].transaction;
    const allLines = group.transactions.flatMap((t) => t.transaction.lines);

    return {
      company_id: companyId,
      voucher_number: first.voucherNumber,
      voucher_date: first.transactionDate,
      // A voucher spans several accounts, so the payroll heuristic cannot be
      // scoped safely here; apply it when any line touches a payroll account.
      description: redactPersonalNames(first.description, {
        knownNames: knownNamesForVouchers,
        applyHeuristic: allLines.some((l) => isNameBearingAccount(l.accountId)),
      }),
      source_system: SAFT_SOURCE_SYSTEM,
      source_id: sourceId,
    };
  });

  await upsertBatched(
    supabase,
    "vouchers",
    voucherRows,
    "company_id,source_system,source_id"
  );

  // Map voucher source ids back to the primary keys the ledger lines reference.
  const voucherIds = await fetchIdMap(
    supabase,
    "vouchers",
    companyId,
    voucherRows.map((v) => v.source_id)
  );

  const accountIds = await fetchAccountIdMap(supabase, companyId);
  const departmentIds = await fetchIdMap(supabase, "departments", companyId);
  const projectIds = await fetchIdMap(supabase, "projects", companyId);
  // Ledger lines name the party by its source id; resolve to our row ids so
  // activity can be attributed per customer and supplier.
  const customerIds = await fetchIdMap(supabase, "customers", companyId);
  const supplierIds = await fetchIdMap(supabase, "suppliers", companyId);

  // Names of parties recorded without an organisation number. These are known
  // private individuals, so they can be matched exactly in any description.
  const knownNames = buildKnownNameMatcher(
    file.suppliers
      .filter((s) => looksLikePrivatePerson(s.registrationNumber))
      .map((s) => s.name)
  );

  const defaultCurrency = file.header.defaultCurrency;
  const lineRows: Record<string, unknown>[] = [];
  const missingAccounts = new Set<string>();
  let redactedCount = 0;

  // RecordID is only unique within one <Transaction>, so merged vouchers can
  // repeat it. A line id that collided would be silently collapsed by the
  // upsert dedupe and the posting would be lost, so uniqueness is enforced
  // per voucher here.
  const usedLineIds = new Set<string>();

  const nextLineId = (voucherSource: string, recordId: string | null, index: number) => {
    const base = `${voucherSource}:${recordId ?? index}`;
    if (!usedLineIds.has(base)) {
      usedLineIds.add(base);
      return base;
    }
    let suffix = 2;
    while (usedLineIds.has(`${base}#${suffix}`)) suffix++;
    const unique = `${base}#${suffix}`;
    usedLineIds.add(unique);
    return unique;
  };

  for (const { journalId, transaction } of transactions) {
    const sourceId = voucherSourceId(journalId, transaction.transactionId);
    const voucherId = voucherIds.get(sourceId) ?? null;

    transaction.lines.forEach((line, index) => {
      const glAccountId = accountIds.get(line.accountId) ?? null;
      if (!glAccountId) missingAccounts.add(line.accountId);

      const transactionDate =
        line.valueDate ?? transaction.transactionDate;
      if (!transactionDate) return;

      const rawDescription = line.description ?? transaction.description;
      const description = redactPersonalNames(rawDescription, {
        knownNames,
        applyHeuristic: isNameBearingAccount(line.accountId),
      });
      if (description !== rawDescription) redactedCount++;

      lineRows.push({
        company_id: companyId,
        voucher_id: voucherId,
        gl_account_id: glAccountId,
        account_number: line.accountId,
        transaction_date: transactionDate,
        description,
        amount: line.amount,
        currency: line.currency ?? defaultCurrency,
        currency_amount: line.currencyAmount,
        vat_code: line.vatCode,
        vat_amount: line.vatAmount,
        department_id: line.departmentCode
          ? (departmentIds.get(line.departmentCode) ?? null)
          : null,
        project_id: line.projectCode
          ? (projectIds.get(line.projectCode) ?? null)
          : null,
        customer_id: line.customerId
          ? (customerIds.get(line.customerId) ?? null)
          : null,
        supplier_id: line.supplierId
          ? (supplierIds.get(line.supplierId) ?? null)
          : null,
        source_system: SAFT_SOURCE_SYSTEM,
        source_id: nextLineId(sourceId, line.recordId, index),
      });
    });
  }

  if (missingAccounts.size > 0) {
    warnings.push(
      `${missingAccounts.size} kontonummer i posteringene finnes ikke i kontoplanen ` +
        `(f.eks. ${[...missingAccounts].slice(0, 5).join(", ")}). ` +
        "Posteringene er importert, men uten kobling til konto."
    );
  }

  if (redactedCount > 0) {
    warnings.push(
      `Personnavn ble maskert i ${redactedCount} beskrivelser på lønns- og ` +
        "refusjonsposteringer. Beløp, konto og dato er beholdt uendret."
    );
  }

  const flaggedSuppliers = file.suppliers.filter((s) =>
    looksLikePrivatePerson(s.registrationNumber)
  ).length;
  if (flaggedSuppliers > 0) {
    warnings.push(
      `${flaggedSuppliers} leverandører mangler gyldig organisasjonsnummer og ` +
        "kan være privatpersoner. De er merket for gjennomgang under Innstillinger."
    );
  }

  await upsertBatched(
    supabase,
    "account_transactions",
    lineRows,
    "company_id,source_system,source_id"
  );

  return { vouchers: voucherRows.length, transactions: lineRows.length };
}

function voucherSourceId(
  journalId: string | null,
  transactionId: string | null
): string {
  return `${journalId ?? "J"}:${transactionId ?? "T"}`;
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

async function upsertBatched(
  supabase: DB,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string
): Promise<void> {
  // Postgres refuses to update the same row twice in one statement
  // ("ON CONFLICT DO UPDATE command cannot affect row a second time"), and
  // real exports do repeat identifiers. Collapse duplicates on the conflict
  // key first, keeping the last occurrence.
  const deduped = dedupeByConflictKey(rows, onConflict);

  for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
    const batch = deduped.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from(table)
      .upsert(batch as never, { onConflict });

    if (error) {
      throw new Error(
        `Kunne ikke lagre ${table}: ${error.message}`
      );
    }
  }
}

function dedupeByConflictKey(
  rows: Record<string, unknown>[],
  onConflict: string
): Record<string, unknown>[] {
  const columns = onConflict.split(",").map((c) => c.trim());
  const seen = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    const key = columns.map((c) => String(row[c] ?? "")).join("\u0000");
    seen.set(key, row);
  }

  return [...seen.values()];
}

/** Maps source_id -> row id for rows this import owns. */
async function fetchIdMap(
  supabase: DB,
  table: string,
  companyId: string,
  sourceIds?: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  const load = async (ids?: string[]) => {
    let query = supabase
      .from(table)
      .select("id, source_id")
      .eq("company_id", companyId)
      .eq("source_system", SAFT_SOURCE_SYSTEM);

    if (ids) query = query.in("source_id", ids);

    const { data, error } = (await query) as {
      data: Array<{ id: string; source_id: string | null }> | null;
      error: { message: string } | null;
    };
    if (error) throw new Error(`Kunne ikke lese ${table}: ${error.message}`);

    for (const row of data ?? []) {
      if (row.source_id) map.set(row.source_id, row.id);
    }
  };

  if (sourceIds) {
    const unique = [...new Set(sourceIds)];
    for (let i = 0; i < unique.length; i += BATCH_SIZE) {
      await load(unique.slice(i, i + BATCH_SIZE));
    }
  } else {
    await load();
  }

  return map;
}

/** Maps account_number -> gl_accounts.id (accounts are keyed by number). */
async function fetchAccountIdMap(
  supabase: DB,
  companyId: string
): Promise<Map<string, string>> {
  const { data, error } = (await supabase
    .from("gl_accounts")
    .select("id, account_number")
    .eq("company_id", companyId)) as {
    data: Array<{ id: string; account_number: string }> | null;
    error: { message: string } | null;
  };

  if (error) throw new Error(`Kunne ikke lese kontoplan: ${error.message}`);

  const map = new Map<string, string>();
  for (const row of data ?? []) map.set(row.account_number, row.id);
  return map;
}
