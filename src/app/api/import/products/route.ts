import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";
import { checkRateLimit, rateLimitResponse } from "@/app/api/_lib/rate-limit";
import {
  parseProductWorkbook,
  ProductParseError,
} from "@/lib/import/products/parser";

/**
 * POST /api/import/products
 *
 * Multipart form data with a product list exported from the accounting
 * system. Unlike SAF-T these files are small, so they are sent directly.
 *
 * Products whose group names a licence or subscription are marked recurring,
 * which makes the revenue analysis authoritative instead of inferred.
 */

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const companyId = formData.get("company_id") as string | null;

    if (!file || !companyId) {
      return NextResponse.json(
        { error: "file og company_id er påkrevd" },
        { status: 400 }
      );
    }

    const auth = await verifyCompanyAccess(companyId);
    if (auth instanceof NextResponse) return auth;

    const limit = checkRateLimit(`products:${auth.userId}`, 20, 60 * 60_000);
    if (!limit.allowed) return rateLimitResponse(limit) as NextResponse;

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Filen er for stor (maks 5 MB)." },
        { status: 400 }
      );
    }

    const parsed = parseProductWorkbook(await file.arrayBuffer());
    const supabase = await createClient();

    const rows = parsed.products.map((p) => ({
      company_id: companyId,
      code: p.code,
      name: p.name,
      product_group: p.productGroup,
      sales_account: p.salesAccount,
      is_recurring: p.isRecurring,
      is_active: true,
      source_system: "product_list",
      source_id: p.code ?? p.name,
    }));

    const { error } = await supabase
      .from("products")
      .upsert(rows as never, { onConflict: "company_id,name" });

    if (error) {
      console.error("Product import error:", error);
      return NextResponse.json(
        { error: "Kunne ikke lagre produktene.", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: "completed",
      counts: {
        products: parsed.products.length,
        recurring: parsed.products.filter((p) => p.isRecurring).length,
      },
      groups: parsed.groups,
      warnings: parsed.warnings,
    });
  } catch (error) {
    if (error instanceof ProductParseError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Product import error:", error);
    return errorResponse("Kunne ikke lese produktlisten.");
  }
}
