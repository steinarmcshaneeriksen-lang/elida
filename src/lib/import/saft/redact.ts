/**
 * Personal-name redaction for imported free text.
 *
 * SAF-T Regnskap carries no payroll register, but names of salary recipients
 * routinely appear in the free-text description on payroll postings — e.g.
 * "Lønn august Ola Nordmann". Elida must not store those, so descriptions on
 * payroll accounts are masked during import.
 *
 * Two mechanisms, strongest first:
 *
 *   1. Known names. Suppliers registered without an organisation number are
 *      usually private individuals (employees claiming expenses). Their names
 *      are matched exactly, anywhere in the text, on any account.
 *
 *   2. Heuristic. On payroll accounts only, capitalised words that are not
 *      recognised accounting or payroll vocabulary are treated as names.
 *
 * The heuristic cannot be exhaustive: an unusual name that collides with a
 * vocabulary word, or a name written in lower case, will survive. Callers that
 * need a hard guarantee should drop the description entirely instead.
 */

import { ACCOUNT_CLASSES } from "@/lib/constants";

export const REDACTION_PLACEHOLDER = "[navn fjernet]";

/**
 * Accounts whose descriptions are name-bearing. Class 5 is payroll; the
 * balance accounts carry the corresponding withholdings and accruals.
 */
const NAME_BEARING_ACCOUNTS = {
  payroll: ACCOUNT_CLASSES.PAYROLL,
  /** 2600 skattetrekk, 2770 skyldig aga, 2930 skyldig lønn. */
  liabilities: [2600, 2770, 2930],
};

export function isNameBearingAccount(accountNumber: string): boolean {
  const account = parseInt(accountNumber, 10);
  if (Number.isNaN(account)) return false;

  if (
    account >= NAME_BEARING_ACCOUNTS.payroll.from &&
    account <= NAME_BEARING_ACCOUNTS.payroll.to
  ) {
    return true;
  }

  return NAME_BEARING_ACCOUNTS.liabilities.includes(account);
}

// ---------------------------------------------------------------------------
// Vocabulary that must never be mistaken for a name
// ---------------------------------------------------------------------------

const VOCABULARY = new Set(
  [
    // Months, full and abbreviated
    "januar", "februar", "mars", "april", "mai", "juni", "juli", "august",
    "september", "oktober", "november", "desember",
    "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "okt",
    "nov", "des",

    // Payroll
    "lonn", "lonnskostnad", "lonnskjoring", "lonnsutbetaling", "fastlonn",
    "timelonn", "manedslonn", "arslonn", "feriepenger", "ferietrekk",
    "forskudd", "forskuddstrekk", "skattetrekk", "trekk", "arbeidsgiveravgift",
    "aga", "pensjon", "pensjonspremie", "otp", "overtid", "overtidstillegg",
    "bonus", "provisjon", "tillegg", "sluttoppgjor", "etterbetaling",
    "sykepenger", "sykelonn", "permisjon", "fravaer", "ansatt", "ansatte",
    "medarbeider", "lonnsmottaker", "styrehonorar", "honorar", "godtgjorelse",
    "naturalytelse", "frynsegode", "firmabil", "fribil", "elektronisk",
    "kommunikasjon", "abonnement",

    // Expenses and travel
    "reise", "reiseregning", "reisekostnad", "utlegg", "utleggsrefusjon",
    "refusjon", "diett", "kost", "losji", "overnatting", "kilometer",
    "kilometergodtgjorelse", "kjoregodtgjorelse", "bilgodtgjorelse", "km",
    "parkering", "bompenger", "taxi", "fly", "hotell", "kurs", "konferanse",

    // Bookkeeping
    "bilag", "faktura", "fakturanr", "kreditnota", "postering", "posteringer",
    "periodisering", "avsetning", "avsetninger", "konto", "kontonr", "belop",
    "sum", "total", "totalt", "netto", "brutto", "mva", "merverdiavgift",
    "moms", "saldo", "balanse", "resultat", "debet", "kredit", "motpost",
    "motkonto", "hovedbok", "reskontro",

    // Transactions
    "utbetaling", "innbetaling", "betaling", "betalt", "overforing",
    "korreksjon", "korrigering", "reversering", "reversert", "justering",
    "avstemming", "avregning", "oppgjor", "utligning", "purring",

    // Time
    "periode", "termin", "kvartal", "maned", "manedlig", "ar", "arlig", "uke",
    "dag", "dager", "time", "timer", "fra", "til", "og", "for", "per", "pr",
    "iht", "ifm", "vedr", "gjelder", "ref", "referanse", "div", "diverse",
    "annet", "ovrig", "ovrige", "andre", "ny", "nye", "gammel",

    // Organisational
    "avdeling", "avd", "prosjekt", "prosjektnr", "kostnadssted", "baerer",
    "selskap", "firma", "konsern", "kontor", "filial", "enhet", "team",

    // Department and function names, which follow "avdeling" and would
    // otherwise be read as surnames
    "salg", "marked", "markedsforing", "drift", "administrasjon", "admin",
    "produksjon", "utvikling", "support", "kundeservice", "okonomi", "regnskap",
    "ledelse", "styret", "innkjop", "logistikk", "lager", "verksted", "butikk",
    "teknisk", "fag", "hr", "it", "ikt",

    // Legal forms and common company suffixes
    "as", "asa", "ans", "da", "nuf", "sa", "enk", "ba", "kf", "if", "gruppen",
    "holding", "invest", "consulting", "norge", "norway", "nordic", "group",
  ].map((w) => w.toLowerCase())
);

/**
 * Norwegian letters are folded so vocabulary can be written without diacritics
 * while still matching real text ("lønn" → "lonn").
 */
function fold(word: string): string {
  return word
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/é|è|ê/g, "e");
}

function isVocabulary(word: string): boolean {
  const folded = fold(word);
  return VOCABULARY.has(folded) || VOCABULARY.has(folded.replace(/[.,:;]/g, ""));
}

// ---------------------------------------------------------------------------
// Known-name matching
// ---------------------------------------------------------------------------

/**
 * An organisation number is nine digits. Anything else — blank, or a personal
 * identifier — means the party is most likely a private individual.
 */
export function looksLikePrivatePerson(orgNumber: string | null): boolean {
  if (!orgNumber) return true;
  const digits = orgNumber.replace(/\D/g, "");
  return digits.length !== 9;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds a matcher for a set of known personal names. Matches the full name
 * and, for multi-word names, the surname on its own — payroll lines often
 * abbreviate to just the surname.
 */
export function buildKnownNameMatcher(names: string[]): RegExp | null {
  const patterns = new Set<string>();

  for (const name of names) {
    const trimmed = name.trim();
    // Two characters cannot identify a person and would match far too much.
    if (trimmed.length < 3) continue;

    patterns.add(escapeRegex(trimmed));

    const parts = trimmed.split(/\s+/).filter((p) => p.length >= 3);
    if (parts.length > 1) {
      // Surname alone, and "Surname, Firstname" as some systems write it.
      const surname = parts[parts.length - 1];
      patterns.add(escapeRegex(surname));
      patterns.add(
        escapeRegex(`${surname}, ${parts.slice(0, -1).join(" ")}`)
      );
    }
  }

  if (patterns.size === 0) return null;

  // Longest first, so "Ola Nordmann" wins over "Nordmann".
  const sorted = [...patterns].sort((a, b) => b.length - a.length);
  return new RegExp(`(?<![\\p{L}])(?:${sorted.join("|")})(?![\\p{L}])`, "giu");
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

export interface RedactOptions {
  /** Matcher built from names we already know belong to private individuals. */
  knownNames?: RegExp | null;
  /** Apply the capitalised-word heuristic. Only safe on payroll accounts. */
  applyHeuristic?: boolean;
}

export function redactPersonalNames(
  text: string | null,
  options: RedactOptions = {}
): string | null {
  if (!text) return text;

  let result = text;

  if (options.knownNames) {
    // Regexes with /g carry lastIndex between calls; reset before reuse.
    options.knownNames.lastIndex = 0;
    result = result.replace(options.knownNames, REDACTION_PLACEHOLDER);
  }

  if (options.applyHeuristic) {
    result = redactCapitalisedNames(result);
  }

  return collapsePlaceholders(result);
}

/**
 * Treats runs of capitalised, alphabetic words as a name unless they are known
 * vocabulary. Applied only where the surrounding account tells us the text
 * describes a payroll event.
 */
function redactCapitalisedNames(text: string): string {
  // A name-ish token: initial capital, letters only, optionally hyphenated,
  // or a single-letter initial with a period.
  const token = /\p{Lu}[\p{L}]*(?:-\p{Lu}[\p{L}]*)*\.?/u;
  const runs = new RegExp(`${token.source}(?:\\s+${token.source})*`, "gu");

  return text.replace(runs, (match) => {
    const words = match.split(/\s+/);

    const nameWords = words.filter((word) => {
      const bare = word.replace(/[.,:;]/g, "");
      if (bare.length === 0) return false;
      // A lone initial ("Ø.") only counts alongside another name word.
      if (bare.length === 1) return false;
      if (isVocabulary(bare)) return false;
      // All-caps tokens are usually codes or abbreviations, not names —
      // unless the whole run is upper case, as in "NORDMANN, OLA".
      if (bare === bare.toUpperCase() && bare.length <= 4) return false;
      return true;
    });

    if (nameWords.length === 0) return match;

    // Keep any leading vocabulary ("Lønn") and mask from the first name word.
    const firstNameIndex = words.findIndex((w) => nameWords.includes(w));
    const kept = words.slice(0, firstNameIndex);

    return kept.length > 0
      ? `${kept.join(" ")} ${REDACTION_PLACEHOLDER}`
      : REDACTION_PLACEHOLDER;
  });
}

/** Several adjacent redactions read better as one. */
function collapsePlaceholders(text: string): string {
  const escaped = escapeRegex(REDACTION_PLACEHOLDER);
  return text
    .replace(new RegExp(`(?:${escaped})(?:[\\s,\\-]+(?:${escaped}))+`, "g"), REDACTION_PLACEHOLDER)
    .replace(/\s{2,}/g, " ")
    .trim();
}
