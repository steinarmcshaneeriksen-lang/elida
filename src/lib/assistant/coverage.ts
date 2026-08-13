/**
 * What the company's books actually contain.
 *
 * Asked "hvordan går det denne måneden" in August against a file covering
 * January to June, the assistant used to find no snapshot for August and
 * answer that nothing had been imported at all — with a list of import
 * instructions for data that was already there. Every handler now resolves
 * coverage first, so a period outside the books is reported as exactly that,
 * with the period the books do cover.
 */

import { createClient } from "@/lib/supabase/server";

export interface Coverage {
  has_data: boolean;
  /**
   * Earliest posting, and the date the bookkeeping runs to.
   *
   * `last_date` is deliberately not the last posting date. An export taken in
   * August carries forward-dated periodisations into December; answering
   * "how is the year going" against a period stretched to December compares
   * eight months of trading with a full year and reports a collapse that did
   * not happen. It is the period end the metrics were computed for, which
   * `resolveDataWindow` has already cut at the last month of real bookkeeping.
   */
  first_date: string | null;
  last_date: string | null;
  /** The genuinely last posting, forward-dated entries included. */
  last_posting_date: string | null;
  /** Accounting years with computed figures, newest first. */
  years: Array<{ year: number; start: string; end: string; is_complete: boolean }>;
  counts: {
    transactions: number;
    accounts: number;
    customers: number;
    suppliers: number;
    recurring_products: number;
  };
  last_import: string | null;
}

const EMPTY: Coverage = {
  has_data: false,
  first_date: null,
  last_date: null,
  last_posting_date: null,
  years: [],
  counts: {
    transactions: 0,
    accounts: 0,
    customers: 0,
    suppliers: 0,
    recurring_products: 0,
  },
  last_import: null,
};

export async function getCoverage(companyId: string): Promise<Coverage> {
  try {
    const supabase = await createClient();

    const [
      first,
      last,
      bookkeepingEnd,
      years,
      txCount,
      accounts,
      customers,
      suppliers,
      products,
      imports,
    ] =
      await Promise.all([
        supabase
          .from("account_transactions")
          .select("transaction_date")
          .eq("company_id", companyId)
          .order("transaction_date", { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("account_transactions")
          .select("transaction_date")
          .eq("company_id", companyId)
          .order("transaction_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
        // Where the books end, as decided when the metrics were computed —
        // cheaper than re-reading every posting on each chat turn.
        supabase
          .from("financial_metric_snapshots")
          .select("period_end")
          .eq("company_id", companyId)
          .eq("period_type", "ytd")
          .order("period_end", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("financial_years")
          .select("year, start_date, end_date, is_closed")
          .eq("company_id", companyId)
          .order("year", { ascending: false }),
        supabase
          .from("account_transactions")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId),
        supabase
          .from("gl_accounts")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId),
        supabase
          .from("customers")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId),
        supabase
          .from("suppliers")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId),
        supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("is_recurring", true),
        supabase
          .from("import_runs")
          .select("started_at")
          .eq("company_id", companyId)
          .eq("status", "completed")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    const firstDate = first.data?.transaction_date ?? null;
    const lastPosting = last.data?.transaction_date ?? null;
    const periodEnd =
      (bookkeepingEnd.data as { period_end?: string } | null)?.period_end ?? null;

    // Fall back to the last posting only when no metrics exist yet — right
    // after an import, before they have been computed.
    const lastDate = periodEnd ?? lastPosting;

    return {
      has_data: firstDate != null,
      first_date: firstDate,
      last_date: lastDate,
      last_posting_date: lastPosting,
      years: (years.data ?? []).map((y) => ({
        year: y.year,
        start: y.start_date,
        end: y.end_date,
        is_complete: y.is_closed ?? false,
      })),
      counts: {
        transactions: txCount.count ?? 0,
        accounts: accounts.count ?? 0,
        customers: customers.count ?? 0,
        suppliers: suppliers.count ?? 0,
        recurring_products: products.count ?? 0,
      },
      last_import: imports.data?.started_at ?? null,
    };
  } catch {
    return EMPTY;
  }
}

/**
 * Narrows a requested period to what the books hold.
 *
 * `outside` means the request and the books do not overlap at all — the caller
 * should answer about the period it does have rather than reporting nothing.
 */
export function clampToCoverage(
  requested: { start: string; end: string },
  coverage: Coverage
): { start: string; end: string; outside: boolean; adjusted: boolean } {
  if (!coverage.first_date || !coverage.last_date) {
    return { ...requested, outside: false, adjusted: false };
  }

  if (requested.end < coverage.first_date || requested.start > coverage.last_date) {
    return {
      start: coverage.first_date,
      end: coverage.last_date,
      outside: true,
      adjusted: true,
    };
  }

  const start = requested.start < coverage.first_date ? coverage.first_date : requested.start;
  const end = requested.end > coverage.last_date ? coverage.last_date : requested.end;

  return {
    start,
    end,
    outside: false,
    adjusted: start !== requested.start || end !== requested.end,
  };
}

/** The note a handler attaches when the asked-for period is not in the books. */
export function coverageNote(
  requested: { start: string; end: string },
  resolved: { start: string; end: string; outside: boolean; adjusted: boolean },
  coverage: Coverage
): string | undefined {
  if (!coverage.has_data) {
    return (
      "Ingen regnskapsdata er importert for dette selskapet ennå. Be brukeren " +
      "importere en SAF-T-fil under «Importer data». Ikke oppgi tall."
    );
  }

  if (resolved.outside) {
    return (
      `Regnskapet inneholder ingen posteringer i perioden brukeren spurte om ` +
      `(${requested.start}–${requested.end}). Regnskapet dekker ` +
      `${coverage.first_date}–${coverage.last_date}. Tallene under gjelder hele den ` +
      `perioden. Si tydelig hvilken periode svaret gjelder, og at det ikke finnes ` +
      `data for perioden det ble spurt om. Ikke be brukeren importere på nytt.`
    );
  }

  if (resolved.adjusted) {
    return (
      `Perioden er avkortet til det regnskapet dekker: ${resolved.start}–${resolved.end}. ` +
      `Si hvilken periode tallene gjelder.`
    );
  }

  return undefined;
}
