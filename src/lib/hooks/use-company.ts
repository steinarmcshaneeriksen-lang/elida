"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  Company,
  Integration,
  IntegrationSyncState,
  SyncStatus,
} from "@/lib/types/database";

interface IntegrationStatus {
  connected: boolean;
  syncing: boolean;
  lastSync: string | null;
  provider: string | null;
}

interface DataQualityMetrics {
  accountsCount: number;
  transactionsCount: number;
  customersCount: number;
  suppliersCount: number;
  hasChartOfAccounts: boolean;
  hasTransactions: boolean;
  latestTransactionDate: string | null;
}

interface UseCompanyReturn {
  /** Company details */
  company: Company | null;
  /** Integration connection status */
  integrationStatus: IntegrationStatus;
  /** Data quality metrics */
  dataQuality: DataQualityMetrics;
  /** Whether data is still loading */
  isLoading: boolean;
  /** Error if any */
  error: string | null;
  /** Reload company data */
  refresh: () => Promise<void>;
}

export function useCompany(companyId: string | null | undefined): UseCompanyReturn {
  const supabase = createClient();

  const [company, setCompany] = useState<Company | null>(null);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus>({
    connected: false,
    syncing: false,
    lastSync: null,
    provider: null,
  });
  const [dataQuality, setDataQuality] = useState<DataQualityMetrics>({
    accountsCount: 0,
    transactionsCount: 0,
    customersCount: 0,
    suppliersCount: 0,
    hasChartOfAccounts: false,
    hasTransactions: false,
    latestTransactionDate: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadCompanyData() {
    if (!companyId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Load company
      const { data: companyData, error: companyError } = await supabase
        .from("companies")
        .select("*")
        .eq("id", companyId)
        .single();

      if (companyError) {
        setError("Kunne ikke laste bedriftsdata.");
        setIsLoading(false);
        return;
      }

      setCompany(companyData);

      // Load integration status
      const { data: integrations } = await supabase
        .from("integrations")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .limit(1);

      if (integrations && integrations.length > 0) {
        const integration = integrations[0];

        // Check sync state
        const { data: syncStates } = await supabase
          .from("integration_sync_state")
          .select("*")
          .eq("company_id", companyId)
          .order("last_sync_completed_at", { ascending: false });

        const isSyncing = syncStates?.some(
          (s: IntegrationSyncState) => s.sync_status === "running"
        ) ?? false;

        const lastCompleted = syncStates?.find(
          (s: IntegrationSyncState) => s.sync_status === "completed"
        );

        setIntegrationStatus({
          connected: true,
          syncing: isSyncing,
          lastSync: lastCompleted?.last_sync_completed_at ?? null,
          provider: integration.provider,
        });
      }

      // Load data quality metrics
      const [accountsRes, transactionsRes, customersRes, suppliersRes] = await Promise.all([
        supabase
          .from("gl_accounts")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId),
        supabase
          .from("account_transactions")
          .select("id, transaction_date", { count: "exact" })
          .eq("company_id", companyId)
          .order("transaction_date", { ascending: false })
          .limit(1),
        supabase
          .from("customers")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId),
        supabase
          .from("suppliers")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId),
      ]);

      const accountsCount = accountsRes.count ?? 0;
      const transactionsCount = transactionsRes.count ?? 0;
      const latestTransaction = transactionsRes.data?.[0];

      setDataQuality({
        accountsCount,
        transactionsCount,
        customersCount: customersRes.count ?? 0,
        suppliersCount: suppliersRes.count ?? 0,
        hasChartOfAccounts: accountsCount > 0,
        hasTransactions: transactionsCount > 0,
        latestTransactionDate: latestTransaction?.transaction_date ?? null,
      });
    } catch (err) {
      console.error("Error loading company data:", err);
      setError("En feil oppstod ved lasting av bedriftsdata.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadCompanyData();
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    company,
    integrationStatus,
    dataQuality,
    isLoading,
    error,
    refresh: loadCompanyData,
  };
}
