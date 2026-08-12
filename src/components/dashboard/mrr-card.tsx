"use client";

import Link from "next/link";
import { Repeat, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatCurrency } from "@/lib/format";

export interface MrrMonth {
  month: string;
  recurring: number;
  one_off: number;
  total: number;
  is_complete: boolean;
}

export interface MrrData {
  has_data: boolean;
  mrr: {
    month: string;
    value: number;
    previous_value: number | null;
    change_percent: number | null;
    arr: number;
    average_3m: number;
    recurring_share: number;
  } | null;
  months: MrrMonth[];
}

const MONTHS = [
  "jan", "feb", "mar", "apr", "mai", "jun",
  "jul", "aug", "sep", "okt", "nov", "des",
];

function monthLabel(iso: string): string {
  const [, m] = iso.split("-").map(Number);
  return MONTHS[m - 1] ?? iso;
}

function longMonth(iso: string): string {
  const full = [
    "januar", "februar", "mars", "april", "mai", "juni",
    "juli", "august", "september", "oktober", "november", "desember",
  ];
  const [y, m] = iso.split("-").map(Number);
  return `${full[m - 1]} ${y}`;
}

/**
 * Recurring revenue is the figure this kind of business is run on, so it sits
 * at the top of the dashboard rather than inside a report.
 *
 * The headline is the last complete month. A part-month at the end of an
 * export would read as a collapse, so it is drawn in the trend but marked and
 * never used as the run rate.
 */
export function MrrCard({ data }: { data: MrrData }) {
  if (!data.has_data || !data.mrr) return null;

  const { mrr, months } = data;
  const up = (mrr.change_percent ?? 0) > 0.5;
  const down = (mrr.change_percent ?? 0) < -0.5;

  const max = Math.max(...months.map((m) => m.recurring), 1);

  return (
    <section className="rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Repeat size={16} className="text-accent" />
            <h3 className="text-sm font-medium text-foreground-secondary">
              Gjentakende inntekter (MRR)
            </h3>
          </div>

          <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">
            {formatCurrency(mrr.value)}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            {mrr.change_percent != null && (
              <span className="inline-flex items-center gap-1">
                {up ? (
                  <TrendingUp size={14} className="text-success" />
                ) : down ? (
                  <TrendingDown size={14} className="text-danger" />
                ) : (
                  <Minus size={14} className="text-foreground-muted" />
                )}
                <span
                  className={`text-sm font-medium ${
                    up
                      ? "text-success"
                      : down
                        ? "text-danger"
                        : "text-foreground-muted"
                  }`}
                >
                  {mrr.change_percent > 0 ? "+" : ""}
                  {mrr.change_percent.toLocaleString("nb-NO", {
                    maximumFractionDigits: 1,
                  })}{" "}
                  %
                </span>
                <span className="text-xs text-foreground-muted">
                  vs. forrige måned
                </span>
              </span>
            )}
          </div>

          <p className="mt-1 text-xs text-foreground-muted">
            {longMonth(mrr.month)} — siste fullstendige måned.{" "}
            {mrr.recurring_share} % av omsetningen den måneden.
          </p>
        </div>

        <div className="flex gap-6">
          <div>
            <p className="text-xs text-foreground-muted">Årlig takt (ARR)</p>
            <p className="mt-0.5 text-lg font-semibold text-foreground">
              {formatCurrency(mrr.arr)}
            </p>
          </div>
          <div>
            <p className="text-xs text-foreground-muted">Snitt siste 3 mnd</p>
            <p className="mt-0.5 text-lg font-semibold text-foreground">
              {formatCurrency(mrr.average_3m)}
            </p>
          </div>
        </div>
      </div>

      {months.length > 1 && (
        <div className="mt-6">
          <div className="flex h-24 items-end gap-1.5">
            {months.map((m) => (
              <div
                key={m.month}
                className="group flex flex-1 flex-col items-center gap-1"
                title={`${longMonth(m.month)}: ${formatCurrency(m.recurring)}${
                  m.is_complete ? "" : " (ufullstendig måned)"
                }`}
              >
                <div
                  className={`w-full rounded-t ${
                    m.is_complete
                      ? "bg-accent"
                      : // A part-month is drawn, but visibly not comparable.
                        "bg-accent/30 outline outline-1 outline-dashed outline-accent/50"
                  }`}
                  style={{
                    height: `${Math.max(4, (m.recurring / max) * 100)}%`,
                  }}
                />
                <span className="text-[10px] text-foreground-muted">
                  {monthLabel(m.month)}
                </span>
              </div>
            ))}
          </div>

          {months.some((m) => !m.is_complete) && (
            <p className="mt-2 text-xs text-foreground-muted">
              Stiplet søyle er en måned regnskapet ikke dekker fullt ut, og
              teller ikke med i MRR.
            </p>
          )}
        </div>
      )}

      <Link
        href="/okonomi"
        className="mt-4 inline-block text-sm text-primary hover:text-primary-light"
      >
        Se hva som gjentar seg →
      </Link>
    </section>
  );
}
