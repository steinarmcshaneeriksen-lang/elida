"use client";

import Link from "next/link";
import {
  TrendingUp,
  Coins,
  Percent,
  Wallet,
  Lightbulb,
  Gauge,
  Droplets,
  Upload,
  FileText,
  MessageCircleQuestion,
  Target,
} from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { InsightCard } from "@/components/dashboard/insight-card";
import { Panel } from "@/components/ui/panel";
import {
  NoDataState,
  LoadingState,
  ErrorState,
} from "@/components/dashboard/empty-state";
import { useUser } from "@/lib/hooks/use-user";
import { useCompanyData } from "@/lib/hooks/use-company-data";
import { MrrCard, type MrrData } from "@/components/dashboard/mrr-card";
import { formatCurrency, formatPercent } from "@/lib/format";

interface Metric {
  ytd: number;
  comparison_ytd: number | null;
  change_percent: number | null;
  has_comparison: boolean;
}

interface MonthFigures {
  revenue: number;
  profit: number;
  margin: number;
}

interface MonthRow extends MonthFigures {
  month: string;
  /** The same calendar month a year earlier, when that year is held. */
  previous: MonthFigures | null;
}

interface SummaryResponse {
  has_data?: boolean;
  period: {
    start: string;
    end: string;
    comparison_start: string | null;
    comparison_end: string | null;
    note: string | null;
  } | null;
  monthly?: MonthRow[];
  revenue: Metric | null;
  profit: Metric | null;
  cash: { current: number } | null;
  receivables: { total: number } | null;
  insights: Array<{
    id: string;
    severity: string;
    title: string;
    description: string;
    period: string | null;
    evidence: string[];
    created_at: string;
  }>;
}

interface CashflowResponse {
  has_data?: boolean;
  current_balance: number | null;
  lowest_point: { month: string; balance: number } | null;
  monthly: Array<{ month: string; movement: number; balance: number }>;
  receivables: { total: number };
  payables: { total: number };
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 10) return "God morgen";
  if (hour < 17) return "God dag";
  return "God kveld";
}

export default function DashboardPage() {
  const { company, profile } = useUser();
  const { data, isLoading, error, isEmpty } =
    useCompanyData<SummaryResponse>("summary");
  const mrr = useCompanyData<MrrData>("mrr");
  const cashflow = useCompanyData<CashflowResponse>("cashflow");

  const monthly = data?.monthly ?? [];
  const firstName = profile?.full_name?.split(" ")[0];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          {getGreeting()}
          {firstName ? `, ${firstName}` : ""}
        </h2>
        <p className="mt-1 text-sm text-foreground-secondary">
          Her er hva som skjer i {company?.name ?? "selskapet"}
          {data?.period ? ` — ${formatPeriod(data.period.start, data.period.end)}` : ""}.
          {/* The comparison is the same months a year earlier, so it needs the
              year, not the months repeated back. */}
          {data?.period?.comparison_start && data.period.comparison_end
            ? ` Tallene er sammenlignet med ${comparisonYear(data.period.comparison_end)}.`
            : ""}
          {/* A month exists in the books that the figures do not cover, so a
              reader who uploaded it does not conclude the import lost it.
              This was a banner explaining the reasoning behind the period —
              true, but nothing anyone could act on, and the period is stated
              in the same breath. */}
          {data?.period?.note ? ` ${data.period.note}` : ""}
        </p>
      </div>

      {isLoading && <LoadingState />}
      {!isLoading && error && <ErrorState message={error} />}
      {isEmpty && <NoDataState />}

      {!isLoading && !error && !isEmpty && data && (
        <>
          {/* The four headline figures. */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {data.revenue && (
              <KpiCard
                label="Omsetning"
                value={formatCurrency(data.revenue.ytd)}
                tone="ocean"
                href="/okonomi"
                series={monthly.map((m) => m.revenue)}
                comparisonSeries={monthly.map((m) => m.previous?.revenue ?? null)}
                change={
                  data.revenue.has_comparison && data.revenue.change_percent != null
                    ? {
                        percent: data.revenue.change_percent,
                        label: "vs. samme periode i fjor",
                      }
                    : null
                }
                note="Eks. mva · ingen sammenligning ennå"
              />
            )}
            {data.profit && (
              <KpiCard
                label="Driftsresultat"
                value={formatCurrency(data.profit.ytd)}
                tone="teal"
                href="/okonomi"
                series={monthly.map((m) => m.profit)}
                comparisonSeries={monthly.map((m) => m.previous?.profit ?? null)}
                change={
                  data.profit.has_comparison && data.profit.change_percent != null
                    ? {
                        percent: data.profit.change_percent,
                        label: "vs. samme periode i fjor",
                      }
                    : null
                }
                note="Eks. mva · ingen sammenligning ennå"
              />
            )}
            {data.revenue && data.profit && (
              <KpiCard
                label="Driftsmargin"
                value={formatPercent(margin(data.profit.ytd, data.revenue.ytd))}
                tone="violet"
                href="/okonomi"
                series={monthly.map((m) => m.margin)}
                comparisonSeries={monthly.map((m) => m.previous?.margin ?? null)}
                change={
                  marginChange(data) != null
                    ? {
                        percent: marginChange(data)!,
                        unit: "points",
                        label: "vs. samme periode i fjor",
                      }
                    : null
                }
                note="Ingen sammenligning ennå"
              />
            )}
            {data.cash && (
              <KpiCard
                label="Likviditet"
                value={formatCurrency(data.cash.current)}
                tone="copper"
                href="/likviditet"
                series={cashflow.data?.monthly?.map((m) => m.balance)}
                change={null}
                note="Bokført saldo ved periodens slutt"
              />
            )}
          </div>

          {mrr.data?.has_data && <MrrCard data={mrr.data} />}

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Two thirds: the observations, which is what the page is for. */}
            <div className="lg:col-span-2">
              <Panel
                tone="ocean"
                icon={Lightbulb}
                title="Dette bør du vite nå"
                description="Utledet av regnskapet ved siste import. Hver observasjon oppgir tallene den bygger på."
              >
                {data.insights.length === 0 ? (
                  <p className="py-8 text-center text-sm text-foreground-muted">
                    Ingenting krever oppmerksomhet akkurat nå. Elida varsler her
                    når noe endrer seg.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {data.insights.map((insight) => (
                      <InsightCard
                        key={insight.id}
                        severity={
                          insight.severity as "high" | "medium" | "low" | "info"
                        }
                        title={insight.title}
                        description={insight.description}
                        evidence={insight.evidence}
                        period={insight.period ?? undefined}
                        createdAt={insight.created_at}
                      />
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            <div className="space-y-4">
              <Panel tone="slate" icon={Gauge} title="Nøkkeltall">
                <dl className="space-y-0.5">
                  <KeyFigure
                    label="Omsetning"
                    value={formatCurrency(data.revenue?.ytd ?? 0)}
                    hint="Eks. mva"
                  />
                  <KeyFigure
                    label="Driftsresultat"
                    value={formatCurrency(data.profit?.ytd ?? 0)}
                    hint={`Margin ${formatPercent(
                      margin(data.profit?.ytd ?? 0, data.revenue?.ytd ?? 0)
                    )}`}
                  />
                  {data.receivables && (
                    <KeyFigure
                      label="Kundefordringer"
                      value={formatCurrency(data.receivables.total)}
                      hint="Inkl. mva — fakturert beløp"
                    />
                  )}
                  {cashflow.data?.payables && (
                    <KeyFigure
                      label="Leverandørgjeld"
                      value={formatCurrency(cashflow.data.payables.total)}
                      hint="Inkl. mva"
                    />
                  )}
                  {cashflow.data?.lowest_point && (
                    <KeyFigure
                      label="Laveste likviditet"
                      value={formatCurrency(cashflow.data.lowest_point.balance)}
                      hint={monthName(cashflow.data.lowest_point.month)}
                    />
                  )}
                </dl>
              </Panel>

              <Panel tone="teal" icon={Droplets} title="Hurtighandlinger">
                <div className="grid gap-2">
                  <Action href="/import" icon={Upload} label="Importer data" />
                  <Action href="/rapporter" icon={FileText} label="Lag en rapport" />
                  <Action href="/budsjett" icon={Target} label="Nytt budsjett" />
                  <Action
                    href="/okonomi"
                    icon={MessageCircleQuestion}
                    label="Se økonomien i detalj"
                  />
                </div>
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function KeyFigure({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border-light py-2.5 last:border-0">
      <dt className="min-w-0">
        <span className="block truncate text-sm text-foreground-secondary">
          {label}
        </span>
        {hint && (
          <span className="block text-xs text-foreground-muted">{hint}</span>
        )}
      </dt>
      <dd className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}

function Action({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Upload;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-foreground-secondary transition-colors hover:bg-surface-hover hover:text-foreground"
    >
      <Icon size={16} className="shrink-0 text-foreground-muted" />
      {label}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------

const MONTHS = [
  "januar", "februar", "mars", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "desember",
];

/**
 * "januar–juli 2026".
 *
 * Whole months, because that is what the period now is. It used to print the
 * end date — "januar–13. august 2026, sammenlignet med januar–13. august
 * 2025" — which is precise about something arbitrary: the 13th is the day the
 * export was taken, not a point anyone reports or plans around.
 */
function formatPeriod(start: string, end: string): string {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);

  if (sy === ey && sm === em) return `${MONTHS[sm - 1]} ${ey}`;
  if (sy === ey) return `${MONTHS[sm - 1]}–${MONTHS[em - 1]} ${ey}`;
  return `${MONTHS[sm - 1]} ${sy} – ${MONTHS[em - 1]} ${ey}`;
}

/** "2025-07-31" → "samme periode i 2025". */
function comparisonYear(end: string): string {
  return `samme periode i ${end.slice(0, 4)}`;
}

function monthName(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function margin(profit: number, revenue: number): number {
  return revenue > 0 ? (profit / revenue) * 100 : 0;
}

/**
 * A margin moves in percentage points, not in percent — a margin going from
 * 5 % to 10 % has risen five points, and calling that "up 100 %" is the kind
 * of true-but-useless figure that gets a board pack questioned.
 */
function marginChange(data: SummaryResponse): number | null {
  if (
    !data.revenue?.has_comparison ||
    data.revenue.comparison_ytd == null ||
    data.profit?.comparison_ytd == null ||
    data.revenue.comparison_ytd <= 0
  ) {
    return null;
  }

  const now = margin(data.profit.ytd, data.revenue.ytd);
  const before = margin(data.profit.comparison_ytd, data.revenue.comparison_ytd);
  return Math.round((now - before) * 10) / 10;
}
