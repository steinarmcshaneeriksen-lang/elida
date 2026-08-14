/**
 * Asking a model what the columns mean.
 *
 * The rule-based matcher knows the words this company's system happens to use.
 * Another system says "Frekvens" or "Billing cycle" or "Fakturointerval", and
 * no list of synonyms will ever be complete. That is what a model is good at,
 * so it is used — for reading labels, and for nothing else.
 *
 * Two limits keep this honest:
 *
 *   The model sees column profiles, not the spreadsheet. Headers, types and
 *   examples where the examples are codes; nothing that identifies a customer.
 *
 *   The model returns a mapping, never a figure. Every column it names is
 *   checked to exist and to hold what it claimed, and the arithmetic is done
 *   afterwards by the same code that handles a rule-matched file. A model that
 *   invents a column, or points "amount" at a column of dates, is rejected
 *   rather than believed.
 */

import OpenAI from "openai";
import type { ColumnProfile } from "./profile";
import { parseDate, parseNumber, text, type CellValue } from "./read";
import { parseInterval } from "./columns";

export interface AiFieldSpec {
  key: string;
  /** What the field means, in the words the model should reason about. */
  description: string;
  required?: boolean;
  /** What the column must hold for the answer to be accepted. */
  expect?: "number" | "date" | "boolean" | "interval" | "text";
}

export interface AiMappingResult {
  mapping: Record<string, number>;
  /** Raw interval strings the model translated, when it was asked to. */
  intervalMonths: Record<string, number>;
  documentKind: string | null;
  confidence: number;
  notes: string[];
  rejected: string[];
}

const MODEL = "gpt-5-mini";

export function isConfigured(): boolean {
  const key = process.env.OPENAI_API_KEY;
  return Boolean(
    key &&
      key !== "" &&
      key !== "placeholder" &&
      key !== "your-api-key-here" &&
      !key.startsWith("sk-placeholder")
  );
}

/**
 * Maps fields to columns using the model, then verifies every answer against
 * the actual values before returning it.
 */
export async function mapColumnsWithAi(
  profiles: ColumnProfile[],
  rows: CellValue[][],
  fields: AiFieldSpec[],
  documentHint: string
): Promise<AiMappingResult | null> {
  if (!isConfigured()) return null;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = buildPrompt(profiles, fields, documentHint);

  let parsed: {
    document_kind?: string;
    columns?: Record<string, number | null>;
    interval_months?: Record<string, number>;
    confidence?: number;
    reasoning?: string;
  };

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      max_completion_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Du tolker kolonnene i et regneark eksportert fra et regnskaps- eller " +
            "faktureringssystem. Du får en beskrivelse av hver kolonne, ikke innholdet. " +
            "Svar kun med JSON. Du skal aldri regne ut beløp eller finne på kolonner — " +
            "du skal bare peke ut hvilken kolonneindeks som svarer til hvert felt. " +
            "Bruk null når ingen kolonne passer. Det er bedre å svare null enn å gjette.",
        },
        { role: "user", content: prompt },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;
    parsed = JSON.parse(content);
  } catch (error) {
    console.error("AI column mapping failed:", error);
    return null;
  }

  return verifyAiMapping(parsed, profiles, rows, fields);
}

function buildPrompt(
  profiles: ColumnProfile[],
  fields: AiFieldSpec[],
  documentHint: string
): string {
  const columns = profiles.map((p) => ({
    index: p.index,
    header: p.header || "(uten overskrift)",
    type: p.type,
    filled: p.filled_ratio,
    distinct: p.distinct_count,
    examples: p.examples,
    ...(p.numeric_range ? { range: p.numeric_range } : {}),
  }));

  return `Dette regnearket skal tolkes som: ${documentHint}

Kolonnene i filen:
${JSON.stringify(columns, null, 1)}

Feltene som skal fylles:
${fields
  .map(
    (f) =>
      `- ${f.key}${f.required ? " (påkrevd)" : ""}: ${f.description}${
        f.expect ? ` Kolonnen må inneholde ${expectLabel(f.expect)}.` : ""
      }`
  )
  .join("\n")}

Svar med JSON på denne formen:
{
  "document_kind": "kort beskrivelse av hva filen er",
  "columns": { "feltnavn": kolonneindeks eller null, ... },
  "interval_months": { "råverdi fra intervallkolonnen": antall måneder mellom hver fakturering, ... },
  "confidence": 0.0-1.0,
  "reasoning": "én setning"
}

Om interval_months: hvis en kolonne beskriver hvor ofte noe faktureres, oversett
hver distinkte verdi du ser i examples til antall måneder. «Månedlig» = 1,
«Kvartalsvis» = 3, «Hver 6 måned» = 6, «Årlig» = 12. Ta bare med verdier du
faktisk ser i examples. Ukentlig eller daglig hører ikke hjemme her — utelat dem.

Viktig: beløp eks. mva foretrekkes framfor beløp inkl. mva. En kolonne som heter
noe med fortjeneste, margin, kostpris eller dekningsbidrag er IKKE fakturabeløpet.`;
}

function expectLabel(expect: string): string {
  switch (expect) {
    case "number":
      return "tall";
    case "date":
      return "datoer";
    case "boolean":
      return "ja/nei-verdier";
    case "interval":
      return "hvor ofte noe gjentas";
    default:
      return "tekst";
  }
}

/**
 * Checks the model's answer against the file.
 *
 * A mapping is only useful if the column exists and holds what the field
 * needs. Verifying here means a confident wrong answer is dropped rather than
 * quietly producing a wrong MRR.
 */
export function verifyAiMapping(
  parsed: {
    document_kind?: string;
    columns?: Record<string, number | null>;
    interval_months?: Record<string, number>;
    confidence?: number;
    reasoning?: string;
  },
  profiles: ColumnProfile[],
  rows: CellValue[][],
  fields: AiFieldSpec[]
): AiMappingResult {
  const mapping: Record<string, number> = {};
  const rejected: string[] = [];
  const notes: string[] = [];
  const used = new Set<number>();

  const sample = rows.slice(0, 200);

  for (const field of fields) {
    const column = parsed.columns?.[field.key];
    if (column == null) continue;

    if (!Number.isInteger(column) || column < 0 || column >= profiles.length) {
      rejected.push(`${field.key}: kolonne ${column} finnes ikke i filen`);
      continue;
    }

    if (used.has(column)) {
      rejected.push(
        `${field.key}: kolonne «${profiles[column].header}» er allerede brukt til et annet felt`
      );
      continue;
    }

    const values = sample.map((r) => r[column] ?? null);
    const fit = matches(values, field.expect, parsed.interval_months);

    if (fit < 0.7) {
      rejected.push(
        `${field.key}: kolonne «${profiles[column].header}» inneholder ikke ${expectLabel(field.expect ?? "text")}`
      );
      continue;
    }

    mapping[field.key] = column;
    used.add(column);
  }

  for (const field of fields) {
    if (field.required && mapping[field.key] === undefined) {
      notes.push(`Fant ingen kolonne for «${field.key}», som er påkrevd.`);
    }
  }

  // Interval translations are only kept where they are plausible cadences.
  const intervalMonths: Record<string, number> = {};
  for (const [raw, months] of Object.entries(parsed.interval_months ?? {})) {
    if (Number.isInteger(months) && months >= 1 && months <= 24) {
      intervalMonths[raw.trim().toLowerCase()] = months;
    } else {
      rejected.push(`Intervall «${raw}» ble oversatt til ${months} måneder, som ikke er gyldig`);
    }
  }

  if (parsed.reasoning) notes.push(parsed.reasoning);

  return {
    mapping,
    intervalMonths,
    documentKind: parsed.document_kind ?? null,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    notes,
    rejected,
  };
}

function matches(
  values: CellValue[],
  expect: AiFieldSpec["expect"],
  intervalMonths: Record<string, number> | undefined
): number {
  const present = values.filter((v) => text(v) !== "");
  if (present.length === 0) return 0;

  const hit = (test: (v: CellValue) => boolean) =>
    present.filter(test).length / present.length;

  switch (expect) {
    case "number":
      return hit((v) => parseNumber(v) != null);
    case "date":
      return hit((v) => parseDate(v) != null);
    case "boolean":
      return hit((v) =>
        ["ja", "nei", "yes", "no", "true", "false", "x", "1", "0", "aktiv", "inaktiv"].includes(
          text(v).toLowerCase()
        )
      );
    case "interval":
      // Either the built-in parser understands it, or the model supplied a
      // translation for that exact value.
      return hit(
        (v) =>
          parseInterval(text(v)) != null ||
          intervalMonths?.[text(v).trim().toLowerCase()] != null
      );
    default:
      return 1;
  }
}
