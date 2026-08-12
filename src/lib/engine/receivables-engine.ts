import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

// ─── Result types ─────────────────────────────────────────────────────────

export interface AgingBucket {
  label: string;
  minDays: number;
  maxDays: number | null;
  amount: number;
  count: number;
  percentage: number;
}

export interface ReceivablesSummaryResult {
  asOfDate: Date;
  totalOutstanding: number;
  totalOverdue: number;
  countOutstanding: number;
  countOverdue: number;
  aging: {
    not_due: AgingBucket;
    days_1_14: AgingBucket;
    days_15_30: AgingBucket;
    days_31_60: AgingBucket;
    days_61_90: AgingBucket;
    days_90_plus: AgingBucket;
  };
}

export interface CustomerPaymentProfileResult {
  customerId: string;
  customerName: string;
  totalInvoices: number;
  totalInvoiced: number;
  currentOutstanding: number;
  currentOverdue: number;
  avgAgreedTerms: number | null;
  avgActualPaymentDays: number | null;
  avgDaysAfterDue: number | null;
  latePaymentRatio: number | null;
  maxDelayDays: number | null;
  paymentTrend: "improving" | "worsening" | "stable" | "unknown";
}

export interface WorstPayerResult {
  customerId: string;
  customerName: string;
  latePaymentRatio: number;
  overdueAmount: number;
  avgDaysLate: number;
  totalOutstanding: number;
}

export interface OverdueInvoiceResult {
  invoiceId: string;
  invoiceNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  amount: number;
  remainingAmount: number;
  dueDate: string;
  daysOverdue: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function daysBetween(dateA: Date, dateB: Date): number {
  const msPerDay = 86400000;
  return Math.floor(
    (dateB.getTime() - dateA.getTime()) / msPerDay
  );
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

// ─── ReceivablesEngine class ──────────────────────────────────────────────

export class ReceivablesEngine {
  private supabase: SupabaseClient<Database>;
  private companyId: string;

  constructor(supabase: SupabaseClient<Database>, companyId: string) {
    this.supabase = supabase;
    this.companyId = companyId;
  }

  /**
   * Total receivables with aging buckets as of a given date.
   * Queries open customer_ledger_entries and outgoing_invoices.
   */
  async getReceivablesSummary(
    asOfDate: Date
  ): Promise<ReceivablesSummaryResult> {
    // Fetch open outgoing invoices with remaining balance
    const { data: invoices, error: invError } = await this.supabase
      .from("outgoing_invoices")
      .select("id, customer_id, due_date, remaining_amount, total_amount")
      .eq("company_id", this.companyId)
      .gt("remaining_amount", 0)
      .lte("invoice_date", formatDate(asOfDate));

    if (invError) {
      throw new Error(`Failed to fetch outgoing invoices: ${invError.message}`);
    }

    // Also check customer_ledger_entries for open items
    const { data: ledgerEntries, error: ledgerError } = await this.supabase
      .from("customer_ledger_entries")
      .select("id, customer_id, due_date, remaining_amount, amount")
      .eq("company_id", this.companyId)
      .eq("is_open", true)
      .lte("entry_date", formatDate(asOfDate));

    if (ledgerError) {
      throw new Error(
        `Failed to fetch customer ledger entries: ${ledgerError.message}`
      );
    }

    // Merge: prefer invoices as the primary source. Use ledger entries
    // as a supplement for any items that only appear there.
    interface OpenItem {
      dueDate: Date | null;
      amount: number;
    }

    const openItems: OpenItem[] = [];

    // From invoices
    for (const inv of invoices || []) {
      const remaining = inv.remaining_amount ?? inv.total_amount ?? 0;
      if (remaining <= 0) continue;
      openItems.push({
        dueDate: inv.due_date ? new Date(inv.due_date) : null,
        amount: remaining,
      });
    }

    // If no invoices, fall back to ledger entries
    if (openItems.length === 0) {
      for (const entry of ledgerEntries || []) {
        const remaining = entry.remaining_amount ?? entry.amount;
        if (remaining <= 0) continue;
        openItems.push({
          dueDate: entry.due_date ? new Date(entry.due_date) : null,
          amount: remaining,
        });
      }
    }

    // Build aging buckets
    const buckets = {
      not_due: this.createBucket("Ikke forfalt", 0, 0),
      days_1_14: this.createBucket("1-14 dager", 1, 14),
      days_15_30: this.createBucket("15-30 dager", 15, 30),
      days_31_60: this.createBucket("31-60 dager", 31, 60),
      days_61_90: this.createBucket("61-90 dager", 61, 90),
      days_90_plus: this.createBucket("Over 90 dager", 91, null),
    };

    let totalOutstanding = 0;
    let totalOverdue = 0;
    let countOutstanding = 0;
    let countOverdue = 0;

    for (const item of openItems) {
      totalOutstanding += item.amount;
      countOutstanding++;

      if (!item.dueDate) {
        // No due date: treat as not due
        buckets.not_due.amount += item.amount;
        buckets.not_due.count++;
        continue;
      }

      const daysOverdue = daysBetween(item.dueDate, asOfDate);

      if (daysOverdue <= 0) {
        buckets.not_due.amount += item.amount;
        buckets.not_due.count++;
      } else {
        totalOverdue += item.amount;
        countOverdue++;

        if (daysOverdue <= 14) {
          buckets.days_1_14.amount += item.amount;
          buckets.days_1_14.count++;
        } else if (daysOverdue <= 30) {
          buckets.days_15_30.amount += item.amount;
          buckets.days_15_30.count++;
        } else if (daysOverdue <= 60) {
          buckets.days_31_60.amount += item.amount;
          buckets.days_31_60.count++;
        } else if (daysOverdue <= 90) {
          buckets.days_61_90.amount += item.amount;
          buckets.days_61_90.count++;
        } else {
          buckets.days_90_plus.amount += item.amount;
          buckets.days_90_plus.count++;
        }
      }
    }

    // Calculate percentages
    if (totalOutstanding > 0) {
      for (const bucket of Object.values(buckets)) {
        bucket.percentage = (bucket.amount / totalOutstanding) * 100;
      }
    }

    return {
      asOfDate,
      totalOutstanding,
      totalOverdue,
      countOutstanding,
      countOverdue,
      aging: buckets,
    };
  }

  /**
   * Calculate payment profile for a specific customer.
   * Uses customer_ledger_entries to compute historical patterns.
   */
  async getCustomerPaymentProfile(
    customerId: string
  ): Promise<CustomerPaymentProfileResult> {
    // Fetch customer info
    const { data: customer, error: custError } = await this.supabase
      .from("customers")
      .select("id, name")
      .eq("company_id", this.companyId)
      .eq("id", customerId)
      .single();

    if (custError || !customer) {
      throw new Error(
        `Customer not found: ${custError?.message || "no data"}`
      );
    }

    // Fetch all ledger entries for this customer
    const { data: entries, error: entryError } = await this.supabase
      .from("customer_ledger_entries")
      .select("*")
      .eq("company_id", this.companyId)
      .eq("customer_id", customerId)
      .order("entry_date", { ascending: true });

    if (entryError) {
      throw new Error(
        `Failed to fetch customer ledger entries: ${entryError.message}`
      );
    }

    const allEntries = entries || [];

    // Separate invoices and payments
    const invoiceEntries = allEntries.filter(
      (e) => e.entry_type === "invoice" || (e.amount > 0 && !e.entry_type)
    );
    const paymentEntries = allEntries.filter(
      (e) => e.entry_type === "payment" || (e.amount < 0 && !e.entry_type)
    );

    const totalInvoices = invoiceEntries.length;
    const totalInvoiced = invoiceEntries.reduce(
      (sum, e) => sum + Math.abs(e.amount),
      0
    );

    // Current outstanding and overdue
    const now = new Date();
    let currentOutstanding = 0;
    let currentOverdue = 0;

    for (const entry of allEntries) {
      if (!entry.is_open) continue;
      const remaining = entry.remaining_amount ?? entry.amount;
      if (remaining <= 0) continue;
      currentOutstanding += remaining;

      if (entry.due_date && new Date(entry.due_date) < now) {
        currentOverdue += remaining;
      }
    }

    // Calculate payment timing stats
    let totalAgreedTermsDays = 0;
    let agreedTermsCount = 0;
    let totalActualPaymentDays = 0;
    let actualPaymentCount = 0;
    let totalDaysAfterDue = 0;
    let daysAfterDueCount = 0;
    let lateCount = 0;
    let maxDelayDays = 0;

    // Match invoices to payments to compute actual payment days
    for (const inv of invoiceEntries) {
      if (!inv.due_date) continue;

      const invDate = new Date(inv.entry_date);
      const dueDate = new Date(inv.due_date);

      // Agreed terms
      const agreedDays = daysBetween(invDate, dueDate);
      if (agreedDays > 0) {
        totalAgreedTermsDays += agreedDays;
        agreedTermsCount++;
      }

      // If invoice is closed, find matching payment
      if (!inv.is_open && inv.invoice_number) {
        const matchingPayment = paymentEntries.find(
          (p) => p.invoice_number === inv.invoice_number
        );
        if (matchingPayment) {
          const paymentDate = new Date(matchingPayment.entry_date);
          const actualDays = daysBetween(invDate, paymentDate);
          if (actualDays >= 0) {
            totalActualPaymentDays += actualDays;
            actualPaymentCount++;
          }

          const daysAfterDue = daysBetween(dueDate, paymentDate);
          if (daysAfterDue > 0) {
            totalDaysAfterDue += daysAfterDue;
            daysAfterDueCount++;
            lateCount++;
            if (daysAfterDue > maxDelayDays) {
              maxDelayDays = daysAfterDue;
            }
          }
        }
      }
    }

    const avgAgreedTerms =
      agreedTermsCount > 0
        ? totalAgreedTermsDays / agreedTermsCount
        : null;
    const avgActualPaymentDays =
      actualPaymentCount > 0
        ? totalActualPaymentDays / actualPaymentCount
        : null;
    const avgDaysAfterDue =
      daysAfterDueCount > 0
        ? totalDaysAfterDue / daysAfterDueCount
        : null;
    const latePaymentRatio =
      totalInvoices > 0 ? lateCount / totalInvoices : null;

    // Determine trend: compare first half of paid invoices to second half
    const paymentTrend = this.calculatePaymentTrend(
      invoiceEntries,
      paymentEntries
    );

    return {
      customerId: customer.id,
      customerName: customer.name,
      totalInvoices,
      totalInvoiced,
      currentOutstanding,
      currentOverdue,
      avgAgreedTerms,
      avgActualPaymentDays,
      avgDaysAfterDue,
      latePaymentRatio,
      maxDelayDays: maxDelayDays > 0 ? maxDelayDays : null,
      paymentTrend,
    };
  }

  /**
   * Top late-paying customers ranked by late_payment_ratio and overdue amount.
   */
  async getWorstPayers(limit: number = 10): Promise<WorstPayerResult[]> {
    // Fetch all customers with open overdue entries
    const { data: customers, error: custError } = await this.supabase
      .from("customers")
      .select("id, name")
      .eq("company_id", this.companyId)
      .eq("is_active", true);

    if (custError) {
      throw new Error(`Failed to fetch customers: ${custError.message}`);
    }

    if (!customers || customers.length === 0) {
      return [];
    }

    // Check for pre-computed payment profiles first
    const { data: profiles, error: profileError } = await this.supabase
      .from("customer_payment_profiles")
      .select("*")
      .eq("company_id", this.companyId);

    if (!profileError && profiles && profiles.length > 0) {
      // Use pre-computed profiles
      const customerMap = new Map(
        customers.map((c) => [c.id, c.name])
      );

      return profiles
        .filter(
          (p) =>
            (p.late_payment_ratio !== null && p.late_payment_ratio > 0) ||
            p.current_overdue > 0
        )
        .map((p) => ({
          customerId: p.customer_id,
          customerName: customerMap.get(p.customer_id) || "Unknown",
          latePaymentRatio: p.late_payment_ratio || 0,
          overdueAmount: p.current_overdue,
          avgDaysLate: p.avg_days_after_due || 0,
          totalOutstanding: p.current_outstanding,
        }))
        .sort((a, b) => {
          // Primary sort: late payment ratio desc
          const ratioDiff = b.latePaymentRatio - a.latePaymentRatio;
          if (Math.abs(ratioDiff) > 0.01) return ratioDiff;
          // Secondary sort: overdue amount desc
          return b.overdueAmount - a.overdueAmount;
        })
        .slice(0, limit);
    }

    // No pre-computed profiles: compute on the fly for each customer
    const results: WorstPayerResult[] = [];

    for (const customer of customers) {
      try {
        const profile = await this.getCustomerPaymentProfile(customer.id);
        if (
          (profile.latePaymentRatio !== null &&
            profile.latePaymentRatio > 0) ||
          profile.currentOverdue > 0
        ) {
          results.push({
            customerId: customer.id,
            customerName: customer.name,
            latePaymentRatio: profile.latePaymentRatio || 0,
            overdueAmount: profile.currentOverdue,
            avgDaysLate: profile.avgDaysAfterDue || 0,
            totalOutstanding: profile.currentOutstanding,
          });
        }
      } catch {
        // Skip customers where profile calculation fails
        continue;
      }
    }

    return results
      .sort((a, b) => {
        const ratioDiff = b.latePaymentRatio - a.latePaymentRatio;
        if (Math.abs(ratioDiff) > 0.01) return ratioDiff;
        return b.overdueAmount - a.overdueAmount;
      })
      .slice(0, limit);
  }

  /**
   * List all overdue invoices with customer info and days overdue.
   */
  async getOverdueInvoices(): Promise<OverdueInvoiceResult[]> {
    const now = new Date();

    const { data: invoices, error } = await this.supabase
      .from("outgoing_invoices")
      .select(
        "id, invoice_number, customer_id, total_amount, remaining_amount, due_date"
      )
      .eq("company_id", this.companyId)
      .gt("remaining_amount", 0)
      .lt("due_date", formatDate(now));

    if (error) {
      throw new Error(`Failed to fetch overdue invoices: ${error.message}`);
    }

    if (!invoices || invoices.length === 0) {
      return [];
    }

    // Fetch customer names
    const customerIds = [
      ...new Set(
        invoices
          .map((inv) => inv.customer_id)
          .filter((id): id is string => id !== null)
      ),
    ];

    const customerNames = new Map<string, string>();
    if (customerIds.length > 0) {
      const { data: customers } = await this.supabase
        .from("customers")
        .select("id, name")
        .eq("company_id", this.companyId)
        .in("id", customerIds);

      for (const c of customers || []) {
        customerNames.set(c.id, c.name);
      }
    }

    return invoices
      .map((inv) => {
        const dueDate = new Date(inv.due_date!);
        const daysOverdue = daysBetween(dueDate, now);

        return {
          invoiceId: inv.id,
          invoiceNumber: inv.invoice_number,
          customerId: inv.customer_id,
          customerName: inv.customer_id
            ? customerNames.get(inv.customer_id) || null
            : null,
          amount: inv.total_amount || 0,
          remainingAmount: inv.remaining_amount || 0,
          dueDate: inv.due_date!,
          daysOverdue,
        };
      })
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private createBucket(
    label: string,
    minDays: number,
    maxDays: number | null
  ): AgingBucket {
    return { label, minDays, maxDays, amount: 0, count: 0, percentage: 0 };
  }

  private calculatePaymentTrend(
    invoiceEntries: Array<{
      entry_date: string;
      due_date: string | null;
      is_open: boolean;
      invoice_number: string | null;
    }>,
    paymentEntries: Array<{
      entry_date: string;
      invoice_number: string | null;
    }>
  ): "improving" | "worsening" | "stable" | "unknown" {
    // Compute days-after-due for each paid invoice, ordered by date
    const delaysByDate: Array<{ date: Date; delay: number }> = [];

    for (const inv of invoiceEntries) {
      if (inv.is_open || !inv.due_date || !inv.invoice_number) continue;

      const dueDate = new Date(inv.due_date);
      const matching = paymentEntries.find(
        (p) => p.invoice_number === inv.invoice_number
      );
      if (!matching) continue;

      const paymentDate = new Date(matching.entry_date);
      const delay = daysBetween(dueDate, paymentDate);

      delaysByDate.push({ date: paymentDate, delay });
    }

    if (delaysByDate.length < 4) return "unknown";

    // Sort by payment date
    delaysByDate.sort((a, b) => a.date.getTime() - b.date.getTime());

    const midpoint = Math.floor(delaysByDate.length / 2);
    const firstHalf = delaysByDate.slice(0, midpoint);
    const secondHalf = delaysByDate.slice(midpoint);

    const avgFirst =
      firstHalf.reduce((sum, d) => sum + d.delay, 0) / firstHalf.length;
    const avgSecond =
      secondHalf.reduce((sum, d) => sum + d.delay, 0) / secondHalf.length;

    const difference = avgSecond - avgFirst;

    if (difference < -2) return "improving";
    if (difference > 2) return "worsening";
    return "stable";
  }
}
