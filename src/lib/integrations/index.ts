/**
 * Integrations — Public API
 *
 * Re-exports the adapter interface, normalized types, sync service,
 * and the PowerOffice Go implementation.
 */

// Adapter interface & normalized types
export type {
  AccountingSystemAdapter,
  AccountingProvider,
  ConnectorCredentials,
  ConnectionResult,
  IntegrationInfo,
  FinancialSettings,
  ExternalGLAccount,
  ExternalAccountType,
  ExternalVatCode,
  ExternalTrialBalanceEntry,
  ExternalTransaction,
  ExternalCustomer,
  ExternalSupplier,
  ExternalAddress,
  ExternalLedgerEntry,
  ExternalInvoice,
  ExternalInvoiceStatus,
  ExternalInvoiceLine,
  ExternalProject,
  ExternalDepartment,
  TransactionQueryParams,
  LedgerQueryParams,
  InvoiceQueryParams,
  SyncResourceType,
  SyncStatus,
  SyncState,
} from "./types";

// Sync service
export { SyncService } from "./sync-service";
export type { SyncPersistence, SyncLogger } from "./sync-service";

// PowerOffice Go
export { PowerOfficeAdapter } from "./poweroffice/adapter";
export { PowerOfficeClient } from "./poweroffice/client";
export { PowerOfficeMapper } from "./poweroffice/mapper";
export {
  PowerOfficeApiError,
  PowerOfficeAuthError,
  PowerOfficeRateLimitError,
} from "./poweroffice/client";
