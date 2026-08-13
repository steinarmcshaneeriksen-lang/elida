/**
 * Reading and writing the budget grid.
 *
 * The grid is stored one row per category per month. That is what makes
 * budget-versus-actual a straight comparison later: the actual figures are
 * aggregated into the same categories, so the two line up without mapping.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { CATEGORIES } from "@/lib/reports/categories";
import { emptyGrid, type BudgetGrid } from "./engine";
import { fetchAll } from "@/lib/supabase/paginate";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

export async function readGrid(supabase: DB, budgetId: string): Promise<BudgetGrid> {
  type LineRow = { category_key: string; month: number; amount: number };

  const lines = await fetchAll<LineRow>(
    (from, to) =>
      supabase
        .from("budget_lines")
        .select("category_key, month, amount")
        .eq("budget_id", budgetId)
        .order("id", { ascending: true })
        .range(from, to) as PromiseLike<{
        data: LineRow[] | null;
        error: { message: string } | null;
      }>,
    { label: "budsjettlinjer" }
  );

  const grid = emptyGrid();

  for (const line of lines) {
    if (!grid[line.category_key]) grid[line.category_key] = new Array(12).fill(0);
    grid[line.category_key][line.month - 1] = Number(line.amount);
  }

  return grid;
}

export async function writeGrid(
  supabase: DB,
  budgetId: string,
  grid: BudgetGrid
): Promise<void> {
  const rows = Object.entries(grid).flatMap(([categoryKey, months]) =>
    months.map((amount, index) => ({
      budget_id: budgetId,
      category_key: categoryKey,
      account_number: null,
      month: index + 1,
      amount: Math.round(amount),
    }))
  );

  // Replaced rather than merged: the grid is the whole truth for this budget,
  // and a partial upsert would leave stale rows for categories now at zero.
  await supabase.from("budget_lines").delete().eq("budget_id", budgetId);

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("budget_lines").insert(rows.slice(i, i + 500));
    if (error) throw new Error(`Kunne ikke lagre budsjettlinjer: ${error.message}`);
  }
}

/** Applies a percentage uplift to every category of one kind. */
export function grownGrid(
  grid: BudgetGrid,
  growth: { revenue: number; cost: number }
): BudgetGrid {
  const next: BudgetGrid = {};

  for (const category of CATEGORIES) {
    const percent = category.kind === "revenue" ? growth.revenue : growth.cost;
    const line = grid[category.key] ?? new Array(12).fill(0);
    next[category.key] =
      percent === 0 ? [...line] : line.map((v) => Math.round(v * (1 + percent / 100)));
  }

  return next;
}
