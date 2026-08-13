/**
 * Assistant Tool Handlers
 *
 * Each handler takes (companyId, params) and returns structured JSON.
 * All queries enforce tenant isolation via company_id filtering.
 *
 * Handlers attempt to query Supabase for real data and fall back to
 * an explicit no-data response when nothing has been imported, so the
 * assistant says so rather than inventing figures.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeFilterTerm } from "@/lib/supabase/filter";
import { getBudget, proposeBudgetChange } from "./budget-tools";
import {
  clampToCoverage,
  coverageNote,
  getCoverage,
  type Coverage,
} from "./coverage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ToolParams = Record<string, unknown>;
type ToolResult = Record<string, unknown>;
type ToolHandler = (companyId: string, params: ToolParams) => Promise<ToolResult>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * The one no-data response. It always states what the books do contain, so the
 * assistant never tells someone to import a file they have already imported.
 */
function noData(coverage: Coverage): ToolResult {
  if (coverage.has_data) {
    return {
      data_source: "saft_import",
      note:
        `Regnskapet dekker ${coverage.first_date}–${coverage.last_date}, men dette ` +
        "verktøyet fant ingen tall å returnere. Si hva regnskapet dekker framfor " +
        "å be brukeren importere på nytt.",
    };
  }

  return {
    data_source: "no_data",
    note:
      "Ingen regnskapsdata er importert for dette selskapet ennå. " +
      "Fortell brukeren dette og be dem importere en SAF-T-fil under " +
      "«Importer data». Ikke oppgi tall.",
  };
}

function inRange(accountNumber: string, from: number, to: number): boolean {
  const account = parseInt(accountNumber, 10);
  return account >= from && account <= to;
}

async function customerSummary(companyId: string) {
  const supabase = await createClient();
  return supabase.rpc("company_customer_summary" as never, {
    p_company_id: companyId,
  } as never) as unknown as Promise<{
    data: Array<{
      customer_id: string;
      revenue: number;
      outstanding: number;
      posting_count: number;
      last_activity: string | null;
    }> | null;
  }>;
}

async function supplierSummary(companyId: string) {
  const supabase = await createClient();
  return supabase.rpc("company_supplier_summary" as never, {
    p_company_id: companyId,
  } as never) as unknown as Promise<{
    data: Array<{
      supplier_id: string;
      cost: number;
      outstanding: number;
      posting_count: number;
      last_activity: string | null;
    }> | null;
  }>;
}

function parsePeriodDates(period: string): { start: string; end: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  switch (period) {
    case "this_month": {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0);
      return { start: fmt(start), end: fmt(end) };
    }
    case "last_month": {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0);
      return { start: fmt(start), end: fmt(end) };
    }
    case "this_quarter": {
      const qStart = Math.floor(month / 3) * 3;
      const start = new Date(year, qStart, 1);
      const end = new Date(year, qStart + 3, 0);
      return { start: fmt(start), end: fmt(end) };
    }
    case "last_quarter": {
      const qStart = Math.floor(month / 3) * 3 - 3;
      const start = new Date(year, qStart, 1);
      const end = new Date(year, qStart + 3, 0);
      return { start: fmt(start), end: fmt(end) };
    }
    case "this_year":
      return { start: `${year}-01-01`, end: `${year}-12-31` };
    case "last_year":
      return {
        start: `${year - 1}-01-01`,
        end: `${year - 1}-12-31`,
      };
    case "ytd":
      return { start: `${year}-01-01`, end: fmt(now) };
    default: {
      // YYYY-MM format
      const mmMatch = period.match(/^(\d{4})-(\d{2})$/);
      if (mmMatch) {
        const y = parseInt(mmMatch[1]);
        const m = parseInt(mmMatch[2]) - 1;
        const start = new Date(y, m, 1);
        const end = new Date(y, m + 1, 0);
        return { start: fmt(start), end: fmt(end) };
      }
      // YYYY-QN format
      const qMatch = period.match(/^(\d{4})-Q(\d)$/);
      if (qMatch) {
        const y = parseInt(qMatch[1]);
        const q = parseInt(qMatch[2]);
        const qm = (q - 1) * 3;
        const start = new Date(y, qm, 1);
        const end = new Date(y, qm + 3, 0);
        return { start: fmt(start), end: fmt(end) };
      }
      // Fallback to current month
      return parsePeriodDates("this_month");
    }
  }
}

function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * Computed from the ledger for whatever period is asked for, rather than
 * looked up among precomputed snapshots. The snapshot lookup only matched
 * whole accounting years, so "hvordan går det denne måneden" fell through to
 * a no-data answer even with six months of postings loaded.
 */
const getFinancialSummary: ToolHandler = async (companyId, params) => {
  const coverage = await getCoverage(companyId);
  if (!coverage.has_data) return noData(coverage);

  const requested = parsePeriodDates(params.period as string);
  const resolved = clampToCoverage(requested, coverage);
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("account_transactions")
    .select("account_number, amount")
    .eq("company_id", companyId)
    .gte("transaction_date", resolved.start)
    .lte("transaction_date", resolved.end)
    .gte("account_number", "3000")
    .lt("account_number", "9000");

  // Revenue is credited and so carries a negative sign in a debit-positive
  // ledger; costs are debited. Both are reported as the positive figures a
  // person expects to read.
  let revenue = 0;
  let costs = 0;
  for (const r of rows ?? []) {
    const amount = Number(r.amount);
    if (inRange(r.account_number, 3000, 3999)) revenue -= amount;
    else if (inRange(r.account_number, 4000, 7999)) costs += amount;
  }

  const cash = (await getCashPosition(companyId, {})) as { booked_cash?: number };
  const receivables = (await getCustomerReceivables(companyId, {})) as {
    total_outstanding?: { amount: number };
  };
  const payables = (await getSupplierPayables(companyId, {})) as {
    total_payables?: { amount: number };
  };

  return {
    period: { start: resolved.start, end: resolved.end },
    requested_period: requested,
    books_cover: { start: coverage.first_date, end: coverage.last_date },
    revenue: Math.round(revenue),
    costs: Math.round(costs),
    operating_profit: Math.round(revenue - costs),
    operating_margin:
      revenue !== 0 ? Math.round(((revenue - costs) / revenue) * 1000) / 10 : null,
    booked_cash: cash.booked_cash ?? null,
    receivables: receivables.total_outstanding?.amount ?? null,
    payables: payables.total_payables?.amount ?? null,
    transaction_count: rows?.length ?? 0,
    note: coverageNote(requested, resolved, coverage),
    data_source: "saft_import",
  };
};

const getRevenueAnalysis: ToolHandler = async (companyId, params) => {
  const coverage = await getCoverage(companyId);
  if (!coverage.has_data) return noData(coverage);

  const requested = parsePeriodDates(params.period as string);
  const resolved = clampToCoverage(requested, coverage);

  const supabase = await createClient();
  const { data: transactions } = await supabase
    .from("account_transactions")
    .select("account_number, amount, transaction_date, description")
    .eq("company_id", companyId)
    .gte("transaction_date", resolved.start)
    .lte("transaction_date", resolved.end)
    .gte("account_number", "3000")
    .lt("account_number", "4000");

  const rows = transactions ?? [];
  const total = rows.reduce((sum, t) => sum - Number(t.amount), 0);

  const byAccount = new Map<string, number>();
  const byMonth = new Map<string, number>();
  for (const t of rows) {
    byAccount.set(
      t.account_number,
      (byAccount.get(t.account_number) ?? 0) - Number(t.amount)
    );
    const month = t.transaction_date.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) - Number(t.amount));
  }

  // Account names, so the answer can say "Salgsinntekt" rather than "3000".
  const { data: accounts } = await supabase
    .from("gl_accounts")
    .select("account_number, name")
    .eq("company_id", companyId)
    .in("account_number", [...byAccount.keys()].slice(0, 200));

  const names = new Map((accounts ?? []).map((a) => [a.account_number, a.name]));

  return {
    period: { start: resolved.start, end: resolved.end },
    requested_period: requested,
    total_revenue: { amount: Math.round(total), currency: "NOK" },
    by_account: [...byAccount.entries()]
      .map(([account_number, amount]) => ({
        account_number,
        name: names.get(account_number) ?? null,
        amount: Math.round(amount),
      }))
      .sort((a, b) => b.amount - a.amount),
    by_month: [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount: Math.round(amount) })),
    transaction_count: rows.length,
    note: coverageNote(requested, resolved, coverage),
    data_source: "saft_import",
  };
};

/**
 * Profit for the asked-for period, with the same period a year earlier
 * alongside it when the books reach that far back — the comparison is what
 * makes the figure mean something.
 */
const getProfitAnalysis: ToolHandler = async (companyId, params) => {
  const coverage = await getCoverage(companyId);
  if (!coverage.has_data) return noData(coverage);

  const requested = parsePeriodDates(params.period as string);
  const resolved = clampToCoverage(requested, coverage);

  const current = await profitFor(companyId, resolved.start, resolved.end);

  const priorRange = {
    start: shiftYear(resolved.start, -1),
    end: shiftYear(resolved.end, -1),
  };
  const priorInBooks =
    coverage.first_date != null &&
    coverage.last_date != null &&
    priorRange.end >= coverage.first_date &&
    priorRange.start <= coverage.last_date;

  const prior = priorInBooks
    ? await profitFor(companyId, priorRange.start, priorRange.end)
    : null;

  const change =
    prior && prior.operating_profit !== 0
      ? Math.round(
          ((current.operating_profit - prior.operating_profit) /
            Math.abs(prior.operating_profit)) *
            1000
        ) / 10
      : null;

  return {
    period: { start: resolved.start, end: resolved.end },
    revenue: current.revenue,
    cost_of_goods: current.cogs,
    gross_profit: current.revenue - current.cogs,
    payroll_costs: current.payroll,
    other_operating_costs: current.other,
    operating_profit: current.operating_profit,
    operating_margin:
      current.revenue !== 0
        ? Math.round((current.operating_profit / current.revenue) * 1000) / 10
        : null,
    comparison: prior
      ? {
          period: priorRange,
          revenue: prior.revenue,
          operating_profit: prior.operating_profit,
          change_percent: change,
        }
      : null,
    comparison_available: prior != null,
    note:
      coverageNote(requested, resolved, coverage) ??
      (prior
        ? undefined
        : "Fjoråret er ikke importert, så det finnes ingen sammenligning. Ikke " +
          "presenter en endring i prosent."),
    data_source: "saft_import",
  };
};

/** Revenue and cost totals for a date range, split the way a P&L reads. */
async function profitFor(companyId: string, start: string, end: string) {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("account_transactions")
    .select("account_number, amount")
    .eq("company_id", companyId)
    .gte("transaction_date", start)
    .lte("transaction_date", end)
    .gte("account_number", "3000")
    .lt("account_number", "8000");

  let revenue = 0;
  let cogs = 0;
  let payroll = 0;
  let other = 0;

  for (const r of rows ?? []) {
    const amount = Number(r.amount);
    if (inRange(r.account_number, 3000, 3999)) revenue -= amount;
    else if (inRange(r.account_number, 4000, 4999)) cogs += amount;
    else if (inRange(r.account_number, 5000, 5999)) payroll += amount;
    else other += amount;
  }

  return {
    revenue: Math.round(revenue),
    cogs: Math.round(cogs),
    payroll: Math.round(payroll),
    other: Math.round(other),
    operating_profit: Math.round(revenue - cogs - payroll - other),
  };
}

function shiftYear(date: string, years: number): string {
  const [y, m, d] = date.split("-");
  return `${Number(y) + years}-${m}-${d}`;
}

const COST_CATEGORIES: Array<{ from: number; to: number; label: string }> = [
  { from: 4000, to: 4999, label: "Varekostnad" },
  { from: 5000, to: 5999, label: "Lønnskostnader" },
  { from: 6000, to: 6099, label: "Avskrivninger" },
  { from: 6100, to: 6399, label: "Lokaler, leie og drift" },
  { from: 6400, to: 6799, label: "Utstyr, verktøy og tjenester" },
  { from: 6800, to: 6999, label: "Kontor, telefon og porto" },
  { from: 7000, to: 7099, label: "Bil og transport" },
  { from: 7100, to: 7299, label: "Reise, diett og representasjon" },
  { from: 7300, to: 7499, label: "Salg, reklame og kontingenter" },
  { from: 7500, to: 7999, label: "Forsikring og andre kostnader" },
];

const getCostAnalysis: ToolHandler = async (companyId, params) => {
  const coverage = await getCoverage(companyId);
  if (!coverage.has_data) return noData(coverage);

  const requested = parsePeriodDates(params.period as string);
  const resolved = clampToCoverage(requested, coverage);

  const supabase = await createClient();
  const { data: transactions } = await supabase
    .from("account_transactions")
    .select("account_number, amount")
    .eq("company_id", companyId)
    .gte("transaction_date", resolved.start)
    .lte("transaction_date", resolved.end)
    .gte("account_number", "4000")
    .lt("account_number", "8000");

  const rows = transactions ?? [];
  const total = rows.reduce((sum, t) => sum + Number(t.amount), 0);

  const byCategory = new Map<string, number>();
  const byAccount = new Map<string, number>();
  for (const t of rows) {
    const num = parseInt(t.account_number, 10);
    const category =
      COST_CATEGORIES.find((c) => num >= c.from && num <= c.to)?.label ??
      "Andre driftskostnader";
    byCategory.set(category, (byCategory.get(category) ?? 0) + Number(t.amount));
    byAccount.set(
      t.account_number,
      (byAccount.get(t.account_number) ?? 0) + Number(t.amount)
    );
  }

  const { data: accounts } = await supabase
    .from("gl_accounts")
    .select("account_number, name")
    .eq("company_id", companyId)
    .in("account_number", [...byAccount.keys()].slice(0, 200));

  const names = new Map((accounts ?? []).map((a) => [a.account_number, a.name]));

  return {
    period: { start: resolved.start, end: resolved.end },
    total_costs: { amount: Math.round(total), currency: "NOK" },
    by_category: [...byCategory.entries()]
      .map(([category, amount]) => ({ category, amount: Math.round(amount) }))
      .sort((a, b) => b.amount - a.amount),
    largest_accounts: [...byAccount.entries()]
      .map(([account_number, amount]) => ({
        account_number,
        name: names.get(account_number) ?? null,
        amount: Math.round(amount),
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 20),
    note: coverageNote(requested, resolved, coverage),
    data_source: "saft_import",
  };
};

/**
 * Accepts a single account, an account range like "6000-6999", or a named
 * category. The previous version matched on an exact account number only, so
 * every category name the tool description advertised returned nothing.
 */
const getAccountBreakdown: ToolHandler = async (companyId, params) => {
  const coverage = await getCoverage(companyId);
  if (!coverage.has_data) return noData(coverage);

  const requested = parsePeriodDates(params.period as string);
  const resolved = clampToCoverage(requested, coverage);
  const raw = String(params.account_or_category ?? "").trim();

  const named: Record<string, [number, number]> = {
    revenue: [3000, 3999],
    inntekter: [3000, 3999],
    omsetning: [3000, 3999],
    varekostnad: [4000, 4999],
    salary_costs: [5000, 5999],
    lonn: [5000, 5999],
    lønn: [5000, 5999],
    driftskostnader: [6000, 7999],
    bank: [1900, 1999],
    kundefordringer: [1500, 1599],
    leverandorgjeld: [2400, 2499],
    leverandørgjeld: [2400, 2499],
  };

  let from: string;
  let to: string;

  const rangeMatch = raw.match(/^(\d{4})\s*-\s*(\d{4})$/);
  const singleMatch = raw.match(/^(\d{4})$/);
  const key = raw.toLowerCase().replace(/\s+/g, "_");

  if (singleMatch) {
    from = to = singleMatch[1];
  } else if (rangeMatch) {
    from = rangeMatch[1];
    to = rangeMatch[2];
  } else if (named[key]) {
    from = String(named[key][0]);
    to = String(named[key][1]);
  } else {
    return {
      error: `Forsto ikke «${raw}». Oppgi et kontonummer (f.eks. 6300), et intervall (6000-6999) eller en kategori: ${Object.keys(named).join(", ")}.`,
    };
  }

  const supabase = await createClient();
  const { data: transactions } = await supabase
    .from("account_transactions")
    .select("transaction_date, account_number, description, amount, vat_code")
    .eq("company_id", companyId)
    .gte("account_number", from)
    .lte("account_number", to)
    .gte("transaction_date", resolved.start)
    .lte("transaction_date", resolved.end)
    .order("transaction_date", { ascending: false })
    .limit(200);

  const rows = transactions ?? [];
  const byMonth = new Map<string, number>();
  for (const t of rows) {
    const month = t.transaction_date.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + Number(t.amount));
  }

  return {
    accounts: from === to ? from : `${from}-${to}`,
    period: { start: resolved.start, end: resolved.end },
    total: {
      amount: Math.round(rows.reduce((sum, t) => sum + Number(t.amount), 0)),
      currency: "NOK",
    },
    transaction_count: rows.length,
    by_month: [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount: Math.round(amount) })),
    transactions: rows.slice(0, 50).map((t) => ({
      date: t.transaction_date,
      account: t.account_number,
      description: t.description,
      amount: Number(t.amount),
      vat_code: t.vat_code,
    })),
    note: coverageNote(requested, resolved, coverage),
    data_source: "saft_import",
  };
};

/**
 * Receivables come from the balance the accounting system states per customer
 * in the SAF-T file, which is what they actually owe. The older version read
 * customer_ledger_entries — a table a SAF-T import never writes — so it always
 * reported that nothing had been imported.
 *
 * SAF-T states a balance, not the invoices behind it, so there is no due date
 * to age against. Saying so is more useful than an ageing bucket built on a
 * guess.
 */
const getCustomerReceivables: ToolHandler = async (companyId) => {
  const coverage = await getCoverage(companyId);
  if (!coverage.has_data) return noData(coverage);

  const supabase = await createClient();

  const [{ data: customers }, { data: summary }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, customer_number, org_number, closing_balance")
      .eq("company_id", companyId)
      .eq("is_active", true),
    customerSummary(companyId),
  ]);

  const byId = new Map((summary ?? []).map((s) => [s.customer_id, s]));

  const rows = (customers ?? [])
    .map((c) => ({
      customer_id: c.id,
      name: c.name,
      customer_number: c.customer_number,
      outstanding: c.closing_balance ?? null,
      outstanding_is_stated: c.closing_balance != null,
      revenue_in_period: Number(byId.get(c.id)?.revenue ?? 0),
      last_activity: byId.get(c.id)?.last_activity ?? null,
    }))
    .filter((r) => (r.outstanding ?? 0) !== 0)
    .sort((a, b) => (b.outstanding ?? 0) - (a.outstanding ?? 0));

  return {
    as_of: coverage.last_date,
    total_outstanding: {
      amount: Math.round(rows.reduce((t, r) => t + (r.outstanding ?? 0), 0)),
      currency: "NOK",
    },
    customer_count: rows.length,
    customers: rows.slice(0, 25),
    ageing_available: false,
    note:
      "Saldoene er kundesaldoene regnskapssystemet oppgir i SAF-T-filen per " +
      `${coverage.last_date}. Filen inneholder ikke forfallsdato per faktura, ` +
      "så aldersfordeling (0–30, 31–60 dager) kan ikke beregnes. Ikke oppgi " +
      "aldersfordeling eller antall dager over forfall.",
    data_source: "saft_import",
  };
};

/**
 * Looks a customer up by name — the assistant has a name from the user, never
 * a database id, so the previous id-only tool could not be called at all.
 */
const getCustomerDetail: ToolHandler = async (companyId, params) => {
  const coverage = await getCoverage(companyId);
  if (!coverage.has_data) return noData(coverage);

  const name = String(params.name ?? "").trim();
  if (!name) return { error: "Mangler kundenavn." };

  const supabase = await createClient();

  const { data: matches } = await supabase
    .from("customers")
    .select("id, name, customer_number, org_number, email, phone, closing_balance")
    .eq("company_id", companyId)
    .ilike("name", `%${sanitizeFilterTerm(name)}%`)
    .limit(10);

  if (!matches || matches.length === 0) {
    return {
      found: false,
      note: `Ingen kunde med navn som ligner «${name}». Bruk list_customers for å se hvilke kunder som finnes.`,
    };
  }

  if (matches.length > 1) {
    const exact = matches.find(
      (m) => m.name.toLowerCase() === name.toLowerCase()
    );
    if (!exact) {
      return {
        found: false,
        ambiguous: true,
        candidates: matches.map((m) => m.name),
        note: "Flere kunder matcher. Spør brukeren hvilken de mener.",
      };
    }
    matches.splice(0, matches.length, exact);
  }

  const customer = matches[0];

  const { data: postings } = await supabase
    .from("account_transactions")
    .select("transaction_date, account_number, amount, description")
    .eq("company_id", companyId)
    .eq("customer_id", customer.id)
    .order("transaction_date", { ascending: false })
    .limit(400);

  const rows = postings ?? [];
  const revenueRows = rows.filter((r) => inRange(r.account_number, 3000, 3999));

  const byMonth = new Map<string, number>();
  for (const r of revenueRows) {
    const month = r.transaction_date.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) - r.amount);
  }

  const byProduct = new Map<string, number>();
  for (const r of revenueRows) {
    const key = r.description?.trim() || "(uten beskrivelse)";
    byProduct.set(key, (byProduct.get(key) ?? 0) - r.amount);
  }

  return {
    found: true,
    customer: {
      name: customer.name,
      customer_number: customer.customer_number,
      org_number: customer.org_number,
      email: customer.email,
    },
    outstanding: customer.closing_balance ?? null,
    outstanding_is_stated: customer.closing_balance != null,
    revenue_in_period: Math.round(
      revenueRows.reduce((t, r) => t - r.amount, 0)
    ),
    period: { start: coverage.first_date, end: coverage.last_date },
    posting_count: rows.length,
    last_activity: rows[0]?.transaction_date ?? null,
    revenue_by_month: [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount: Math.round(amount) })),
    buys: [...byProduct.entries()]
      .map(([description, amount]) => ({ description, amount: Math.round(amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 15),
    data_source: "saft_import",
  };
};

/** The customer list, so the assistant can answer "hvem er våre største kunder". */
const listCustomers: ToolHandler = async (companyId, params) => {
  const coverage = await getCoverage(companyId);
  if (!coverage.has_data) return noData(coverage);

  const sortBy = params.sort_by === "outstanding" ? "outstanding" : "revenue";
  const limit = Math.min(Number(params.limit ?? 20) || 20, 100);

  const supabase = await createClient();
  const [{ data: customers }, { data: summary }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, customer_number, org_number, closing_balance")
      .eq("company_id", companyId)
      .eq("is_active", true),
    customerSummary(companyId),
  ]);

  const byId = new Map((summary ?? []).map((s) => [s.customer_id, s]));

  const rows = (customers ?? [])
    .map((c) => ({
      name: c.name,
      customer_number: c.customer_number,
      revenue: Math.round(Number(byId.get(c.id)?.revenue ?? 0)),
      outstanding: c.closing_balance ?? null,
      last_activity: byId.get(c.id)?.last_activity ?? null,
    }))
    .sort((a, b) =>
      sortBy === "outstanding"
        ? (b.outstanding ?? 0) - (a.outstanding ?? 0)
        : b.revenue - a.revenue
    );

  return {
    period: { start: coverage.first_date, end: coverage.last_date },
    total_customers: rows.length,
    total_revenue: rows.reduce((t, r) => t + r.revenue, 0),
    customers: rows.slice(0, limit),
    data_source: "saft_import",
  };
};

/**
 * SAF-T does not carry invoice-level due dates, so "forfalt" cannot be
 * derived. Reporting that plainly stops the assistant inventing an ageing
 * profile out of posting dates.
 */
const getOverdueInvoices: ToolHandler = async (companyId) => {
  const coverage = await getCoverage(companyId);
  if (!coverage.has_data) return noData(coverage);

  return {
    available: false,
    note:
      "Regnskapsdataene kommer fra en SAF-T-fil. Den oppgir saldo per kunde, " +
      "men ikke enkeltfakturaer med forfallsdato, så det går ikke å si hva " +
      "som er forfalt. Fortell brukeren dette, og bruk get_customer_receivables " +
      "for å vise hvem som har utestående saldo. Ikke oppgi forfalte beløp " +
      "eller dager over forfall.",
    data_source: "saft_import",
  };
};

const getSupplierPayables: ToolHandler = async (companyId) => {
  const coverage = await getCoverage(companyId);
  if (!coverage.has_data) return noData(coverage);

  const supabase = await createClient();

  const [{ data: suppliers }, { data: summary }] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name, supplier_number, org_number, closing_balance")
      .eq("company_id", companyId)
      .eq("is_active", true),
    supplierSummary(companyId),
  ]);

  const byId = new Map((summary ?? []).map((s) => [s.supplier_id, s]));

  const rows = (suppliers ?? [])
    .map((s) => ({
      name: s.name,
      supplier_number: s.supplier_number,
      owed: s.closing_balance ?? null,
      cost_in_period: Math.round(Number(byId.get(s.id)?.cost ?? 0)),
      last_activity: byId.get(s.id)?.last_activity ?? null,
    }))
    .sort((a, b) => (b.owed ?? 0) - (a.owed ?? 0));

  const withBalance = rows.filter((r) => (r.owed ?? 0) !== 0);

  return {
    as_of: coverage.last_date,
    total_payables: {
      amount: Math.round(withBalance.reduce((t, r) => t + (r.owed ?? 0), 0)),
      currency: "NOK",
    },
    supplier_count: withBalance.length,
    suppliers_by_balance: withBalance.slice(0, 25),
    suppliers_by_cost: [...rows]
      .sort((a, b) => b.cost_in_period - a.cost_in_period)
      .slice(0, 25),
    period: { start: coverage.first_date, end: coverage.last_date },
    ageing_available: false,
    note:
      "Saldoene er leverandørsaldoene SAF-T-filen oppgir per " +
      `${coverage.last_date}. Filen har ikke forfallsdato per faktura, så ` +
      "aldersfordeling og forfallsoversikt kan ikke beregnes.",
    data_source: "saft_import",
  };
};

const getUpcomingObligations: ToolHandler = async (companyId, params) => {
  const days = (params.days as number) || 30;
  const coverage = await getCoverage(companyId);
  if (!coverage.has_data) return noData(coverage);

  const payables = (await getSupplierPayables(companyId, {})) as {
    total_payables?: { amount: number };
  };

  return {
    horizon_days: days,
    scheduled_obligations_available: false,
    total_payables_outstanding: payables.total_payables?.amount ?? 0,
    note:
      "SAF-T-filen inneholder ikke forfallsdatoer, så konkrete forfall de " +
      `neste ${days} dagene kan ikke listes. Det som er kjent er samlet ` +
      "leverandørgjeld per siste dag i regnskapet. Si dette tydelig framfor " +
      "å anslå et forfallsbilde.",
    data_source: "saft_import",
  };
};

/**
 * Recurring revenue — the figure this business is run on, and previously
 * unreachable for the assistant even though the dashboard showed it.
 */
const getRecurringRevenue: ToolHandler = async (companyId) => {
  const coverage = await getCoverage(companyId);
  const supabase = await createClient();

  // A contract list states the run rate outright. Inferring it from posting
  // text counts one-off work that reads like a subscription, so where
  // contracts exist they are the answer and the ledger is not consulted.
  const { data: contracts } = await supabase
    .from("recurring_contracts")
    .select(
      "customer_name, description, interval_months, net_amount, gross_amount, is_active, is_draft, next_invoice_date"
    )
    .eq("company_id", companyId);

  const counted = (contracts ?? []).filter((c) => c.is_active && !c.is_draft);

  if (counted.length > 0) {
    const net = counted.reduce(
      (t, c) => t + Number(c.net_amount) / c.interval_months,
      0
    );

    const byInterval = new Map<number, { count: number; mrr: number }>();
    for (const c of counted) {
      const entry = byInterval.get(c.interval_months) ?? { count: 0, mrr: 0 };
      entry.count++;
      entry.mrr += Number(c.net_amount) / c.interval_months;
      byInterval.set(c.interval_months, entry);
    }

    const top = [...counted]
      .sort(
        (a, b) =>
          Number(b.net_amount) / b.interval_months -
          Number(a.net_amount) / a.interval_months
      )
      .slice(0, 15)
      .map((c) => ({
        customer: c.customer_name,
        monthly_value: Math.round(Number(c.net_amount) / c.interval_months),
        invoiced_amount: Number(c.net_amount),
        interval_months: c.interval_months,
        next_invoice_date: c.next_invoice_date,
      }));

    return {
      source: "contract_list",
      mrr: Math.round(net),
      arr: Math.round(net) * 12,
      contracts: {
        total: contracts?.length ?? 0,
        counted: counted.length,
        drafts: (contracts ?? []).filter((c) => c.is_draft).length,
        inactive: (contracts ?? []).filter((c) => !c.is_active).length,
      },
      by_interval: [...byInterval.entries()]
        .sort(([a], [b]) => a - b)
        .map(([months, v]) => ({
          interval_months: months,
          count: v.count,
          mrr: Math.round(v.mrr),
        })),
      largest_contracts: top,
      note:
        "Alle beløp er eks. mva. MRR er beregnet fra den opplastede listen over " +
        "gjentakende fakturaer: beløp per faktura delt på antall måneder mellom " +
        "hver fakturering. Avtaler som står som utkast eller er inaktive er ikke " +
        "med. Dette er et sikkert tall, ikke et estimat.",
      data_source: "contract_list",
    };
  }

  if (!coverage.has_data) return noData(coverage);
  const { data } = (await supabase.rpc("company_mrr" as never, {
    p_company_id: companyId,
  } as never)) as unknown as {
    data: Array<{
      month: string;
      recurring: number;
      normalised_mrr: number;
      one_off: number;
      total: number;
      is_complete: boolean;
    }> | null;
  };

  const months = (data ?? []).map((m) => ({
    month: m.month.slice(0, 7),
    normalised_mrr: Math.round(Number(m.normalised_mrr)),
    billed_recurring: Math.round(Number(m.recurring)),
    one_off: Math.round(Number(m.one_off)),
    total_revenue: Math.round(Number(m.total)),
    is_complete: m.is_complete,
  }));

  const complete = months.filter((m) => m.is_complete);
  const latest = complete[complete.length - 1] ?? null;
  const previous = complete[complete.length - 2] ?? null;

  return {
    mrr: latest
      ? {
          month: latest.month,
          value: latest.normalised_mrr,
          arr: latest.normalised_mrr * 12,
          previous_month: previous?.normalised_mrr ?? null,
          change_percent:
            previous && previous.normalised_mrr
              ? Math.round(
                  ((latest.normalised_mrr - previous.normalised_mrr) /
                    previous.normalised_mrr) *
                    10000
                ) / 100
              : null,
          share_of_revenue: latest.total_revenue
            ? Math.round((latest.normalised_mrr / latest.total_revenue) * 100)
            : null,
        }
      : null,
    months,
    based_on_product_list: coverage.counts.recurring_products > 0,
    note:
      coverage.counts.recurring_products > 0
        ? "MRR er beregnet fra produktlisten: kvartals-, halvårs- og årskontrakter " +
          "er normalisert ned til månedsbeløp. Alle beløp er eks. mva."
        : "Ingen liste over gjentakende fakturaer er lastet opp, så tallet er utledet " +
          "fra posteringstekst og er USIKKERT — det teller med engangssalg som ligner " +
          "på abonnement. Si dette tydelig, og be brukeren laste opp listen over " +
          "repeterende fakturaer under «Importer data» for et sikkert tall.",
    data_source: "saft_import",
  };
};

/** Bank balances and their movement — what the liquidity page shows. */
const getCashPosition: ToolHandler = async (companyId) => {
  const coverage = await getCoverage(companyId);
  if (!coverage.has_data) return noData(coverage);

  const supabase = await createClient();

  const [{ data: series }, { data: accounts }] = await Promise.all([
    supabase.rpc("company_cash_series" as never, {
      p_company_id: companyId,
    } as never) as unknown as Promise<{
      data: Array<{ month: string; movement: number; balance: number }> | null;
    }>,
    supabase
      .from("gl_accounts")
      .select("account_number, name, closing_balance")
      .eq("company_id", companyId)
      .gte("account_number", "1900")
      .lt("account_number", "2000"),
  ]);

  const bank = (accounts ?? []).filter((a) => a.closing_balance != null);

  return {
    as_of: coverage.last_date,
    booked_cash: Math.round(
      bank.reduce((t, a) => t + Number(a.closing_balance ?? 0), 0)
    ),
    accounts: bank.map((a) => ({
      account_number: a.account_number,
      name: a.name,
      balance: Math.round(Number(a.closing_balance ?? 0)),
    })),
    monthly: (series ?? []).map((s) => ({
      month: String(s.month).slice(0, 7),
      movement: Math.round(Number(s.movement)),
      balance: Math.round(Number(s.balance)),
    })),
    note:
      "Dette er bokført bankbeholdning fra regnskapet, ikke live banksaldo. " +
      "Bruk «bokført likviditet».",
    data_source: "saft_import",
  };
};

/** Account balances — the closing balance per account, i.e. the balance sheet. */
const getAccountBalances: ToolHandler = async (companyId, params) => {
  const coverage = await getCoverage(companyId);
  if (!coverage.has_data) return noData(coverage);

  const supabase = await createClient();
  let query = supabase
    .from("gl_accounts")
    .select("account_number, name, account_type, opening_balance, closing_balance")
    .eq("company_id", companyId)
    .order("account_number");

  const prefix = params.account_prefix
    ? String(params.account_prefix).replace(/\D/g, "")
    : null;

  if (prefix) {
    const padded = prefix.padEnd(4, "0");
    const upper = String(Number(prefix) + 1).padEnd(4, "0");
    query = query.gte("account_number", padded).lt("account_number", upper);
  }

  const { data: accounts } = await query;

  const rows = (accounts ?? [])
    .filter((a) => a.closing_balance != null || a.opening_balance != null)
    .map((a) => ({
      account_number: a.account_number,
      name: a.name,
      opening_balance: a.opening_balance == null ? null : Math.round(Number(a.opening_balance)),
      closing_balance: a.closing_balance == null ? null : Math.round(Number(a.closing_balance)),
    }));

  return {
    as_of: coverage.last_date,
    account_count: rows.length,
    accounts: rows.slice(0, 200),
    note:
      "Saldoene er inngående og utgående balanse slik SAF-T-filen oppgir dem. " +
      "Debet er positiv, kredit negativ.",
    data_source: "saft_import",
  };
};

/** Free-text search across the ledger, for "hva betalte vi til X". */
const searchTransactions: ToolHandler = async (companyId, params) => {
  const coverage = await getCoverage(companyId);
  if (!coverage.has_data) return noData(coverage);

  const supabase = await createClient();
  const text = params.text ? sanitizeFilterTerm(String(params.text)) : null;
  const limit = Math.min(Number(params.limit ?? 50) || 50, 200);

  let query = supabase
    .from("account_transactions")
    .select("transaction_date, account_number, amount, description, vat_code")
    .eq("company_id", companyId)
    .order("transaction_date", { ascending: false })
    .limit(limit);

  if (text) query = query.ilike("description", `%${text}%`);
  if (params.period) {
    const resolved = clampToCoverage(
      parsePeriodDates(String(params.period)),
      coverage
    );
    query = query
      .gte("transaction_date", resolved.start)
      .lte("transaction_date", resolved.end);
  }

  const { data: rows } = await query;

  return {
    match_count: rows?.length ?? 0,
    total_amount: Math.round(
      (rows ?? []).reduce((t, r) => t + Number(r.amount), 0)
    ),
    transactions: (rows ?? []).map((r) => ({
      date: r.transaction_date,
      account: r.account_number,
      amount: Number(r.amount),
      description: r.description,
      vat_code: r.vat_code,
    })),
    data_source: "saft_import",
  };
};

/** What the books hold, so the assistant can answer scope questions directly. */
const getDataCoverage: ToolHandler = async (companyId) => {
  const coverage = await getCoverage(companyId);
  return {
    ...coverage,
    note: coverage.has_data
      ? `Regnskapet dekker ${coverage.first_date} til ${coverage.last_date}. ` +
        "Spørsmål om perioder utenfor dette kan ikke besvares med tall."
      : "Ingen regnskapsdata er importert ennå.",
  };
};

const getCashForecast: ToolHandler = async (companyId, params) => {
  const days = Math.min((params.days as number) || 30, 90);

  try {
    const supabase = await createClient();
    const { data: forecast } = await supabase
      .from("forecasts")
      .select("*, forecast_items(*)")
      .eq("company_id", companyId)
      .eq("forecast_type", "cash_flow")
      .order("calculated_at", { ascending: false })
      .limit(1)
      .single();

    if (forecast) {
      return {
        horizon_days: days,
        forecast_date: forecast.forecast_date,
        confidence: forecast.confidence,
        summary: forecast.summary,
        items: (forecast as Record<string, unknown>).forecast_items,
        data_source: "regnskapssystem",
      };
    }
  } catch {
    // Fall through
  }

  return {
    data_source: "no_data",
    note:
      "Ingen regnskapsdata er importert for dette selskapet ennå. " +
      "Fortell brukeren dette og be dem importere en SAF-T-fil under " +
      "«Importer data». Ikke oppgi tall.",
  };
};

const getVatEstimate: ToolHandler = async (companyId) => {
  try {
    const supabase = await createClient();

    const { data: vatSettings } = await supabase
      .from("vat_settings")
      .select("*")
      .eq("company_id", companyId)
      .single();

    // Try to compute from transactions in current VAT period
    if (vatSettings) {
      return {
        vat_registered: vatSettings.vat_registered,
        vat_period: vatSettings.vat_period,
        note: "MVA-estimat basert på innstillinger. Detaljert beregning krever full transaksjonsdata.",
        data_source: "partial",
      };
    }
  } catch {
    // Fall through
  }

  return {
    data_source: "no_data",
    note:
      "Ingen regnskapsdata er importert for dette selskapet ennå. " +
      "Fortell brukeren dette og be dem importere en SAF-T-fil under " +
      "«Importer data». Ikke oppgi tall.",
  };
};

const getTaxEstimate: ToolHandler = async (companyId) => {
  try {
    const supabase = await createClient();
    const { data: metrics } = await supabase
      .from("financial_metric_snapshots")
      .select("*")
      .eq("company_id", companyId)
      .eq("metric", "net_profit")
      .eq("period_type", "ytd")
      .order("calculated_at", { ascending: false })
      .limit(1);

    if (metrics && metrics.length > 0) {
      const profit = metrics[0].value;
      const estimatedTax = profit * 0.22;
      return {
        taxable_profit_ytd: profit,
        tax_rate: 0.22,
        estimated_tax: estimatedTax,
        currency: "NOK",
        confidence: "estimated",
        note: "Forenklet estimat (22% av resultat). Tar ikke hensyn til midlertidige forskjeller eller skattemessige justeringer.",
        data_source: "beregnet",
      };
    }
  } catch {
    // Fall through
  }

  return {
    data_source: "no_data",
    note:
      "Ingen regnskapsdata er importert for dette selskapet ennå. " +
      "Fortell brukeren dette og be dem importere en SAF-T-fil under " +
      "«Importer data». Ikke oppgi tall.",
  };
};

const getChartOfAccounts: ToolHandler = async (companyId) => {
  try {
    const supabase = await createClient();
    const { data: accounts } = await supabase
      .from("gl_accounts")
      .select("account_number, name, account_type, is_active")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("account_number");

    if (accounts && accounts.length > 0) {
      return {
        account_count: accounts.length,
        accounts: accounts.map((a) => ({
          number: a.account_number,
          name: a.name,
          type: a.account_type,
        })),
        data_source: "regnskapssystem",
      };
    }
  } catch {
    // Fall through
  }

  return {
    account_count: 0,
    note: "Kontoplan ikke tilgjengelig. Koble til regnskapssystem for å hente kontoplan.",
    standard_accounts_hint: [
      { number: "1920", name: "Bankinnskudd", type: "asset" },
      { number: "2400", name: "Leverandørgjeld", type: "liability" },
      { number: "3000", name: "Salgsinntekt, avgiftspliktig", type: "revenue" },
      { number: "4000", name: "Varekostnad", type: "expense" },
      { number: "5000", name: "Lønn", type: "expense" },
      { number: "6300", name: "Leie av lokaler", type: "expense" },
      { number: "6800", name: "Kontorkostnader", type: "expense" },
      { number: "7100", name: "Bilkostnader", type: "expense" },
      { number: "7700", name: "Bankgebyr", type: "expense" },
    ],
    data_source: "standard_kontoplan",
  };
};

const findSimilarVendorTransactions: ToolHandler = async (
  companyId,
  params
) => {
  const vendorName = params.vendor_name as string;

  try {
    const supabase = await createClient();

    // Find vendor posting patterns
    const { data: patterns } = await supabase
      .from("vendor_posting_patterns")
      .select("*")
      .eq("company_id", companyId)
      .ilike("vendor_name", `%${vendorName}%`)
      .order("occurrence_count", { ascending: false })
      .limit(5);

    if (patterns && patterns.length > 0) {
      return {
        vendor_name: vendorName,
        patterns: patterns.map((p) => ({
          vendor: p.vendor_name,
          typical_account: p.typical_account_number,
          typical_vat_code: p.typical_vat_code,
          occurrences: p.occurrence_count,
          confidence: p.confidence,
        })),
        data_source: "regnskapssystem",
      };
    }

    // Fallback: search transactions by description
    const { data: transactions } = await supabase
      .from("account_transactions")
      .select("account_number, description, amount, vat_code, transaction_date")
      .eq("company_id", companyId)
      .ilike("description", `%${vendorName}%`)
      .order("transaction_date", { ascending: false })
      .limit(10);

    if (transactions && transactions.length > 0) {
      return {
        vendor_name: vendorName,
        matching_transactions: transactions,
        data_source: "regnskapssystem",
      };
    }
  } catch {
    // Fall through
  }

  return {
    data_source: "no_data",
    note:
      "Ingen regnskapsdata er importert for dette selskapet ennå. " +
      "Fortell brukeren dette og be dem importere en SAF-T-fil under " +
      "«Importer data». Ikke oppgi tall.",
  };
};

const findSimilarDescriptionTransactions: ToolHandler = async (
  companyId,
  params
) => {
  const text = params.text as string;

  try {
    const supabase = await createClient();
    const { data: transactions } = await supabase
      .from("account_transactions")
      .select("account_number, description, amount, vat_code, transaction_date")
      .eq("company_id", companyId)
      .ilike("description", `%${text}%`)
      .order("transaction_date", { ascending: false })
      .limit(10);

    if (transactions && transactions.length > 0) {
      // Find most common account
      const accountCounts: Record<string, number> = {};
      for (const t of transactions) {
        accountCounts[t.account_number] =
          (accountCounts[t.account_number] || 0) + 1;
      }
      const mostCommon = Object.entries(accountCounts).sort(
        ([, a], [, b]) => b - a
      )[0];

      return {
        search_text: text,
        matching_transactions: transactions,
        most_common_account: mostCommon
          ? { account: mostCommon[0], count: mostCommon[1] }
          : null,
        data_source: "regnskapssystem",
      };
    }
  } catch {
    // Fall through
  }

  return {
    data_source: "no_data",
    note:
      "Ingen regnskapsdata er importert for dette selskapet ennå. " +
      "Fortell brukeren dette og be dem importere en SAF-T-fil under " +
      "«Importer data». Ikke oppgi tall.",
  };
};

const getVendorPostingHistory: ToolHandler = async (companyId, params) => {
  const vendorName = params.vendor_name as string;

  try {
    const supabase = await createClient();
    const { data: patterns } = await supabase
      .from("vendor_posting_patterns")
      .select("*")
      .eq("company_id", companyId)
      .ilike("vendor_name", `%${vendorName}%`)
      .order("occurrence_count", { ascending: false })
      .limit(3);

    if (patterns && patterns.length > 0) {
      return {
        vendor_name: vendorName,
        posting_patterns: patterns.map((p) => ({
          account_number: p.typical_account_number,
          vat_code: p.typical_vat_code,
          category: p.typical_category_key,
          occurrences: p.occurrence_count,
          last_used: p.last_occurrence_date,
          confidence: p.confidence,
        })),
        data_source: "regnskapssystem",
      };
    }
  } catch {
    // Fall through
  }

  return {
    data_source: "no_data",
    note:
      "Ingen regnskapsdata er importert for dette selskapet ennå. " +
      "Fortell brukeren dette og be dem importere en SAF-T-fil under " +
      "«Importer data». Ikke oppgi tall.",
  };
};

const searchAccountingRules: ToolHandler = async (companyId, params) => {
  const topic = params.topic as string;
  // The topic originates from a model tool call, which an uploaded document
  // can influence, so it must not reach the filter string unescaped.
  const safeTopic = sanitizeFilterTerm(topic ?? "");
  void companyId; // Rules are not company-specific, but we keep the signature consistent

  if (!safeTopic) {
    return { topic, rules: [], note: "Tomt eller ugyldig søkeord." };
  }

  try {
    const supabase = await createClient();
    const { data: rules } = await supabase
      .from("accounting_rules")
      .select("*")
      .or(
        `title_nb.ilike.%${safeTopic}%,content_nb.ilike.%${safeTopic}%,category.ilike.%${safeTopic}%`
      )
      .limit(5);

    if (rules && rules.length > 0) {
      return {
        topic,
        rules: rules.map((r) => ({
          title: r.title_nb,
          content: r.content_nb,
          category: r.category,
          source: r.source,
          effective_from: r.effective_from,
        })),
        data_source: "regeldatabase",
      };
    }
  } catch {
    // Fall through
  }

  return {
    data_source: "no_data",
    note:
      "Ingen regnskapsdata er importert for dette selskapet ennå. " +
      "Fortell brukeren dette og be dem importere en SAF-T-fil under " +
      "«Importer data». Ikke oppgi tall.",
  };
};

// Payroll scenario rates. Zone 1 is the default employer's national
// insurance rate; the user's actual zone is a company setting.
const DEFAULT_EMPLOYER_TAX_RATE = 0.141;
const HOLIDAY_PAY_RATE = 0.12;
const MIN_PENSION_RATE = 0.02;

const runScenario: ToolHandler = async (companyId, params) => {
  const scenarioParams = params.parameters as Record<string, unknown>;
  const scenarioType = (scenarioParams?.type as string) || "custom";

  // Scenarios are computed from the parameters the user supplies rather
  // than from company data, so they do not depend on an import having run.
  void companyId;

  switch (scenarioType) {
    case "new_hire": {
      const salary = (scenarioParams.monthly_salary as number) || 50000;

      // Holiday pay and mandatory occupational pension accrue on the gross
      // salary; employer's national insurance is then charged on the sum of
      // salary, holiday pay and the pension premium.
      const holidayPay = salary * HOLIDAY_PAY_RATE;
      const pension = salary * MIN_PENSION_RATE;
      const employerTax =
        (salary + holidayPay + pension) * DEFAULT_EMPLOYER_TAX_RATE;
      const totalCost = salary + holidayPay + pension + employerTax;

      return {
        scenario: "Ny ansettelse",
        monthly_salary: salary,
        estimated_monthly_cost: Math.round(totalCost),
        annual_cost: Math.round(totalCost * 12),
        cost_breakdown: {
          bruttolonn: salary,
          feriepenger: Math.round(holidayPay),
          pensjon: Math.round(pension),
          arbeidsgiveravgift: Math.round(employerTax),
        },
        impact_on_result: {
          monthly: -Math.round(totalCost),
          annual: -Math.round(totalCost * 12),
        },
        note:
          "Estimatet bruker sone 1 (14,1 %) arbeidsgiveravgift, 12 % feriepenger " +
          "og 2 % obligatorisk tjenestepensjon. Faktisk kostnad avhenger av " +
          "selskapets avgiftssone, pensjonsavtale og øvrige ytelser.",
        confidence: "estimated",
      };
    }

    case "investment": {
      const amount = (scenarioParams.amount as number) || 100000;
      return {
        scenario: "Investering",
        amount,
        financing: scenarioParams.financing || "egenkapital",
        impact: {
          cash_effect: -amount,
          balance_sheet: "Øker anleggsmidler, reduserer kontanter/øker gjeld",
          annual_depreciation: Math.round(amount / 5),
        },
        note: "Avskrivningstiden avhenger av type eiendel. Konsulter regnskapsfører for korrekt avskrivningsplan.",
        confidence: "estimated",
      };
    }

    default:
      return {
        scenario: scenarioType,
        parameters: scenarioParams,
        note: "Scenarioanalyse er under utvikling. For detaljerte analyser, ta kontakt med regnskapsfører.",
        confidence: "low",
      };
  }
};

// ---------------------------------------------------------------------------
// Handler registry
// ---------------------------------------------------------------------------

export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  get_financial_summary: getFinancialSummary,
  get_revenue_analysis: getRevenueAnalysis,
  get_profit_analysis: getProfitAnalysis,
  get_cost_analysis: getCostAnalysis,
  get_account_breakdown: getAccountBreakdown,
  get_customer_receivables: getCustomerReceivables,
  get_customer_detail: getCustomerDetail,
  list_customers: listCustomers,
  get_recurring_revenue: getRecurringRevenue,
  get_cash_position: getCashPosition,
  get_account_balances: getAccountBalances,
  search_transactions: searchTransactions,
  get_data_coverage: getDataCoverage,
  get_overdue_invoices: getOverdueInvoices,
  get_supplier_payables: getSupplierPayables,
  get_upcoming_obligations: getUpcomingObligations,
  get_cash_forecast: getCashForecast,
  get_vat_estimate: getVatEstimate,
  get_tax_estimate: getTaxEstimate,
  get_chart_of_accounts: getChartOfAccounts,
  find_similar_vendor_transactions: findSimilarVendorTransactions,
  find_similar_description_transactions: findSimilarDescriptionTransactions,
  get_vendor_posting_history: getVendorPostingHistory,
  search_accounting_rules: searchAccountingRules,
  run_scenario: runScenario,
  get_budget: getBudget,
  propose_budget_change: proposeBudgetChange,
};

/**
 * Execute a tool by name with company-scoped parameters.
 * Throws if the tool name is unknown.
 */
export async function executeTool(
  toolName: string,
  companyId: string,
  params: ToolParams
): Promise<ToolResult> {
  const handler = TOOL_HANDLERS[toolName];
  if (!handler) {
    throw new Error(`Ukjent verktøy: ${toolName}`);
  }
  return handler(companyId, params);
}
