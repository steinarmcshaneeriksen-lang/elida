"use client";

import { useMemo, useState } from "react";
import { formatCurrency, formatChange, formatPercent } from "@/lib/format";
import { useCompanyData } from "@/lib/hooks/use-company-data";
import {
  NoDataState,
  LoadingState,
  ErrorState,
} from "@/components/dashboard/empty-state";
import { BarChart3, TrendingUp, TrendingDown, Minus } from "lucide-react";

type Period = "month" | "quarter" | "ytd" | "rolling12";

const periodLabels: Record<Period, string> = {
  month: "Måned",
  quarter: "Kvartal",
  ytd: "Hittil i år",
  rolling12: "Siste 12 mnd",
};

interface FinancialsResponse {
  has_data?: boolean;
  monthly: Array<{
    month: string;
    revenue: number;
    costs: number;
    profit: number;
  }>;
  revenue: {
    total: number;
    previous_period_total: number;
    change_percent: number | null;
  } | null;
  costs: {
    total: number;
    by_category: Record<string, number>;
    previous_period_total: number;
    change_percent: number | null;
  } | null;
  profit: {
    operating_profit: number;
    operating_margin_percent: number;
    change_percent: number | null;
  } | null;
}

/** Maps the selected period onto the date range the API expects. */
function periodRange(period: Period): { start: string; end: string } {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const end = iso(now);

  switch (period) {
    case "month":
      return {
        start: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
        end,
      };
    case "quarter": {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      return {
        start: iso(new Date(now.getFullYear(), quarterStartMonth, 1)),
        end,
      };
    }
    case "rolling12":
      return {
        start: iso(
          new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
        ),
        end,
      };
    case "ytd":
    default:
      return { start: `${now.getFullYear()}-01-01`, end };
  }
}

const MONTH_NAMES = [
  "jan", "feb", "mar", "apr", "mai", "jun",
  "jul", "aug", "sep", "okt", "nov", "des",
];

function monthLabel(isoMonth: string): string {
  const [, month] = isoMonth.split("-");
  return MONTH_NAMES[Number(month) - 1] ?? isoMonth;
}

export default function OkonomiPage() {
  const [period, setPeriod] = useState<Period>("ytd");

  const path = useMemo(() => {
    const { start, end } = periodRange(period);
    return `financials?period_start=${start}&period_end=${end}`;
  }, [period]);

  const { data, isLoading, error, isEmpty } =
    useCompanyData<FinancialsResponse>(path);

  const monthly = data?.monthly ?? [];
  const maxRevenue = Math.max(1, ...monthly.map((m) => m.revenue));

  const costCategories = useMemo(() => {
    const byCategory = data?.costs?.by_category ?? {};
    const total = data?.costs?.total ?? 0;
    return Object.entries(byCategory)
      .map(([category, amount]) => ({
        category,
        amount,
        percent: total > 0 ? (amount / total) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [data]);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex rounded-lg border border-border bg-surface p-1">
          {(Object.keys(periodLabels) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                period === p
                  ? "bg-primary text-white"
                  : "text-foreground-secondary hover:bg-surface-hover"
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <LoadingState />}
      {!isLoading && error && <ErrorState message={error} />}
      {isEmpty && <NoDataState />}

      {!isLoading && !error && !isEmpty && data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label="Omsetning"
              value={formatCurrency(data.revenue?.total ?? 0)}
              change={data.revenue?.change_percent ?? null}
            />
            <SummaryCard
              label="Kostnader"
              value={formatCurrency(data.costs?.total ?? 0)}
              change={data.costs?.change_percent ?? null}
              // Rising costs are unfavourable, so invert the colour cue.
              invert
            />
            <SummaryCard
              label="Driftsresultat"
              value={formatCurrency(data.profit?.operating_profit ?? 0)}
              change={data.profit?.change_percent ?? null}
            />
            <SummaryCard
              label="Driftsmargin"
              value={formatPercent(data.profit?.operating_margin_percent ?? 0)}
              change={null}
            />
          </div>

          {monthly.length > 0 && (
            <section className="rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow)]">
              <div className="mb-6 flex items-center gap-2">
                <BarChart3 size={18} className="text-foreground-muted" />
                <h3 className="text-lg font-semibold text-foreground">
                  Omsetning per måned
                </h3>
              </div>
              <div className="space-y-3">
                {monthly.map((m) => (
                  <div key={m.month} className="flex items-center gap-4">
                    <span className="w-10 text-sm font-medium text-foreground-secondary">
                      {monthLabel(m.month)}
                    </span>
                    <div className="flex-1">
                      <div
                        className="h-8 rounded-md bg-primary"
                        style={{
                          width: `${Math.max(1, (m.revenue / maxRevenue) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="w-28 text-right text-sm font-medium tabular-nums text-foreground">
                      {formatCurrency(m.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {costCategories.length > 0 && (
            <section className="rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow)]">
              <h3 className="mb-6 text-lg font-semibold text-foreground">
                Kostnader etter kategori
              </h3>
              <div className="space-y-4">
                {costCategories.map((cat) => (
                  <div key={cat.category} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">
                        {cat.category}
                      </span>
                      <span className="text-sm tabular-nums text-foreground">
                        {formatCurrency(cat.amount)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-hover">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${cat.percent}%` }}
                      />
                    </div>
                    <p className="text-xs text-foreground-muted">
                      {cat.percent.toFixed(1).replace(".", ",")} % av totale
                      kostnader
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  change,
  invert = false,
}: {
  label: string;
  value: string;
  change: number | null;
  invert?: boolean;
}) {
  const isUp = (change ?? 0) > 0.5;
  const isDown = (change ?? 0) < -0.5;
  const favourable = invert ? isDown : isUp;

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow)]">
      <p className="text-sm text-foreground-muted">{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight text-foreground">
        {value}
      </p>
      <div className="mt-2 flex items-center gap-1">
        {change == null ? (
          <span className="text-xs text-foreground-muted">
            Ingen sammenligning tilgjengelig
          </span>
        ) : (
          <>
            {isUp ? (
              <TrendingUp
                size={14}
                className={favourable ? "text-success" : "text-danger"}
              />
            ) : isDown ? (
              <TrendingDown
                size={14}
                className={favourable ? "text-success" : "text-danger"}
              />
            ) : (
              <Minus size={14} className="text-foreground-muted" />
            )}
            <span
              className={`text-sm font-medium ${
                isUp || isDown
                  ? favourable
                    ? "text-success"
                    : "text-danger"
                  : "text-foreground-muted"
              }`}
            >
              {formatChange(change)}
            </span>
            <span className="text-xs text-foreground-muted">vs. i fjor</span>
          </>
        )}
      </div>
    </div>
  );
}
