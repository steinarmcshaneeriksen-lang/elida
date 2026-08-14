/**
 * Intent Classifier
 *
 * Simple keyword/pattern-based intent classification for routing
 * user messages. This determines which tools are most relevant
 * and helps shape the system prompt additions.
 */

export type Intent =
  | "FINANCIAL_QUERY"
  | "ACCOUNTING_ADVICE"
  | "SCENARIO_ANALYSIS"
  | "DOCUMENT_ACCOUNTING_ADVICE"
  | "GENERAL";

export interface ClassificationResult {
  intent: Intent;
  confidence: number;
  suggestedTools: string[];
}

// ---------------------------------------------------------------------------
// Keyword patterns per intent
// ---------------------------------------------------------------------------

const FINANCIAL_PATTERNS = [
  /omsetning/i,
  /inntekt/i,
  /kostn/i,
  /resultat/i,
  /fortjeneste/i,
  /margin/i,
  /likviditet/i,
  /kontant/i,
  /cash/i,
  /hvordan\s+g(å|a)r/i,
  /penger/i,
  /saldo/i,
  /bankkonto/i,
  /fordring/i,
  /gjeld/i,
  /skylder/i,
  /faktura/i,
  /forfal/i,
  /betaling/i,
  /mva/i,
  /merverdi/i,
  /skatt/i,
  /l(ø|o)nn/i,
  /budsjett/i,
  /prognose/i,
  /trend/i,
  /vekst/i,
  /nedgang/i,
  /denne\s+m(å|a)ned/i,
  /forrige\s+m(å|a)ned/i,
  /i\s+(å|a)r/i,
  /i\s+fjor/i,
  /kvartal/i,
  /bruker\s+mest/i,
  /st(ø|o)rste/i,
  /topp/i,
  /d(å|a)rligere/i,
  /bedre/i,
  /revenue/i,
  /profit/i,
  /expense/i,
];

const ACCOUNTING_PATTERNS = [
  /bokf(ø|o)r/i,
  /konter/i,
  /konto\s/i,
  /hvilken\s+konto/i,
  /kreditere/i,
  /debitere/i,
  /bilag/i,
  /kvittering/i,
  /utgift/i,
  /f(ø|o)re\s/i,
  /posterng/i,
  /regnskaps/i,
  /regnskap/i,
  /representasjon/i,
  /firmabil/i,
  /avskrivning/i,
  /aktivere/i,
  /fradrag/i,
  /mva.*(kode|sats|fradrag|behandling)/i,
  /saf-?t/i,
  /kontoplan/i,
  /standard\s*konto/i,
  /hvordan\s+(bokf|f(ø|o)r|konter)/i,
  /kan\s+jeg\s+trekke\s+fra/i,
];

const SCENARIO_PATTERNS = [
  /hva\s+om/i,
  /hva\s+skjer\s+hvis/i,
  /what\s+if/i,
  /kan\s+jeg\s+(leie|ansette|kj(ø|o)pe|investere)/i,
  /har\s+(jeg|vi)\s+r(å|a)d/i,
  /klarer\s+(vi|jeg)/i,
  /t(å|a)ler?\s+(vi|jeg)/i,
  /simuler/i,
  /scenario/i,
  /hvis\s+(vi|jeg)\s+(ansetter|kj(ø|o)per|investerer|leier|utvider)/i,
  /konsekvens/i,
  /effekt\s+av/i,
];

const DOCUMENT_PATTERNS = [
  /last(et)?\s+opp/i,
  /vedlegg/i,
  /dokument/i,
  /fil(en)?\s/i,
  /bildet/i,
  /pdf/i,
  /scannet/i,
  /skannet/i,
  /bilde/i,
  /upload/i,
];

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => {
    return count + (pattern.test(text) ? 1 : 0);
  }, 0);
}

export function classifyIntent(
  message: string,
  hasDocument: boolean = false
): ClassificationResult {
  // Document intent takes priority when a document is present
  if (hasDocument) {
    const docMatches = countMatches(message, DOCUMENT_PATTERNS);
    const accountingMatches = countMatches(message, ACCOUNTING_PATTERNS);
    if (docMatches > 0 || accountingMatches > 0 || message.trim().length < 20) {
      return {
        intent: "DOCUMENT_ACCOUNTING_ADVICE",
        confidence: 0.9,
        suggestedTools: [
          "get_chart_of_accounts",
          "find_similar_vendor_transactions",
          "find_similar_description_transactions",
          "search_accounting_rules",
        ],
      };
    }
  }

  const scores: Record<Exclude<Intent, "DOCUMENT_ACCOUNTING_ADVICE">, number> =
    {
      FINANCIAL_QUERY: countMatches(message, FINANCIAL_PATTERNS),
      ACCOUNTING_ADVICE: countMatches(message, ACCOUNTING_PATTERNS),
      SCENARIO_ANALYSIS: countMatches(message, SCENARIO_PATTERNS),
      GENERAL: 0,
    };

  // Find top intent
  let topIntent: Intent = "GENERAL";
  let topScore = 0;
  for (const [intent, score] of Object.entries(scores)) {
    if (score > topScore) {
      topScore = score;
      topIntent = intent as Intent;
    }
  }

  // If no pattern matched, it is general
  if (topScore === 0) {
    return {
      intent: "GENERAL",
      confidence: 0.5,
      suggestedTools: [],
    };
  }

  const totalPatterns =
    FINANCIAL_PATTERNS.length +
    ACCOUNTING_PATTERNS.length +
    SCENARIO_PATTERNS.length;
  const confidence = Math.min(0.95, 0.5 + (topScore / totalPatterns) * 5);

  return {
    intent: topIntent,
    confidence,
    suggestedTools: isDeadlineQuestion(message)
      ? // The answer is one calendar lookup. Offered the full financial
        // toolset, the model reached for a VAT estimate, a coverage check, an
        // obligations list and a search of the accounting rules — paged reads
        // over the whole ledger to answer a question whose answer is in the
        // statute. Unless the amount is asked for in the same breath, in
        // which case the estimate comes along and the two run together.
        ASKS_AMOUNT.test(message)
        ? ["get_vat_deadline", "get_vat_estimate"]
        : ["get_vat_deadline"]
      : getSuggestedTools(topIntent),
  };
}

/** Names VAT. */
const NAMES_VAT = /\b(mva|merverdiavgift|moms)/i;

/** Asks when, rather than how much. */
const ASKS_WHEN =
  /(frist|forfall|termin|innlever|leverer|leveres|rapporter|n(å|a)r\s)/i;

/** Asks for a figure as well as a date. */
const ASKS_AMOUNT = /(hvor\s*mye|hvor\s*stor|bel(ø|o)p|hva\s+blir|hva\s+skal)/i;

/**
 * "Når er neste mva-innlevering?" and its variants.
 *
 * Deliberately narrow: the message has to name VAT *and* ask about timing, so
 * "hvor mye mva skylder vi" still goes to the estimate.
 */
function isDeadlineQuestion(message: string): boolean {
  return NAMES_VAT.test(message) && ASKS_WHEN.test(message);
}

function getSuggestedTools(intent: Intent): string[] {
  switch (intent) {
    case "FINANCIAL_QUERY":
      return [
        "get_financial_summary",
        "get_revenue_analysis",
        "get_profit_analysis",
        "get_cost_analysis",
        "get_customer_receivables",
        "get_overdue_invoices",
        "get_vat_estimate",
        "get_vat_deadline",
      ];
    case "ACCOUNTING_ADVICE":
      return [
        "get_chart_of_accounts",
        "find_similar_vendor_transactions",
        "find_similar_description_transactions",
        "get_vendor_posting_history",
        "search_accounting_rules",
      ];
    case "SCENARIO_ANALYSIS":
      return [
        "run_scenario",
        "get_financial_summary",
        "get_cash_forecast",
        "get_upcoming_obligations",
        "get_vat_deadline",
      ];
    case "DOCUMENT_ACCOUNTING_ADVICE":
      return [
        "get_chart_of_accounts",
        "find_similar_vendor_transactions",
        "search_accounting_rules",
      ];
    case "GENERAL":
      return [];
  }
}
