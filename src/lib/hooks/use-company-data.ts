"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useUser } from "./use-user";
import { invalidate, load, peek, pending, subscribe } from "@/lib/data-cache";

/** A value held over while a newer one loads, tied to the company it is for. */
interface Retained<T> {
  companyId: string;
  value: T;
}

interface CompanyDataState<T> {
  data: T | null;
  /**
   * Nothing to show yet. True only on a genuinely cold read — not while a
   * changed period or page number is being fetched behind figures that are
   * already on screen.
   */
  isLoading: boolean;
  /** Figures are on screen and a newer set is on its way. */
  isRefreshing: boolean;
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
 * Pass `null` while the path cannot be built yet — a page whose range depends
 * on which years exist has no path until that query returns. Passing a
 * placeholder instead fired a request nothing wanted and then moved to the
 * real key, which tore the page down a second time.
 *
 * Endpoints report `has_data: false` when nothing has been imported yet;
 * that is surfaced as `isEmpty` so pages can show an import prompt instead
 * of rendering an all-zero view that looks like real figures.
 */
export function useCompanyData<T = unknown>(
  path: string | null
): CompanyDataState<T> & { companyId: string | undefined } {
  const { company, isLoading: isLoadingUser } = useUser();
  const companyId = company?.id;

  const key = companyId && path ? `company:${companyId}/${path}` : null;

  const snapshot = useSyncExternalStore(
    useCallback(
      (listener: () => void) => (key ? subscribe(key, listener) : () => {}),
      [key]
    ),
    useCallback(() => (key ? peek<T>(key) : pending<T>()), [key]),
    pending<T>
  );

  useEffect(() => {
    if (!key || !companyId || !path) return;
    load(key, () => fetchJson<T>(`/api/companies/${companyId}/${path}`));
  }, [key, companyId, path]);

  /**
   * The last figures this component held.
   *
   * Changing the period or turning a page changes the cache key, and a fresh
   * key has no value — so the page collapsed to a spinner even though correct
   * figures were on screen and only a narrower slice of them had been asked
   * for. Holding them lets the page stay put while the new slice loads.
   *
   * Kept with the company it belongs to and dropped the moment that changes.
   * Showing one company's figures under another company's name, even for a
   * single frame, is not acceptable.
   */
  const [retained, setRetained] = useState<Retained<T> | null>(null);

  // Adjusting state during render: React's documented way to derive state from
  // changed inputs. It re-renders immediately without committing the first
  // pass, so no stale frame reaches the screen.
  const belongsToAnother = retained != null && retained.companyId !== companyId;

  if (belongsToAnother) {
    setRetained(null);
  } else if (
    snapshot.value != null &&
    companyId &&
    retained?.value !== snapshot.value
  ) {
    setRetained({ companyId, value: snapshot.value });
  }

  const data =
    snapshot.value ?? (belongsToAnother ? null : (retained?.value ?? null));
  const error = snapshot.error;

  const settled = key != null && snapshot.hasValue;
  const isLoading = (isLoadingUser || !settled) && data == null;
  const isRefreshing = !settled && data != null;

  const isEmpty =
    settled &&
    !error &&
    snapshot.value != null &&
    (snapshot.value as { has_data?: boolean }).has_data === false;

  return { data, isLoading, isRefreshing, error, isEmpty, companyId };
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
    useCallback(
      (listener: () => void) => (key ? subscribe(key, listener) : () => {}),
      [key]
    ),
    useCallback(() => (key ? peek<T>(key) : pending<T>()), [key]),
    pending<T>
  );

  useEffect(() => {
    if (!key || !url) return;
    load(key, () => fetchJson<T>(url));
  }, [key, url]);

  return {
    data: snapshot.value,
    error: snapshot.error,
    isLoading: key != null && !snapshot.hasValue,
    isRefreshing: false,
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
