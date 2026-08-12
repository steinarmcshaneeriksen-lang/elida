/**
 * Sync Service
 *
 * Orchestrates initial and incremental synchronization of accounting data
 * from any AccountingSystemAdapter into Elida's database.
 *
 * Each sync step is independent — a failure in one step logs the error and
 * continues to the next. Progress is tracked per resource type in
 * integration_sync_state so syncs can be resumed and monitored.
 */

import type {
  AccountingSystemAdapter,
  FinancialSettings,
  SyncResourceType,
  SyncState,
  SyncStatus,
} from "./types";

// ---------------------------------------------------------------------------
// Sync Step Result
// ---------------------------------------------------------------------------

interface SyncStepResult {
  resourceType: SyncResourceType;
  status: SyncStatus;
  recordCount: number;
  error?: string;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Sync Callbacks (dependency injection for persistence)
// ---------------------------------------------------------------------------

/**
 * The caller must supply a persistence layer. This avoids coupling the sync
 * logic to Supabase or any specific ORM.
 */
export interface SyncPersistence {
  /** Read the current sync state for a company + resource. */
  getSyncState(
    companyId: string,
    resourceType: SyncResourceType
  ): Promise<SyncState | null>;

  /** Create or update the sync state for a company + resource. */
  upsertSyncState(companyId: string, state: SyncState): Promise<void>;

  /** Persist an array of records (upsert by external_id where applicable). */
  upsertRecords(
    companyId: string,
    resourceType: SyncResourceType,
    records: Record<string, unknown>[]
  ): Promise<number>;

  /** Read the financial settings for a company (used to determine conversion date). */
  getFinancialSettings(companyId: string): Promise<FinancialSettings | null>;

  /** Persist financial settings. */
  upsertFinancialSettings(
    companyId: string,
    settings: FinancialSettings
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Logger interface
// ---------------------------------------------------------------------------

export interface SyncLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const defaultLogger: SyncLogger = {
  info: (msg, meta) =>
    console.log(`[sync] ${msg}`, meta ? JSON.stringify(meta) : ""),
  warn: (msg, meta) =>
    console.warn(`[sync] ${msg}`, meta ? JSON.stringify(meta) : ""),
  error: (msg, meta) =>
    console.error(`[sync] ${msg}`, meta ? JSON.stringify(meta) : ""),
};

// ---------------------------------------------------------------------------
// Sync Service
// ---------------------------------------------------------------------------

export class SyncService {
  private readonly persistence: SyncPersistence;
  private readonly logger: SyncLogger;

  constructor(persistence: SyncPersistence, logger?: SyncLogger) {
    this.persistence = persistence;
    this.logger = logger ?? defaultLogger;
  }

  // -------------------------------------------------------------------------
  // Initial Sync — Full 11-step sequence
  // -------------------------------------------------------------------------

  /**
   * Perform a full initial synchronization. Steps run sequentially because
   * later steps may depend on data from earlier ones (e.g., financial settings
   * determine the transaction date range).
   *
   * Each step is individually fault-tolerant: a failure is recorded in
   * sync_state but does not abort the remaining steps.
   */
  async initialSync(
    companyId: string,
    adapter: AccountingSystemAdapter
  ): Promise<SyncStepResult[]> {
    this.logger.info("Starting initial sync", {
      companyId,
      provider: adapter.provider,
    });

    const results: SyncStepResult[] = [];

    // Step 1: Integration info — check privileges
    results.push(
      await this.runStep(companyId, "integration_info", async () => {
        const info = await adapter.getIntegrationInfo();
        await this.persistence.upsertRecords(companyId, "integration_info", [
          info as unknown as Record<string, unknown>,
        ]);
        return 1;
      })
    );

    // Step 2: Financial settings & VAT codes
    let financialSettings: FinancialSettings | undefined;

    results.push(
      await this.runStep(companyId, "financial_settings", async () => {
        financialSettings = await adapter.getFinancialSettings();
        await this.persistence.upsertFinancialSettings(
          companyId,
          financialSettings
        );
        return 1;
      })
    );

    results.push(
      await this.runStep(companyId, "vat_codes", async () => {
        const vatCodes = await adapter.getVatCodes();
        return this.persistence.upsertRecords(
          companyId,
          "vat_codes",
          vatCodes as unknown as Record<string, unknown>[]
        );
      })
    );

    // Step 3: Chart of accounts
    results.push(
      await this.runStep(companyId, "chart_of_accounts", async () => {
        const accounts = await adapter.getChartOfAccounts();
        return this.persistence.upsertRecords(
          companyId,
          "chart_of_accounts",
          accounts as unknown as Record<string, unknown>[]
        );
      })
    );

    // Step 4: Trial balance (as of today)
    results.push(
      await this.runStep(companyId, "trial_balance", async () => {
        const entries = await adapter.getTrialBalance(new Date());
        return this.persistence.upsertRecords(
          companyId,
          "trial_balance",
          entries as unknown as Record<string, unknown>[]
        );
      })
    );

    // Step 5: Account transactions (24 months back, or from conversion date)
    results.push(
      await this.runStep(companyId, "account_transactions", async () => {
        const fromDate = this.calculateTransactionStartDate(financialSettings);
        const transactions = await adapter.getAccountTransactions({
          fromDate,
          toDate: new Date(),
        });
        return this.persistence.upsertRecords(
          companyId,
          "account_transactions",
          transactions as unknown as Record<string, unknown>[]
        );
      })
    );

    // Step 6: Customers
    results.push(
      await this.runStep(companyId, "customers", async () => {
        const customers = await adapter.getCustomers();
        return this.persistence.upsertRecords(
          companyId,
          "customers",
          customers as unknown as Record<string, unknown>[]
        );
      })
    );

    // Step 7: Customer ledger
    results.push(
      await this.runStep(companyId, "customer_ledger", async () => {
        const fromDate = this.calculateTransactionStartDate(financialSettings);
        const entries = await adapter.getCustomerLedger({
          fromDate,
          toDate: new Date(),
        });
        return this.persistence.upsertRecords(
          companyId,
          "customer_ledger",
          entries as unknown as Record<string, unknown>[]
        );
      })
    );

    // Step 8: Outgoing invoices
    results.push(
      await this.runStep(companyId, "outgoing_invoices", async () => {
        const fromDate = this.calculateTransactionStartDate(financialSettings);
        const invoices = await adapter.getOutgoingInvoices({
          fromDate,
          toDate: new Date(),
        });
        return this.persistence.upsertRecords(
          companyId,
          "outgoing_invoices",
          invoices as unknown as Record<string, unknown>[]
        );
      })
    );

    // Step 9: Suppliers
    results.push(
      await this.runStep(companyId, "suppliers", async () => {
        const suppliers = await adapter.getSuppliers();
        return this.persistence.upsertRecords(
          companyId,
          "suppliers",
          suppliers as unknown as Record<string, unknown>[]
        );
      })
    );

    // Step 10: Supplier ledger
    results.push(
      await this.runStep(companyId, "supplier_ledger", async () => {
        const fromDate = this.calculateTransactionStartDate(financialSettings);
        const entries = await adapter.getSupplierLedger({
          fromDate,
          toDate: new Date(),
        });
        return this.persistence.upsertRecords(
          companyId,
          "supplier_ledger",
          entries as unknown as Record<string, unknown>[]
        );
      })
    );

    // Step 11: Incoming invoices, projects, departments
    results.push(
      await this.runStep(companyId, "incoming_invoices", async () => {
        const fromDate = this.calculateTransactionStartDate(financialSettings);
        const invoices = await adapter.getIncomingInvoices({
          fromDate,
          toDate: new Date(),
        });
        return this.persistence.upsertRecords(
          companyId,
          "incoming_invoices",
          invoices as unknown as Record<string, unknown>[]
        );
      })
    );

    results.push(
      await this.runStep(companyId, "projects", async () => {
        const projects = await adapter.getProjects();
        return this.persistence.upsertRecords(
          companyId,
          "projects",
          projects as unknown as Record<string, unknown>[]
        );
      })
    );

    results.push(
      await this.runStep(companyId, "departments", async () => {
        const departments = await adapter.getDepartments();
        return this.persistence.upsertRecords(
          companyId,
          "departments",
          departments as unknown as Record<string, unknown>[]
        );
      })
    );

    const failed = results.filter((r) => r.status === "failed");
    if (failed.length > 0) {
      this.logger.warn("Initial sync completed with errors", {
        companyId,
        failedSteps: failed.map((f) => f.resourceType),
      });
    } else {
      this.logger.info("Initial sync completed successfully", {
        companyId,
        totalRecords: results.reduce((sum, r) => sum + r.recordCount, 0),
      });
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // Incremental Sync — Cursor-based delta
  // -------------------------------------------------------------------------

  /**
   * Perform an incremental sync. Uses cursors stored in sync_state to fetch
   * only new or changed data since the last sync.
   */
  async incrementalSync(
    companyId: string,
    adapter: AccountingSystemAdapter
  ): Promise<SyncStepResult[]> {
    this.logger.info("Starting incremental sync", {
      companyId,
      provider: adapter.provider,
    });

    const results: SyncStepResult[] = [];

    // Financial settings & VAT codes — always re-fetch (small payload)
    results.push(
      await this.runStep(companyId, "financial_settings", async () => {
        const settings = await adapter.getFinancialSettings();
        await this.persistence.upsertFinancialSettings(companyId, settings);
        return 1;
      })
    );

    results.push(
      await this.runStep(companyId, "vat_codes", async () => {
        const vatCodes = await adapter.getVatCodes();
        return this.persistence.upsertRecords(
          companyId,
          "vat_codes",
          vatCodes as unknown as Record<string, unknown>[]
        );
      })
    );

    // Chart of accounts — always re-fetch (small payload, accounts may change)
    results.push(
      await this.runStep(companyId, "chart_of_accounts", async () => {
        const accounts = await adapter.getChartOfAccounts();
        return this.persistence.upsertRecords(
          companyId,
          "chart_of_accounts",
          accounts as unknown as Record<string, unknown>[]
        );
      })
    );

    // Trial balance — refresh as of today
    results.push(
      await this.runStep(companyId, "trial_balance", async () => {
        const entries = await adapter.getTrialBalance(new Date());
        return this.persistence.upsertRecords(
          companyId,
          "trial_balance",
          entries as unknown as Record<string, unknown>[]
        );
      })
    );

    // Account transactions — from last synced voucher number
    results.push(
      await this.runStep(companyId, "account_transactions", async () => {
        const state = await this.persistence.getSyncState(
          companyId,
          "account_transactions"
        );
        const cursor = state?.cursor as
          | { lastVoucherNumber?: number; lastSyncedDate?: string }
          | undefined;

        const fromDate = cursor?.lastSyncedDate
          ? new Date(cursor.lastSyncedDate)
          : this.calculateTransactionStartDate();

        const transactions = await adapter.getAccountTransactions({
          fromDate,
          fromVoucherNumber: cursor?.lastVoucherNumber
            ? cursor.lastVoucherNumber + 1
            : undefined,
          toDate: new Date(),
        });

        const count = await this.persistence.upsertRecords(
          companyId,
          "account_transactions",
          transactions as unknown as Record<string, unknown>[]
        );

        // Update cursor with the highest voucher number we received
        if (transactions.length > 0) {
          const maxVoucher = Math.max(
            ...transactions.map((t) => t.voucherNumber)
          );
          await this.updateSyncState(
            companyId,
            "account_transactions",
            "completed",
            {
              cursor: {
                lastVoucherNumber: maxVoucher,
                lastSyncedDate: new Date().toISOString().split("T")[0],
              },
              recordCount: count,
            }
          );
        }

        return count;
      })
    );

    // Customers — re-fetch all (no reliable delta mechanism in PowerOffice)
    results.push(
      await this.runStep(companyId, "customers", async () => {
        const customers = await adapter.getCustomers();
        return this.persistence.upsertRecords(
          companyId,
          "customers",
          customers as unknown as Record<string, unknown>[]
        );
      })
    );

    // Customer ledger — from last synced date
    results.push(
      await this.runStep(companyId, "customer_ledger", async () => {
        const state = await this.persistence.getSyncState(
          companyId,
          "customer_ledger"
        );
        const cursor = state?.cursor as
          | { lastSyncedDate?: string }
          | undefined;

        const fromDate = cursor?.lastSyncedDate
          ? new Date(cursor.lastSyncedDate)
          : this.calculateTransactionStartDate();

        const entries = await adapter.getCustomerLedger({
          fromDate,
          toDate: new Date(),
        });

        const count = await this.persistence.upsertRecords(
          companyId,
          "customer_ledger",
          entries as unknown as Record<string, unknown>[]
        );

        if (entries.length > 0) {
          await this.updateSyncState(companyId, "customer_ledger", "completed", {
            cursor: {
              lastSyncedDate: new Date().toISOString().split("T")[0],
            },
            recordCount: count,
          });
        }

        return count;
      })
    );

    // Outgoing invoices — from last synced date
    results.push(
      await this.runStep(companyId, "outgoing_invoices", async () => {
        const state = await this.persistence.getSyncState(
          companyId,
          "outgoing_invoices"
        );
        const cursor = state?.cursor as
          | { lastSyncedDate?: string }
          | undefined;

        const fromDate = cursor?.lastSyncedDate
          ? new Date(cursor.lastSyncedDate)
          : this.calculateTransactionStartDate();

        const invoices = await adapter.getOutgoingInvoices({
          fromDate,
          toDate: new Date(),
        });

        const count = await this.persistence.upsertRecords(
          companyId,
          "outgoing_invoices",
          invoices as unknown as Record<string, unknown>[]
        );

        if (invoices.length > 0) {
          await this.updateSyncState(
            companyId,
            "outgoing_invoices",
            "completed",
            {
              cursor: {
                lastSyncedDate: new Date().toISOString().split("T")[0],
              },
              recordCount: count,
            }
          );
        }

        return count;
      })
    );

    // Suppliers — re-fetch all
    results.push(
      await this.runStep(companyId, "suppliers", async () => {
        const suppliers = await adapter.getSuppliers();
        return this.persistence.upsertRecords(
          companyId,
          "suppliers",
          suppliers as unknown as Record<string, unknown>[]
        );
      })
    );

    // Supplier ledger — from last synced date
    results.push(
      await this.runStep(companyId, "supplier_ledger", async () => {
        const state = await this.persistence.getSyncState(
          companyId,
          "supplier_ledger"
        );
        const cursor = state?.cursor as
          | { lastSyncedDate?: string }
          | undefined;

        const fromDate = cursor?.lastSyncedDate
          ? new Date(cursor.lastSyncedDate)
          : this.calculateTransactionStartDate();

        const entries = await adapter.getSupplierLedger({
          fromDate,
          toDate: new Date(),
        });

        const count = await this.persistence.upsertRecords(
          companyId,
          "supplier_ledger",
          entries as unknown as Record<string, unknown>[]
        );

        if (entries.length > 0) {
          await this.updateSyncState(
            companyId,
            "supplier_ledger",
            "completed",
            {
              cursor: {
                lastSyncedDate: new Date().toISOString().split("T")[0],
              },
              recordCount: count,
            }
          );
        }

        return count;
      })
    );

    // Incoming invoices — from last synced date
    results.push(
      await this.runStep(companyId, "incoming_invoices", async () => {
        const state = await this.persistence.getSyncState(
          companyId,
          "incoming_invoices"
        );
        const cursor = state?.cursor as
          | { lastSyncedDate?: string }
          | undefined;

        const fromDate = cursor?.lastSyncedDate
          ? new Date(cursor.lastSyncedDate)
          : this.calculateTransactionStartDate();

        const invoices = await adapter.getIncomingInvoices({
          fromDate,
          toDate: new Date(),
        });

        const count = await this.persistence.upsertRecords(
          companyId,
          "incoming_invoices",
          invoices as unknown as Record<string, unknown>[]
        );

        if (invoices.length > 0) {
          await this.updateSyncState(
            companyId,
            "incoming_invoices",
            "completed",
            {
              cursor: {
                lastSyncedDate: new Date().toISOString().split("T")[0],
              },
              recordCount: count,
            }
          );
        }

        return count;
      })
    );

    // Projects & departments — re-fetch all (small payloads)
    results.push(
      await this.runStep(companyId, "projects", async () => {
        const projects = await adapter.getProjects();
        return this.persistence.upsertRecords(
          companyId,
          "projects",
          projects as unknown as Record<string, unknown>[]
        );
      })
    );

    results.push(
      await this.runStep(companyId, "departments", async () => {
        const departments = await adapter.getDepartments();
        return this.persistence.upsertRecords(
          companyId,
          "departments",
          departments as unknown as Record<string, unknown>[]
        );
      })
    );

    const failed = results.filter((r) => r.status === "failed");
    if (failed.length > 0) {
      this.logger.warn("Incremental sync completed with errors", {
        companyId,
        failedSteps: failed.map((f) => f.resourceType),
      });
    } else {
      this.logger.info("Incremental sync completed successfully", {
        companyId,
        totalRecords: results.reduce((sum, r) => sum + r.recordCount, 0),
      });
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // Sync State Management
  // -------------------------------------------------------------------------

  /**
   * Update the sync state for a specific resource type.
   */
  async updateSyncState(
    companyId: string,
    resourceType: SyncResourceType,
    status: SyncStatus,
    metadata?: {
      error?: string;
      recordCount?: number;
      cursor?: Record<string, unknown>;
    }
  ): Promise<void> {
    const state: SyncState = {
      resourceType,
      status,
      lastSyncedAt: status === "completed" ? new Date() : undefined,
      lastError: metadata?.error,
      recordCount: metadata?.recordCount,
      cursor: metadata?.cursor,
    };

    await this.persistence.upsertSyncState(companyId, state);
  }

  // -------------------------------------------------------------------------
  // Internal Helpers
  // -------------------------------------------------------------------------

  /**
   * Run a single sync step with error isolation, timing, and state tracking.
   */
  private async runStep(
    companyId: string,
    resourceType: SyncResourceType,
    work: () => Promise<number>
  ): Promise<SyncStepResult> {
    const start = Date.now();

    // Mark as in-progress
    await this.updateSyncState(companyId, resourceType, "in_progress").catch(
      () => {
        // State update failure should not block the sync step itself
      }
    );

    try {
      this.logger.info(`Syncing ${resourceType}`, { companyId });

      const recordCount = await work();
      const durationMs = Date.now() - start;

      await this.updateSyncState(companyId, resourceType, "completed", {
        recordCount,
      });

      this.logger.info(`Synced ${resourceType}: ${recordCount} records`, {
        companyId,
        durationMs,
      });

      return { resourceType, status: "completed", recordCount, durationMs };
    } catch (error) {
      const durationMs = Date.now() - start;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      this.logger.error(`Failed to sync ${resourceType}: ${errorMessage}`, {
        companyId,
        durationMs,
      });

      await this.updateSyncState(companyId, resourceType, "failed", {
        error: errorMessage,
      }).catch(() => {
        // State update failure should not mask the original error
      });

      return {
        resourceType,
        status: "failed",
        recordCount: 0,
        error: errorMessage,
        durationMs,
      };
    }
  }

  /**
   * Calculate the start date for transaction fetching.
   * Uses the conversion date from financial settings if available,
   * otherwise defaults to 24 months back.
   */
  private calculateTransactionStartDate(
    financialSettings?: FinancialSettings
  ): Date {
    if (financialSettings?.conversionDate) {
      return financialSettings.conversionDate;
    }

    // Default: 24 months back
    const date = new Date();
    date.setMonth(date.getMonth() - 24);
    // Start from the first day of that month
    date.setDate(1);
    return date;
  }
}
