/**
 * Report handlers for the assistant.
 *
 * "Lag en styrerapport på fjoråret" had no path through the chat. The report
 * builder existed, the templates existed, the PDF and Excel export existed —
 * all of it reachable only by filling in a form on the reports page. The
 * assistant could describe the report it was unable to produce.
 *
 * It builds the report through the same code the page uses, so a report made
 * from a sentence and a report made from the form are the same object, stored
 * in the same table, opened by the same screen.
 *
 * Creating one is confirmed first. A report is a document someone may hand to
 * a board, and the difference between "here is what it would cover" and "here
 * it is" should be a decision, not a side effect.
 */

import { createClient } from "@/lib/supabase/server";
import { buildReportDataset } from "@/lib/reports/dataset";
import {
  defaultConfiguration,
  reportTypeByKey,
  REPORT_TYPES,
} from "@/lib/reports/types";
import { getCoverage } from "./coverage";

type ToolParams = Record<string, unknown>;
type ToolResult = Record<string, unknown>;

/** What the assistant may build, and when each one is the right choice. */
const AVAILABLE = REPORT_TYPES.map((t) => ({
  key: t.key,
  title: t.title,
  use_case: t.useCase,
}));

export const createReport = async (
  companyId: string,
  params: ToolParams,
  userId?: string
): Promise<ToolResult> => {
  const coverage = await getCoverage(companyId);
  if (!coverage.has_data) {
    return {
      created: false,
      note:
        "Ingen regnskapsdata er importert, så det er ingenting å lage rapport " +
        "av. Be brukeren importere en SAF-T-fil først.",
    };
  }

  const typeKey = String(params.report_type ?? "month");
  const type = reportTypeByKey(typeKey);

  const range = resolveRange(params, coverage);
  if ("error" in range) return { created: false, ...range, available: AVAILABLE };

  const confirmed = params.confirmed === true;

  if (!confirmed) {
    return {
      created: false,
      requires_confirmation: true,
      would_create: {
        report_type: type.key,
        title: type.title,
        period: range,
      },
      available: AVAILABLE,
      note:
        "Dette er et FORSLAG. Rapporten er ikke laget. Bekreft type og " +
        "periode med brukeren, og kall verktøyet på nytt med confirmed: true.",
      data_source: "reports",
    };
  }

  const supabase = await createClient();
  const config = defaultConfiguration(type.key);

  const dataset = await buildReportDataset(supabase, {
    companyId,
    reportType: type.key,
    periodStart: range.start,
    periodEnd: range.end,
    comparisonType: config.comparison,
  });

  if (dataset.data_quality.transaction_count === 0) {
    return {
      created: false,
      error: "Ingen posteringer i perioden.",
      books_cover: dataset.data_quality.books_cover,
      note: "Si hvilken periode regnskapet faktisk dekker, og foreslå den.",
    };
  }

  const title =
    (params.title ? String(params.title).trim() : "") ||
    `${type.title} ${dataset.period.label}`;

  const { data: saved, error } = (await supabase
    .from("reports")
    .insert({
      company_id: companyId,
      created_by: userId ?? null,
      report_type: type.key,
      title,
      period_start: range.start,
      period_end: range.end,
      comparison_type: config.comparison,
      configuration: config as unknown as Record<string, unknown>,
      dataset: dataset as unknown as Record<string, unknown>,
      status: "ready",
    } as never)
    .select("id")
    .single()) as { data: { id: string } | null; error: { message: string } | null };

  if (error || !saved) {
    return { created: false, error: "Kunne ikke lagre rapporten." };
  }

  return {
    created: true,
    report: {
      id: saved.id,
      title,
      report_type: type.key,
      period: range,
      url: `/rapporter?report=${saved.id}`,
    },
    highlights: {
      revenue: dataset.financial_summary.revenue,
      costs: dataset.financial_summary.costs,
      operating_profit: dataset.financial_summary.operating_profit,
      operating_margin: dataset.financial_summary.operating_margin,
      transaction_count: dataset.data_quality.transaction_count,
    },
    note:
      "Rapporten er LAGET og lagret. Gi brukeren tittelen og si at den ligger " +
      "under «Rapporter», hvor den kan lastes ned som PDF eller Excel. " +
      "Oppsummer hovedtallene kort.",
    data_source: "reports",
  };
};

/**
 * The period the report covers.
 *
 * "Fjoråret" is the previous calendar year, which is what a board asks for —
 * not the last twelve months, and not the part of this year that happens to be
 * booked. Where the books do not reach that far, the range is cut to what
 * exists and said so, rather than producing an empty report.
 */
function resolveRange(
  params: ToolParams,
  coverage: Awaited<ReturnType<typeof getCoverage>>
): { start: string; end: string } | { error: string } {
  const explicitStart = asIsoDate(params.period_start);
  const explicitEnd = asIsoDate(params.period_end);

  if (explicitStart && explicitEnd) {
    if (explicitStart > explicitEnd) {
      return { error: "Perioden slutter før den begynner." };
    }
    return { start: explicitStart, end: explicitEnd };
  }

  const year = Number(params.year);
  if (Number.isInteger(year)) {
    const held = coverage.years.find((y) => y.year === year);
    if (!held) {
      return {
        error:
          `Regnskapet har ingen data for ${year}. ` +
          `Tilgjengelige år: ${coverage.years.map((y) => y.year).join(", ")}.`,
      };
    }
    return { start: held.start, end: held.end };
  }

  // No period given: the most recent year the books hold.
  const latest = coverage.years[0];
  if (!latest) return { error: "Ingen regnskapsår funnet." };
  return { start: latest.start, end: latest.end };
}

function asIsoDate(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
