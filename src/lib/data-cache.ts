"use client";

/**
 * A tiny client-side cache shared by every component in the tab.
 *
 * Without it each page mount re-ran the same auth lookup and the same company
 * query, so moving between pages meant staring at a spinner for a second or
 * two even though nothing had changed. Entries are served immediately and
 * refreshed in the background, so a revisit paints instantly and still ends up
 * on current numbers.
 *
 * The cache lives in module scope, which means it is per tab and disappears on
 * reload — deliberately, since it holds company figures and must not outlive
 * the session.
 */

export interface Snapshot<T> {
  value: T | null;
  error: string | null;
  /** False until the first read completes, so callers can show a spinner once. */
  hasValue: boolean;
}

interface Entry<T> {
  /**
   * Held as one frozen object so useSyncExternalStore sees a stable identity
   * between writes — returning a fresh object on every read would loop.
   */
  snapshot: Snapshot<T>;
  /** When the value was written, for staleness checks. */
  at: number;
  /** In-flight request, so concurrent callers share one round trip. */
  inflight: Promise<void> | null;
  listeners: Set<() => void>;
}

const entries = new Map<string, Entry<unknown>>();

const PENDING: Snapshot<never> = { value: null, error: null, hasValue: false };

/** How long a value is served without a background refresh. */
const FRESH_MS = 60_000;

function getEntry<T>(key: string): Entry<T> {
  let entry = entries.get(key) as Entry<T> | undefined;
  if (!entry) {
    entry = { snapshot: PENDING, at: 0, inflight: null, listeners: new Set() };
    entries.set(key, entry as Entry<unknown>);
  }
  return entry;
}

function notify(entry: Entry<unknown>) {
  for (const listener of entry.listeners) listener();
}

export function peek<T>(key: string): Snapshot<T> {
  const entry = entries.get(key) as Entry<T> | undefined;
  return entry?.snapshot ?? PENDING;
}

/** The stable object every not-yet-loaded key resolves to, including on the server. */
export function pending<T>(): Snapshot<T> {
  return PENDING;
}

export function subscribe(key: string, listener: () => void): () => void {
  const entry = getEntry(key);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
}

/**
 * Ensures `key` holds a value, fetching it at most once across all callers.
 * Returns a promise that resolves when this call's work is done; a cached hit
 * that is still fresh resolves immediately without touching the network.
 */
export function load<T>(
  key: string,
  fetcher: () => Promise<T>,
  { force = false }: { force?: boolean } = {}
): Promise<void> {
  const entry = getEntry<T>(key);

  if (entry.inflight) return entry.inflight;
  if (!force && entry.at > 0 && Date.now() - entry.at < FRESH_MS) {
    return Promise.resolve();
  }

  const run = (async () => {
    try {
      const value = await fetcher();
      entry.snapshot = { value, error: null, hasValue: true };
    } catch (err) {
      // A failed refresh must not blank out a good cached value; the page keeps
      // showing the last known figures and the error is reported alongside.
      entry.snapshot = {
        value: entry.snapshot.value,
        error:
          err instanceof Error
            ? err.message
            : "Kunne ikke koble til. Sjekk nettforbindelsen.",
        hasValue: true,
      };
    } finally {
      entry.at = Date.now();
      entry.inflight = null;
      notify(entry as Entry<unknown>);
    }
  })();

  entry.inflight = run;
  return run;
}

/**
 * Drops cached values so the next read refetches. Called after an import, when
 * every derived figure on every page has just changed.
 */
export function invalidate(prefix?: string) {
  for (const [key, entry] of entries) {
    if (prefix && !key.startsWith(prefix)) continue;
    entry.at = 0;
    entry.snapshot = PENDING;
    notify(entry);
  }
}
