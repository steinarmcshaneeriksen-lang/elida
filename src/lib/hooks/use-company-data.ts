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

interface Result<T> {
  /** Identifies which request produced this result. */
  key: string;
  data: T | null;
  error: string | null;
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

  const key = companyId ? `${companyId}/${path}` : null;
  const [result, setResult] = useState<Result<T> | null>(null);

  useEffect(() => {
    if (!key || !companyId) return;
    let cancelled = false;

    async function load() {
      try {
        const separator = path.includes("?") ? "&" : "?";
        const res = await fetch(
          `/api/companies/${companyId}/${path}${separator}_=${Date.now()}`
        );
        if (cancelled) return;

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          if (!cancelled) {
            setResult({
              key: key!,
              data: null,
              error: body?.error ?? `Forespørselen feilet (${res.status})`,
            });
          }
          return;
        }

        const json = (await res.json()) as T;
        if (!cancelled) setResult({ key: key!, data: json, error: null });
      } catch (err) {
        if (!cancelled) {
          setResult({
            key: key!,
            data: null,
            error:
              err instanceof Error
                ? err.message
                : "Kunne ikke koble til. Sjekk nettforbindelsen.",
          });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [key, companyId, path]);

  // Derived rather than stored, so no state is written during the effect body.
  const isFresh = result?.key === key;
  const isLoading = isLoadingUser || (key != null && !isFresh);

  const data = isFresh ? result.data : null;
  const error = isFresh ? result.error : null;

  const isEmpty =
    !isLoading &&
    !error &&
    data != null &&
    (data as { has_data?: boolean }).has_data === false;

  return { data, isLoading, error, isEmpty, companyId };
}
