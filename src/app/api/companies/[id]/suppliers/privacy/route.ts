import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";

/**
 * GET   — suppliers flagged as possible private individuals
 * PATCH — anonymise the named suppliers, replacing identifying fields
 *
 * SAF-T has no employee register, but employees are commonly registered as
 * suppliers for expense reimbursement. Those rows are flagged on import so a
 * user who does not want to store payroll-recipient names can clear them.
 */

const ANONYMISED_NAME = "Privatperson (anonymisert)";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;
    const auth = await verifyCompanyAccess(companyId);
    if (auth instanceof NextResponse) return auth;

    const supabase = await createClient();
    const { data } = (await supabase
      .from("suppliers")
      .select("id, name, supplier_number, org_number, is_anonymised")
      .eq("company_id", companyId)
      .eq("is_possible_private_person", true)
      .order("name", { ascending: true })) as {
      data: Array<{
        id: string;
        name: string;
        supplier_number: string | null;
        org_number: string | null;
        is_anonymised: boolean;
      }> | null;
    };

    return NextResponse.json({ suppliers: data ?? [] });
  } catch (error) {
    console.error("Supplier privacy GET error:", error);
    return errorResponse("Kunne ikke hente flaggede leverandører");
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

    const body = (await request.json()) as { supplier_ids?: unknown };
    const ids = Array.isArray(body.supplier_ids)
      ? body.supplier_ids.filter((v): v is string => typeof v === "string")
      : [];

    if (ids.length === 0) {
      return NextResponse.json(
        { error: "Ingen leverandører valgt" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Overwrite rather than delete: the supplier row is still referenced by
    // postings, so the link must survive while the identity does not.
    const { error } = await supabase
      .from("suppliers")
      .update({
        name: ANONYMISED_NAME,
        email: null,
        phone: null,
        address: null,
        is_anonymised: true,
      } as never)
      .eq("company_id", companyId)
      .eq("is_possible_private_person", true)
      .in("id", ids);

    if (error) {
      console.error("Anonymise error:", error);
      return errorResponse("Kunne ikke anonymisere leverandørene");
    }

    return NextResponse.json({ ok: true, anonymised: ids.length });
  } catch (error) {
    console.error("Supplier privacy PATCH error:", error);
    return errorResponse("Kunne ikke anonymisere leverandørene");
  }
}
