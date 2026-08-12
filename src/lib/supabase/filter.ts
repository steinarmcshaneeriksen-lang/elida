/**
 * Sanitising for values interpolated into PostgREST filter strings.
 *
 * `.or("col.ilike.%term%,other.ilike.%term%")` is a single string parsed by
 * PostgREST, so a term containing a comma, parenthesis or dot can close the
 * current condition and append new ones. Row-level security still applies —
 * an injected filter cannot reach another tenant's rows — but it can widen or
 * distort a query, so untrusted values must be cleaned before interpolation.
 *
 * Values reaching these helpers can originate from a model tool call, which in
 * turn can be influenced by an uploaded document, so treat them as hostile.
 */

/** Characters that carry meaning inside a PostgREST filter expression. */
const FILTER_METACHARACTERS = /[,.()"'\\{}*%:]/g;

/**
 * Cleans a term used inside an `ilike` pattern. Keeps letters (including
 * Norwegian ones), digits, spaces and hyphens; drops everything else.
 */
export function sanitizeFilterTerm(term: string, maxLength = 100): string {
  return term
    .replace(FILTER_METACHARACTERS, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/**
 * Cleans a token used inside an array-contains filter (`col.cs.{token}`),
 * where braces and commas would otherwise alter the array literal.
 */
export function sanitizeArrayToken(token: string, maxLength = 60): string {
  return token
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .slice(0, maxLength);
}
