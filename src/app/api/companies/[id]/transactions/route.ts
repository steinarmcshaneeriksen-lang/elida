import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";
import type { AccountTransaction } from "@/lib/types/database";

type TransactionWithVoucher = AccountTransaction & {
  vouchers: {
    voucher_number: number | null;
    voucher_date: string | null;
    description: string | null;
  } | null;
  gl_accounts: { name: string | null } | null;
  departments: { name: string | null } | null;
  projects: { name: string | null } | null;
};

/**
 * GET /api/companies/[id]/transactions
 *
 * Query params: date_from, date_to, account, supplier, customer,
 * amount_min, amount_max, text, project, department, page, page_size.
 *
 * Returns paginated transactions.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;
    const auth = await verifyCompanyAccess(companyId);
    if (auth instanceof NextResponse) return auth;

    const sp = request.nextUrl.searchParams;
    const dateFrom = sp.get("date_from");
    const dateTo = sp.get("date_to");
    const account = sp.get("account");
    const supplier = sp.get("supplier");
    const customer = sp.get("customer");
    const amountMin = sp.get("amount_min");
    const amountMax = sp.get("amount_max");
    const text = sp.get("text");
    const project = sp.get("project");
    const department = sp.get("department");
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("page_size") ?? "25", 10)));

    const supabase = await createClient();

    // Build query
    let query = supabase
      .from("account_transactions")
      .select(
        "*, vouchers(voucher_number, voucher_date, description), " +
          "gl_accounts(name), departments(name), projects(name)",
        { count: "exact" }
      )
      .eq("company_id", companyId)
      .order("transaction_date", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (dateFrom) query = query.gte("transaction_date", dateFrom);
    if (dateTo) query = query.lte("transaction_date", dateTo);
    if (account) query = query.eq("account_number", account);
    if (amountMin) query = query.gte("amount", parseFloat(amountMin));
    if (amountMax) query = query.lte("amount", parseFloat(amountMax));
    if (text) query = query.ilike("description", `%${text}%`);
    if (project) query = query.eq("project_id", project);
    if (department) query = query.eq("department_id", department);

    // Supplier/customer filters would require a join through vouchers or
    // a denormalized field. For MVP, filter on description as a fallback.
    if (supplier) query = query.ilike("description", `%${supplier}%`);
    if (customer) query = query.ilike("description", `%${customer}%`);

    const { data: transactions, count, error } = await query as {
      data: TransactionWithVoucher[] | null;
      count: number | null;
      error: { message: string } | null;
    };

    if (error) {
      console.error("Transaction query error:", error);
    }

    if (transactions && transactions.length > 0) {
      return NextResponse.json({
        transactions: transactions.map((t) => ({
          id: t.id,
          date: t.transaction_date,
          account_number: t.account_number,
          amount: t.amount,
          currency: t.currency,
          description: t.description,
          vat_code: t.vat_code,
          vat_amount: t.vat_amount,
          account_name: t.gl_accounts?.name ?? null,
          project_id: t.project_id,
          project_name: t.projects?.name ?? null,
          department_id: t.department_id,
          department_name: t.departments?.name ?? null,
          voucher_number: (t.vouchers as { voucher_number: number | null } | null)?.voucher_number ?? null,
          voucher_date: (t.vouchers as { voucher_date: string | null } | null)?.voucher_date ?? null,
        })),
        pagination: {
          page,
          page_size: pageSize,
          total: count ?? 0,
          total_pages: count ? Math.ceil(count / pageSize) : 0,
        },
      });
    }

    // No real data -- return mock
    return NextResponse.json({
      transactions: [],
      pagination: { page, page_size: pageSize, total: 0, total_pages: 0 },
    });
  } catch (error) {
    console.error("Transactions API error:", error);
    return errorResponse("Failed to load transactions");
  }
}
