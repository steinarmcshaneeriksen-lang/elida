/**
 * Deciding what each column is, by whichever means works.
 *
 * Rules first: they are instant, free, and produce the same answer every time,
 * which matters for a figure someone will put in front of a board. When they
 * resolve the file — as they do for an export using familiar wording — nothing
 * else runs.
 *
 * When they do not, the model is asked. That is the case this exists for: an
 * export from a system nobody anticipated, in a language or with labels no
 * synonym list covers. Its answer is verified against the file before it is
 * used, and what it decided is reported, so a mistake is visible rather than
 * folded into the numbers.
 */

import { mapColumns, parseInterval, type ColumnMap, type FieldSpec } from "./columns";
import { profileColumns } from "./profile";
import { mapColumnsWithAi, isConfigured, type AiFieldSpec } from "./ai-mapper";
import { text, type CellValue, type Sheet } from "./read";

export interface ResolvedColumns {
  map: ColumnMap;
  /** Extra interval translations the model supplied, keyed lowercased. */
  intervalMonths: Record<string, number>;
  method: "rules" | "ai" | "rules+ai";
  documentKind: string | null;
  notes: string[];
  rejected: string[];
}

export interface ResolveSpec {
  /** Rule-based specs, tried first. */
  fields: FieldSpec[];
  /** The same fields described for the model, used only if the rules fall short. */
  aiFields: AiFieldSpec[];
  /** Which fields must be present for the file to be usable. */
  required: string[];
  /** What the file is expected to be, told to the model as context. */
  documentHint: string;
}

export async function resolveColumns(
  sheet: Sheet,
  spec: ResolveSpec
): Promise<ResolvedColumns> {
  const ruleMap = mapColumns(sheet.headers, sheet.rows, spec.fields);

  const missing = spec.required.filter((f) => ruleMap[f] === undefined);

  // Only a document that has intervals can fail to state them. A product list
  // has no billing interval to find, and demanding one of every file sent the
  // rules to the model on a question the file never posed.
  const hasIntervals = spec.fields.some((f) => f.key === "interval");
  const intervalUnderstood = hasIntervals ? intervalCoverage(sheet, ruleMap) : 1;

  // The rules are trusted when they found everything required and the interval
  // column actually parses. A named column that yields nothing is not a match.
  if (missing.length === 0 && intervalUnderstood >= 0.9) {
    return {
      map: ruleMap,
      intervalMonths: {},
      method: "rules",
      documentKind: null,
      notes: [],
      rejected: [],
    };
  }

  if (!isConfigured()) {
    return {
      map: ruleMap,
      intervalMonths: {},
      method: "rules",
      documentKind: null,
      notes: missing.length
        ? [
            `Fant ikke kolonne for ${missing.join(", ")}. AI-tolking er ikke ` +
              "tilgjengelig, så filen må ha gjenkjennelige kolonnenavn.",
          ]
        : [],
      rejected: [],
    };
  }

  const profiles = profileColumns(sheet.headers, sheet.rows);
  const ai = await mapColumnsWithAi(
    profiles,
    sheet.rows,
    spec.aiFields,
    spec.documentHint
  );

  if (!ai) {
    return {
      map: ruleMap,
      intervalMonths: {},
      method: "rules",
      documentKind: null,
      notes: ["AI-tolking var ikke tilgjengelig; brukte kolonnenavn alene."],
      rejected: [],
    };
  }

  // The model fills the gaps rather than replacing what the rules established.
  // A recognised header is stronger evidence than an inference from shape, and
  // this way a partially familiar file keeps its certain half.
  const merged: ColumnMap = { ...ruleMap };
  const taken = new Set(
    Object.values(ruleMap).filter((c): c is number => c !== undefined)
  );

  let usedAi = false;

  for (const [field, column] of Object.entries(ai.mapping)) {
    if (merged[field] !== undefined) continue;
    if (taken.has(column)) continue;
    merged[field] = column;
    taken.add(column);
    usedAi = true;
  }

  // Where the rules found nothing at all, the model's reading stands alone.
  const method: ResolvedColumns["method"] =
    Object.keys(ruleMap).length === 0 ? "ai" : usedAi ? "rules+ai" : "rules";

  return {
    map: merged,
    intervalMonths: ai.intervalMonths,
    method,
    documentKind: ai.documentKind,
    notes: ai.notes,
    rejected: ai.rejected,
  };
}

/** How much of the interval column the built-in parser understands. */
function intervalCoverage(sheet: Sheet, map: ColumnMap): number {
  const column = map.interval;
  if (column === undefined) return 0;

  const values = sheet.rows
    .map((r) => text(r[column] ?? null))
    .filter(Boolean);

  if (values.length === 0) return 0;

  return values.filter((v) => parseInterval(v) != null).length / values.length;
}

/**
 * Reads an interval, falling back to the model's translation for wording the
 * built-in parser does not know.
 */
export function resolveInterval(
  value: CellValue,
  intervalMonths: Record<string, number>
): number | null {
  const raw = text(value);
  if (!raw) return null;

  const parsed = parseInterval(raw);
  if (parsed != null) return parsed;

  return intervalMonths[raw.trim().toLowerCase()] ?? null;
}
