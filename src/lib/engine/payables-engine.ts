import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

// ─── Result types ─────────────────────────────────────────────────────────

export interface PayablesSummaryResult {
  asOfDate: Date;
  totalOutstanding: number;
  overdue: number;
  dueWithin7Days: number;
  dueWithin14Days: number;
  dueWithin30Days: number;
  dueWithin60Days: number;
  dueWithin90Days: number;
  countOutstanding: number;
  countOverdue: number;
}

export interface UpcomingPaymentResult {
  supplierId: string | null;
  supplierName: string | null;
  invoiceId: string;
  invoiceNumber: string | null;
  amount: number;
  remainingAmount: number;
  dueDate: string;
  daysUntilDue: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function daysBetween(dateA: Date, dateB: Date): number {
  const msPerDay = 86400000;
  return Math.floor((dateB.getTime() - dateA.getTime()) / msPerDay);
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

// ─── PayablesEngine class ─────────────────────────────────────────────────

export class PayablesEngine {
  private supabase: SupabaseClient<Database>;
  private companyId: string;

  constructor(supabase: SupabaseClient<Database>, companyId: string) {
    this.supabase = supabase;
    this.companyId = companyId;
  }

  /**
   * Total payables summary with due-date buckets as of a given date.
   */
  async getPayablesSummary(asOfDate: Date): Promise<PayablesSummaryResult> {
    // Fetch open incoming invoices (supplier invoices)
    const { data: invoices, error: invError } = await this.supabase
      .from("incoming_invoices")
      .select(
        "id, supplier_id, due_date, remaining_amount, total_amount"
      )
      .eq("company_id", this.companyId)
      .gt("remaining_amount", 0);

    if (invError) {
      throw new Error(
        `Failed to fetch incoming invoices: ${invError.message}`
      );
    }

    // Also check supplier_ledger_entries for open items
    const { data: ledgerEntries, error: ledgerError } = await this.supabase
      .from("supplier_ledger_entries")
      .select("id, supplier_id, due_date, remaining_amount, amount")
      .eq("company_id", this.companyId)
      .eq("is_open", true);

    if (ledgerError) {
      throw new Error(
        `Failed to fetch supplier ledger entries: ${ledgerError.message}`
      );
    }

    // Build unified list of open payables
    interface OpenPayable {
      dueDate: Date | null;
      amount: number;
    }

    const openPayables: OpenPayable[] = [];

    // From incoming invoices (primary source)
    for (const inv of invoices || []) {
      const remaining = inv.remaining_amount ?? inv.total_amount ?? 0;
      if (remaining <= 0) continue;
      openPayables.push({
        dueDate: inv.due_date ? new Date(inv.due_date) : null,
        amount: Math.abs(remaining),
      });
    }

    // If no invoices, fall back to ledger entries
    if (openPayables.length === 0) {
      for (const entry of ledgerEntries || []) {
        const remaining = entry.remaining_amount ?? entry.amount;
        if (remaining === 0) continue;
        openPayables.push({
          dueDate: entry.due_date ? new Date(entry.due_date) : null,
          amount: Math.abs(remaining),
        });
      }
    }

    let totalOutstanding = 0;
    let overdue = 0;
    let dueWithin7Days = 0;
    let dueWithin14Days = 0;
    let dueWithin30Days = 0;
    let dueWithin60Days = 0;
    let dueWithin90Days = 0;
    let countOutstanding = 0;
    let countOverdue = 0;

    for (const payable of openPayables) {
      totalOutstanding += payable.amount;
      countOutstanding++;

      if (!payable.dueDate) continue;

      const daysUntilDue = daysBetween(asOfDate, payable.dueDate);

      if (daysUntilDue < 0) {
        // Already overdue
        overdue += payable.amount;
        countOverdue++;
      } else {
        // Due in the future: classify into buckets (cumulative)
        if (daysUntilDue <= 7) dueWithin7Days += payable.amount;
        if (daysUntilDue <= 14) dueWithin14Days += payable.amount;
        if (daysUntilDue <= 30) dueWithin30Days += payable.amount;
        if (daysUntilDue <= 60) dueWithin60Days += payable.amount;
        if (daysUntilDue <= 90) dueWithin90Days += payable.amount;
      }
    }

    return {
      asOfDate,
      totalOutstanding,
      overdue,
      dueWithin7Days,
      dueWithin14Days,
      dueWithin30Days,
      dueWithin60Days,
      dueWithin90Days,
      countOutstanding,
      countOverdue,
    };
  }

  /**
   * List upcoming supplier payments within the next N days,
   * sorted by due date ascending (most urgent first).
   */
  async getUpcomingPayments(
    days: number
  ): Promise<UpcomingPaymentResult[]> {
    const now = new Date();
    const horizon = addDays(now, days);

    // Fetch open incoming invoices due within the horizon
    const { data: invoices, error: invError } = await this.supabase
      .from("incoming_invoices")
      .select(
        "id, supplier_id, invoice_number, total_amount, remaining_amount, due_date"
      )
      .eq("company_id", this.companyId)
      .gt("remaining_amount", 0)
      .gte("due_date", formatDate(now))
      .lte("due_date", formatDate(horizon))
      .order("due_date", { ascending: true });

    if (invError) {
      throw new Error(
        `Failed to fetch upcoming invoices: ${invError.message}`
      );
    }

    if (!invoices || invoices.length === 0) {
      // Fall back to supplier ledger entries
      return this.getUpcomingFromLedger(now, horizon);
    }

    // Fetch supplier names
    const supplierIds = [
      ...new Set(
        invoices
          .map((inv) => inv.supplier_id)
          .filter((id): id is string => id !== null)
      ),
    ];

    const supplierNames = await this.loadSupplierNames(supplierIds);

    return invoices.map((inv) => {
      const dueDate = new Date(inv.due_date!);
      return {
        supplierId: inv.supplier_id,
        supplierName: inv.supplier_id
          ? supplierNames.get(inv.supplier_id) || null
          : null,
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        amount: Math.abs(inv.total_amount || 0),
        remainingAmount: Math.abs(inv.remaining_amount || 0),
        dueDate: inv.due_date!,
        daysUntilDue: daysBetween(now, dueDate),
      };
    });
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private async getUpcomingFromLedger(
    now: Date,
    horizon: Date
  ): Promise<UpcomingPaymentResult[]> {
    const { data: entries, error } = await this.supabase
      .from("supplier_ledger_entries")
      .select(
        "id, supplier_id, invoice_number, amount, remaining_amount, due_date"
      )
      .eq("company_id", this.companyId)
      .eq("is_open", true)
      .gte("due_date", formatDate(now))
      .lte("due_date", formatDate(horizon))
      .order("due_date", { ascending: true });

    if (error) {
      throw new Error(
        `Failed to fetch supplier ledger entries: ${error.message}`
      );
    }

    if (!entries || entries.length === 0) return [];

    const supplierIds = [
      ...new Set(
        entries
          .map((e) => e.supplier_id)
          .filter((id): id is string => id !== null)
      ),
    ];

    const supplierNames = await this.loadSupplierNames(supplierIds);

    return entries.map((entry) => {
      const dueDate = new Date(entry.due_date!);
      return {
        supplierId: entry.supplier_id,
        supplierName: entry.supplier_id
          ? supplierNames.get(entry.supplier_id) || null
          : null,
        invoiceId: entry.id,
        invoiceNumber: entry.invoice_number,
        amount: Math.abs(entry.amount),
        remainingAmount: Math.abs(entry.remaining_amount ?? entry.amount),
        dueDate: entry.due_date!,
        daysUntilDue: daysBetween(now, dueDate),
      };
    });
  }

  private async loadSupplierNames(
    supplierIds: string[]
  ): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    if (supplierIds.length === 0) return names;

    const { data: suppliers } = await this.supabase
      .from("suppliers")
      .select("id, name")
      .eq("company_id", this.companyId)
      .in("id", supplierIds);

    for (const s of suppliers || []) {
      names.set(s.id, s.name);
    }
    return names;
  }
}
