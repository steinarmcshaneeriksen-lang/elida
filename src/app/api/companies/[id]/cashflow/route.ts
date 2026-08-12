import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess, errorResponse } from "@/app/api/_lib/auth";
import type { Forecast, ForecastItem } from "@/lib/types/database";

/**
 * GET /api/companies/[id]/cashflow?horizon_days=60
 *
 * Returns cash flow forecast: starting_cash, daily_forecast[],
 * inflows[], outflows[], obligations[].
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;
    const auth = await verifyCompanyAccess(companyId);
    if (auth instanceof NextResponse) return auth;

    const horizonDays = parseInt(
      request.nextUrl.searchParams.get("horizon_days") ?? "60",
      10
    );

    const supabase = await createClient();

    // Try to load a forecast from the database
    const { data: forecast } = await supabase
      .from("forecasts")
      .select("*")
      .eq("company_id", companyId)
      .eq("forecast_type", "cashflow")
      .order("calculated_at", { ascending: false })
      .limit(1)
      .single() as { data: Forecast | null };

    if (forecast) {
      // Load forecast items
      const { data: items } = await supabase
        .from("forecast_items")
        .select("*")
        .eq("forecast_id", forecast.id)
        .order("item_date", { ascending: true }) as { data: ForecastItem[] | null };

      const forecastItems = items ?? [];

      const dailyForecast = forecastItems
        .filter((i) => i.category === "daily_balance")
        .map((i) => ({
          date: i.item_date,
          balance: i.amount,
          confidence: i.confidence,
        }));

      const inflows = forecastItems
        .filter((i) => i.category === "inflow")
        .map((i) => ({
          date: i.item_date,
          amount: i.amount,
          description: i.description,
          confidence: i.confidence,
          source_type: i.source_type,
        }));

      const outflows = forecastItems
        .filter((i) => i.category === "outflow")
        .map((i) => ({
          date: i.item_date,
          amount: i.amount,
          description: i.description,
          confidence: i.confidence,
          source_type: i.source_type,
        }));

      const obligations = forecastItems
        .filter((i) => i.category === "obligation")
        .map((i) => ({
          date: i.item_date,
          amount: i.amount,
          description: i.description,
          confidence: i.confidence,
          source_type: i.source_type,
        }));

      return NextResponse.json({
        starting_cash: (forecast.summary as Record<string, unknown>).starting_cash ?? 0,
        horizon_days: forecast.horizon_days,
        forecast_date: forecast.forecast_date,
        calculated_at: forecast.calculated_at,
        confidence: forecast.confidence,
        daily_forecast: dailyForecast,
        inflows,
        outflows,
        obligations,
      });
    }

    // No forecast data -- return mock
    return NextResponse.json({
      has_data: false,
      starting_cash: null,
      horizon_days: horizonDays,
      forecast_date: null,
      calculated_at: new Date().toISOString(),
      confidence: "no_data",
      daily_forecast: [],
    });
  } catch (error) {
    console.error("Cashflow API error:", error);
    return errorResponse("Failed to load cash flow data");
  }
}
