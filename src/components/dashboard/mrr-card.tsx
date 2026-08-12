"use client";

import Link from "next/link";
import { Repeat, TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import { formatCurrency } from "@/lib/format";

export interface MrrMonth {
  month: string;
  recurring: number;
  normalised: number;
  one_off: number;
  total: number;
  is_complete: boolean;
}

export interface MrrData {
  has_data: boolean;
  mrr: {
    month: string;
    value: number;
    billed_value: number;
    based_on_product_list: boolean;
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

const LONG_MONTHS = [
  "januar", "februar", "mars", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "desember",
];

function longMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${LONG_MONTHS[m - 1]} ${y}`;
}

/**
 * Recurring revenue is the figure this kind of business is run on, so it sits
 * at the top of the dashboard rather than inside a report — but as one band,
 * not a panel. The headline is the last complete month: a part-month at the
 * end of an export would read as a collapse, so it is drawn in the trend,
 * marked, and never used as the run rate.
 */
export function MrrCard({ data }: { data: MrrData }) {
  if (!data.has_data || !data.mrr) return null;

  const { mrr, months } = data;
  const up = (mrr.change_percent ?? 0) > 0.5;
  const down = (mrr.change_percent ?? 0) < -0.5;
  const TrendIcon = up ? TrendingUp : down ? TrendingDown : Minus;
  const trendClass = up
    ? "text-success"
    : down
      ? "text-danger"
      : "text-foreground-muted";

  const max = Math.max(...months.map((m) => m.normalised), 1);

  const basis = [
    mrr.based_on_product_list
      ? "Basert på produktlisten din."
      : "Utledet fra posteringstekst — last opp produktlisten for et sikrere tall.",
    "Kvartals- og årskontrakter er fordelt ned på måned.",
    mrr.billed_value !== mrr.value
      ? `Fakturert i måneden: ${formatCurrency(mrr.billed_value)}.`
      : "",
    "Kontrakter som ikke er fakturert innenfor perioden i filen er ikke med.",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-center gap-x-10 gap-y-5">
        <div className="min-w-[13rem]">
          <div className="flex items-center gap-1.5">
            <Repeat size={14} className="text-accent" />
            <span className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
              Gjentakende inntekter
            </span>
            <span
              title={basis}
              className="cursor-help text-foreground-muted"
              aria-label={basis}
            >
              <Info size={13} />
            </span>
          </div>

          <div className="mt-1.5 flex items-baseline gap-2.5">
            <span className="text-3xl font-bold tracking-tight text-foreground">
              {formatCurrency(mrr.value)}
            </span>
            {mrr.change_percent != null && (
              <span className={`inline-flex items-center gap-0.5 text-sm font-medium ${trendClass}`}>
                <TrendIcon size={14} />
                {mrr.change_percent > 0 ? "+" : ""}
                {mrr.change_percent.toLocaleString("nb-NO", {
                  maximumFractionDigits: 1,
                })}
                &nbsp;%
              </span>
            )}
          </div>

          <p className="mt-1 text-xs text-foreground-muted">
            MRR i {longMonth(mrr.month)} — siste fullstendige måned
          </p>
        </div>

        <Stat label="Årlig takt (ARR)" value={formatCurrency(mrr.arr)} />
        <Stat label="Snitt siste 3 mnd" value={formatCurrency(mrr.average_3m)} />
        <Stat
          label="Andel av omsetningen"
          value={`${mrr.recurring_share} %`}
        />

        {months.length > 1 && (
          <div className="ml-auto flex items-end gap-1" aria-hidden>
            {months.slice(-12).map((m) => (
              <div
                key={m.month}
                className="flex w-4 flex-col items-center gap-1"
                title={`${longMonth(m.month)}: ${formatCurrency(m.normalised)}${
                  m.is_complete ? "" : " (ufullstendig måned)"
                }`}
              >
                <div className="flex h-10 w-full items-end">
                  <div
                    className={`w-full rounded-sm ${
                      m.is_complete
                        ? "bg-accent"
                        : // A part-month is drawn, but visibly not comparable.
                          "bg-accent/25 outline outline-1 outline-dashed outline-accent/50"
                    }`}
                    style={{
                      height: `${Math.max(6, (m.normalised / max) * 100)}%`,
                    }}
                  />
                </div>
                <span className="text-[9px] text-foreground-muted">
                  {MONTHS[Number(m.month.split("-")[1]) - 1]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Link
        href="/okonomi"
        className="mt-4 inline-flex text-xs font-medium text-primary hover:text-primary-light"
      >
        Se hva som gjentar seg →
      </Link>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-foreground-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}
