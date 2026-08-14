"use client";

import { useId } from "react";

/**
 * The shape of a figure over the period, beside the figure itself.
 *
 * Deliberately unlabelled and unmeasured: it says "rising, then flat", not how
 * much. The number next to it carries the amount and the chip carries the
 * change, so the line only has to add the one thing neither of them can — the
 * path between them. Anything more would need axes, and then it is a chart and
 * belongs on its own page.
 *
 * Drawn as an SVG path rather than a chart library so it costs nothing and
 * scales to whatever width the card ends up at.
 */
export function Sparkline({
  values,
  tone = "ocean",
  width = 104,
  height = 40,
}: {
  values: number[];
  tone?: string;
  width?: number;
  height?: number;
}) {
  const gradientId = useId();

  // Two points is the minimum that can describe a direction.
  if (values.length < 2) return null;

  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = max - min || 1;

  // Inset so the stroke and the end dot are not clipped by the viewbox.
  const pad = 3;
  const x = (i: number) => (i / (values.length - 1)) * (width - pad * 2) + pad;
  const y = (v: number) =>
    height - pad - ((v - min) / span) * (height - pad * 2);

  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
  const area = `${line} L${x(values.length - 1)},${height} L${x(0)},${height} Z`;

  const last = values[values.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      // The figure and the chip beside it already state everything this shows.
      aria-hidden
      className="shrink-0 overflow-visible"
      data-tone={tone}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--tone)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--tone)" stopOpacity="0" />
        </linearGradient>
      </defs>

      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke="var(--tone)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={x(values.length - 1)}
        cy={y(last)}
        r="3"
        fill="var(--tone)"
        stroke="var(--surface)"
        strokeWidth="2"
      />
    </svg>
  );
}
