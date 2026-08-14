"use client";

import Link from "next/link";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Sparkline } from "./sparkline";
import type { Tone } from "./metric-card";

export interface KpiCardProps {
  label: string;
  value: string;
  /** The movement against the same period last year, where one exists. */
  change: {
    percent: number;
    /** A margin moves in percentage points, not in percent. */
    unit?: "percent" | "points";
    /** Rising costs are a worse result, so the colour follows the outcome. */
    invert?: boolean;
    label: string;
  } | null;
  /** Said in words when there is no comparison to make. */
  note?: string;
  /** The shape of the figure over the period. */
  series?: number[];
  tone?: Tone;
  href?: string;
}

/**
 * One headline figure: label, amount, movement, and the shape behind it.
 *
 * The four of these across the top are the first thing anyone reads, so the
 * amount is the largest thing on the card and everything else defers to it.
 * The line is decoration only in the sense that removing it loses nothing
 * quantitative — it adds the path between the two numbers already stated.
 */
export function KpiCard({
  label,
  value,
  change,
  note,
  series,
  tone = "ocean",
  href,
}: KpiCardProps) {
  const moved = change != null && Math.abs(change.percent) > 0.05;
  const up = (change?.percent ?? 0) > 0;
  // Colour follows whether the movement is good, not which way it points.
  const favourable = change?.invert ? !up : up;
  const chip = !moved ? "flat" : favourable ? "up" : "down";
  const ChangeIcon = !moved ? Minus : up ? TrendingUp : TrendingDown;

  const body = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground-secondary">
            {label}
          </p>
          <p className="mt-1.5 text-[28px] font-bold leading-none tracking-tight tabular-nums text-foreground">
            {value}
          </p>
        </div>
        {series && series.length > 1 && (
          <Sparkline values={series} tone={tone} />
        )}
      </div>

      <div className="mt-3 flex h-6 items-center gap-2">
        {change ? (
          <>
            <span className={`chip chip--${chip}`}>
              <ChangeIcon size={13} strokeWidth={2.5} />
              {up && moved ? "+" : ""}
              {change.percent.toLocaleString("nb-NO", {
                maximumFractionDigits: 1,
              })}
              {change.unit === "points" ? " pp" : " %"}
            </span>
            <span className="truncate text-xs text-foreground-muted">
              {change.label}
            </span>
          </>
        ) : (
          <span className="truncate text-xs text-foreground-muted">{note}</span>
        )}
      </div>
    </>
  );

  const className = "tone-card block p-5";

  if (!href) {
    return (
      <div data-tone={tone} className={className}>
        {body}
      </div>
    );
  }

  return (
    <Link data-tone={tone} href={href} className={className}>
      {body}
    </Link>
  );
}
