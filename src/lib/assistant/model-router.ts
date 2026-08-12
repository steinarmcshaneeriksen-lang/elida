/**
 * Model Router
 *
 * Determines which OpenAI model to use based on the query complexity.
 *
 * Architecture:
 *   GPT-5 nano  → classifies intent and determines routing
 *   GPT-5 mini  → handles standard chat, tool calling, financial queries
 *   GPT-5.1     → handles complex accounting: foreign VAT, capitalization,
 *                  shareholder transactions, high-risk bookkeeping
 */

import type { Intent } from "./intent-classifier";

export type ModelTier = "nano" | "mini" | "expert";

export const MODEL_IDS: Record<ModelTier, string> = {
  nano: "gpt-5-nano",
  mini: "gpt-5-mini",
  expert: "gpt-5.1",
};

export const VISION_MODEL = "gpt-5-mini";
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const MODERATION_MODEL = "omni-moderation-latest";

interface RoutingDecision {
  model: string;
  tier: ModelTier;
  reason: string;
}

const HIGH_RISK_KEYWORDS = [
  /aksjon(æ|ae)r/i,
  /utbytte/i,
  /eiendom/i,
  /konsern/i,
  /fusjon/i,
  /fisjon/i,
  /internasjonal\s+skatt/i,
  /transfer\s*pric/i,
  /omorganiser/i,
  /selskapsrettslig/i,
  /aksjeloven/i,
  /n(æ|ae)rst(å|a)ende/i,
  /skatteplanlegging/i,
  /utenlandsk\s+(mva|merverdi|avgift)/i,
  /reverse\s*charge/i,
  /snudd\s*avregning/i,
  /aktivering\s+(eller|vs|kontra|mot)\s+kostnadsf/i,
  /balansefør/i,
  /goodwill/i,
  /immateriel/i,
  /forskningsutgift/i,
  /utviklingskost/i,
  /virksomhetsoverdragelse/i,
  /omdanning/i,
  /stiftelse/i,
  /avvikling/i,
  /konkurs/i,
  /gjeldsforhandling/i,
];

export function routeToModel(
  intent: Intent,
  message: string,
  hasDocument: boolean
): RoutingDecision {
  if (hasDocument) {
    return {
      model: VISION_MODEL,
      tier: "mini",
      reason: "Dokumentanalyse med bildeinput",
    };
  }

  if (intent === "ACCOUNTING_ADVICE") {
    const isHighRisk = HIGH_RISK_KEYWORDS.some((pattern) =>
      pattern.test(message)
    );
    if (isHighRisk) {
      return {
        model: MODEL_IDS.expert,
        tier: "expert",
        reason: "Komplisert regnskapsspørsmål som krever dypere resonnering",
      };
    }
  }

  if (intent === "SCENARIO_ANALYSIS") {
    return {
      model: MODEL_IDS.mini,
      tier: "mini",
      reason: "Scenarioanalyse med verktøybruk",
    };
  }

  return {
    model: MODEL_IDS.mini,
    tier: "mini",
    reason: "Standard spørsmål",
  };
}
