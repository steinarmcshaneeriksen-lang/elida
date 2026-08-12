"use client";

import Link from "next/link";
import { TrendingUp, TrendingDown, Minus, ArrowRight } from "lucide-react";

interface MetricCardProps {
  question: string;
  label: string;
  value: string;
  comparison: {
    percent: number;
    direction: "up" | "down" | "flat";
    label: string;
  };
  detail?: string;
  href?: string;
}

const directionConfig = {
  up: { icon: TrendingUp, className: "text-success" },
  down: { icon: TrendingDown, className: "text-danger" },
  flat: { icon: Minus, className: "text-foreground-muted" },
};

/**
 * One figure with the question it answers.
 *
 * Every row is a fixed slot — question, value, trend, note — so cards next to
 * each other line up whether or not they have a note or a comparison. Cards
 * used to carry a "Lav sikkerhet" badge derived from how long ago the last
 * sync ran; on file-imported data that was red on every card regardless of
 * what the figures were worth, which said nothing. Where the numbers come from
 * is stated once above the grid instead.
 */
export function MetricCard({
  question,
  label,
  value,
  comparison,
  detail,
  href,
}: MetricCardProps) {
  const dir = directionConfig[comparison.direction];
  const DirIcon = dir.icon;

  const body = (
    <>
      <p className="text-sm font-semibold text-foreground">{question}</p>
      <p className="mt-0.5 text-xs text-foreground-muted">{label}</p>

      <p className="mt-4 text-2xl font-bold tracking-tight text-foreground">
        {value}
      </p>

      <div className="mt-2 flex h-5 items-center gap-1.5">
        {comparison.percent !== 0 ? (
          <>
            <DirIcon size={15} className={dir.className} />
            <span className={`text-sm font-medium ${dir.className}`}>
              {comparison.direction === "up" ? "+" : ""}
              {comparison.percent.toLocaleString("nb-NO", {
                maximumFractionDigits: 1,
              })}
              &nbsp;%
            </span>
            <span className="truncate text-xs text-foreground-muted">
              {comparison.label}
            </span>
          </>
        ) : (
          <span className="truncate text-xs text-foreground-muted">
            {comparison.label}
          </span>
        )}
      </div>

      <div className="mt-auto flex items-end justify-between gap-2 pt-4">
        <p className="text-xs leading-relaxed text-foreground-secondary">
          {detail ?? ""}
        </p>
        {href && (
          <ArrowRight
            size={15}
            className="mb-0.5 shrink-0 text-foreground-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
          />
        )}
      </div>
    </>
  );

  const className =
    "group flex h-full flex-col rounded-xl border border-border bg-surface p-5 text-left shadow-[var(--shadow)]";

  if (!href) return <div className={className}>{body}</div>;

  return (
    <Link href={href} className={`${className} hover:shadow-[var(--shadow-md)]`}>
      {body}
    </Link>
  );
}
