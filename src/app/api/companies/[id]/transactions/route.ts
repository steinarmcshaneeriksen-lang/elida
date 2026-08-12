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
      .select("*, vouchers(voucher_number, voucher_date, description)", {
        count: "exact",
      })
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
          project_id: t.project_id,
          department_id: t.department_id,
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
    return NextResponse.json(getMockTransactions(page, pageSize, text));
  } catch (error) {
    console.error("Transactions API error:", error);
    return errorResponse("Failed to load transactions");
  }
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function getMockTransactions(
  page: number,
  pageSize: number,
  textFilter: string | null
) {
  const allMock = [
    { id: "txn-1", date: "2026-08-11", account_number: "1500", amount: 245_000, currency: "NOK", description: "Innbetaling faktura #2026-0142", vat_code: null, vat_amount: null, project_id: null, department_id: null, voucher_number: 1042, voucher_date: "2026-08-11" },
    { id: "txn-2", date: "2026-08-10", account_number: "6540", amount: -42_000, currency: "NOK", description: "CloudHost - Augustfaktura", vat_code: "1", vat_amount: -8_400, project_id: null, department_id: "dep-it", voucher_number: 1041, voucher_date: "2026-08-10" },
    { id: "txn-3", date: "2026-08-09", account_number: "6560", amount: -3_200, currency: "NOK", description: "Kontorrekvisita", vat_code: "1", vat_amount: -640, project_id: null, department_id: "dep-admin", voucher_number: 1040, voucher_date: "2026-08-09" },
    { id: "txn-4", date: "2026-08-08", account_number: "3000", amount: 380_000, currency: "NOK", description: "Prosjektfaktura - Bergen Energi", vat_code: "3", vat_amount: 76_000, project_id: "proj-be", department_id: "dep-konsulent", voucher_number: 1039, voucher_date: "2026-08-08" },
    { id: "txn-5", date: "2026-08-07", account_number: "7300", amount: -35_000, currency: "NOK", description: "Digital Marketing - Kampanjekostnad", vat_code: "1", vat_amount: -7_000, project_id: null, department_id: "dep-salg", voucher_number: 1038, voucher_date: "2026-08-07" },
    { id: "txn-6", date: "2026-08-06", account_number: "1500", amount: 180_000, currency: "NOK", description: "Innbetaling faktura #2026-0138", vat_code: null, vat_amount: null, project_id: null, department_id: null, voucher_number: 1037, voucher_date: "2026-08-06" },
    { id: "txn-7", date: "2026-08-05", account_number: "7500", amount: -28_000, currency: "NOK", description: "Forsikringspremie Q3", vat_code: null, vat_amount: null, project_id: null, department_id: "dep-admin", voucher_number: 1036, voucher_date: "2026-08-05" },
    { id: "txn-8", date: "2026-08-04", account_number: "7140", amount: -4_850, currency: "NOK", description: "Reisekostnader - kundemøte Bergen", vat_code: "1", vat_amount: -970, project_id: "proj-be", department_id: "dep-konsulent", voucher_number: 1035, voucher_date: "2026-08-04" },
    { id: "txn-9", date: "2026-08-03", account_number: "5000", amount: -680_000, currency: "NOK", description: "Lønnskjøring juli", vat_code: null, vat_amount: null, project_id: null, department_id: null, voucher_number: 1034, voucher_date: "2026-08-03" },
    { id: "txn-10", date: "2026-08-02", account_number: "3000", amount: 285_000, currency: "NOK", description: "Prosjektfaktura - Nordfjord", vat_code: "3", vat_amount: 57_000, project_id: "proj-nc", department_id: "dep-konsulent", voucher_number: 1033, voucher_date: "2026-08-02" },
    { id: "txn-11", date: "2026-08-01", account_number: "6300", amount: -65_000, currency: "NOK", description: "Kontorleie august", vat_code: "1", vat_amount: -13_000, project_id: null, department_id: "dep-admin", voucher_number: 1032, voucher_date: "2026-08-01" },
    { id: "txn-12", date: "2026-07-31", account_number: "6540", amount: -89_000, currency: "NOK", description: "Tekna Systems - Systemvedlikehold", vat_code: "1", vat_amount: -17_800, project_id: null, department_id: "dep-it", voucher_number: 1031, voucher_date: "2026-07-31" },
  ];

  let filtered = allMock;
  if (textFilter) {
    const lowerFilter = textFilter.toLowerCase();
    filtered = allMock.filter((t) =>
      t.description.toLowerCase().includes(lowerFilter)
    );
  }

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  return {
    transactions: paged,
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: Math.ceil(total / pageSize),
    },
  };
}
