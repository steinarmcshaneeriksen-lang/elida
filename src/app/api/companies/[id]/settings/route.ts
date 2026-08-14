import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";

/**
 * GET  /api/companies/[id]/settings — company settings plus data status
 * PATCH /api/companies/[id]/settings — persist editable settings
 */

interface SettingsPatch {
  normal_payroll_date?: number | null;
  employer_tax_zone?: string | null;
  min_liquidity_buffer?: number | null;
  accounting_knowledge_level?: string;
}

const KNOWLEDGE_LEVELS = ["beginner", "intermediate", "advanced"];

/** Entities Elida tracks, and the table each is counted from. */
const DATA_SOURCES: { label: string; table: string }[] = [
  { label: "Kontoplan", table: "gl_accounts" },
  { label: "Bilag", table: "vouchers" },
  { label: "Posteringer", table: "account_transactions" },
  { label: "Kunder", table: "customers" },
  { label: "Leverandører", table: "suppliers" },
  { label: "MVA-koder", table: "vat_codes" },
];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;
    const auth = await verifyCompanyAccess(companyId);
    if (auth instanceof NextResponse) return auth;

    const supabase = await createClient();

    const { data: company } = await supabase
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .single();

    const { data: access } = (await supabase
      .from("user_company_access")
      .select("accounting_knowledge_level")
      .eq("user_id", auth.userId)
      .eq("company_id", companyId)
      .single()) as {
      data: { accounting_knowledge_level: string } | null;
    };

    // Row counts tell the user what actually made it into the database.
    const counts = await Promise.all(
      DATA_SOURCES.map(async (source) => {
        const { count } = await supabase
          .from(source.table as never)
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId);
        return { label: source.label, count: count ?? 0 };
      })
    );

    const { data: lastImport } = (await supabase
      .from("import_runs")
      .select("started_at, status, file_name")
      .eq("company_id", companyId)
      .eq("status", "completed")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle()) as {
      data: { started_at: string; status: string; file_name: string | null } | null;
    };

    const { data: integration } = (await supabase
      .from("integrations")
      .select("provider, is_active")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .maybeSingle()) as {
      data: { provider: string; is_active: boolean } | null;
    };

    return NextResponse.json({
      company,
      accounting_knowledge_level:
        access?.accounting_knowledge_level ?? "intermediate",
      data_status: counts,
      last_import: lastImport,
      integration: integration ?? null,
    });
  } catch (error) {
    console.error("Settings GET error:", error);
    return errorResponse("Kunne ikke hente innstillinger");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;
    const auth = await verifyCompanyAccess(companyId);
    if (auth instanceof NextResponse) return auth;

    const body = (await request.json()) as SettingsPatch;
    const supabase = await createClient();

    const companyUpdate: Record<string, unknown> = {};

    if ("normal_payroll_date" in body) {
      const day = body.normal_payroll_date;
      if (day != null && (day < 1 || day > 31)) {
        return NextResponse.json(
          { error: "Lønnsdag må være mellom 1 og 31" },
          { status: 400 }
        );
      }
      companyUpdate.normal_payroll_date = day;
    }

    if ("employer_tax_zone" in body) {
      companyUpdate.employer_tax_zone = body.employer_tax_zone;
    }

    if ("min_liquidity_buffer" in body) {
      const buffer = body.min_liquidity_buffer;
      if (buffer != null && buffer < 0) {
        return NextResponse.json(
          { error: "Likviditetsbuffer kan ikke være negativ" },
          { status: 400 }
        );
      }
      companyUpdate.min_liquidity_buffer = buffer;
    }

    if (Object.keys(companyUpdate).length > 0) {
      const { error } = await supabase
        .from("companies")
        .update(companyUpdate as never)
        .eq("id", companyId);

      if (error) {
        console.error("Company update error:", error);
        return errorResponse("Kunne ikke lagre bedriftsinnstillinger");
      }
    }

    if (body.accounting_knowledge_level) {
      if (!KNOWLEDGE_LEVELS.includes(body.accounting_knowledge_level)) {
        return NextResponse.json(
          { error: "Ugyldig kunnskapsnivå" },
          { status: 400 }
        );
      }

      const { error } = await supabase
        .from("user_company_access")
        .update({
          accounting_knowledge_level: body.accounting_knowledge_level,
        } as never)
        .eq("user_id", auth.userId)
        .eq("company_id", companyId);

      if (error) {
        console.error("Knowledge level update error:", error);
        return errorResponse("Kunne ikke lagre kunnskapsnivå");
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Settings PATCH error:", error);
    return errorResponse("Kunne ikke lagre innstillinger");
  }
}
