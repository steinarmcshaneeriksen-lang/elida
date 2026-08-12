/**
 * Escalation Rules
 *
 * Defines when the accounting advisor should escalate a question
 * to a human accountant rather than providing automated advice.
 *
 * Escalation is triggered when:
 * 1. The transaction type is inherently complex (e.g. mergers, real estate)
 * 2. The facts are insufficient and the error would be material
 * 3. The confidence is too low for the risk level
 */

import type { EscalationRule, AccountingRecommendation } from "../types";

// ---------------------------------------------------------------------------
// Escalation rules
// ---------------------------------------------------------------------------

export const ESCALATION_RULES: EscalationRule[] = [
  {
    id: "esc-shareholder",
    category: "shareholder_transactions",
    title_nb: "Aksjonærtransaksjoner",
    description_nb:
      "Transaksjoner mellom selskapet og aksjonær/nærstående " +
      "krever særlig oppmerksomhet rundt armlengdeprinsippet, " +
      "uttaksbeskatning og dokumentasjonskrav.",
    keywords: [
      "aksjonær",
      "aksjonærlån",
      "mellomværende",
      "nærstående",
      "aksjonærkonto",
      "privatuttak",
      "lån fra selskapet",
      "lån til selskapet",
      "aksjonærlån",
      "kapitalnedsettelse",
    ],
    severity: "warning",
    message_nb:
      "Transaksjoner med aksjonær/nærstående har komplekse regler. " +
      "Anbefaler å konsultere regnskapsfører for korrekt behandling.",
  },
  {
    id: "esc-dividend",
    category: "dividend",
    title_nb: "Utbytte",
    description_nb:
      "Utbyttevedtak krever at formelle vilkår er oppfylt " +
      "(forsvarlig egenkapital og likviditet, generalforsamlingsvedtak). " +
      "Feil kan gi personlig ansvar for styret.",
    keywords: [
      "utbytte",
      "dividende",
      "utdeling",
      "ekstraordinært utbytte",
      "tilleggsutbytte",
      "aksjonærverdi",
    ],
    severity: "block",
    message_nb:
      "Utbytte krever formelt vedtak og forsvarlighetsvurdering. " +
      "Denne transaksjonen må håndteres av regnskapsfører/revisor.",
  },
  {
    id: "esc-real-estate",
    category: "real_estate",
    title_nb: "Eiendomstransaksjoner",
    description_nb:
      "Kjøp og salg av fast eiendom har komplekse regler for " +
      "dokumentavgift, gevinstberegning, justeringsregler for MVA, " +
      "og eventuell frivillig MVA-registrering.",
    keywords: [
      "eiendom",
      "fast eiendom",
      "tomt",
      "bolig",
      "næringsbygg",
      "bygning",
      "eiendomskjøp",
      "eiendomssalg",
      "dokumentavgift",
      "tinglysing",
      "justeringsrett",
      "justeringsplikt",
    ],
    severity: "block",
    message_nb:
      "Eiendomstransaksjoner har komplekse skatte- og MVA-regler. " +
      "Må håndteres av regnskapsfører med eiendomskompetanse.",
  },
  {
    id: "esc-group",
    category: "group_transactions",
    title_nb: "Konserntransaksjoner",
    description_nb:
      "Transaksjoner mellom selskaper i samme konsern krever " +
      "armlengdepris, internprisingsdokumentasjon, og korrekt " +
      "eliminering ved konsolidering.",
    keywords: [
      "konsern",
      "konsernbidrag",
      "internprising",
      "transfer pricing",
      "morselskap",
      "datterselskap",
      "konsolidering",
      "konserninternt",
      "konsernintern",
    ],
    severity: "warning",
    message_nb:
      "Konserntransaksjoner krever internprisingsdokumentasjon " +
      "og armlengdevurdering. Anbefaler å involvere regnskapsfører.",
  },
  {
    id: "esc-merger",
    category: "merger_demerger",
    title_nb: "Fusjon og fisjon",
    description_nb:
      "Fusjoner og fisjoner har komplekse selskapsrettslige, " +
      "regnskapsmessige og skattemessige konsekvenser.",
    keywords: [
      "fusjon",
      "fisjon",
      "sammenslåing",
      "deling",
      "omorganisering",
      "omdanning",
      "aksjebytte",
      "tinginnskudd",
    ],
    severity: "block",
    message_nb:
      "Fusjon/fisjon krever spesialisert rådgivning fra revisor " +
      "og advokat. Kan ikke håndteres automatisk.",
  },
  {
    id: "esc-international-tax",
    category: "international_tax",
    title_nb: "Kompleks internasjonal skatt",
    description_nb:
      "Transaksjoner som involverer fast driftssted i utlandet, " +
      "kildeskatt, skatteavtaler, eller NOKUS-regler.",
    keywords: [
      "fast driftssted",
      "kildeskatt",
      "withholding tax",
      "skatteavtale",
      "nokus",
      "cfc",
      "permanent establishment",
      "dobbeltbeskatning",
      "exitskatt",
    ],
    severity: "block",
    message_nb:
      "Internasjonal skatt krever spesialisert rådgivning. " +
      "Anbefaler å kontakte skatterådgiver.",
  },
  {
    id: "esc-reorganization",
    category: "reorganization",
    title_nb: "Større omorganisering",
    description_nb:
      "Vesentlige organisasjonsendringer som påvirker selskapsstruktur, " +
      "ansettelsesforhold, eller virksomhetsoverdraging.",
    keywords: [
      "omorganisering",
      "nedbemanning",
      "virksomhetsoverdragelse",
      "oppkjøp",
      "overtakelse",
      "avvikling",
      "konkurs",
      "oppbud",
      "likvidasjon",
      "gjeldsforhandling",
    ],
    severity: "block",
    message_nb:
      "Større omorganiseringer krever juridisk og regnskapsfaglig bistand. " +
      "Kan ikke håndteres automatisk.",
  },
  {
    id: "esc-insufficient-facts",
    category: "insufficient_information",
    title_nb: "Utilstrekkelig informasjon for vesentlige beløp",
    description_nb:
      "Når transaksjonsbeløp er vesentlig og det mangler " +
      "tilstrekkelig informasjon til å gi et trygt råd.",
    keywords: [],
    severity: "warning",
    message_nb:
      "Det mangler informasjon for å gi en sikker anbefaling på " +
      "dette beløp. Anbefaler å kontakte regnskapsfører.",
  },
];

// ---------------------------------------------------------------------------
// Escalation check
// ---------------------------------------------------------------------------

/**
 * Standard escalation messages in Norwegian, keyed by category.
 */
export const ESCALATION_MESSAGES: Record<string, string> = {};
for (const rule of ESCALATION_RULES) {
  ESCALATION_MESSAGES[rule.category] = rule.message_nb;
}

/**
 * Check if any escalation rule is triggered by the given text.
 *
 * @param description Transaction description or user question
 * @param vendorName Optional vendor name
 * @returns Matched escalation rules, or empty array if none match
 */
export function checkEscalation(
  description: string,
  vendorName?: string
): EscalationRule[] {
  const searchText = `${description} ${vendorName ?? ""}`.toLowerCase();

  return ESCALATION_RULES.filter((rule) => {
    // Rules without keywords (like insufficient-facts) are checked programmatically
    if (rule.keywords.length === 0) return false;

    return rule.keywords.some((kw) => searchText.includes(kw.toLowerCase()));
  });
}

/**
 * Check if escalation is needed based on amount and confidence.
 *
 * Large amounts with low confidence should be escalated.
 *
 * @param amount Transaction amount in NOK
 * @param confidence Advisor confidence 0-1
 * @returns The escalation rule if triggered, null otherwise
 */
export function checkAmountConfidenceEscalation(
  amount: number | undefined,
  confidence: number
): EscalationRule | null {
  if (amount === undefined) return null;

  // High-value transactions with low confidence
  const isHighValue = amount >= 100_000;
  const isLowConfidence = confidence < 0.5;

  if (isHighValue && isLowConfidence) {
    return ESCALATION_RULES.find(
      (r) => r.category === "insufficient_information"
    ) ?? null;
  }

  return null;
}

/**
 * Determine if a recommendation should include an escalation note.
 * Checks both keyword-based and confidence-based rules.
 *
 * @returns Escalation note string if escalation is needed, undefined otherwise
 */
export function getEscalationNote(
  description: string,
  vendorName: string | undefined,
  amount: number | undefined,
  confidence: number
): string | undefined {
  const keywordMatches = checkEscalation(description, vendorName);

  // Check for blocking escalations first
  const blocked = keywordMatches.find((r) => r.severity === "block");
  if (blocked) {
    return blocked.message_nb;
  }

  // Check confidence-based escalation
  const confidenceEscalation = checkAmountConfidenceEscalation(
    amount,
    confidence
  );
  if (confidenceEscalation) {
    return confidenceEscalation.message_nb;
  }

  // Return warning-level escalation notes
  const warnings = keywordMatches.filter((r) => r.severity === "warning");
  if (warnings.length > 0) {
    return warnings.map((w) => w.message_nb).join(" ");
  }

  return undefined;
}

/**
 * Determine the risk level adjustment based on escalation rules.
 * If escalation rules match, the risk level should be raised.
 */
export function adjustRiskForEscalation(
  currentRisk: AccountingRecommendation["risk_level"],
  escalationNote: string | undefined
): AccountingRecommendation["risk_level"] {
  if (!escalationNote) return currentRisk;

  // Any escalation raises risk to at least medium
  if (currentRisk === "low") return "medium";

  return currentRisk;
}
