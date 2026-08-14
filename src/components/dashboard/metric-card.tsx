"use client";

import Link from "next/link";
import { ArrowRight, TrendingUp, TrendingDown, Minus, type LucideIcon } from "lucide-react";

export type Tone = "ocean" | "teal" | "violet" | "copper" | "rose" | "slate";

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
  tone?: Tone;
  icon?: LucideIcon;
}

const directionIcon = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
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
 *
 * Each card takes a tone. Four identical white boxes with navy text made a
 * dashboard that was uniform to the point of being hard to read; the hue is
 * what lets someone find the card they want without reading all four.
 */
export function MetricCard({
  question,
  label,
  value,
  comparison,
  detail,
  href,
  tone = "slate",
  icon: Icon,
}: MetricCardProps) {
  const DirIcon = directionIcon[comparison.direction];

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{question}</p>
          <p className="mt-0.5 text-xs text-foreground-muted">{label}</p>
        </div>
        {Icon && (
          <span className="tone-badge shrink-0">
            <Icon size={16} strokeWidth={2.2} />
          </span>
        )}
      </div>

      <p className="mt-4 text-2xl font-bold tracking-tight text-foreground tabular-nums">
        {value}
      </p>

      <div className="mt-2.5 flex h-6 items-center gap-2">
        {comparison.percent !== 0 && (
          <span className={`chip chip--${comparison.direction}`}>
            <DirIcon size={13} strokeWidth={2.5} />
            {comparison.direction === "up" ? "+" : ""}
            {comparison.percent.toLocaleString("nb-NO", {
              maximumFractionDigits: 1,
            })}
            &nbsp;%
          </span>
        )}
        <span className="truncate text-xs text-foreground-muted">
          {comparison.label}
        </span>
      </div>

      <div className="mt-auto flex items-end justify-between gap-2 pt-4">
        <p className="text-xs leading-relaxed text-foreground-secondary">
          {detail ?? ""}
        </p>
        {href && (
          <ArrowRight
            size={15}
            className="mb-0.5 shrink-0 text-[var(--tone)] opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
          />
        )}
      </div>
    </>
  );

  const className = "tone-card group flex h-full flex-col p-5 text-left";

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
