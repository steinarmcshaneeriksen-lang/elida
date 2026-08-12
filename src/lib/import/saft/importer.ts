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

  checkBalance(file, warnings);

  const ledger = await importLedger(supabase, companyId, file, warnings);
  counts.vouchers = ledger.vouchers;
  counts.transactions = ledger.transactions;

  return { header: file.header, counts, warnings };
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

  // Voucher source ids must be unique within the file; journal id disambiguates
  // systems that restart transaction numbering per journal.
  const voucherRows = transactions.map(({ journalId, transaction }) => ({
    company_id: companyId,
    voucher_number: transaction.voucherNumber,
    voucher_date: transaction.transactionDate,
    description: transaction.description,
    source_system: SAFT_SOURCE_SYSTEM,
    source_id: voucherSourceId(journalId, transaction.transactionId),
  }));

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

  const defaultCurrency = file.header.defaultCurrency;
  const lineRows: Record<string, unknown>[] = [];
  const missingAccounts = new Set<string>();

  for (const { journalId, transaction } of transactions) {
    const sourceId = voucherSourceId(journalId, transaction.transactionId);
    const voucherId = voucherIds.get(sourceId) ?? null;

    transaction.lines.forEach((line, index) => {
      const glAccountId = accountIds.get(line.accountId) ?? null;
      if (!glAccountId) missingAccounts.add(line.accountId);

      const transactionDate =
        line.valueDate ?? transaction.transactionDate;
      if (!transactionDate) return;

      lineRows.push({
        company_id: companyId,
        voucher_id: voucherId,
        gl_account_id: glAccountId,
        account_number: line.accountId,
        transaction_date: transactionDate,
        description: line.description ?? transaction.description,
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
        source_system: SAFT_SOURCE_SYSTEM,
        source_id: `${sourceId}:${line.recordId ?? index}`,
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
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
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
