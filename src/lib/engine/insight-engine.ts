import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

// ─── Insight types ────────────────────────────────────────────────────────

export type InsightType =
  | "REVENUE_DOWN"
  | "MARGIN_DOWN"
  | "PAYROLL_GROWING_FASTER"
  | "HIGH_OVERDUE_RECEIVABLES"
  | "CUSTOMER_CONCENTRATION"
  | "LOW_CASH_FORECAST"
  | "COST_INCREASE"
  | "NEGATIVE_WORKING_CAPITAL";

export type InsightSeverity = "info" | "low" | "medium" | "high" | "critical";

export interface InsightResult {
  type: InsightType;
  severity: InsightSeverity;
  title_nb: string;
  description_nb: string;
  metric_current: number | null;
  metric_reference: number | null;
  evidence: Record<string, unknown>;
}

// ─── Thresholds ───────────────────────────────────────────────────────────

const THRESHOLDS = {
  /** Revenue drop > 15% triggers REVENUE_DOWN */
  REVENUE_DROP_PERCENT: 15,
  /** Operating margin drop > 5 percentage points triggers MARGIN_DOWN */
  MARGIN_DROP_PP: 5,
  /** Payroll growth exceeding revenue growth by > 10pp triggers PAYROLL_GROWING_FASTER */
  PAYROLL_VS_REVENUE_PP: 10,
  /** Overdue AR > 20% of total triggers HIGH_OVERDUE_RECEIVABLES */
  OVERDUE_AR_PERCENT: 20,
  /** Single customer > 35% of revenue triggers CUSTOMER_CONCENTRATION */
  CUSTOMER_CONCENTRATION_PERCENT: 35,
  /** Cost category increase > 30% triggers COST_INCREASE */
  COST_INCREASE_PERCENT: 30,
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function safePercent(
  numerator: number,
  denominator: number
): number | null {
  if (denominator === 0) return null;
  return (numerator / denominator) * 100;
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

// ─── InsightEngine class ──────────────────────────────────────────────────

export class InsightEngine {
  private supabase: SupabaseClient<Database>;
  private companyId: string;

  constructor(supabase: SupabaseClient<Database>, companyId: string) {
    this.supabase = supabase;
    this.companyId = companyId;
  }

  /**
   * Section 29: Run all insight rules and return active insights.
   * Each rule is checked independently. An insight is returned only
   * when the threshold condition is met.
   */
  async generateInsights(
    periodStart: Date,
    periodEnd: Date,
    comparisonStart: Date,
    comparisonEnd: Date
  ): Promise<InsightResult[]> {
    // Lazy-import engines to avoid circular dependencies
    const { FinancialEngine } = await import("./financial-engine");
    const { ReceivablesEngine } = await import("./receivables-engine");
    const { ForecastEngine } = await import("./forecast-engine");

    const financial = new FinancialEngine(this.supabase, this.companyId);
    const receivables = new ReceivablesEngine(this.supabase, this.companyId);
    const forecast = new ForecastEngine(this.supabase, this.companyId);

    // Gather all the data we need in parallel
    const [
      currentRevenue,
      previousRevenue,
      currentProfit,
      previousProfit,
      currentPersonnel,
      previousPersonnel,
      currentCosts,
      previousCosts,
      receivablesSummary,
      customerRevenue,
      cashForecast,
      workingCapitalData,
    ] = await Promise.all([
      financial.getRevenue(periodStart, periodEnd),
      financial.getRevenue(comparisonStart, comparisonEnd),
      financial.getProfitAnalysis(periodStart, periodEnd),
      financial.getProfitAnalysis(comparisonStart, comparisonEnd),
      financial.getPersonnelCosts(periodStart, periodEnd),
      financial.getPersonnelCosts(comparisonStart, comparisonEnd),
      financial.getCostAnalysis(periodStart, periodEnd),
      financial.getCostAnalysis(comparisonStart, comparisonEnd),
      receivables
        .getReceivablesSummary(periodEnd)
        .catch(() => null),
      this.getRevenueByCustomer(periodStart, periodEnd),
      forecast.getCashForecast(90).catch(() => null),
      this.getWorkingCapitalData(),
    ]);

    const insights: InsightResult[] = [];

    // ─── Rule: REVENUE_DOWN ─────────────────────────────────────────────

    const revenueChange = pctChange(
      currentRevenue.amount,
      previousRevenue.amount
    );
    if (revenueChange !== null && revenueChange < -THRESHOLDS.REVENUE_DROP_PERCENT) {
      const severity = this.classifyRevenueSeverity(revenueChange);
      insights.push({
        type: "REVENUE_DOWN",
        severity,
        title_nb: "Omsetningen har falt",
        description_nb:
          `Omsetningen falt ${Math.abs(revenueChange).toFixed(1)}% ` +
          `fra kr ${previousRevenue.amount.toLocaleString("nb-NO")} ` +
          `til kr ${currentRevenue.amount.toLocaleString("nb-NO")} ` +
          `sammenlignet med forrige periode.`,
        metric_current: currentRevenue.amount,
        metric_reference: previousRevenue.amount,
        evidence: {
          change_percent: revenueChange,
          current_period: {
            start: formatDate(periodStart),
            end: formatDate(periodEnd),
          },
          comparison_period: {
            start: formatDate(comparisonStart),
            end: formatDate(comparisonEnd),
          },
        },
      });
    }

    // ─── Rule: MARGIN_DOWN ──────────────────────────────────────────────

    const currentMargin = currentProfit.operating_margin;
    const previousMargin = previousProfit.operating_margin;
    if (
      currentMargin !== null &&
      previousMargin !== null
    ) {
      const marginDrop = previousMargin - currentMargin;
      if (marginDrop > THRESHOLDS.MARGIN_DROP_PP) {
        insights.push({
          type: "MARGIN_DOWN",
          severity: marginDrop > 10 ? "high" : "medium",
          title_nb: "Driftsmarginen har falt",
          description_nb:
            `Driftsmarginen falt fra ${previousMargin.toFixed(1)}% ` +
            `til ${currentMargin.toFixed(1)}%, en nedgang på ` +
            `${marginDrop.toFixed(1)} prosentpoeng.`,
          metric_current: currentMargin,
          metric_reference: previousMargin,
          evidence: {
            margin_drop_pp: marginDrop,
          },
        });
      }
    }

    // ─── Rule: PAYROLL_GROWING_FASTER ───────────────────────────────────

    const payrollGrowth = pctChange(
      currentPersonnel.total,
      previousPersonnel.total
    );
    if (
      revenueChange !== null &&
      payrollGrowth !== null &&
      payrollGrowth - (revenueChange > 0 ? revenueChange : 0) >
        THRESHOLDS.PAYROLL_VS_REVENUE_PP
    ) {
      insights.push({
        type: "PAYROLL_GROWING_FASTER",
        severity: "medium",
        title_nb: "Lønnskostnadene vokser raskere enn omsetningen",
        description_nb:
          `Lønnskostnadene økte ${payrollGrowth.toFixed(1)}% mens ` +
          `omsetningen ${revenueChange > 0 ? "økte" : "falt"} ` +
          `${Math.abs(revenueChange).toFixed(1)}%. ` +
          `Differansen er ${(payrollGrowth - (revenueChange > 0 ? revenueChange : 0)).toFixed(1)} prosentpoeng.`,
        metric_current: currentPersonnel.total,
        metric_reference: previousPersonnel.total,
        evidence: {
          payroll_growth_percent: payrollGrowth,
          revenue_growth_percent: revenueChange,
          gap_pp:
            payrollGrowth - (revenueChange > 0 ? revenueChange : 0),
        },
      });
    }

    // ─── Rule: HIGH_OVERDUE_RECEIVABLES ─────────────────────────────────

    if (receivablesSummary) {
      const overduePercent = safePercent(
        receivablesSummary.totalOverdue,
        receivablesSummary.totalOutstanding
      );
      if (
        overduePercent !== null &&
        overduePercent > THRESHOLDS.OVERDUE_AR_PERCENT
      ) {
        insights.push({
          type: "HIGH_OVERDUE_RECEIVABLES",
          severity: overduePercent > 40 ? "high" : "medium",
          title_nb: "Høy andel forfalte kundefordringer",
          description_nb:
            `${overduePercent.toFixed(1)}% av utestående kundefordringer er forfalt ` +
            `(kr ${receivablesSummary.totalOverdue.toLocaleString("nb-NO")} ` +
            `av kr ${receivablesSummary.totalOutstanding.toLocaleString("nb-NO")}).`,
          metric_current: receivablesSummary.totalOverdue,
          metric_reference: receivablesSummary.totalOutstanding,
          evidence: {
            overdue_percent: overduePercent,
            overdue_count: receivablesSummary.countOverdue,
            total_count: receivablesSummary.countOutstanding,
          },
        });
      }
    }

    // ─── Rule: CUSTOMER_CONCENTRATION ───────────────────────────────────

    if (
      customerRevenue.length > 0 &&
      currentRevenue.amount > 0
    ) {
      const topCustomer = customerRevenue[0];
      const concentrationPercent = safePercent(
        topCustomer.amount,
        currentRevenue.amount
      );

      if (
        concentrationPercent !== null &&
        concentrationPercent > THRESHOLDS.CUSTOMER_CONCENTRATION_PERCENT
      ) {
        insights.push({
          type: "CUSTOMER_CONCENTRATION",
          severity: concentrationPercent > 50 ? "high" : "medium",
          title_nb: "Høy kundeavhengighet",
          description_nb:
            `Kunde "${topCustomer.customerName}" står for ` +
            `${concentrationPercent.toFixed(1)}% av omsetningen ` +
            `(kr ${topCustomer.amount.toLocaleString("nb-NO")}). ` +
            `Dette gir høy risiko ved kundefrafall.`,
          metric_current: topCustomer.amount,
          metric_reference: currentRevenue.amount,
          evidence: {
            customer_id: topCustomer.customerId,
            customer_name: topCustomer.customerName,
            concentration_percent: concentrationPercent,
          },
        });
      }
    }

    // ─── Rule: LOW_CASH_FORECAST ────────────────────────────────────────

    if (cashForecast) {
      const company = await this.loadCompanySettings();
      const threshold = company?.min_liquidity_buffer || 0;

      if (
        threshold > 0 &&
        cashForecast.estimatedFutureCash < threshold
      ) {
        insights.push({
          type: "LOW_CASH_FORECAST",
          severity:
            cashForecast.estimatedFutureCash < 0 ? "critical" : "high",
          title_nb: "Lav likviditetsprognose",
          description_nb:
            `Estimert kontantbeholdning om ${cashForecast.horizonDays} dager er ` +
            `kr ${cashForecast.estimatedFutureCash.toLocaleString("nb-NO")}, ` +
            `som er under terskelverdi på kr ${threshold.toLocaleString("nb-NO")}.`,
          metric_current: cashForecast.estimatedFutureCash,
          metric_reference: threshold,
          evidence: {
            starting_cash: cashForecast.startingCash,
            expected_inflows: cashForecast.expectedCustomerPayments,
            expected_outflows:
              cashForecast.supplierPayments +
              cashForecast.estimatedPayroll +
              cashForecast.estimatedEmployerTax +
              cashForecast.estimatedVat +
              cashForecast.recurringCosts,
            horizon_days: cashForecast.horizonDays,
          },
        });
      }

      // Also trigger if cash goes negative even without threshold
      if (
        threshold === 0 &&
        cashForecast.estimatedFutureCash < 0
      ) {
        insights.push({
          type: "LOW_CASH_FORECAST",
          severity: "critical",
          title_nb: "Negativ likviditetsprognose",
          description_nb:
            `Estimert kontantbeholdning om ${cashForecast.horizonDays} dager er ` +
            `kr ${cashForecast.estimatedFutureCash.toLocaleString("nb-NO")}. ` +
            `Det kan oppstå likviditetsproblemer.`,
          metric_current: cashForecast.estimatedFutureCash,
          metric_reference: 0,
          evidence: {
            starting_cash: cashForecast.startingCash,
            horizon_days: cashForecast.horizonDays,
          },
        });
      }
    }

    // ─── Rule: COST_INCREASE ────────────────────────────────────────────

    const previousCostMap = new Map(
      previousCosts.map((c) => [c.category, c])
    );

    for (const currentCost of currentCosts) {
      const prevCost = previousCostMap.get(currentCost.category);
      if (!prevCost || prevCost.amount === 0) continue;

      const costChange = pctChange(currentCost.amount, prevCost.amount);
      if (
        costChange !== null &&
        costChange > THRESHOLDS.COST_INCREASE_PERCENT
      ) {
        insights.push({
          type: "COST_INCREASE",
          severity: costChange > 50 ? "high" : "medium",
          title_nb: `Stor økning i ${currentCost.categoryNameNb.toLowerCase()}`,
          description_nb:
            `${currentCost.categoryNameNb} økte ${costChange.toFixed(1)}% ` +
            `fra kr ${prevCost.amount.toLocaleString("nb-NO")} ` +
            `til kr ${currentCost.amount.toLocaleString("nb-NO")}.`,
          metric_current: currentCost.amount,
          metric_reference: prevCost.amount,
          evidence: {
            category: currentCost.category,
            change_percent: costChange,
            change_amount: currentCost.amount - prevCost.amount,
          },
        });
      }
    }

    // ─── Rule: NEGATIVE_WORKING_CAPITAL ─────────────────────────────────

    if (workingCapitalData) {
      const { currentAssets, currentLiabilities } = workingCapitalData;
      if (currentAssets < currentLiabilities && currentLiabilities > 0) {
        const deficit = currentLiabilities - currentAssets;
        insights.push({
          type: "NEGATIVE_WORKING_CAPITAL",
          severity: deficit > currentLiabilities * 0.5 ? "critical" : "high",
          title_nb: "Negativ arbeidskapital",
          description_nb:
            `Omløpsmidler (kr ${currentAssets.toLocaleString("nb-NO")}) er lavere enn ` +
            `kortsiktig gjeld (kr ${currentLiabilities.toLocaleString("nb-NO")}). ` +
            `Differansen er kr ${deficit.toLocaleString("nb-NO")}.`,
          metric_current: currentAssets,
          metric_reference: currentLiabilities,
          evidence: {
            current_assets: currentAssets,
            current_liabilities: currentLiabilities,
            working_capital: currentAssets - currentLiabilities,
          },
        });
      }
    }

    // Sort insights by severity (critical first)
    const severityOrder: Record<InsightSeverity, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      info: 4,
    };

    return insights.sort(
      (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
    );
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private classifyRevenueSeverity(
    revenueChangePercent: number
  ): InsightSeverity {
    const drop = Math.abs(revenueChangePercent);
    if (drop > 40) return "critical";
    if (drop > 25) return "high";
    return "medium";
  }

  /**
   * Get revenue broken down by customer for concentration analysis.
   * Uses outgoing_invoices to attribute revenue to customers.
   */
  private async getRevenueByCustomer(
    periodStart: Date,
    periodEnd: Date
  ): Promise<
    Array<{
      customerId: string;
      customerName: string;
      amount: number;
    }>
  > {
    // Fetch invoices in period grouped by customer
    const { data: invoices, error: invError } = await this.supabase
      .from("outgoing_invoices")
      .select("customer_id, total_amount")
      .eq("company_id", this.companyId)
      .gte("invoice_date", formatDate(periodStart))
      .lte("invoice_date", formatDate(periodEnd))
      .not("customer_id", "is", null);

    if (invError || !invoices || invoices.length === 0) {
      return [];
    }

    // Aggregate by customer
    const byCustomer = new Map<string, number>();
    for (const inv of invoices) {
      if (!inv.customer_id) continue;
      const existing = byCustomer.get(inv.customer_id) || 0;
      byCustomer.set(inv.customer_id, existing + (inv.total_amount || 0));
    }

    // Fetch customer names
    const customerIds = [...byCustomer.keys()];
    const { data: customers } = await this.supabase
      .from("customers")
      .select("id, name")
      .eq("company_id", this.companyId)
      .in("id", customerIds);

    const nameMap = new Map<string, string>();
    for (const c of customers || []) {
      nameMap.set(c.id, c.name);
    }

    return Array.from(byCustomer.entries())
      .map(([customerId, amount]) => ({
        customerId,
        customerName: nameMap.get(customerId) || "Ukjent kunde",
        amount,
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  /**
   * Get working capital components: current assets vs current liabilities.
   * Current assets: cash (1900-1999), receivables (1500-1599), other current (1000-1499)
   * Current liabilities: payables (2400-2499), other short-term (2000-2399, 2500-2999)
   */
  private async getWorkingCapitalData(): Promise<{
    currentAssets: number;
    currentLiabilities: number;
  } | null> {
    const { data: snapshots, error } = await this.supabase
      .from("trial_balance_snapshots")
      .select("account_number, closing_balance")
      .eq("company_id", this.companyId)
      .order("snapshot_date", { ascending: false })
      .limit(1000);

    if (error || !snapshots || snapshots.length === 0) {
      return null;
    }

    // Take the latest snapshot per account
    const latestByAccount = new Map<string, number>();
    for (const s of snapshots) {
      if (!latestByAccount.has(s.account_number)) {
        latestByAccount.set(s.account_number, s.closing_balance);
      }
    }

    let currentAssets = 0;
    let currentLiabilities = 0;

    for (const [accountNumber, balance] of latestByAccount.entries()) {
      const num = parseInt(accountNumber, 10);
      if (isNaN(num)) continue;

      // Current assets: accounts 1000-1999
      if (num >= 1000 && num <= 1999) {
        currentAssets += balance;
      }
      // Current liabilities: accounts 2000-2999
      // (Simplified: treating all 2xxx as current liabilities)
      if (num >= 2000 && num <= 2999) {
        // Liabilities are negative in the GL (credit balances)
        currentLiabilities += Math.abs(balance);
      }
    }

    return { currentAssets, currentLiabilities };
  }

  private async loadCompanySettings(): Promise<{
    min_liquidity_buffer: number | null;
  } | null> {
    const { data, error } = await this.supabase
      .from("companies")
      .select("min_liquidity_buffer")
      .eq("id", this.companyId)
      .single();

    if (error) return null;
    return data;
  }
}
