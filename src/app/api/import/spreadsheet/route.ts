import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";
import { readWorkbook } from "@/lib/import/spreadsheet/read";
import {
  importRecurringContracts,
  parseRecurringSheet,
  scoreRecurringSheet,
} from "@/lib/import/spreadsheet/recurring";
import {
  importProducts,
  parseProductSheet,
  scoreProductSheet,
} from "@/lib/import/spreadsheet/products";

export const maxDuration = 60;

/** Well under the serverless body limit; a contract list is a few hundred kB. */
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * POST /api/import/spreadsheet
 *
 * Takes a spreadsheet without being told what is in it.
 *
 * The alternative — requiring a fixed column order — means reshaping every
 * export by hand before it can be used, which is the work the import exists to
 * remove. So the header row is located, the columns are identified by meaning,
 * and the file is classified by what its columns turn out to be.
 */
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const companyId = String(form.get("company_id") ?? "");
    const file = form.get("file");

    if (!companyId) {
      return NextResponse.json({ error: "Mangler company_id" }, { status: 400 });
    }

    const auth = await verifyCompanyAccess(companyId);
    if (auth instanceof NextResponse) return auth;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Mangler fil" }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        {
          error: "Filen er for stor",
          detail: `Maks ${Math.round(MAX_BYTES / 1024 / 1024)} MB. Filen er ${(file.size / 1024 / 1024).toFixed(1)} MB.`,
        },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let sheets;
    try {
      sheets = readWorkbook(buffer);
    } catch {
      return NextResponse.json(
        {
          error: "Kunne ikke lese filen",
          detail: "Filen ser ikke ut til å være et regneark (.xlsx, .xls eller .csv).",
        },
        { status: 400 }
      );
    }

    if (sheets.length === 0) {
      return NextResponse.json(
        {
          error: "Fant ingen tabell i filen",
          detail:
            "Elida leter etter en rad med kolonneoverskrifter og data under. Sjekk at arket ikke er tomt.",
        },
        { status: 422 }
      );
    }

    /*
     * What is this file?
     *
     * This used to be settled before it was asked. Every upload went through
     * the recurring-contract parser, which looks for a customer, an amount and
     * a billing interval. A product list has none of those, produced no
     * contracts, and came back as "forsto ikke innholdet i filen" — while the
     * column interpretation, AI included, had worked perfectly on a file it
     * was never meant for.
     *
     * Each kind scores every sheet on the same scale, and the best pairing of
     * sheet and kind wins. Where nothing scores well the file is written in
     * wording the rules do not know, and the largest table goes to the model
     * as a contract list, which is the commoner upload.
     */
    const candidates = sheets.flatMap((sheet) => [
      { sheet, kind: "recurring" as const, score: scoreRecurringSheet(sheet) },
      { sheet, kind: "products" as const, score: scoreProductSheet(sheet) },
    ]);

    const ranked = [...candidates].sort((a, b) => b.score - a.score);
    const confident = ranked[0].score >= 5;

    const best = confident
      ? ranked[0]
      : {
          kind: "recurring" as const,
          score: ranked[0].score,
          sheet: [...sheets].sort(
            (a, b) =>
              b.rows.length * b.headers.length - a.rows.length * a.headers.length
          )[0],
        };

    const supabase = await createClient();

    if (best.kind === "products") {
      const parsed = await parseProductSheet(best.sheet);

      if (parsed.products.length === 0) {
        return NextResponse.json(
          {
            error: "Forsto ikke innholdet i filen",
            detail:
              "Filen ser ut som en produktliste, men Elida fant ingen rader " +
              "med produktnavn.",
            found_columns: best.sheet.headers.filter(Boolean),
            interpretation: parsed.interpretation,
            skipped: parsed.skipped.slice(0, 10),
          },
          { status: 422 }
        );
      }

      const result = await importProducts(supabase, companyId, parsed);

      return NextResponse.json({
        kind: "products",
        file_name: file.name,
        sheet: best.sheet.name,
        header_row: best.sheet.headerRowIndex + 1,
        columns_used: parsed.mapping,
        interpretation: parsed.interpretation,
        products: result.written,
        with_sales: result.withSales,
        total_revenue: result.totalRevenue,
        product_groups: result.groups,
        period: best.sheet.preamble.find((p) => /periode/i.test(p)) ?? null,
        skipped: parsed.skipped.slice(0, 20),
        warnings: result.warnings,
      });
    }

    const parsed = await parseRecurringSheet(best.sheet);

    if (parsed.contracts.length === 0) {
      return NextResponse.json(
        {
          error: "Forsto ikke innholdet i filen",
          detail:
            parsed.skipped[0]?.reason ??
            "Elida fant ingen kolonner som beskriver gjentakende fakturaer. " +
              "Filen bør ha én rad per avtale, med kunde, beløp og hvor ofte den faktureres.",
          found_columns: best.sheet.headers.filter(Boolean),
          interpretation: parsed.interpretation,
          skipped: parsed.skipped.slice(0, 10),
        },
        { status: 422 }
      );
    }

    const result = await importRecurringContracts(supabase, companyId, parsed);

    const counted = result.contracts.filter((c) => c.isActive && !c.isDraft);
    const drafts = result.contracts.filter((c) => c.isDraft).length;
    const inactive = result.contracts.filter((c) => !c.isActive).length;

    return NextResponse.json({
      kind: "recurring_contracts",
      file_name: file.name,
      sheet: best.sheet.name,
      header_row: best.sheet.headerRowIndex + 1,
      columns_used: result.mapping,
      interpretation: result.interpretation,
      contracts: result.written,
      counted_towards_mrr: counted.length,
      drafts,
      inactive,
      matched_customers: result.matchedCustomers,
      mrr: result.mrr,
      arr: result.mrr * 12,
      by_interval: result.byInterval,
      skipped: result.skipped.slice(0, 20),
      warnings: buildWarnings(result, drafts, inactive),
    });
  } catch (error) {
    console.error("Spreadsheet import error:", error);
    return errorResponse("Kunne ikke importere filen");
  }
}

function buildWarnings(
  result: Awaited<ReturnType<typeof importRecurringContracts>>,
  drafts: number,
  inactive: number
): string[] {
  const warnings: string[] = [];

  warnings.push(
    `Leste ${result.written} avtaler. MRR er ${format(result.mrr)} eks. mva — ` +
      `beløpet per faktura delt på antall måneder mellom hver fakturering.`
  );

  // How the columns were identified matters to how much the figure can be
  // trusted, so it is said rather than left in a details pane.
  if (result.interpretation.method !== "rules") {
    warnings.push(
      result.interpretation.method === "ai"
        ? "Kolonnenavnene var ukjente, så Elida tolket filen med AI og kontrollerte " +
          "hver kolonne mot innholdet. Se «Slik tolket Elida filen» og bekreft at " +
          "beløpskolonnen er riktig."
        : "Noen kolonnenavn var ukjente. Elida tolket dem med AI og kontrollerte " +
          "dem mot innholdet. Se «Slik tolket Elida filen»."
    );
  }

  for (const rejected of result.interpretation.rejected) {
    warnings.push(`Forkastet tolkning: ${rejected}`);
  }

  if (drafts > 0) {
    warnings.push(
      `${drafts} ${drafts === 1 ? "avtale er" : "avtaler er"} satt til utkast og ` +
        "teller ikke med, siden de ikke faktureres før noen sender dem."
    );
  }

  if (inactive > 0) {
    warnings.push(`${inactive} avtaler er markert som inaktive og teller ikke med.`);
  }

  const unmatched = result.written - result.matchedCustomers;
  if (unmatched > 0) {
    warnings.push(
      `${unmatched} avtaler ble ikke koblet til en kunde i regnskapet, så de ` +
        "vises ikke på kundesiden. De teller likevel med i MRR."
    );
  }

  if (result.skipped.length > 0) {
    warnings.push(
      `${result.skipped.length} rader ble hoppet over. Første årsak: ${result.skipped[0].reason} (rad ${result.skipped[0].row}).`
    );
  }

  if (result.removed > 0) {
    warnings.push(
      `${result.removed} avtaler fra forrige opplasting er fjernet, siden de ikke ` +
        "står i den nye listen."
    );
  }

  return warnings;
}

function format(n: number): string {
  return `${n.toLocaleString("nb-NO", { maximumFractionDigits: 0 })} kr`;
}
