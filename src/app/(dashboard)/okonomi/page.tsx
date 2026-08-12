"use client";

import { useState } from "react";
import { formatCurrency, formatChange, formatPercent } from "@/lib/format";
import { monthlyFinancials, costCategories } from "@/lib/mock-data";
import { BarChart3, TrendingUp, TrendingDown } from "lucide-react";

type Period = "month" | "quarter" | "ytd" | "rolling12";
type ComparisonType = "prevPeriod" | "sameLastYear";

const periodLabels: Record<Period, string> = {
  month: "Måned",
  quarter: "Kvartal",
  ytd: "Hittil i år",
  rolling12: "Siste 12 mnd",
};

const comparisonLabels: Record<ComparisonType, string> = {
  prevPeriod: "Forrige periode",
  sameLastYear: "Samme periode i fjor",
};

export default function OkonomiPage() {
  const [period, setPeriod] = useState<Period>("ytd");
  const [comparison, setComparison] = useState<ComparisonType>("sameLastYear");

  const totalRevenue = monthlyFinancials.reduce((s, m) => s + m.revenue, 0);
  const totalCosts = monthlyFinancials.reduce((s, m) => s + m.costs, 0);
  const totalProfit = monthlyFinancials.reduce((s, m) => s + m.profit, 0);
  const margin = (totalProfit / totalRevenue) * 100;

  const maxRevenue = Math.max(...monthlyFinancials.map((m) => m.revenue));

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Period selector */}
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

        {/* Comparison selector */}
        <div className="flex rounded-lg border border-border bg-surface p-1">
          {(Object.keys(comparisonLabels) as ComparisonType[]).map((c) => (
            <button
              key={c}
              onClick={() => setComparison(c)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                comparison === c
                  ? "bg-primary text-white"
                  : "text-foreground-secondary hover:bg-surface-hover"
              }`}
            >
              {comparisonLabels[c]}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Omsetning"
          value={formatCurrency(totalRevenue)}
          change={10.0}
          direction="up"
        />
        <SummaryCard
          label="Kostnader"
          value={formatCurrency(totalCosts)}
          change={7.2}
          direction="up"
        />
        <SummaryCard
          label="Driftsresultat"
          value={formatCurrency(totalProfit)}
          change={19.6}
          direction="up"
        />
        <SummaryCard
          label="Driftsmargin"
          value={formatPercent(margin)}
          change={1.4}
          direction="up"
          suffix="pp"
        />
      </div>

      {/* Revenue chart area */}
      <section className="rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow)]">
        <div className="mb-6 flex items-center gap-2">
          <BarChart3 size={18} className="text-foreground-muted" />
          <h3 className="text-lg font-semibold text-foreground">
            Omsetning per måned
          </h3>
        </div>
        <div className="space-y-3">
          {monthlyFinancials.map((m) => (
            <div key={m.month} className="flex items-center gap-4">
              <span className="w-10 text-sm font-medium text-foreground-secondary">
                {m.month}
              </span>
              <div className="flex-1">
                <div className="flex gap-1">
                  <div
                    className="h-8 rounded-l-md bg-primary"
                    style={{
                      width: `${(m.revenue / maxRevenue) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <span className="w-28 text-right text-sm tabular-nums font-medium text-foreground">
                {formatCurrency(m.revenue)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Cost breakdown */}
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
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums text-foreground">
                    {formatCurrency(cat.amount)}
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      cat.changeYoY > 10
                        ? "text-danger"
                        : cat.changeYoY > 0
                          ? "text-warning"
                          : "text-success"
                    }`}
                  >
                    {formatChange(cat.changeYoY)}
                  </span>
                </div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-hover">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${cat.percent}%` }}
                />
              </div>
              <p className="text-xs text-foreground-muted">
                {cat.percent.toFixed(1).replace(".", ",")} % av totale kostnader
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  change,
  direction,
  suffix,
}: {
  label: string;
  value: string;
  change: number;
  direction: "up" | "down";
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow)]">
      <p className="text-sm text-foreground-muted">{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight text-foreground">{value}</p>
      <div className="mt-2 flex items-center gap-1">
        {direction === "up" ? (
          <TrendingUp size={14} className="text-success" />
        ) : (
          <TrendingDown size={14} className="text-danger" />
        )}
        <span
          className={`text-sm font-medium ${
            direction === "up" ? "text-success" : "text-danger"
          }`}
        >
          +{change.toFixed(1).replace(".", ",")} {suffix || "%"}
        </span>
        <span className="text-xs text-foreground-muted">vs. i fjor</span>
      </div>
    </div>
  );
}
