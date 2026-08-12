"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useUser } from "./use-user";
import { invalidate, load, peek, pending, subscribe } from "@/lib/data-cache";

interface CompanyDataState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  /** True once loading finished and the API reported no synced data. */
  isEmpty: boolean;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Forespørselen feilet (${res.status})`);
  }

  return (await res.json()) as T;
}

/**
 * Fetches a company-scoped API endpoint for the signed-in user's company.
 *
 * `path` is the part after /api/companies/[id], e.g. "summary" or
 * "financials?period_start=2026-01-01".
 *
 * The result is cached per tab, so returning to a page you have already
 * visited renders from cache and refreshes behind the scenes rather than
 * showing a spinner again. Accounting figures only change on import, and
 * `refreshCompanyData()` clears the cache at that point.
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

  const key = companyId ? `company:${companyId}/${path}` : null;

  const snapshot = useSyncExternalStore(
    (listener) => (key ? subscribe(key, listener) : () => {}),
    () => (key ? peek<T>(key) : pending<T>()),
    () => pending<T>()
  );

  useEffect(() => {
    if (!key || !companyId) return;
    load(key, () => fetchJson<T>(`/api/companies/${companyId}/${path}`));
  }, [key, companyId, path]);

  const isLoading = isLoadingUser || (key != null && !snapshot.hasValue);
  const data = snapshot.value;
  const error = snapshot.error;

  const isEmpty =
    !isLoading &&
    !error &&
    data != null &&
    (data as { has_data?: boolean }).has_data === false;

  return { data, isLoading, error, isEmpty, companyId };
}

/**
 * Fetches an arbitrary endpoint through the same cache. Used for the few reads
 * that are not company-scoped API routes, such as import status in the header.
 */
export function useCachedFetch<T = unknown>(
  url: string | null
): CompanyDataState<T> {
  const key = url ? `url:${url}` : null;

  const snapshot = useSyncExternalStore(
    (listener) => (key ? subscribe(key, listener) : () => {}),
    () => (key ? peek<T>(key) : pending<T>()),
    () => pending<T>()
  );

  useEffect(() => {
    if (!key || !url) return;
    load(key, () => fetchJson<T>(url));
  }, [key, url]);

  return {
    data: snapshot.value,
    error: snapshot.error,
    isLoading: key != null && !snapshot.hasValue,
    isEmpty: false,
  };
}

/**
 * Clears every cached figure. Call after an import, which rewrites the numbers
 * behind all of them at once.
 */
export function refreshCompanyData() {
  invalidate("company:");
  invalidate("url:");
}
