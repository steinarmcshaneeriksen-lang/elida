"use client";

import { formatCurrency, formatDateShort } from "@/lib/format";
import { useCompanyData } from "@/lib/hooks/use-company-data";
import {
  NoDataState,
  LoadingState,
  ErrorState,
} from "@/components/dashboard/empty-state";
import {
  Droplets,
  ArrowDownRight,
  ArrowUpRight,
  AlertTriangle,
  ShieldCheck,
  Receipt,
} from "lucide-react";

type Confidence = "high" | "medium" | "low";

interface FlowItem {
  date: string | null;
  amount: number;
  description: string | null;
  confidence: string | null;
}

interface CashflowResponse {
  has_data?: boolean;
  starting_cash: number | null;
  daily_forecast: Array<{
    date: string | null;
    balance: number;
    confidence: string | null;
  }>;
  inflows: FlowItem[];
  outflows: FlowItem[];
}

interface VatResponse {
  has_data?: boolean;
  output_vat: number | null;
  input_vat: number | null;
  estimated_settlement: number | null;
  period: string | null;
  due_date: string | null;
}

/** Maps the API's confidence strings onto the three bands the dot renders. */
function toConfidence(value: string | null): Confidence {
  if (value === "confirmed" || value === "high_confidence") return "high";
  if (value === "low_confidence" || value === "rough_estimate") return "low";
  return "medium";
}

export default function LikviditetPage() {
  const cashflow = useCompanyData<CashflowResponse>("cashflow?horizon_days=60");
  const vat = useCompanyData<VatResponse>("vat-estimate");

  if (cashflow.isLoading) return <LoadingState />;
  if (cashflow.error) return <ErrorState message={cashflow.error} />;
  if (cashflow.isEmpty || !cashflow.data) {
    return (
      <NoDataState
        title="Ingen likviditetsdata ennå"
        description="Importer en SAF-T-fil fra regnskapssystemet ditt, så beregner Elida likviditet, forventede inn- og utbetalinger og MVA-estimat."
      />
    );
  }

  const data = cashflow.data;
  const inflows = data.inflows ?? [];
  const outflows = data.outflows ?? [];
  const forecast = data.daily_forecast ?? [];

  const totalInflows = inflows.reduce((s, i) => s + i.amount, 0);
  const totalOutflows = outflows.reduce((s, o) => s + o.amount, 0);

  const lowestPoint =
    forecast.length > 0
      ? forecast.reduce((min, d) => (d.balance < min.balance ? d : min))
      : null;
  const bufferOk = (lowestPoint?.balance ?? 0) > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow)]">
          <div className="flex items-center gap-2 text-foreground-muted">
            <Droplets size={16} />
            <span className="text-sm">Bokført likviditet</span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {formatCurrency(data.starting_cash ?? 0)}
          </p>
          <p className="mt-1 text-xs text-foreground-muted">
            Bokført saldo, ikke live banksaldo
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow)]">
          <div className="flex items-center gap-2 text-foreground-muted">
            <ArrowUpRight size={16} className="text-success" />
            <span className="text-sm">Forventede innbetalinger</span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-success">
            {formatCurrency(totalInflows)}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow)]">
          <div className="flex items-center gap-2 text-foreground-muted">
            <ArrowDownRight size={16} className="text-danger" />
            <span className="text-sm">Forventede utbetalinger</span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-danger">
            {formatCurrency(Math.abs(totalOutflows))}
          </p>
        </div>

        {lowestPoint && (
          <div
            className={`rounded-xl border border-border p-5 shadow-[var(--shadow)] ${
              bufferOk ? "bg-success-light" : "bg-danger-light"
            }`}
          >
            <div className="flex items-center gap-2 text-foreground-muted">
              {bufferOk ? (
                <ShieldCheck size={16} className="text-success" />
              ) : (
                <AlertTriangle size={16} className="text-danger" />
              )}
              <span className="text-sm">Laveste punkt (60 dager)</span>
            </div>
            <p
              className={`mt-2 text-2xl font-bold tracking-tight ${
                bufferOk ? "text-success" : "text-danger"
              }`}
            >
              {formatCurrency(lowestPoint.balance)}
            </p>
            {lowestPoint.date && (
              <p className="mt-1 text-xs text-foreground-secondary">
                {formatDateShort(lowestPoint.date)}
              </p>
            )}
          </div>
        )}
      </div>

      {forecast.length > 0 && (
        <section className="rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow)]">
          <h3 className="mb-4 text-lg font-semibold text-foreground">
            Likviditetsprognose
          </h3>
          <ForecastChart points={forecast} />
          <p className="mt-3 text-xs text-foreground-muted">
            Prognosen er et estimat basert på kjente fordringer og
            forpliktelser. Den er ikke en bekreftet saldo.
          </p>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <FlowSection
          title="Forventede innbetalinger"
          icon={<ArrowUpRight size={18} className="text-success" />}
          items={inflows}
          total={totalInflows}
          tone="success"
        />
        <FlowSection
          title="Forventede utbetalinger"
          icon={<ArrowDownRight size={18} className="text-danger" />}
          items={outflows}
          total={Math.abs(totalOutflows)}
          tone="danger"
        />
      </div>

      {!vat.isEmpty && vat.data && (
        <section className="rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow)]">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <Receipt size={18} className="text-foreground-muted" />
            Merverdiavgift
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-surface-hover p-4">
              <p className="text-xs font-medium text-foreground-muted">
                Utgående MVA
              </p>
              <p className="mt-1 text-xl font-bold text-foreground">
                {formatCurrency(vat.data.output_vat ?? 0)}
              </p>
            </div>
            <div className="rounded-lg bg-surface-hover p-4">
              <p className="text-xs font-medium text-foreground-muted">
                Inngående MVA
              </p>
              <p className="mt-1 text-xl font-bold text-foreground">
                {formatCurrency(vat.data.input_vat ?? 0)}
              </p>
            </div>
            <div className="rounded-lg bg-surface-hover p-4">
              <p className="text-xs font-medium text-foreground-muted">
                Estimert oppgjør
                {vat.data.period ? ` — ${vat.data.period}` : ""}
              </p>
              <p className="mt-1 text-xl font-bold text-foreground">
                {formatCurrency(vat.data.estimated_settlement ?? 0)}
              </p>
              {vat.data.due_date && (
                <p className="mt-0.5 text-xs text-foreground-muted">
                  Forfaller {formatDateShort(vat.data.due_date)}
                </p>
              )}
            </div>
          </div>
          <p className="mt-3 text-xs text-foreground-muted">
            Estimat basert på bokførte MVA-koder. Avstem mot regnskapssystemet
            før innsending.
          </p>
        </section>
      )}
    </div>
  );
}

function ForecastChart({
  points,
}: {
  points: Array<{ date: string | null; balance: number }>;
}) {
  const balances = points.map((p) => p.balance);
  const max = Math.max(...balances, 0);
  const min = Math.min(...balances, 0);
  const range = max - min || 1;

  const width = 100;
  const height = 40;

  const coords = points.map((p, i) => {
    const x = (i / Math.max(1, points.length - 1)) * width;
    const y = height - ((p.balance - min) / range) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  // Baseline sits where balance crosses zero, so a dip below it is visible.
  const zeroY = height - ((0 - min) / range) * height;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-48 w-full"
        role="img"
        aria-label="Likviditetsprognose de neste 60 dagene"
      >
        <line
          x1="0"
          x2={width}
          y1={zeroY}
          y2={zeroY}
          stroke="var(--danger)"
          strokeWidth="0.3"
          strokeDasharray="1 1"
        />
        <polyline
          points={coords.join(" ")}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="0.8"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-foreground-muted">
        <span>{points[0]?.date ? formatDateShort(points[0].date) : ""}</span>
        <span>
          {points[points.length - 1]?.date
            ? formatDateShort(points[points.length - 1].date!)
            : ""}
        </span>
      </div>
    </div>
  );
}

function FlowSection({
  title,
  icon,
  items,
  total,
  tone,
}: {
  title: string;
  icon: React.ReactNode;
  items: FlowItem[];
  total: number;
  tone: "success" | "danger";
}) {
  const toneClass = tone === "success" ? "text-success" : "text-danger";

  return (
    <section className="rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow)]">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
        {icon}
        {title}
      </h3>

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-foreground-muted">
          Ingen registrert ennå.
        </p>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border border-border-light p-3 hover:bg-surface-hover"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.description ?? "—"}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2">
                    {item.date && (
                      <span className="text-xs text-foreground-muted">
                        {formatDateShort(item.date)}
                      </span>
                    )}
                    <ConfidenceDot confidence={toConfidence(item.confidence)} />
                  </div>
                </div>
                <span
                  className={`ml-4 text-sm font-semibold tabular-nums ${toneClass}`}
                >
                  {formatCurrency(Math.abs(item.amount))}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm font-semibold text-foreground">Totalt</span>
            <span className={`text-sm font-bold tabular-nums ${toneClass}`}>
              {formatCurrency(total)}
            </span>
          </div>
        </>
      )}
    </section>
  );
}

function ConfidenceDot({ confidence }: { confidence: Confidence }) {
  const colors = {
    high: "bg-success",
    medium: "bg-warning",
    low: "bg-danger",
  };
  const labels = {
    high: "Høy",
    medium: "Middels",
    low: "Lav",
  };
  return (
    <span className="flex items-center gap-1">
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${colors[confidence]}`}
      />
      <span className="text-xs text-foreground-muted">
        {labels[confidence]}
      </span>
    </span>
  );
}
