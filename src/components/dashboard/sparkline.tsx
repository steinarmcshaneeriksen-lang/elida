"use client";

import { useId } from "react";

/**
 * The shape of a figure over the period, with the same period a year earlier
 * behind it.
 *
 * The comparison line is not decoration, and leaving it out was a real fault.
 * A single line drawn from this period alone shows the shape *within* the
 * period, while the chip beside it states the change *against last year* —
 * two different measurements, side by side, with nothing saying so. On this
 * ledger the revenue line rose from January to July while the chip read
 * "−18,2 %", and it looked as though the card contradicted itself or the
 * figures were invented. Both were true: the months rose, and every one of
 * them sat below the same month last year.
 *
 * With last year drawn behind, the gap between the lines *is* the change the
 * chip states, and the two agree by construction.
 *
 * Still deliberately unlabelled and unmeasured: it says "below last year, and
 * rising", not by how much. The figure and the chip carry the quantities.
 *
 * The two lines are told apart by weight and dash as well as colour — this
 * year solid in the tone, last year thin and dashed in a muted grey — so the
 * distinction survives any form of colour blindness.
 */
export function Sparkline({
  values,
  comparison,
  tone = "ocean",
  width = 104,
  height = 40,
}: {
  values: number[];
  /** The same months a year earlier, aligned index for index. */
  comparison?: (number | null)[];
  tone?: string;
  width?: number;
  height?: number;
}) {
  const gradientId = useId();

  // Two points is the minimum that can describe a direction.
  if (values.length < 2) return null;

  // A comparison is only drawn when it covers the same months; a partial one
  // would make the gap between the lines mean nothing.
  const previous =
    comparison && comparison.length === values.length && comparison.every((v) => v != null)
      ? (comparison as number[])
      : null;

  // One scale for both lines, or the gap between them would be meaningless.
  const all = previous ? [...values, ...previous] : values;
  const min = Math.min(...all, 0);
  const max = Math.max(...all, 0);
  const span = max - min || 1;

  // Inset so the stroke and the end dot are not clipped by the viewbox.
  const pad = 3;
  const x = (i: number) => (i / (values.length - 1)) * (width - pad * 2) + pad;
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);

  const path = (series: number[]) =>
    series.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");

  const line = path(values);
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

      {previous && (
        <path
          d={path(previous)}
          fill="none"
          stroke="var(--foreground-muted)"
          strokeWidth="1.25"
          strokeDasharray="3 2.5"
          strokeLinecap="round"
          strokeOpacity="0.75"
        />
      )}

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
