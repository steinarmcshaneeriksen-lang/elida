import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";
import { parseSaft } from "@/lib/import/saft/parser";
import { importSaft } from "@/lib/import/saft/importer";
import { SaftParseError } from "@/lib/import/saft/types";

/**
 * POST /api/import/saft
 *
 * Multipart form data with:
 * - file: SAF-T Regnskap XML export
 * - company_id: string
 *
 * Parses the file and writes accounts, parties, dimensions, vouchers and
 * ledger lines into the company's tables. Re-importing the same file updates
 * the existing rows rather than duplicating them.
 */

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

// SAF-T files are large; give the parse and the batched writes room to finish.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let runId: string | null = null;
  let supabase: Awaited<ReturnType<typeof createClient>> | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const companyId = formData.get("company_id") as string | null;

    if (!file) {
      return NextResponse.json({ error: "Fil mangler" }, { status: 400 });
    }
    if (!companyId) {
      return NextResponse.json(
        { error: "company_id mangler" },
        { status: 400 }
      );
    }

    const auth = await verifyCompanyAccess(companyId);
    if (auth instanceof NextResponse) return auth;

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error:
            "Filen er for stor (maks 100 MB). Eksporter en kortere periode og last opp i flere omganger.",
        },
        { status: 400 }
      );
    }

    supabase = await createClient();

    const { data: run } = (await supabase
      .from("import_runs")
      .insert({
        company_id: companyId,
        user_id: auth.userId,
        source_format: "saft",
        file_name: file.name,
        file_size: file.size,
        status: "running",
      } as never)
      .select("id")
      .single()) as { data: { id: string } | null };

    runId = run?.id ?? null;

    const xml = await file.text();
    const parsed = parseSaft(xml);
    const result = await importSaft(supabase, companyId, parsed);

    if (runId) {
      await (supabase
        .from("import_runs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          counts: result.counts,
          warnings: result.warnings,
          period_start: parsed.header.periodStart,
          period_end: parsed.header.periodEnd,
        } as never)
        .eq("id", runId) as never);
    }

    return NextResponse.json({
      import_run_id: runId,
      status: "completed",
      header: result.header,
      counts: result.counts,
      warnings: result.warnings,
    });
  } catch (error) {
    const message =
      error instanceof SaftParseError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Ukjent feil under import";

    console.error("SAF-T import error:", error);

    if (runId && supabase) {
      await (supabase
        .from("import_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message: message,
        } as never)
        .eq("id", runId) as never);
    }

    if (error instanceof SaftParseError) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return errorResponse(message);
  }
}

/**
 * GET /api/import/saft?company_id=…
 *
 * Returns the company's import history, newest first.
 */
export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get("company_id");
    if (!companyId) {
      return NextResponse.json(
        { error: "company_id mangler" },
        { status: 400 }
      );
    }

    const auth = await verifyCompanyAccess(companyId);
    if (auth instanceof NextResponse) return auth;

    const supabase = await createClient();
    const { data } = await supabase
      .from("import_runs")
      .select("*")
      .eq("company_id", companyId)
      .order("started_at", { ascending: false })
      .limit(20);

    return NextResponse.json({ runs: data ?? [] });
  } catch (error) {
    console.error("Import history error:", error);
    return errorResponse("Kunne ikke hente importhistorikk");
  }
}
