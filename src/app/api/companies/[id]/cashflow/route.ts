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
    return NextResponse.json(getMockCashflow(horizonDays));
  } catch (error) {
    console.error("Cashflow API error:", error);
    return errorResponse("Failed to load cash flow data");
  }
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function getMockCashflow(horizonDays: number) {
  const today = new Date();
  const startingCash = 2_340_000;

  // Generate daily forecast
  const dailyForecast: Array<{
    date: string;
    balance: number;
    confidence: string;
  }> = [];

  let balance = startingCash;
  const events: Record<number, number> = {
    6: -89_000, // Tekna Systems
    8: -42_000, // CloudHost
    13: -680_000, // Payroll
    8.5: 340_000, // Stavanger Tech payment
    10: 180_000, // Tromsø Digital payment
    16: -35_000, // Digital Marketing
    20: -65_000, // Rent
    28: -310_000, // VAT
    16.5: 520_000, // Bergen Energi
    24: 250_000, // Oslo Innovations
    33: -341_000, // Employer tax + withholding
    18: 185_000, // Nordfjord
  };

  for (let day = 0; day < horizonDays; day++) {
    const d = new Date(today);
    d.setDate(d.getDate() + day);
    const dateStr = d.toISOString().split("T")[0];

    // Apply events roughly
    const eventAmount = events[day] ?? 0;
    balance += eventAmount;

    dailyForecast.push({
      date: dateStr,
      balance,
      confidence: day < 14 ? "high_confidence" : day < 30 ? "estimated" : "rough_estimate",
    });
  }

  const minBalance = Math.min(...dailyForecast.map((d) => d.balance));
  const minDate = dailyForecast.find((d) => d.balance === minBalance)?.date;

  return {
    starting_cash: startingCash,
    horizon_days: horizonDays,
    forecast_date: today.toISOString().split("T")[0],
    calculated_at: today.toISOString(),
    confidence: "estimated",
    minimum_balance: minBalance,
    minimum_balance_date: minDate,
    daily_forecast: dailyForecast,
    inflows: [
      {
        date: addDays(today, 8),
        amount: 340_000,
        description: "Stavanger Tech Solutions - Faktura #2026-0148",
        confidence: "high_confidence",
        source_type: "invoice",
      },
      {
        date: addDays(today, 10),
        amount: 180_000,
        description: "Tromsø Digital AS - Forfalt faktura",
        confidence: "estimated",
        source_type: "invoice",
      },
      {
        date: addDays(today, 16),
        amount: 520_000,
        description: "Bergen Energi AS - Prosjektfaktura",
        confidence: "high_confidence",
        source_type: "invoice",
      },
      {
        date: addDays(today, 18),
        amount: 185_000,
        description: "Nordfjord Consulting AS - Forfalt faktura",
        confidence: "low_confidence",
        source_type: "invoice",
      },
      {
        date: addDays(today, 24),
        amount: 250_000,
        description: "Oslo Innovations AS - Delleveranse",
        confidence: "estimated",
        source_type: "invoice",
      },
    ],
    outflows: [
      {
        date: addDays(today, 6),
        amount: -89_000,
        description: "Tekna Systems AS",
        confidence: "confirmed",
        source_type: "supplier_invoice",
      },
      {
        date: addDays(today, 8),
        amount: -42_000,
        description: "CloudHost Norge",
        confidence: "confirmed",
        source_type: "supplier_invoice",
      },
      {
        date: addDays(today, 13),
        amount: -680_000,
        description: "Lønnskjøring august",
        confidence: "high_confidence",
        source_type: "payroll",
      },
      {
        date: addDays(today, 16),
        amount: -35_000,
        description: "Digital Marketing Oslo",
        confidence: "confirmed",
        source_type: "supplier_invoice",
      },
      {
        date: addDays(today, 20),
        amount: -65_000,
        description: "Kontorleie september",
        confidence: "high_confidence",
        source_type: "recurring",
      },
      {
        date: addDays(today, 28),
        amount: -310_000,
        description: "MVA 4. termin (jul-aug)",
        confidence: "estimated",
        source_type: "tax",
      },
      {
        date: addDays(today, 33),
        amount: -341_000,
        description: "Arbeidsgiveravgift + skattetrekk august",
        confidence: "estimated",
        source_type: "tax",
      },
    ],
    obligations: [
      {
        date: addDays(today, 6),
        amount: 89_000,
        description: "Leverandør: Tekna Systems AS",
        confidence: "confirmed",
        source_type: "supplier_invoice",
      },
      {
        date: addDays(today, 8),
        amount: 42_000,
        description: "Leverandør: CloudHost Norge",
        confidence: "confirmed",
        source_type: "supplier_invoice",
      },
      {
        date: addDays(today, 13),
        amount: 680_000,
        description: "Lønnskjøring august",
        confidence: "high_confidence",
        source_type: "payroll",
      },
      {
        date: addDays(today, 20),
        amount: 65_000,
        description: "Kontorleie september",
        confidence: "high_confidence",
        source_type: "recurring",
      },
      {
        date: addDays(today, 28),
        amount: 310_000,
        description: "MVA 4. termin (jul-aug)",
        confidence: "estimated",
        source_type: "tax",
      },
      {
        date: addDays(today, 33),
        amount: 341_000,
        description: "Arbeidsgiveravgift + skattetrekk",
        confidence: "estimated",
        source_type: "tax",
      },
    ],
  };
}

function addDays(date: Date, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
