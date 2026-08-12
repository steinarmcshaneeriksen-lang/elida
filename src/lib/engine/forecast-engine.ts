import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ConfidenceLevel } from "../types/database";

// ─── Result types ─────────────────────────────────────────────────────────

export interface CashForecastResult {
  startingCash: number;
  expectedCustomerPayments: number;
  supplierPayments: number;
  estimatedPayroll: number;
  estimatedEmployerTax: number;
  estimatedVat: number;
  recurringCosts: number;
  estimatedFutureCash: number;
  horizonDays: number;
  weeklyBreakdown: WeeklyForecastItem[];
  confidence: ConfidenceLevel;
  calculatedAt: string;
}

export interface WeeklyForecastItem {
  weekStart: string;
  weekEnd: string;
  inflows: number;
  outflows: number;
  netChange: number;
  projectedBalance: number;
}

export interface ExpectedPaymentResult {
  customerId: string;
  customerName: string;
  invoiceId: string;
  invoiceNumber: string | null;
  amount: number;
  dueDate: string;
  expectedPaymentDate: string;
  expectedDaysLate: number;
  confidence: ConfidenceLevel;
}

export interface RecurringCostResult {
  id: string;
  supplierName: string | null;
  description: string | null;
  categoryKey: string | null;
  avgAmount: number;
  frequency: string;
  lastOccurrence: string | null;
  nextExpected: string | null;
  confidence: ConfidenceLevel;
}

export interface VatEstimateResult {
  outputVat: number;
  inputVat: number;
  estimatedSettlement: number;
  breakdownByRate: Array<{
    rate: number;
    baseAmount: number;
    vatAmount: number;
  }>;
  confidence: ConfidenceLevel;
}

export interface TaxEstimateResult {
  profitBeforeTax: number;
  estimatedTax: number;
  effectiveRate: number;
  confidence: ConfidenceLevel;
  disclaimer: string;
}

export interface PayrollEstimateResult {
  estimatedGrossPayroll: number;
  estimatedEmployerTax: number;
  estimatedTotal: number;
  basedOnMonths: number;
  monthlyHistory: Array<{ month: string; amount: number }>;
  confidence: ConfidenceLevel;
}

export interface UpcomingObligationResult {
  date: string;
  category:
    | "payroll"
    | "withholding_tax"
    | "employer_tax"
    | "supplier_payment"
    | "vat"
    | "recurring_cost";
  description: string;
  amount: number;
  isRecurring: boolean;
  confidence: ConfidenceLevel;
}

// ─── Constants ────────────────────────────────────────────────────────────

const CASH_ACCOUNT_MIN = 1900;
const CASH_ACCOUNT_MAX = 1999;
const PAYROLL_ACCOUNT_MIN = 5000;
const PAYROLL_ACCOUNT_MAX = 5199;
const EMPLOYER_TAX_ACCOUNT_MIN = 5400;
const EMPLOYER_TAX_ACCOUNT_MAX = 5499;
const NORWAY_CORPORATE_TAX_RATE = 0.22;

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

function addMonths(d: Date, months: number): Date {
  const result = new Date(d);
  result.setMonth(result.getMonth() + months);
  return result;
}

function startOfWeek(d: Date): Date {
  const result = new Date(d);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  result.setDate(result.getDate() + diff);
  return result;
}

function daysBetween(dateA: Date, dateB: Date): number {
  const msPerDay = 86400000;
  return Math.floor((dateB.getTime() - dateA.getTime()) / msPerDay);
}

// ─── ForecastEngine class ─────────────────────────────────────────────────

export class ForecastEngine {
  private supabase: SupabaseClient<Database>;
  private companyId: string;

  constructor(supabase: SupabaseClient<Database>, companyId: string) {
    this.supabase = supabase;
    this.companyId = companyId;
  }

  /**
   * Section 18: Cash flow forecast.
   *
   * starting_cash + expected_customer_payments
   *   - supplier_payments - estimated_payroll - estimated_employer_tax
   *   - estimated_vat - recurring_costs = estimated_future_cash
   */
  async getCashForecast(
    horizonDays: number
  ): Promise<CashForecastResult> {
    const now = new Date();

    const [
      startingCash,
      expectedPayments,
      supplierPayments,
      payrollEstimate,
      vatEstimate,
      recurringCosts,
    ] = await Promise.all([
      this.getStartingCash(),
      this.getExpectedCustomerPayments(horizonDays),
      this.getSupplierPaymentsDue(horizonDays),
      this.estimatePayroll(3),
      this.estimateVat(addMonths(now, -2), now),
      this.getRecurringCosts(),
    ]);

    const totalExpectedInflows = expectedPayments.reduce(
      (sum, p) => sum + p.amount,
      0
    );

    const totalSupplierOutflows = supplierPayments;
    const estimatedPayroll = payrollEstimate.estimatedGrossPayroll;
    const estimatedEmployerTax = payrollEstimate.estimatedEmployerTax;
    const estimatedVatAmount = Math.max(0, vatEstimate.estimatedSettlement);

    // Estimate recurring costs for the horizon
    const recurringCostTotal = this.projectRecurringCosts(
      recurringCosts,
      horizonDays
    );

    const estimatedFutureCash =
      startingCash +
      totalExpectedInflows -
      totalSupplierOutflows -
      estimatedPayroll -
      estimatedEmployerTax -
      estimatedVatAmount -
      recurringCostTotal;

    // Build weekly breakdown
    const weeklyBreakdown = this.buildWeeklyBreakdown(
      now,
      horizonDays,
      startingCash,
      expectedPayments,
      totalSupplierOutflows,
      estimatedPayroll,
      estimatedEmployerTax,
      estimatedVatAmount,
      recurringCostTotal
    );

    return {
      startingCash,
      expectedCustomerPayments: totalExpectedInflows,
      supplierPayments: totalSupplierOutflows,
      estimatedPayroll,
      estimatedEmployerTax,
      estimatedVat: estimatedVatAmount,
      recurringCosts: recurringCostTotal,
      estimatedFutureCash,
      horizonDays,
      weeklyBreakdown,
      confidence: "estimated",
      calculatedAt: new Date().toISOString(),
    };
  }

  /**
   * For each open invoice, use customer's historical payment pattern to
   * estimate when they'll pay. Conservative: if poor history, delay expected
   * payment.
   */
  async getExpectedCustomerPayments(
    days: number
  ): Promise<ExpectedPaymentResult[]> {
    const now = new Date();
    const horizon = addDays(now, days);

    // Fetch open outgoing invoices
    const { data: invoices, error: invError } = await this.supabase
      .from("outgoing_invoices")
      .select(
        "id, customer_id, invoice_number, remaining_amount, due_date"
      )
      .eq("company_id", this.companyId)
      .gt("remaining_amount", 0);

    if (invError) {
      throw new Error(
        `Failed to fetch outgoing invoices: ${invError.message}`
      );
    }

    if (!invoices || invoices.length === 0) return [];

    // Load customer payment profiles for delay estimation
    const customerIds = [
      ...new Set(
        invoices
          .map((inv) => inv.customer_id)
          .filter((id): id is string => id !== null)
      ),
    ];

    const customerProfiles = await this.loadCustomerPaymentProfiles(
      customerIds
    );
    const customerNames = await this.loadCustomerNames(customerIds);

    const results: ExpectedPaymentResult[] = [];

    for (const inv of invoices) {
      if (!inv.due_date || !inv.customer_id) continue;

      const dueDate = new Date(inv.due_date);
      const profile = customerProfiles.get(inv.customer_id);

      // Estimate expected payment date based on historical behavior
      let expectedDaysLate = 0;
      let confidence: ConfidenceLevel = "estimated";

      if (profile) {
        if (
          profile.avg_days_after_due !== null &&
          profile.avg_days_after_due > 0
        ) {
          // Conservative: use average delay plus a buffer
          expectedDaysLate = Math.ceil(profile.avg_days_after_due * 1.2);
          confidence =
            profile.late_payment_ratio !== null &&
            profile.late_payment_ratio > 0.5
              ? "low_confidence"
              : "estimated";
        } else if (
          profile.late_payment_ratio !== null &&
          profile.late_payment_ratio > 0.3
        ) {
          // Known late payer but no average delay data: assume 14 days late
          expectedDaysLate = 14;
          confidence = "low_confidence";
        }
      } else {
        // No profile data: assume 7 days late as conservative default
        expectedDaysLate = 7;
        confidence = "low_confidence";
      }

      const expectedPaymentDate = addDays(dueDate, expectedDaysLate);

      // Only include if expected payment is within our horizon
      if (expectedPaymentDate > horizon) continue;

      // If payment is already expected before now, treat as imminent
      const effectiveDate =
        expectedPaymentDate < now ? now : expectedPaymentDate;

      results.push({
        customerId: inv.customer_id,
        customerName:
          customerNames.get(inv.customer_id) || "Ukjent kunde",
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        amount: inv.remaining_amount || 0,
        dueDate: inv.due_date,
        expectedPaymentDate: formatDate(effectiveDate),
        expectedDaysLate,
        confidence,
      });
    }

    return results.sort(
      (a, b) =>
        new Date(a.expectedPaymentDate).getTime() -
        new Date(b.expectedPaymentDate).getTime()
    );
  }

  /**
   * Identify recurring vendor costs from the recurring_cost_patterns table.
   * If that table is empty, attempts to detect patterns from transaction history.
   */
  async getRecurringCosts(): Promise<RecurringCostResult[]> {
    // Try pre-computed patterns first
    const { data: patterns, error: patternError } = await this.supabase
      .from("recurring_cost_patterns")
      .select("*")
      .eq("company_id", this.companyId)
      .eq("is_active", true);

    if (!patternError && patterns && patterns.length > 0) {
      return patterns.map((p) => ({
        id: p.id,
        supplierName: p.supplier_name,
        description: p.description,
        categoryKey: p.category_key,
        avgAmount: p.avg_amount,
        frequency: p.frequency,
        lastOccurrence: p.last_occurrence_date,
        nextExpected: p.next_expected_date,
        confidence: p.confidence as ConfidenceLevel,
      }));
    }

    // Detect patterns from transaction history: group by description or
    // supplier, look for repeating amounts at regular intervals
    return this.detectRecurringPatterns();
  }

  /**
   * Calculate VAT estimate for a period.
   * output_vat (from sales with VAT) - input_vat (from purchases with VAT)
   * = estimated_settlement. Marked as ESTIMATED.
   */
  async estimateVat(
    periodStart: Date,
    periodEnd: Date
  ): Promise<VatEstimateResult> {
    // Load VAT codes for this company
    const { data: vatCodes, error: vatError } = await this.supabase
      .from("vat_codes")
      .select("code, rate")
      .eq("company_id", this.companyId)
      .eq("is_active", true);

    if (vatError) {
      throw new Error(`Failed to load VAT codes: ${vatError.message}`);
    }

    const vatRateMap = new Map<string, number>();
    for (const vc of vatCodes || []) {
      if (vc.rate !== null) {
        vatRateMap.set(vc.code, vc.rate);
      }
    }

    // Fetch transactions with VAT
    const { data: transactions, error: txError } = await this.supabase
      .from("account_transactions")
      .select("account_number, amount, vat_code, vat_amount")
      .eq("company_id", this.companyId)
      .gte("transaction_date", formatDate(periodStart))
      .lte("transaction_date", formatDate(periodEnd));

    if (txError) {
      throw new Error(`Failed to fetch transactions: ${txError.message}`);
    }

    let outputVat = 0;
    let inputVat = 0;
    const byRate = new Map<
      number,
      { baseAmount: number; vatAmount: number }
    >();

    for (const tx of transactions || []) {
      if (!tx.vat_code || !tx.vat_amount) continue;

      const rate = vatRateMap.get(tx.vat_code);
      if (rate === undefined) continue;

      const acctNum = parseInt(tx.account_number, 10);
      const isRevenue = acctNum >= 3000 && acctNum <= 3999;
      const isCost =
        (acctNum >= 4000 && acctNum <= 7999) ||
        (acctNum >= 6000 && acctNum <= 7999);

      if (isRevenue) {
        outputVat += Math.abs(tx.vat_amount);
      } else if (isCost) {
        inputVat += Math.abs(tx.vat_amount);
      }

      // Track by rate
      const existing = byRate.get(rate) || {
        baseAmount: 0,
        vatAmount: 0,
      };
      existing.baseAmount += Math.abs(tx.amount);
      existing.vatAmount += Math.abs(tx.vat_amount);
      byRate.set(rate, existing);
    }

    const breakdownByRate = Array.from(byRate.entries())
      .map(([rate, data]) => ({
        rate,
        baseAmount: data.baseAmount,
        vatAmount: data.vatAmount,
      }))
      .sort((a, b) => b.rate - a.rate);

    return {
      outputVat,
      inputVat,
      estimatedSettlement: outputVat - inputVat,
      breakdownByRate,
      confidence: "estimated",
    };
  }

  /**
   * Simple tax estimate: profit_before_tax * 0.22
   * Norwegian corporate tax rate. Marked as ROUGH_ESTIMATE.
   */
  async estimateTax(
    periodStart: Date,
    periodEnd: Date
  ): Promise<TaxEstimateResult> {
    // Import FinancialEngine lazily to avoid circular dependency
    const { FinancialEngine } = await import("./financial-engine");
    const financialEngine = new FinancialEngine(
      this.supabase,
      this.companyId
    );
    const profit = await financialEngine.getProfitAnalysis(
      periodStart,
      periodEnd
    );

    const profitBeforeTax = profit.profit_before_tax;
    const estimatedTax = Math.max(0, profitBeforeTax * NORWAY_CORPORATE_TAX_RATE);

    return {
      profitBeforeTax,
      estimatedTax,
      effectiveRate: NORWAY_CORPORATE_TAX_RATE,
      confidence: "rough_estimate",
      disclaimer:
        "Dette er et grovt estimat basert på resultat før skatt * 22%. " +
        "Faktisk skatt kan avvike vesentlig pga. permanente og midlertidige " +
        "forskjeller, fremførbare underskudd, og andre skattemessige justeringer. " +
        "Kontakt regnskapsfører for nøyaktig skatteberegning.",
    };
  }

  /**
   * Estimate next month's payroll based on last N months of payroll
   * account transactions. Include employer_tax estimate based on
   * historical ratio.
   */
  async estimatePayroll(
    basedOnMonths: number
  ): Promise<PayrollEstimateResult> {
    const now = new Date();
    const startDate = addMonths(now, -basedOnMonths);

    // Fetch payroll account transactions
    const { data: payrollTxs, error: payrollError } = await this.supabase
      .from("account_transactions")
      .select("transaction_date, amount, account_number")
      .eq("company_id", this.companyId)
      .gte("account_number", String(PAYROLL_ACCOUNT_MIN))
      .lte("account_number", String(PAYROLL_ACCOUNT_MAX))
      .gte("transaction_date", formatDate(startDate))
      .lte("transaction_date", formatDate(now));

    if (payrollError) {
      throw new Error(
        `Failed to fetch payroll transactions: ${payrollError.message}`
      );
    }

    // Fetch employer tax transactions for ratio calculation
    const { data: taxTxs, error: taxError } = await this.supabase
      .from("account_transactions")
      .select("transaction_date, amount")
      .eq("company_id", this.companyId)
      .gte("account_number", String(EMPLOYER_TAX_ACCOUNT_MIN))
      .lte("account_number", String(EMPLOYER_TAX_ACCOUNT_MAX))
      .gte("transaction_date", formatDate(startDate))
      .lte("transaction_date", formatDate(now));

    if (taxError) {
      throw new Error(
        `Failed to fetch employer tax transactions: ${taxError.message}`
      );
    }

    // Group payroll by month
    const monthlyPayroll = new Map<string, number>();
    for (const tx of payrollTxs || []) {
      const monthKey = tx.transaction_date.substring(0, 7); // YYYY-MM
      const existing = monthlyPayroll.get(monthKey) || 0;
      monthlyPayroll.set(monthKey, existing + tx.amount);
    }

    const monthlyHistory = Array.from(monthlyPayroll.entries())
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Calculate average monthly payroll
    const totalPayroll = monthlyHistory.reduce(
      (sum, m) => sum + m.amount,
      0
    );
    const monthCount = monthlyHistory.length || 1;
    const estimatedGrossPayroll = totalPayroll / monthCount;

    // Calculate employer tax ratio
    const totalEmployerTax = (taxTxs || []).reduce(
      (sum, tx) => sum + tx.amount,
      0
    );
    const employerTaxRatio =
      totalPayroll > 0 ? totalEmployerTax / totalPayroll : 0.141; // Default 14.1%

    const estimatedEmployerTax = estimatedGrossPayroll * employerTaxRatio;

    return {
      estimatedGrossPayroll,
      estimatedEmployerTax,
      estimatedTotal: estimatedGrossPayroll + estimatedEmployerTax,
      basedOnMonths: monthCount,
      monthlyHistory,
      confidence:
        monthCount >= 3 ? "estimated" : "low_confidence",
    };
  }

  /**
   * Section 25: Combine all upcoming obligations into a timeline.
   * Payroll, withholding_tax, employer_tax, supplier_payments, VAT,
   * recurring_costs.
   */
  async getUpcomingObligations(
    days: number
  ): Promise<UpcomingObligationResult[]> {
    const now = new Date();
    const horizon = addDays(now, days);
    const obligations: UpcomingObligationResult[] = [];

    // 1. Supplier payments
    const { PayablesEngine } = await import("./payables-engine");
    const payablesEngine = new PayablesEngine(
      this.supabase,
      this.companyId
    );
    const upcomingPayments = await payablesEngine.getUpcomingPayments(days);

    for (const payment of upcomingPayments) {
      obligations.push({
        date: payment.dueDate,
        category: "supplier_payment",
        description: `Leverandørbetaling: ${payment.supplierName || payment.invoiceNumber || "Ukjent"}`,
        amount: payment.remainingAmount,
        isRecurring: false,
        confidence: "confirmed",
      });
    }

    // 2. Recurring costs
    const recurringCosts = await this.getRecurringCosts();
    for (const cost of recurringCosts) {
      if (!cost.nextExpected) continue;
      const nextDate = new Date(cost.nextExpected);
      if (nextDate > horizon) continue;

      obligations.push({
        date: cost.nextExpected,
        category: "recurring_cost",
        description: `${cost.supplierName || cost.description || "Gjentakende kostnad"} (${cost.frequency})`,
        amount: cost.avgAmount,
        isRecurring: true,
        confidence: cost.confidence,
      });
    }

    // 3. Payroll estimate (typically on the company's normal_payroll_date)
    const company = await this.loadCompanySettings();
    const payrollEstimate = await this.estimatePayroll(3);

    if (payrollEstimate.estimatedGrossPayroll > 0) {
      const payrollDay = company?.normal_payroll_date || 15;

      // Find next payroll dates within horizon
      let checkDate = new Date(now.getFullYear(), now.getMonth(), payrollDay);
      if (checkDate <= now) {
        checkDate = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          payrollDay
        );
      }

      while (checkDate <= horizon) {
        obligations.push({
          date: formatDate(checkDate),
          category: "payroll",
          description: "Lønnsutbetaling (estimert)",
          amount: payrollEstimate.estimatedGrossPayroll,
          isRecurring: true,
          confidence: payrollEstimate.confidence,
        });

        // Employer tax is due on the 15th of the month after payroll
        const taxDate = new Date(
          checkDate.getFullYear(),
          checkDate.getMonth() + 1,
          15
        );
        if (taxDate <= horizon) {
          obligations.push({
            date: formatDate(taxDate),
            category: "employer_tax",
            description: "Arbeidsgiveravgift (estimert)",
            amount: payrollEstimate.estimatedEmployerTax,
            isRecurring: true,
            confidence: payrollEstimate.confidence,
          });

          // Withholding tax due same date
          // Estimate as ~30% of gross payroll (typical for Norwegian employees)
          obligations.push({
            date: formatDate(taxDate),
            category: "withholding_tax",
            description: "Forskuddstrekk (estimert)",
            amount: payrollEstimate.estimatedGrossPayroll * 0.3,
            isRecurring: true,
            confidence: "rough_estimate",
          });
        }

        // Next month
        checkDate = new Date(
          checkDate.getFullYear(),
          checkDate.getMonth() + 1,
          payrollDay
        );
      }
    }

    // 4. VAT settlement (bi-monthly for most companies)
    const vatEstimate = await this.estimateVat(addMonths(now, -2), now);
    if (vatEstimate.estimatedSettlement > 0) {
      // VAT due dates: 10th of the month after the bi-monthly period
      // Periods: Jan-Feb (due Apr 10), Mar-Apr (due Jun 10), etc.
      const vatDueDates = this.getUpcomingVatDueDates(now, horizon);
      for (const vatDate of vatDueDates) {
        obligations.push({
          date: formatDate(vatDate),
          category: "vat",
          description: "MVA-oppgjør (estimert)",
          amount: vatEstimate.estimatedSettlement,
          isRecurring: true,
          confidence: "estimated",
        });
      }
    }

    // Sort by date
    return obligations.sort(
      (a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private async getStartingCash(): Promise<number> {
    // Get current cash position from bank/cash GL accounts (1900-1999)
    const { data: snapshots, error: snapError } = await this.supabase
      .from("trial_balance_snapshots")
      .select("account_number, closing_balance")
      .eq("company_id", this.companyId)
      .gte("account_number", String(CASH_ACCOUNT_MIN))
      .lte("account_number", String(CASH_ACCOUNT_MAX))
      .order("snapshot_date", { ascending: false })
      .limit(100);

    if (!snapError && snapshots && snapshots.length > 0) {
      const latestByAccount = new Map<string, number>();
      for (const s of snapshots) {
        if (!latestByAccount.has(s.account_number)) {
          latestByAccount.set(s.account_number, s.closing_balance);
        }
      }
      let total = 0;
      for (const balance of latestByAccount.values()) {
        total += balance;
      }
      return total;
    }

    // Fallback: sum all transactions on cash accounts
    const { data: transactions, error: txError } = await this.supabase
      .from("account_transactions")
      .select("amount")
      .eq("company_id", this.companyId)
      .gte("account_number", String(CASH_ACCOUNT_MIN))
      .lte("account_number", String(CASH_ACCOUNT_MAX));

    if (txError) {
      throw new Error(
        `Failed to fetch cash transactions: ${txError.message}`
      );
    }

    let total = 0;
    for (const tx of transactions || []) {
      total += tx.amount;
    }
    return total;
  }

  private async getSupplierPaymentsDue(days: number): Promise<number> {
    const now = new Date();
    const horizon = addDays(now, days);

    const { data: invoices, error } = await this.supabase
      .from("incoming_invoices")
      .select("remaining_amount")
      .eq("company_id", this.companyId)
      .gt("remaining_amount", 0)
      .lte("due_date", formatDate(horizon));

    if (error) {
      throw new Error(
        `Failed to fetch supplier invoices: ${error.message}`
      );
    }

    let total = 0;
    for (const inv of invoices || []) {
      total += Math.abs(inv.remaining_amount || 0);
    }
    return total;
  }

  private async loadCustomerPaymentProfiles(
    customerIds: string[]
  ): Promise<
    Map<
      string,
      {
        avg_days_after_due: number | null;
        late_payment_ratio: number | null;
      }
    >
  > {
    const map = new Map<
      string,
      {
        avg_days_after_due: number | null;
        late_payment_ratio: number | null;
      }
    >();
    if (customerIds.length === 0) return map;

    const { data: profiles } = await this.supabase
      .from("customer_payment_profiles")
      .select(
        "customer_id, avg_days_after_due, late_payment_ratio"
      )
      .eq("company_id", this.companyId)
      .in("customer_id", customerIds);

    for (const p of profiles || []) {
      map.set(p.customer_id, {
        avg_days_after_due: p.avg_days_after_due,
        late_payment_ratio: p.late_payment_ratio,
      });
    }
    return map;
  }

  private async loadCustomerNames(
    customerIds: string[]
  ): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    if (customerIds.length === 0) return names;

    const { data: customers } = await this.supabase
      .from("customers")
      .select("id, name")
      .eq("company_id", this.companyId)
      .in("id", customerIds);

    for (const c of customers || []) {
      names.set(c.id, c.name);
    }
    return names;
  }

  private async loadCompanySettings(): Promise<{
    normal_payroll_date: number | null;
    min_liquidity_buffer: number | null;
  } | null> {
    const { data, error } = await this.supabase
      .from("companies")
      .select("normal_payroll_date, min_liquidity_buffer")
      .eq("id", this.companyId)
      .single();

    if (error) return null;
    return data;
  }

  /**
   * Detect recurring cost patterns from transaction history.
   * Groups by description, looks for same-ish amounts at regular intervals.
   */
  private async detectRecurringPatterns(): Promise<RecurringCostResult[]> {
    const now = new Date();
    const lookback = addMonths(now, -6);

    const { data: transactions, error } = await this.supabase
      .from("account_transactions")
      .select("id, description, amount, transaction_date, account_number")
      .eq("company_id", this.companyId)
      .gte("transaction_date", formatDate(lookback))
      .lte("transaction_date", formatDate(now))
      .gte("account_number", "4000")
      .lte("account_number", "7999")
      .order("transaction_date", { ascending: true });

    if (error || !transactions || transactions.length === 0) {
      return [];
    }

    // Group transactions by description (normalized)
    const groups = new Map<
      string,
      Array<{ date: string; amount: number; id: string }>
    >();

    for (const tx of transactions) {
      if (!tx.description) continue;
      const key = tx.description.toLowerCase().trim();
      const existing = groups.get(key) || [];
      existing.push({
        date: tx.transaction_date,
        amount: tx.amount,
        id: tx.id,
      });
      groups.set(key, existing);
    }

    const results: RecurringCostResult[] = [];

    for (const [description, txGroup] of groups.entries()) {
      if (txGroup.length < 2) continue;

      // Check if amounts are similar (within 10%)
      const amounts = txGroup.map((t) => t.amount);
      const avgAmount =
        amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
      const allSimilar = amounts.every(
        (a) => Math.abs(a - avgAmount) / Math.abs(avgAmount) < 0.1
      );

      if (!allSimilar) continue;

      // Check if intervals are regular
      const dates = txGroup.map((t) => new Date(t.date));
      const intervals: number[] = [];
      for (let i = 1; i < dates.length; i++) {
        intervals.push(daysBetween(dates[i - 1], dates[i]));
      }

      if (intervals.length === 0) continue;

      const avgInterval =
        intervals.reduce((sum, i) => sum + i, 0) / intervals.length;

      // Determine frequency
      let frequency: string;
      if (avgInterval >= 25 && avgInterval <= 35) {
        frequency = "monthly";
      } else if (avgInterval >= 80 && avgInterval <= 100) {
        frequency = "quarterly";
      } else if (avgInterval >= 350 && avgInterval <= 380) {
        frequency = "yearly";
      } else {
        continue; // Not a recognized pattern
      }

      const lastOccurrence = txGroup[txGroup.length - 1].date;
      const nextExpected = formatDate(
        addDays(new Date(lastOccurrence), Math.round(avgInterval))
      );

      results.push({
        id: txGroup[0].id,
        supplierName: null,
        description,
        categoryKey: null,
        avgAmount,
        frequency,
        lastOccurrence,
        nextExpected,
        confidence: txGroup.length >= 4 ? "estimated" : "low_confidence",
      });
    }

    return results;
  }

  /**
   * Project total recurring costs over a number of days.
   */
  private projectRecurringCosts(
    costs: RecurringCostResult[],
    days: number
  ): number {
    let total = 0;

    for (const cost of costs) {
      let multiplier: number;
      switch (cost.frequency) {
        case "monthly":
          multiplier = days / 30;
          break;
        case "quarterly":
          multiplier = days / 90;
          break;
        case "yearly":
          multiplier = days / 365;
          break;
        default:
          multiplier = days / 30; // Default to monthly
      }
      total += cost.avgAmount * multiplier;
    }

    return total;
  }

  /**
   * Build weekly forecast breakdown.
   */
  private buildWeeklyBreakdown(
    startDate: Date,
    horizonDays: number,
    startingCash: number,
    expectedPayments: ExpectedPaymentResult[],
    totalSupplierOutflows: number,
    estimatedPayroll: number,
    estimatedEmployerTax: number,
    estimatedVat: number,
    recurringCosts: number
  ): WeeklyForecastItem[] {
    const weeks: WeeklyForecastItem[] = [];
    const totalWeeks = Math.ceil(horizonDays / 7);

    // Spread outflows evenly across weeks for simplified projection
    const weeklyOutflow =
      (totalSupplierOutflows +
        estimatedPayroll +
        estimatedEmployerTax +
        estimatedVat +
        recurringCosts) /
      totalWeeks;

    // Group expected payments by week
    const paymentsByWeek = new Map<number, number>();
    for (const payment of expectedPayments) {
      const payDate = new Date(payment.expectedPaymentDate);
      const weekIndex = Math.floor(
        daysBetween(startDate, payDate) / 7
      );
      if (weekIndex >= 0 && weekIndex < totalWeeks) {
        const existing = paymentsByWeek.get(weekIndex) || 0;
        paymentsByWeek.set(weekIndex, existing + payment.amount);
      }
    }

    let runningBalance = startingCash;

    for (let w = 0; w < totalWeeks; w++) {
      const weekStart = addDays(startDate, w * 7);
      const weekEnd = addDays(startDate, (w + 1) * 7 - 1);

      const inflows = paymentsByWeek.get(w) || 0;
      const outflows = weeklyOutflow;
      const netChange = inflows - outflows;
      runningBalance += netChange;

      weeks.push({
        weekStart: formatDate(weekStart),
        weekEnd: formatDate(weekEnd),
        inflows,
        outflows,
        netChange,
        projectedBalance: runningBalance,
      });
    }

    return weeks;
  }

  /**
   * Get upcoming VAT due dates within a horizon.
   * Norwegian VAT periods are bi-monthly, with deadline on the 10th
   * of the month following the period.
   */
  private getUpcomingVatDueDates(now: Date, horizon: Date): Date[] {
    // VAT due dates: Apr 10, Jun 10, Aug 10, Oct 10, Dec 10, Feb 10
    const vatMonths = [2, 4, 6, 8, 10, 12]; // Feb, Apr, Jun, Aug, Oct, Dec
    const dates: Date[] = [];

    for (let yearOffset = 0; yearOffset <= 1; yearOffset++) {
      const year = now.getFullYear() + yearOffset;
      for (const month of vatMonths) {
        const dueDate = new Date(year, month - 1, 10);
        if (dueDate > now && dueDate <= horizon) {
          dates.push(dueDate);
        }
      }
    }

    return dates;
  }
}
