/**
 * Assistant Tool Handlers
 *
 * Each handler takes (companyId, params) and returns structured JSON.
 * All queries enforce tenant isolation via company_id filtering.
 *
 * Handlers attempt to query Supabase for real data and fall back to
 * structured mock data when data is unavailable (MVP approach).
 */

import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ToolParams = Record<string, unknown>;
type ToolResult = Record<string, unknown>;
type ToolHandler = (companyId: string, params: ToolParams) => Promise<ToolResult>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const getFinancialSummary: ToolHandler = async (companyId, params) => {
  const { start, end } = parsePeriodDates(params.period as string);

  try {
    const supabase = await createClient();

    // Try to get metric snapshots for the period
    const { data: metrics } = await supabase
      .from("financial_metric_snapshots")
      .select("*")
      .eq("company_id", companyId)
      .gte("period_start", start)
      .lte("period_end", end);

    if (metrics && metrics.length > 0) {
      const metricMap: Record<string, unknown> = {};
      for (const m of metrics) {
        metricMap[m.metric] = {
          value: m.value,
          comparison_value: m.comparison_value,
          change_percent: m.change_percent,
          confidence: m.confidence,
        };
      }
      return {
        period: { start, end },
        metrics: metricMap,
        data_source: "regnskapssystem",
      };
    }
  } catch {
    // Fall through to mock data
  }

  return {
    period: { start, end },
    revenue: { amount: 850000, confidence: "estimated", currency: "NOK" },
    costs: { amount: 620000, confidence: "estimated", currency: "NOK" },
    profit: { amount: 230000, confidence: "estimated", currency: "NOK" },
    profit_margin: { percent: 27.1, confidence: "estimated" },
    cash_balance: { amount: 1250000, confidence: "estimated", currency: "NOK" },
    receivables: { amount: 340000, confidence: "estimated", currency: "NOK" },
    payables: { amount: 180000, confidence: "estimated", currency: "NOK" },
    data_source: "mock_data",
    note: "Viser eksempeldata. Koble til regnskapssystem for reelle tall.",
  };
};

const getRevenueAnalysis: ToolHandler = async (companyId, params) => {
  const { start, end } = parsePeriodDates(params.period as string);

  try {
    const supabase = await createClient();

    // Get revenue accounts (3xxx range in Norwegian chart of accounts)
    const { data: transactions } = await supabase
      .from("account_transactions")
      .select("*, gl_accounts!inner(account_number, name)")
      .eq("company_id", companyId)
      .gte("transaction_date", start)
      .lte("transaction_date", end)
      .gte("account_number", "3000")
      .lt("account_number", "4000");

    if (transactions && transactions.length > 0) {
      const total = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const byAccount: Record<string, number> = {};
      for (const t of transactions) {
        const key = t.account_number;
        byAccount[key] = (byAccount[key] || 0) + Math.abs(t.amount);
      }
      return {
        period: { start, end },
        total_revenue: { amount: total, currency: "NOK" },
        by_account: byAccount,
        transaction_count: transactions.length,
        data_source: "regnskapssystem",
      };
    }
  } catch {
    // Fall through
  }

  return {
    period: { start, end },
    total_revenue: { amount: 850000, currency: "NOK", confidence: "estimated" },
    by_category: {
      "Salgsinntekt, avgiftspliktig": 720000,
      "Salgsinntekt, avgiftsfri": 90000,
      "Annen driftsinntekt": 40000,
    },
    trend: "stabil",
    data_source: "mock_data",
  };
};

const getProfitAnalysis: ToolHandler = async (companyId, params) => {
  const { start, end } = parsePeriodDates(params.period as string);

  try {
    const supabase = await createClient();
    const { data: metrics } = await supabase
      .from("financial_metric_snapshots")
      .select("*")
      .eq("company_id", companyId)
      .in("metric", [
        "gross_profit",
        "operating_profit",
        "net_profit",
        "gross_margin",
        "operating_margin",
      ])
      .gte("period_start", start)
      .lte("period_end", end);

    if (metrics && metrics.length > 0) {
      const result: Record<string, unknown> = { period: { start, end } };
      for (const m of metrics) {
        result[m.metric] = {
          value: m.value,
          change_percent: m.change_percent,
          confidence: m.confidence,
        };
      }
      result.data_source = "regnskapssystem";
      return result;
    }
  } catch {
    // Fall through
  }

  return {
    period: { start, end },
    revenue: 850000,
    cost_of_goods: 340000,
    gross_profit: 510000,
    gross_margin_percent: 60.0,
    operating_expenses: 280000,
    operating_profit: 230000,
    operating_margin_percent: 27.1,
    currency: "NOK",
    confidence: "estimated",
    data_source: "mock_data",
  };
};

const getCostAnalysis: ToolHandler = async (companyId, params) => {
  const { start, end } = parsePeriodDates(params.period as string);

  try {
    const supabase = await createClient();

    // Cost accounts (4xxx-7xxx in Norwegian chart of accounts)
    const { data: transactions } = await supabase
      .from("account_transactions")
      .select("account_number, amount")
      .eq("company_id", companyId)
      .gte("transaction_date", start)
      .lte("transaction_date", end)
      .gte("account_number", "4000")
      .lt("account_number", "8000");

    if (transactions && transactions.length > 0) {
      const total = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const byRange: Record<string, number> = {};
      for (const t of transactions) {
        const num = parseInt(t.account_number);
        let category: string;
        if (num < 5000) category = "Varekostnad";
        else if (num < 6000) category = "Lonnskostnader";
        else if (num < 7000) category = "Avskrivninger og nedskrivninger";
        else category = "Andre driftskostnader";
        byRange[category] = (byRange[category] || 0) + Math.abs(t.amount);
      }
      return {
        period: { start, end },
        total_costs: { amount: total, currency: "NOK" },
        by_category: byRange,
        data_source: "regnskapssystem",
      };
    }
  } catch {
    // Fall through
  }

  return {
    period: { start, end },
    total_costs: { amount: 620000, currency: "NOK", confidence: "estimated" },
    by_category: {
      Varekostnad: 340000,
      Lonnskostnader: 150000,
      Husleie: 35000,
      "Kontorkostnader og rekvisita": 12000,
      "Reise og transport": 18000,
      "Markedsforing": 25000,
      "IT og programvare": 15000,
      "Andre driftskostnader": 25000,
    },
    largest_single_expense: {
      description: "Varekostnad",
      amount: 340000,
      percent_of_total: 54.8,
    },
    data_source: "mock_data",
  };
};

const getAccountBreakdown: ToolHandler = async (companyId, params) => {
  const { start, end } = parsePeriodDates(params.period as string);
  const accountOrCategory = params.account_or_category as string;

  try {
    const supabase = await createClient();
    const { data: transactions } = await supabase
      .from("account_transactions")
      .select("*")
      .eq("company_id", companyId)
      .eq("account_number", accountOrCategory)
      .gte("transaction_date", start)
      .lte("transaction_date", end)
      .order("transaction_date", { ascending: false })
      .limit(50);

    if (transactions && transactions.length > 0) {
      const total = transactions.reduce((sum, t) => sum + t.amount, 0);
      return {
        account: accountOrCategory,
        period: { start, end },
        total: { amount: total, currency: "NOK" },
        transaction_count: transactions.length,
        transactions: transactions.map((t) => ({
          date: t.transaction_date,
          description: t.description,
          amount: t.amount,
          vat_code: t.vat_code,
        })),
        data_source: "regnskapssystem",
      };
    }
  } catch {
    // Fall through
  }

  return {
    account: accountOrCategory,
    period: { start, end },
    total: { amount: 35000, currency: "NOK", confidence: "estimated" },
    transaction_count: 0,
    note: "Ingen transaksjoner funnet for denne kontoen i perioden.",
    data_source: "mock_data",
  };
};

const getCustomerReceivables: ToolHandler = async (companyId) => {
  try {
    const supabase = await createClient();

    const { data: entries } = await supabase
      .from("customer_ledger_entries")
      .select("*, customers!inner(name)")
      .eq("company_id", companyId)
      .eq("is_open", true);

    if (entries && entries.length > 0) {
      const total = entries.reduce(
        (sum, e) => sum + (e.remaining_amount ?? e.amount),
        0
      );
      const now = new Date();
      const aging = { "0_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0 };
      for (const e of entries) {
        const due = e.due_date ? new Date(e.due_date) : new Date(e.entry_date);
        const daysOver = Math.floor(
          (now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)
        );
        const amt = e.remaining_amount ?? e.amount;
        if (daysOver <= 30) aging["0_30"] += amt;
        else if (daysOver <= 60) aging["31_60"] += amt;
        else if (daysOver <= 90) aging["61_90"] += amt;
        else aging["90_plus"] += amt;
      }
      return {
        total_outstanding: { amount: total, currency: "NOK" },
        aging,
        customer_count: new Set(entries.map((e) => e.customer_id)).size,
        data_source: "regnskapssystem",
      };
    }
  } catch {
    // Fall through
  }

  return {
    total_outstanding: {
      amount: 340000,
      currency: "NOK",
      confidence: "estimated",
    },
    aging: {
      "0_30_dager": 180000,
      "31_60_dager": 95000,
      "61_90_dager": 45000,
      "over_90_dager": 20000,
    },
    top_debtors: [
      { name: "Eksempel Kunde AS", amount: 120000 },
      { name: "Demo Handel AS", amount: 85000 },
      { name: "Test Tjenester AS", amount: 55000 },
    ],
    data_source: "mock_data",
  };
};

const getCustomerPaymentProfile: ToolHandler = async (companyId, params) => {
  const customerId = params.customer_id as string;

  try {
    const supabase = await createClient();
    const { data: profile } = await supabase
      .from("customer_payment_profiles")
      .select("*, customers!inner(name)")
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .single();

    if (profile) {
      return {
        customer_id: customerId,
        total_invoices: profile.total_invoices,
        total_invoiced: profile.total_invoiced_amount,
        outstanding: profile.current_outstanding,
        overdue: profile.current_overdue,
        avg_payment_days: profile.avg_actual_payment_days,
        avg_days_after_due: profile.avg_days_after_due,
        late_payment_ratio: profile.late_payment_ratio,
        risk_score: profile.payment_risk_score,
        payment_trend: profile.payment_trend,
        data_source: "regnskapssystem",
      };
    }
  } catch {
    // Fall through
  }

  return {
    customer_id: customerId,
    note: "Ingen betalingsprofil funnet for denne kunden.",
    data_source: "mock_data",
  };
};

const getOverdueInvoices: ToolHandler = async (companyId) => {
  try {
    const supabase = await createClient();
    const today = fmt(new Date());

    const { data: invoices } = await supabase
      .from("outgoing_invoices")
      .select("*, customers!inner(name)")
      .eq("company_id", companyId)
      .lt("due_date", today)
      .gt("remaining_amount", 0)
      .order("due_date", { ascending: true });

    if (invoices && invoices.length > 0) {
      const now = new Date();
      return {
        count: invoices.length,
        total_overdue: invoices.reduce(
          (sum, inv) => sum + (inv.remaining_amount ?? 0),
          0
        ),
        currency: "NOK",
        invoices: invoices.map((inv) => ({
          invoice_number: inv.invoice_number,
          customer: (inv as Record<string, unknown>).customers,
          amount: inv.remaining_amount,
          due_date: inv.due_date,
          days_overdue: Math.floor(
            (now.getTime() - new Date(inv.due_date!).getTime()) /
              (1000 * 60 * 60 * 24)
          ),
        })),
        data_source: "regnskapssystem",
      };
    }
  } catch {
    // Fall through
  }

  return {
    count: 4,
    total_overdue: { amount: 65000, currency: "NOK", confidence: "estimated" },
    invoices: [
      {
        invoice_number: "2025-042",
        customer: "Eksempel Kunde AS",
        amount: 25000,
        due_date: "2025-01-15",
        days_overdue: 30,
      },
      {
        invoice_number: "2025-038",
        customer: "Demo Handel AS",
        amount: 18000,
        due_date: "2025-01-10",
        days_overdue: 35,
      },
    ],
    data_source: "mock_data",
  };
};

const getSupplierPayables: ToolHandler = async (companyId) => {
  try {
    const supabase = await createClient();
    const { data: entries } = await supabase
      .from("supplier_ledger_entries")
      .select("*, suppliers!inner(name)")
      .eq("company_id", companyId)
      .eq("is_open", true);

    if (entries && entries.length > 0) {
      const total = entries.reduce(
        (sum, e) => sum + Math.abs(e.remaining_amount ?? e.amount),
        0
      );
      return {
        total_payables: { amount: total, currency: "NOK" },
        supplier_count: new Set(entries.map((e) => e.supplier_id)).size,
        data_source: "regnskapssystem",
      };
    }
  } catch {
    // Fall through
  }

  return {
    total_payables: {
      amount: 180000,
      currency: "NOK",
      confidence: "estimated",
    },
    upcoming_due: [
      {
        supplier: "Leverandor Eksempel AS",
        amount: 45000,
        due_date: "2025-02-20",
      },
      { supplier: "IT-Partner AS", amount: 12000, due_date: "2025-02-25" },
    ],
    data_source: "mock_data",
  };
};

const getUpcomingObligations: ToolHandler = async (companyId, params) => {
  const days = (params.days as number) || 30;
  const now = new Date();
  const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  try {
    const supabase = await createClient();
    const { data: invoices } = await supabase
      .from("incoming_invoices")
      .select("*, suppliers!inner(name)")
      .eq("company_id", companyId)
      .gte("due_date", fmt(now))
      .lte("due_date", fmt(futureDate))
      .gt("remaining_amount", 0);

    if (invoices && invoices.length > 0) {
      return {
        horizon_days: days,
        obligations: invoices.map((inv) => ({
          type: "leverandorfaktura",
          supplier: (inv as Record<string, unknown>).suppliers,
          amount: inv.remaining_amount ?? inv.total_amount,
          due_date: inv.due_date,
          currency: inv.currency,
        })),
        total: invoices.reduce(
          (sum, inv) =>
            sum + Math.abs(inv.remaining_amount ?? inv.total_amount ?? 0),
          0
        ),
        data_source: "regnskapssystem",
      };
    }
  } catch {
    // Fall through
  }

  return {
    horizon_days: days,
    obligations: [
      { type: "Leverandorfakturaer", amount: 85000, currency: "NOK" },
      { type: "Lonn og arbeidsgiveravgift", amount: 195000, currency: "NOK" },
      { type: "MVA-termin", amount: 68000, currency: "NOK" },
      { type: "Husleie", amount: 35000, currency: "NOK" },
    ],
    total: { amount: 383000, currency: "NOK", confidence: "estimated" },
    data_source: "mock_data",
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
    horizon_days: days,
    current_balance: { amount: 1250000, currency: "NOK" },
    expected_inflows: { amount: 420000, currency: "NOK" },
    expected_outflows: { amount: 383000, currency: "NOK" },
    projected_balance: { amount: 1287000, currency: "NOK" },
    weekly_projection: [
      { week: 1, inflow: 120000, outflow: 95000, balance: 1275000 },
      { week: 2, inflow: 100000, outflow: 195000, balance: 1180000 },
      { week: 3, inflow: 110000, outflow: 50000, balance: 1240000 },
      { week: 4, inflow: 90000, outflow: 43000, balance: 1287000 },
    ],
    confidence: "estimated",
    data_source: "mock_data",
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
        note: "MVA-estimat basert paa innstillinger. Detaljert beregning krever full transaksjonsdata.",
        data_source: "partial",
      };
    }
  } catch {
    // Fall through
  }

  return {
    termin: "1. termin 2025 (jan-feb)",
    utgaaende_mva: { amount: 170000, currency: "NOK" },
    inngaaende_mva: { amount: 102000, currency: "NOK" },
    netto_aa_betale: { amount: 68000, currency: "NOK" },
    frist: "2025-04-10",
    confidence: "estimated",
    data_source: "mock_data",
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
    taxable_profit_ytd: { amount: 230000, currency: "NOK" },
    tax_rate_percent: 22,
    estimated_tax: { amount: 50600, currency: "NOK" },
    note: "Forenklet estimat. Faktisk skatt kan avvike pga. midlertidige forskjeller, fremforbart underskudd, etc. Raadfor deg med regnskapsforer for noyaktig beregning.",
    confidence: "estimated",
    data_source: "mock_data",
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
    note: "Kontoplan ikke tilgjengelig. Koble til regnskapssystem for aa hente kontoplan.",
    standard_accounts_hint: [
      { number: "1920", name: "Bankinnskudd", type: "asset" },
      { number: "2400", name: "Leverandorgjeld", type: "liability" },
      { number: "3000", name: "Salgsinntekt, avgiftspliktig", type: "revenue" },
      { number: "4000", name: "Varekostnad", type: "expense" },
      { number: "5000", name: "Lonn", type: "expense" },
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
    vendor_name: vendorName,
    matching_transactions: [],
    note: "Ingen tidligere transaksjoner funnet for denne leverandoren.",
    data_source: "mock_data",
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
    search_text: text,
    matching_transactions: [],
    note: "Ingen lignende transaksjoner funnet.",
    data_source: "mock_data",
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
    vendor_name: vendorName,
    posting_patterns: [],
    note: "Ingen posteringshistorikk funnet for denne leverandoren.",
    data_source: "mock_data",
  };
};

const searchAccountingRules: ToolHandler = async (companyId, params) => {
  const topic = params.topic as string;
  void companyId; // Rules are not company-specific, but we keep the signature consistent

  try {
    const supabase = await createClient();
    const { data: rules } = await supabase
      .from("accounting_rules")
      .select("*")
      .or(
        `title_nb.ilike.%${topic}%,content_nb.ilike.%${topic}%,category.ilike.%${topic}%`
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
    topic,
    rules: [],
    note: "Ingen spesifikke regler funnet i databasen. Assistenten vil svare basert paa generell kunnskap om norsk regnskapspraksis.",
    data_source: "mock_data",
  };
};

const runScenario: ToolHandler = async (companyId, params) => {
  const scenarioParams = params.parameters as Record<string, unknown>;
  const scenarioType = (scenarioParams?.type as string) || "custom";

  // For MVP, we provide mock scenario results. A full implementation
  // would run the financial engine.
  void companyId;

  switch (scenarioType) {
    case "new_hire": {
      const salary = (scenarioParams.monthly_salary as number) || 50000;
      const totalCost = salary * 1.141 * 1.141; // Employer tax + pension estimate
      return {
        scenario: "Ny ansettelse",
        monthly_salary: salary,
        estimated_monthly_cost: Math.round(totalCost),
        annual_cost: Math.round(totalCost * 12),
        cost_breakdown: {
          bruttolonn: salary,
          arbeidsgiveravgift: Math.round(salary * 0.141),
          pensjon: Math.round(salary * 0.02),
          feriepenger: Math.round(salary * 0.12),
        },
        impact_on_result: {
          monthly: -Math.round(totalCost),
          annual: -Math.round(totalCost * 12),
        },
        note: "Forenklet estimat. Faktiske kostnader avhenger av arbeidsgiveravgiftsone, pensjonsavtale og andre ytelser.",
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
          balance_sheet: "Oker anleggsmidler, reduserer kontanter/oker gjeld",
          annual_depreciation: Math.round(amount / 5),
        },
        note: "Avskrivningstiden avhenger av type eiendel. Konsulter regnskapsforer for korrekt avskrivningsplan.",
        confidence: "estimated",
      };
    }

    default:
      return {
        scenario: scenarioType,
        parameters: scenarioParams,
        note: "Scenarioanalyse er under utvikling. For detaljerte analyser, ta kontakt med regnskapsforer.",
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
  get_customer_payment_profile: getCustomerPaymentProfile,
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
    throw new Error(`Ukjent verktoy: ${toolName}`);
  }
  return handler(companyId, params);
}
