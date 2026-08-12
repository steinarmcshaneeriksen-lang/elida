/**
 * Report charts.
 *
 * Plain SVG, no library. A chart in a report has one job — make a movement
 * legible — so these are drawn thin, in one or two colours, without gridline
 * clutter, legends that repeat the axis, or fills that carry no information.
 * SVG also survives the print path intact, which a canvas chart does not.
 *
 * Every component takes figures already computed by the report engine.
 */

const INK = "var(--report-ink)";
const MUTED = "var(--report-muted)";
const RULE = "var(--report-rule)";
const POSITIVE = "var(--report-positive)";
const NEGATIVE = "var(--report-negative)";
const ACCENT = "var(--report-accent)";

const MONTHS = [
  "jan", "feb", "mar", "apr", "mai", "jun",
  "jul", "aug", "sep", "okt", "nov", "des",
];

function monthLabel(iso: string): string {
  const [, m] = iso.split("-").map(Number);
  return MONTHS[m - 1] ?? iso;
}

function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toLocaleString("nb-NO", { maximumFractionDigits: 1 })}m`;
  if (abs >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
}

// ---------------------------------------------------------------------------
// Revenue and profit over time
// ---------------------------------------------------------------------------

export interface MonthPoint {
  month: string;
  revenue: number;
  operating_profit: number;
  is_complete: boolean;
}

/**
 * Revenue as columns with profit as a line over it. Two series of very
 * different magnitude on one axis would flatten the smaller one, so profit is
 * drawn against its own scale and labelled, rather than forced onto one axis.
 */
export function RevenueProfitChart({
  points,
  height = 180,
}: {
  points: MonthPoint[];
  height?: number;
}) {
  if (points.length === 0) return null;

  const width = 720;
  const padding = { top: 16, right: 8, bottom: 24, left: 8 };
  const plotH = height - padding.top - padding.bottom;
  const plotW = width - padding.left - padding.right;

  const maxRevenue = Math.max(...points.map((p) => p.revenue), 1);
  const profits = points.map((p) => p.operating_profit);
  const maxProfit = Math.max(...profits, 0);
  const minProfit = Math.min(...profits, 0);
  const profitRange = maxProfit - minProfit || 1;

  const slot = plotW / points.length;
  const barWidth = Math.min(slot * 0.5, 34);

  const profitY = (v: number) =>
    padding.top + plotH - ((v - minProfit) / profitRange) * plotH;

  const line = points
    .map((p, i) => {
      const x = padding.left + slot * i + slot / 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${profitY(p.operating_profit).toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label="Omsetning og driftsresultat per måned"
    >
      <line
        x1={padding.left}
        x2={width - padding.right}
        y1={padding.top + plotH}
        y2={padding.top + plotH}
        stroke={RULE}
        strokeWidth="1"
      />

      {points.map((p, i) => {
        const x = padding.left + slot * i + (slot - barWidth) / 2;
        const h = (p.revenue / maxRevenue) * plotH;
        return (
          <g key={p.month}>
            <rect
              x={x}
              y={padding.top + plotH - h}
              width={barWidth}
              height={Math.max(h, 0)}
              fill={ACCENT}
              opacity={p.is_complete ? 0.18 : 0.08}
            />
            <text
              x={x + barWidth / 2}
              y={height - 8}
              textAnchor="middle"
              fontSize="10"
              fill={MUTED}
            >
              {monthLabel(p.month)}
            </text>
          </g>
        );
      })}

      <path d={line} fill="none" stroke={INK} strokeWidth="1.5" />

      {points.map((p, i) => (
        <circle
          key={p.month}
          cx={padding.left + slot * i + slot / 2}
          cy={profitY(p.operating_profit)}
          r="2.5"
          fill={INK}
        />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Waterfall
// ---------------------------------------------------------------------------

export interface WaterfallStep {
  label: string;
  amount: number;
  kind: "start" | "change" | "end";
}

/**
 * Explains a change as a sequence of contributions. The anchored bars sit on
 * the baseline; each change floats from where the previous one left off, which
 * is what makes a bridge readable at a glance.
 */
export function WaterfallChart({
  steps,
  height = 260,
}: {
  steps: WaterfallStep[];
  height?: number;
}) {
  if (steps.length < 2) return null;

  const width = 720;
  const padding = { top: 20, right: 8, bottom: 62, left: 8 };
  const plotH = height - padding.top - padding.bottom;
  const plotW = width - padding.left - padding.right;

  // Walk the steps once to find where each bar starts and ends.
  const bars: Array<{ from: number; to: number; step: WaterfallStep }> = [];
  let running = 0;
  for (const step of steps) {
    if (step.kind === "start") {
      running = step.amount;
      bars.push({ from: 0, to: step.amount, step });
    } else if (step.kind === "end") {
      bars.push({ from: 0, to: step.amount, step });
    } else {
      bars.push({ from: running, to: running + step.amount, step });
      running += step.amount;
    }
  }

  const values = bars.flatMap((b) => [b.from, b.to]);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const y = (v: number) => padding.top + plotH - ((v - min) / range) * plotH;

  const slot = plotW / bars.length;
  const barWidth = Math.min(slot * 0.62, 56);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label="Endringsforklaring"
    >
      <line
        x1={padding.left}
        x2={width - padding.right}
        y1={y(0)}
        y2={y(0)}
        stroke={RULE}
        strokeWidth="1"
      />

      {bars.map((bar, i) => {
        const x = padding.left + slot * i + (slot - barWidth) / 2;
        const top = Math.min(y(bar.from), y(bar.to));
        const h = Math.max(Math.abs(y(bar.to) - y(bar.from)), 1.5);
        const anchored = bar.step.kind !== "change";
        const rising = bar.to >= bar.from;

        return (
          <g key={`${bar.step.label}-${i}`}>
            {i > 0 && (
              <line
                x1={padding.left + slot * (i - 1) + (slot + barWidth) / 2}
                x2={x}
                y1={y(bars[i - 1].to)}
                y2={y(bars[i - 1].to)}
                stroke={RULE}
                strokeWidth="1"
                strokeDasharray="2 2"
              />
            )}
            <rect
              x={x}
              y={top}
              width={barWidth}
              height={h}
              fill={anchored ? INK : rising ? POSITIVE : NEGATIVE}
              opacity={anchored ? 0.85 : 0.75}
            />
            <text
              x={x + barWidth / 2}
              y={top - 5}
              textAnchor="middle"
              fontSize="10"
              fill={MUTED}
            >
              {anchored ? compact(bar.to) : `${bar.step.amount > 0 ? "+" : ""}${compact(bar.step.amount)}`}
            </text>
            <text
              x={x + barWidth / 2}
              y={padding.top + plotH + 18}
              textAnchor="middle"
              fontSize="9.5"
              fill={MUTED}
            >
              {wrap(bar.step.label).map((line, j) => (
                <tspan key={j} x={x + barWidth / 2} dy={j === 0 ? 0 : 11}>
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Two short lines read better under a narrow bar than one long one. */
function wrap(label: string, max = 16): string[] {
  const words = label.split(" ");
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    if ((line + " " + word).trim().length > max && line) {
      lines.push(line.trim());
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line) lines.push(line);

  return lines.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Cash over time
// ---------------------------------------------------------------------------

export function CashChart({
  points,
  markers = [],
  height = 190,
}: {
  points: Array<{ month: string; balance: number }>;
  markers?: Array<{ month: string; label: string }>;
  height?: number;
}) {
  if (points.length === 0) return null;

  const width = 720;
  const padding = { top: 18, right: 8, bottom: 34, left: 8 };
  const plotH = height - padding.top - padding.bottom;
  const plotW = width - padding.left - padding.right;

  const values = points.map((p) => p.balance);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const x = (i: number) =>
    padding.left + (points.length === 1 ? plotW / 2 : (plotW / (points.length - 1)) * i);
  const y = (v: number) => padding.top + plotH - ((v - min) / range) * plotH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;

  const lowest = points.reduce((low, p) => (p.balance < low.balance ? p : low), points[0]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label="Bankbeholdning over tid"
    >
      <path d={area} fill={ACCENT} opacity="0.10" />
      <line x1={padding.left} x2={width - padding.right} y1={y(0)} y2={y(0)} stroke={RULE} />
      <path d={line} fill="none" stroke={INK} strokeWidth="1.5" />

      {points.map((p, i) => (
        <g key={p.month}>
          <circle
            cx={x(i)}
            cy={y(p.balance)}
            r={p.month === lowest.month ? 3.5 : 2}
            fill={p.month === lowest.month ? NEGATIVE : INK}
          />
          <text x={x(i)} y={height - 8} textAnchor="middle" fontSize="10" fill={MUTED}>
            {monthLabel(p.month)}
          </text>
        </g>
      ))}

      {markers.map((marker) => {
        const i = points.findIndex((p) => p.month === marker.month);
        if (i < 0) return null;
        return (
          <g key={`${marker.month}-${marker.label}`}>
            <line
              x1={x(i)}
              x2={x(i)}
              y1={padding.top}
              y2={padding.top + plotH}
              stroke={MUTED}
              strokeWidth="1"
              strokeDasharray="2 3"
            />
            <text x={x(i)} y={padding.top - 5} textAnchor="middle" fontSize="9" fill={MUTED}>
              {marker.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Horizontal bars — shares and rankings
// ---------------------------------------------------------------------------

export function RankedBars({
  rows,
  valueFormatter,
}: {
  rows: Array<{ label: string; value: number; note?: string | null }>;
  valueFormatter: (n: number) => string;
}) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3">
          <span className="w-[38%] shrink-0 truncate text-[13px]" style={{ color: INK }}>
            {row.label}
          </span>
          <div className="relative h-3 flex-1">
            <div
              className="absolute inset-y-0 left-0 rounded-[1px]"
              style={{
                width: `${(Math.abs(row.value) / max) * 100}%`,
                background: row.value < 0 ? NEGATIVE : ACCENT,
                opacity: 0.35,
              }}
            />
          </div>
          <span
            className="w-28 shrink-0 text-right text-[13px] tabular-nums"
            style={{ color: INK }}
          >
            {valueFormatter(row.value)}
          </span>
          {row.note != null && (
            <span className="w-12 shrink-0 text-right text-[12px] tabular-nums" style={{ color: MUTED }}>
              {row.note}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sparkline
// ---------------------------------------------------------------------------

export function Sparkline({
  values,
  width = 96,
  height = 24,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const path = values
    .map((v, i) => {
      const x = (width / (values.length - 1)) * i;
      const y = height - ((v - min) / range) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden>
      <path d={path} fill="none" stroke={INK} strokeWidth="1.25" opacity="0.7" />
    </svg>
  );
}
