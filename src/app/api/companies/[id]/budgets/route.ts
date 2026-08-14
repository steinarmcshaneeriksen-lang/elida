import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";
import { generateBudgetGrid, type BudgetGrid } from "@/lib/budget/engine";
import { grownGrid, readGrid, writeGrid } from "@/lib/budget/store";

export const maxDuration = 60;

/**
 * GET  /api/companies/[id]/budgets — every budget for the company.
 * POST /api/companies/[id]/budgets — create one, seeded from history.
 *
 * A blank grid never gets filled in, so a new budget arrives already holding
 * what the company actually did, month by month, with its seasonal shape
 * intact. The owner then adjusts rather than authors.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;
    const auth = await verifyCompanyAccess(companyId);
    if (auth instanceof NextResponse) return auth;

    const supabase = await createClient();

    const { data: budgets } = await supabase
      .from("budgets")
      .select("id, name, year, status, scenario, based_on, version, created_at, updated_at")
      .eq("company_id", companyId)
      .order("year", { ascending: false })
      .order("created_at", { ascending: false });

    return NextResponse.json({ has_data: true, budgets: budgets ?? [] });
  } catch (error) {
    console.error("Budget list error:", error);
    return errorResponse("Kunne ikke hente budsjetter");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;
    const auth = await verifyCompanyAccess(companyId);
    if (auth instanceof NextResponse) return auth;

    const body = (await request.json()) as {
      name?: string;
      year?: number;
      based_on?: string;
      scenario?: string;
      revenue_growth_percent?: number;
      cost_growth_percent?: number;
      copy_from_budget_id?: string;
    };

    const year = Number(body.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "Ugyldig budsjettår" }, { status: 400 });
    }

    const supabase = await createClient();

    const name = (body.name ?? `Budsjett ${year}`).trim();

    const { data: budget, error } = await supabase
      .from("budgets")
      .insert({
        company_id: companyId,
        created_by: auth.userId,
        name,
        year,
        status: "draft",
        scenario: body.scenario ?? "base",
        based_on: body.copy_from_budget_id ? "copy" : (body.based_on ?? "last_12_months"),
      })
      .select("id, name, year, status, scenario, based_on")
      .single();

    if (error) {
      // The unique constraint on (company_id, name) is the likely cause, and
      // saying so is more useful than a generic failure.
      return NextResponse.json(
        {
          error: error.code === "23505"
            ? `Det finnes allerede et budsjett som heter «${name}».`
            : "Kunne ikke opprette budsjettet",
        },
        { status: error.code === "23505" ? 409 : 500 }
      );
    }

    let grid: BudgetGrid;
    let basis: { start: string; end: string } | null = null;

    if (body.copy_from_budget_id) {
      grid = await copyGrid(supabase, body.copy_from_budget_id, {
        revenue: body.revenue_growth_percent ?? 0,
        cost: body.cost_growth_percent ?? 0,
      });
    } else {
      const generated = await generateBudgetGrid(supabase, {
        companyId,
        year,
        basedOn: body.based_on ?? "last_12_months",
        revenueGrowthPercent: body.revenue_growth_percent,
        costGrowthPercent: body.cost_growth_percent,
      });
      grid = generated.grid;
      basis = generated.basis;
    }

    await writeGrid(supabase, budget.id, grid);

    // Stored, not just returned: which months a budget was derived from is
    // part of what it means, and the page has to be able to say so on a later
    // visit rather than only in the moment it was created.
    if (basis) {
      await supabase
        .from("budgets")
        .update({ basis_start: basis.start, basis_end: basis.end } as never)
        .eq("id", budget.id);
    }

    return NextResponse.json({ budget, basis });
  } catch (error) {
    console.error("Budget create error:", error);
    return errorResponse("Kunne ikke opprette budsjettet");
  }
}

async function copyGrid(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceBudgetId: string,
  growth: { revenue: number; cost: number }
): Promise<BudgetGrid> {
  return grownGrid(await readGrid(supabase, sourceBudgetId), growth);
}
