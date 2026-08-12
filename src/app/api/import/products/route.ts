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

    // Read what is already stored so the response can say what actually
    // changed, rather than reporting every row as if it were new.
    const { data: existingRows } = (await supabase
      .from("products")
      .select("name, sales_price, cost_price, is_recurring")
      .eq("company_id", companyId)) as {
      data: Array<{
        name: string;
        sales_price: number | null;
        cost_price: number | null;
        is_recurring: boolean;
      }> | null;
    };

    const existing = new Map((existingRows ?? []).map((r) => [r.name, r]));

    let added = 0;
    let priceChanged = 0;
    let unchanged = 0;
    const priceChanges: Array<{
      name: string;
      from: number | null;
      to: number | null;
    }> = [];

    const now = new Date().toISOString();

    const rows = parsed.products.map((p) => {
      const before = existing.get(p.name);
      const salesChanged =
        before != null &&
        p.salesPrice != null &&
        Number(before.sales_price) !== p.salesPrice;
      const costChanged =
        before != null &&
        p.costPrice != null &&
        Number(before.cost_price) !== p.costPrice;

      if (!before) {
        added++;
      } else if (salesChanged || costChanged) {
        priceChanged++;
        if (salesChanged) {
          priceChanges.push({
            name: p.name,
            from: before.sales_price,
            to: p.salesPrice,
          });
        }
      } else {
        unchanged++;
      }

      return {
        company_id: companyId,
        code: p.code,
        name: p.name,
        product_group: p.productGroup,
        sales_account: p.salesAccount,
        sales_price: p.salesPrice,
        cost_price: p.costPrice,
        unit: p.unit,
        is_recurring: p.isRecurring,
        is_active: true,
        // Stamped only when a price actually moved, so the column records
        // when the price last changed rather than when a file was last read.
        price_updated_at:
          salesChanged || costChanged
            ? now
            : (before ? undefined : now),
        updated_at: now,
        source_system: "product_list",
        source_id: p.code ?? p.name,
      };
    });

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

    // Products held from an earlier upload that are absent now. They are kept
    // rather than deleted — postings still reference them — but flagged so a
    // discontinued product does not silently stay in the recurring total.
    const uploadedNames = new Set(parsed.products.map((p) => p.name));
    const removed = [...existing.keys()].filter((n) => !uploadedNames.has(n));

    return NextResponse.json({
      status: "completed",
      counts: {
        products: parsed.products.length,
        recurring: parsed.products.filter((p) => p.isRecurring).length,
        added,
        price_changed: priceChanged,
        unchanged,
        missing_from_file: removed.length,
      },
      price_changes: priceChanges.slice(0, 20),
      missing_products: removed.slice(0, 20),
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
