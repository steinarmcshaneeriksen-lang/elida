/**
 * Reading every row, not the first thousand.
 *
 * PostgREST caps a response at 1000 rows unless a range is asked for, and it
 * does so silently: the query succeeds, the array looks fine, and the total is
 * simply wrong. On this ledger that turned a year-to-date revenue of 4 776 875
 * into 461 030, because January alone holds 1 240 postings and the read stopped
 * inside it.
 *
 * Nothing that sums a table may read it without this.
 */

export interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/** How many rows a page asks for. PostgREST's own maximum. */
export const PAGE_SIZE = 1000;

/**
 * Runs `build` once per page until the source is exhausted.
 *
 * `build(from, to)` must apply `.range(from, to)` to the query it returns;
 * ordering is the caller's business, but an unordered paged read can repeat or
 * skip rows, so a stable order should be applied where it matters.
 */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<PageResult<T>>,
  options: { pageSize?: number; maxRows?: number; label?: string } = {}
): Promise<T[]> {
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const maxRows = options.maxRows ?? 500_000;

  const all: T[] = [];

  for (let page = 0; ; page++) {
    const from = page * pageSize;
    const { data, error } = await build(from, from + pageSize - 1);

    if (error) {
      throw new Error(
        `Kunne ikke lese ${options.label ?? "data"}: ${error.message}`
      );
    }

    if (!data || data.length === 0) break;

    all.push(...data);

    // A short page means the end; the guard is only for a source that keeps
    // returning full pages, which would otherwise loop forever.
    if (data.length < pageSize) break;
    if (all.length >= maxRows) break;
  }

  return all;
}
