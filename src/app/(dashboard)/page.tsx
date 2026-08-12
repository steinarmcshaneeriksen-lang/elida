"use client";

import { MetricCard } from "@/components/dashboard/metric-card";
import { InsightCard } from "@/components/dashboard/insight-card";
import {
  NoDataState,
  LoadingState,
  ErrorState,
} from "@/components/dashboard/empty-state";
import { useUser } from "@/lib/hooks/use-user";
import { useCompanyData } from "@/lib/hooks/use-company-data";
import { MrrCard, type MrrData } from "@/components/dashboard/mrr-card";
import { formatCurrency } from "@/lib/format";

interface Metric {
  ytd: number;
  comparison_ytd: number | null;
  change_percent: number | null;
  has_comparison: boolean;
}

interface SummaryResponse {
  has_data?: boolean;
  period: {
    start: string;
    end: string;
    comparison_start: string | null;
    comparison_end: string | null;
  } | null;
  revenue: Metric | null;
  profit: Metric | null;
  cash: { current: number } | null;
  receivables: { total: number; overdue: number | null } | null;
  upcoming_obligations_30d: number | null;
  insights: Array<{
    id: string;
    severity: string;
    title: string;
    description: string;
    created_at: string;
  }>;
  data_quality: {
    last_sync: string | null;
    freshness: string;
    completeness: string;
  };
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 10) return "God morgen!";
  if (hour < 17) return "God dag!";
  return "God kveld!";
}

function direction(percent: number): "up" | "down" | "flat" {
  if (percent > 0.5) return "up";
  if (percent < -0.5) return "down";
  return "flat";
}

export default function DashboardPage() {
  const { company } = useUser();
  const { data, isLoading, error, isEmpty } =
    useCompanyData<SummaryResponse>("summary");
  const mrr = useCompanyData<MrrData>("mrr");

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          {getGreeting()}
        </h2>
        <p className="mt-1 text-sm text-foreground-secondary">
          Her er en oppsummering av den økonomiske situasjonen
          {company ? ` til ${company.name}` : ""}.
        </p>
        {data?.period && (
          <p className="mt-2 text-xs text-foreground-muted">
            Tallene gjelder {formatPeriod(data.period.start, data.period.end)}
            {data.period.comparison_start && data.period.comparison_end
              ? `, sammenlignet med ${formatPeriod(data.period.comparison_start, data.period.comparison_end)}.`
              : ". Last opp foregående år for å se utvikling."}
          </p>
        )}
      </div>

      {isLoading && <LoadingState />}
      {!isLoading && error && <ErrorState message={error} />}
      {isEmpty && <NoDataState />}

      {!isLoading && !error && !isEmpty && data && (
        <>
          {mrr.data?.has_data && <MrrCard data={mrr.data} />}

          <section>
            {/* One row of equal cards. A three-column grid left the fourth
                card alone on a second row, which read as a mistake. */}
            <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {buildMetrics(data).map((metric) => (
                <MetricCard
                  key={metric.question}
                  question={metric.question}
                  label={metric.label}
                  value={metric.value}
                  comparison={metric.comparison}
                  detail={metric.detail}
                  href={metric.href}
                />
              ))}
            </div>
          </section>

          <section>
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-foreground">
                Dette bør du vite nå
              </h3>
              <p className="text-sm text-foreground-muted">
                Viktige hendelser og observasjoner fra Elida
              </p>
            </div>

            {data.insights.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface px-5 py-8 text-center text-sm text-foreground-muted">
                Ingen observasjoner å vise ennå. Elida varsler her når noe
                krever oppmerksomhet.
              </div>
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
                    createdAt={insight.created_at}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

const MONTHS = [
  "januar", "februar", "mars", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "desember",
];

/** "1. jan – 30. jun 2026", collapsing the year when both ends share it. */
function formatPeriod(start: string, end: string): string {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const from = `${MONTHS[sm - 1]}`;
  const to = `${ed}. ${MONTHS[em - 1]}`;
  return sy === ey ? `${from}–${to} ${ey}` : `${from} ${sy} – ${to} ${ey}`;
}

interface DashboardMetric {
  question: string;
  label: string;
  value: string;
  comparison: {
    percent: number;
    direction: "up" | "down" | "flat";
    label: string;
  };
  detail?: string;
  href: string;
}

function buildMetrics(data: SummaryResponse): DashboardMetric[] {
  const metrics: DashboardMetric[] = [];

  if (data.profit) {
    const margin =
      data.revenue?.ytd && data.profit
        ? (data.profit.ytd / data.revenue.ytd) * 100
        : null;
    metrics.push({
      question: "Går bedriften med overskudd?",
      label: "Driftsresultat i perioden",
      value: formatCurrency(data.profit.ytd),
      comparison: comparisonFor(data.profit),
      detail:
        margin != null
          ? `Driftsmargin ${margin.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} %`
          : undefined,
      href: "/okonomi",
    });
  }

  if (data.revenue) {
    metrics.push({
      question: "Vokser bedriften?",
      label: "Omsetning i perioden",
      value: formatCurrency(data.revenue.ytd),
      comparison: comparisonFor(data.revenue),
      detail: data.revenue.has_comparison
        ? `I fjor: ${formatCurrency(data.revenue.comparison_ytd ?? 0)}`
        : undefined,
      href: "/okonomi",
    });
  }

  if (data.cash) {
    metrics.push({
      question: "Har bedriften nok penger?",
      label: "Bokført likviditet",
      value: formatCurrency(data.cash.current),
      comparison: {
        percent: 0,
        direction: "flat",
        label: "ved periodens slutt",
      },
      detail: "Bokført saldo, ikke live banksaldo.",
      href: "/likviditet",
    });
  }

  if (data.receivables) {
    metrics.push({
      question: "Hvem skylder oss penger?",
      label: "Utestående kundefordringer",
      value: formatCurrency(data.receivables.total),
      comparison: {
        percent: 0,
        direction: "flat",
        label: "bokført ved periodens slutt",
      },
      href: "/kunder",
    });
  }

  return metrics;
}

/**
 * Without a previous year there is nothing to compare against. Showing a
 * zero baseline would render as a 100% change, so say so instead.
 */
function comparisonFor(metric: Metric) {
  if (!metric.has_comparison || metric.change_percent == null) {
    return {
      percent: 0,
      direction: "flat" as const,
      label: "ingen sammenligning ennå",
    };
  }
  return {
    percent: metric.change_percent,
    direction: direction(metric.change_percent),
    label: "vs. i fjor",
  };
}
