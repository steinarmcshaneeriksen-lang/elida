import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";
import { parseSaft } from "@/lib/import/saft/parser";
import { importSaft } from "@/lib/import/saft/importer";
import { SaftParseError } from "@/lib/import/saft/types";
import { checkRateLimit, rateLimitResponse } from "@/app/api/_lib/rate-limit";

/**
 * POST /api/import/saft
 *
 * JSON body: { company_id, storage_path, file_name }
 *
 * The browser uploads the SAF-T file straight to the `saft-imports` bucket
 * and passes the object path here. Sending the file in the request body is
 * not viable: a serverless request body is capped well below the size of a
 * normal SAF-T export, and the platform rejects it before this code runs.
 *
 * Parses the file and writes accounts, parties, dimensions, vouchers and
 * ledger lines into the company's tables. Re-importing the same file updates
 * the existing rows rather than duplicating them. The uploaded object is
 * removed once processing finishes, successfully or not.
 */

interface ImportRequest {
  company_id?: string;
  storage_path?: string;
  file_name?: string;
}

export const SAFT_BUCKET = "saft-imports";

// SAF-T files are large; give the parse and the batched writes room to finish.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let runId: string | null = null;
  let supabase: Awaited<ReturnType<typeof createClient>> | null = null;
  let storageCleanupPath: string | null = null;

  try {
    const body = (await request.json()) as ImportRequest;
    const companyId = body.company_id;
    const storagePath = body.storage_path;

    if (!companyId || !storagePath) {
      return NextResponse.json(
        { error: "company_id og storage_path er påkrevd" },
        { status: 400 }
      );
    }

    const auth = await verifyCompanyAccess(companyId);
    if (auth instanceof NextResponse) return auth;

    // The object path encodes the tenant; refuse anything pointing elsewhere
    // so an authorised user cannot read another company's uploaded file.
    if (!storagePath.startsWith(`${companyId}/`)) {
      return NextResponse.json(
        { error: "Ugyldig filsti" },
        { status: 400 }
      );
    }

    // Parsing a large SAF-T file is expensive; a handful per hour is ample.
    const limit = checkRateLimit(`saft:${auth.userId}`, 10, 60 * 60_000);
    if (!limit.allowed) {
      return rateLimitResponse(limit) as NextResponse;
    }

    supabase = await createClient();
    storageCleanupPath = storagePath;

    const { data: blob, error: downloadError } = await supabase.storage
      .from(SAFT_BUCKET)
      .download(storagePath);

    if (downloadError || !blob) {
      return NextResponse.json(
        { error: "Fant ikke den opplastede filen. Prøv å laste opp på nytt." },
        { status: 400 }
      );
    }

    const { data: run } = (await supabase
      .from("import_runs")
      .insert({
        company_id: companyId,
        user_id: auth.userId,
        source_format: "saft",
        file_name: body.file_name ?? storagePath.split("/").pop() ?? null,
        file_size: blob.size,
        status: "running",
      } as never)
      .select("id")
      .single()) as { data: { id: string } | null };

    runId = run?.id ?? null;

    const xml = await blob.text();
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

    // The caller is a verified member of this company importing their own
    // file, so the actual failure is far more useful to them than a generic
    // message — and it is their own data either way.
    if (error instanceof SaftParseError) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json(
      {
        error: "Importen feilet.",
        detail: message,
        import_run_id: runId,
      },
      { status: 500 }
    );
  } finally {
    // The upload is working storage only; never keep the raw ledger file.
    if (supabase && storageCleanupPath) {
      await supabase.storage
        .from(SAFT_BUCKET)
        .remove([storageCleanupPath])
        .catch(() => {
          // Nothing actionable if cleanup fails; the bucket is private.
        });
    }
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
