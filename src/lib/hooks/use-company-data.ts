"use client";

import { useEffect, useState } from "react";
import { useUser } from "./use-user";

interface CompanyDataState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  /** True once loading finished and the API reported no synced data. */
  isEmpty: boolean;
}

/**
 * Fetches a company-scoped API endpoint for the signed-in user's company.
 *
 * `path` is the part after /api/companies/[id], e.g. "summary" or
 * "financials?period_start=2026-01-01".
 *
 * Endpoints report `has_data: false` when nothing has been imported yet;
 * that is surfaced as `isEmpty` so pages can show an import prompt instead
 * of rendering an all-zero view that looks like real figures.
 */
export function useCompanyData<T = unknown>(
  path: string
): CompanyDataState<T> & { companyId: string | undefined } {
  const { company, isLoading: isLoadingUser } = useUser();
  const companyId = company?.id;

  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoadingUser) return;

    if (!companyId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    async function load() {
      try {
        const separator = path.includes("?") ? "&" : "?";
        const res = await fetch(
          `/api/companies/${companyId}/${path}${separator}_=${Date.now()}`
        );

        if (cancelled) return;

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setError(body?.error ?? `Forespørselen feilet (${res.status})`);
          setData(null);
          return;
        }

        const json = (await res.json()) as T;
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Kunne ikke koble til. Sjekk nettforbindelsen."
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [companyId, path, isLoadingUser]);

  const isEmpty =
    !isLoading &&
    !error &&
    data != null &&
    (data as { has_data?: boolean }).has_data === false;

  return { data, isLoading: isLoading || isLoadingUser, error, isEmpty, companyId };
}
