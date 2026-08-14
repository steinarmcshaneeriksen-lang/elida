/**
 * Making "show it first, then do it" a rule the model cannot skip.
 *
 * The rule was written down and asked for politely: call the tool without
 * `confirmed`, show the user what it would do, wait for a yes, then call again
 * with `confirmed: true`. A model that sets the flag on the first call gets the
 * write anyway, and that is what happened — a budget was overwritten while the
 * answer on screen said "ingenting er lagret eller endret". The user was told
 * nothing had happened by the same turn that made it happen.
 *
 * So the flag alone no longer buys a write. The proposal returns a short code,
 * and the write requires that code back. The model has no way to produce it
 * except by making the proposal call first — which is exactly the step it was
 * being asked to take on trust.
 *
 * The code covers the state as well as the request. It is computed over the
 * figures the proposal was made against, so a proposal shown for one set of
 * numbers cannot be applied to another: change the budget in between, and the
 * code stops matching. That also closes the case where the same change is
 * applied twice and the second pass reports "no change" because the first one
 * already did it.
 */

import { createHmac } from "node:crypto";

/**
 * Server-side only, and never in a prompt, a tool schema or a response — which
 * is all the secrecy this needs. It defends against a model guessing, not
 * against the user, who is entitled to change their own budget.
 */
function secret(): string {
  return process.env.OPENAI_API_KEY ?? "elida-confirm";
}

/**
 * A short code standing for one proposal, made against one set of figures.
 *
 * `scope` names the action, `facts` is everything that must not change between
 * showing the proposal and carrying it out.
 */
export function confirmationCode(scope: string, facts: unknown): string {
  return createHmac("sha256", secret())
    .update(`${scope}\n${canonical(facts)}`)
    .digest("hex")
    .slice(0, 10);
}

/**
 * Whether this call may write.
 *
 * Both are required: the user's yes, carried as `confirmed`, and the code from
 * the proposal that yes was given to.
 */
export function mayApply(
  params: Record<string, unknown>,
  scope: string,
  facts: unknown
): boolean {
  if (params.confirmed !== true) return false;
  const given = typeof params.confirm_code === "string" ? params.confirm_code.trim() : "";
  return given !== "" && given === confirmationCode(scope, facts);
}

/**
 * What to tell the model when it asked for a write it has not earned.
 *
 * Written for the model, not the reader: it says what is missing and what to do
 * about it, and forbids the claim that the work is done.
 */
export function refusalNote(hasCode: boolean): string {
  return hasCode
    ? "Koden stemmer ikke med tallene endringen ble regnet på. Budsjettet er " +
        "IKKE endret — noe har endret seg siden forslaget ble laget, eller " +
        "endringen er allerede utført. Hent tallene på nytt, vis det nye " +
        "forslaget, og be om bekreftelse igjen."
    : "Forslaget er ikke vist til brukeren ennå, så ingenting er utført. " +
        "Tallene under er hva endringen VILLE gjort. Vis dem, spør om det skal " +
        "gjennomføres, og kall verktøyet på nytt med samme «confirm_code» først " +
        "når brukeren har sagt ja. Ikke påstå at noe er lagret.";
}

/** Stable JSON: key order must not change the code. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}
