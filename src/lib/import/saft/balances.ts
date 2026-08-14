/**
 * Balances per accounting year.
 *
 * A SAF-T file states opening and closing balances for the year it covers.
 * Those were being written straight onto gl_accounts, customers and suppliers,
 * which hold one value each — so importing 2025 after 2026 overwrote 2026's
 * balances with 2025's, and the dashboard went on calling them current. The
 * bank balance fell back to the 2025 year-end and receivables jumped to the
 * 2025 closing figure.
 *
 * Balances now live in entity_balances, one row per entity per year. A year
 * the file did not state is derived from one that did, by rolling the ledger
 * movement forward or backward:
 *
 *   closing(Y) = opening(Y) + movement(Y)
 *   opening(Y) = closing(Y-1)
 *
 * That identity is exact for a complete ledger, so importing either year's
 * file gives correct figures for both.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

const PAGE_SIZE = 1000;

export type EntityType = "account" | "customer" | "supplier";

export interface StatedBalance {
  entityKey: string;
  openingBalance: number | null;
  closingBalance: number | null;
}

interface BalanceRow {
  company_id: string;
  entity_type: EntityType;
  entity_key: string;
  year: number;
  opening_balance: number | null;
  closing_balance: number | null;
  source: "stated" | "derived";
}

/** Receivables sit on 1500–1599, payables on 2400–2499. */
const RECEIVABLE_RANGE: [number, number] = [1500, 1599];
const PAYABLE_RANGE: [number, number] = [2400, 2499];

/**
 * Writes the balances a file states for its own year, then rebuilds every
 * other year from the ledger.
 */
export async function recordBalances(
  supabase: DB,
  companyId: string,
  year: number,
  stated: {
    accounts: StatedBalance[];
    customers: StatedBalance[];
    suppliers: StatedBalance[];
  }
): Promise<{ years: number[]; derived: number }> {
  const rows: BalanceRow[] = [];

  const push = (type: EntityType, list: StatedBalance[]) => {
    for (const b of list) {
      if (b.openingBalance == null && b.closingBalance == null) continue;
      rows.push({
        company_id: companyId,
        entity_type: type,
        entity_key: b.entityKey,
        year,
        opening_balance: b.openingBalance,
        closing_balance: b.closingBalance,
        source: "stated",
      });
    }
  };

  push("account", stated.accounts);
  push("customer", stated.customers);
  push("supplier", stated.suppliers);

  await upsertBalances(supabase, rows);

  return deriveMissingYears(supabase, companyId);
}

/**
 * Fills in the years no file has stated, and refreshes the denormalised
 * columns on the parent tables so they describe the most recent year.
 */
export async function deriveMissingYears(
  supabase: DB,
  companyId: string
): Promise<{ years: number[]; derived: number }> {
  const movements = await loadMovements(supabase, companyId);
  const years = [...movements.years].sort((a, b) => a - b);

  if (years.length === 0) return { years: [], derived: 0 };

  const existing = await loadBalances(supabase, companyId);
  const derivedRows: BalanceRow[] = [];

  for (const [type, movementsByEntity] of [
    ["account", movements.accounts] as const,
    ["customer", movements.customers] as const,
    ["supplier", movements.suppliers] as const,
  ]) {
    // Every entity that has either a stated balance or any movement.
    const entities = new Set<string>([
      ...movementsByEntity.keys(),
      ...[...existing.keys()]
        .filter((k) => k.startsWith(`${type}:`))
        .map((k) => k.split(":").slice(1, -1).join(":")),
    ]);

    for (const entityKey of entities) {
      const byYear = movementsByEntity.get(entityKey) ?? new Map<number, number>();

      // An anchor is a year whose balances came from a file.
      const anchorYear = years.find(
        (y) => existing.get(key(type, entityKey, y))?.source === "stated"
      );
      if (anchorYear == null) continue;

      const anchor = existing.get(key(type, entityKey, anchorYear))!;

      // Roll forward from the anchor.
      let carry = anchor.closing_balance;
      for (const year of years.filter((y) => y > anchorYear)) {
        if (carry == null) break;
        const opening = carry;
        const closing = opening + (byYear.get(year) ?? 0);
        pushDerived(derivedRows, existing, companyId, type, entityKey, year, opening, closing);
        carry = closing;
      }

      // Roll backward from the anchor.
      carry = anchor.opening_balance;
      for (const year of years.filter((y) => y < anchorYear).reverse()) {
        if (carry == null) break;
        const closing = carry;
        const opening = closing - (byYear.get(year) ?? 0);
        pushDerived(derivedRows, existing, companyId, type, entityKey, year, opening, closing);
        carry = opening;
      }
    }
  }

  await upsertBalances(supabase, derivedRows);
  await refreshDenormalisedColumns(supabase, companyId, years[years.length - 1]);

  return { years, derived: derivedRows.length };
}

/** A stated balance is never replaced by a derived one. */
function pushDerived(
  out: BalanceRow[],
  existing: Map<string, { source: string; opening_balance: number | null; closing_balance: number | null }>,
  companyId: string,
  type: EntityType,
  entityKey: string,
  year: number,
  opening: number,
  closing: number
) {
  if (existing.get(key(type, entityKey, year))?.source === "stated") return;

  out.push({
    company_id: companyId,
    entity_type: type,
    entity_key: entityKey,
    year,
    opening_balance: round(opening),
    closing_balance: round(closing),
    source: "derived",
  });
}

function key(type: string, entityKey: string, year: number): string {
  return `${type}:${entityKey}:${year}`;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

interface Movements {
  years: Set<number>;
  accounts: Map<string, Map<number, number>>;
  customers: Map<string, Map<number, number>>;
  suppliers: Map<string, Map<number, number>>;
}

/**
 * Movement per entity per year.
 *
 * A customer's movement is what was posted to the receivable accounts in their
 * name; a supplier's is the payable side, sign-flipped so a positive figure
 * means "we owe them", matching how the balance is stored.
 */
async function loadMovements(supabase: DB, companyId: string): Promise<Movements> {
  const out: Movements = {
    years: new Set(),
    accounts: new Map(),
    customers: new Map(),
    suppliers: new Map(),
  };

  for (let page = 0; ; page++) {
    const { data, error } = (await supabase
      .from("account_transactions")
      .select("account_number, amount, transaction_date, customer_id, supplier_id")
      .eq("company_id", companyId)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)) as {
      data: Array<{
        account_number: string;
        amount: number;
        transaction_date: string;
        customer_id: string | null;
        supplier_id: string | null;
      }> | null;
      error: { message: string } | null;
    };

    if (error) throw new Error(`Kunne ikke lese posteringer: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const p of data) {
      const year = Number(p.transaction_date.slice(0, 4));
      if (!Number.isFinite(year)) continue;
      out.years.add(year);

      const amount = Number(p.amount);
      add(out.accounts, p.account_number, year, amount);

      const account = parseInt(p.account_number, 10);

      if (p.customer_id && inRange(account, RECEIVABLE_RANGE)) {
        add(out.customers, p.customer_id, year, amount);
      }

      if (p.supplier_id && inRange(account, PAYABLE_RANGE)) {
        add(out.suppliers, p.supplier_id, year, -amount);
      }
    }

    if (data.length < PAGE_SIZE) break;
  }

  return out;
}

function inRange(account: number, [from, to]: [number, number]): boolean {
  return account >= from && account <= to;
}

function add(
  map: Map<string, Map<number, number>>,
  entityKey: string,
  year: number,
  amount: number
) {
  let byYear = map.get(entityKey);
  if (!byYear) {
    byYear = new Map();
    map.set(entityKey, byYear);
  }
  byYear.set(year, (byYear.get(year) ?? 0) + amount);
}

async function loadBalances(supabase: DB, companyId: string) {
  const out = new Map<
    string,
    { source: string; opening_balance: number | null; closing_balance: number | null }
  >();

  for (let page = 0; ; page++) {
    const { data } = (await supabase
      .from("entity_balances")
      .select("entity_type, entity_key, year, opening_balance, closing_balance, source")
      .eq("company_id", companyId)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)) as {
      data: Array<{
        entity_type: string;
        entity_key: string;
        year: number;
        opening_balance: number | null;
        closing_balance: number | null;
        source: string;
      }> | null;
    };

    if (!data || data.length === 0) break;

    for (const b of data) {
      out.set(key(b.entity_type, b.entity_key, b.year), {
        source: b.source,
        opening_balance: b.opening_balance == null ? null : Number(b.opening_balance),
        closing_balance: b.closing_balance == null ? null : Number(b.closing_balance),
      });
    }

    if (data.length < PAGE_SIZE) break;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

async function upsertBalances(supabase: DB, rows: BalanceRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from("entity_balances")
      .upsert(rows.slice(i, i + 500) as never, {
        onConflict: "company_id,entity_type,entity_key,year",
      });

    if (error) throw new Error(`Kunne ikke lagre saldoer: ${error.message}`);
  }
}

/**
 * Copies the latest year's balances back onto gl_accounts, customers and
 * suppliers. Those columns are what the pages and the assistant read for
 * "current", so they must describe the most recent year rather than whichever
 * file happened to be imported last.
 */
async function refreshDenormalisedColumns(
  supabase: DB,
  companyId: string,
  latestYear: number
): Promise<void> {
  const { data } = (await supabase
    .from("entity_balances")
    .select("entity_type, entity_key, opening_balance, closing_balance")
    .eq("company_id", companyId)
    .eq("year", latestYear)
    .limit(1000)) as {
    data: Array<{
      entity_type: string;
      entity_key: string;
      opening_balance: number | null;
      closing_balance: number | null;
    }> | null;
  };

  if (!data) return;

  const byType = {
    account: [] as typeof data,
    customer: [] as typeof data,
    supplier: [] as typeof data,
  };

  for (const row of data) {
    const bucket = byType[row.entity_type as keyof typeof byType];
    if (bucket) bucket.push(row);
  }

  for (const row of byType.account) {
    await supabase
      .from("gl_accounts")
      .update({
        opening_balance: row.opening_balance,
        closing_balance: row.closing_balance,
      })
      .eq("company_id", companyId)
      .eq("account_number", row.entity_key);
  }

  for (const [table, rows] of [
    ["customers", byType.customer],
    ["suppliers", byType.supplier],
  ] as const) {
    for (const row of rows) {
      await supabase
        .from(table)
        .update({
          opening_balance: row.opening_balance,
          closing_balance: row.closing_balance,
        })
        .eq("company_id", companyId)
        .eq("id", row.entity_key);
    }
  }
}

/** The balances for one year, for a reader that knows which year it wants. */
export async function balancesForYear(
  supabase: DB,
  companyId: string,
  year: number,
  entityType: EntityType
): Promise<Map<string, { opening: number | null; closing: number | null }>> {
  const out = new Map<string, { opening: number | null; closing: number | null }>();

  for (let page = 0; ; page++) {
    const { data } = (await supabase
      .from("entity_balances")
      .select("entity_key, opening_balance, closing_balance")
      .eq("company_id", companyId)
      .eq("entity_type", entityType)
      .eq("year", year)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)) as {
      data: Array<{
        entity_key: string;
        opening_balance: number | null;
        closing_balance: number | null;
      }> | null;
    };

    if (!data || data.length === 0) break;

    for (const row of data) {
      out.set(row.entity_key, {
        opening: row.opening_balance == null ? null : Number(row.opening_balance),
        closing: row.closing_balance == null ? null : Number(row.closing_balance),
      });
    }

    if (data.length < PAGE_SIZE) break;
  }

  return out;
}
