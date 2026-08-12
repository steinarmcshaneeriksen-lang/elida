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
import { formatCurrency } from "@/lib/format";

interface SummaryResponse {
  has_data?: boolean;
  revenue: { ytd: number; comparison_ytd: number; change_percent: number } | null;
  profit: { ytd: number; comparison_ytd: number; change_percent: number } | null;
  cash: { current: number; forecast_60_day_min: number } | null;
  receivables: { total: number; overdue: number } | null;
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

/** Data derived from a partial period is an estimate, not a confirmed figure. */
function confidenceFor(freshness: string): "high" | "medium" | "low" {
  if (freshness === "live" || freshness === "recent") return "high";
  if (freshness === "stale") return "medium";
  return "low";
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
      </div>

      {isLoading && <LoadingState />}
      {!isLoading && error && <ErrorState message={error} />}
      {isEmpty && <NoDataState />}

      {!isLoading && !error && !isEmpty && data && (
        <>
          <section>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {buildMetrics(data).map((metric, index) => (
                <MetricCard
                  key={index}
                  question={metric.question}
                  label={metric.label}
                  value={metric.value}
                  comparison={metric.comparison}
                  confidence={metric.confidence}
                  detail={metric.detail}
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

function buildMetrics(data: SummaryResponse) {
  const confidence = confidenceFor(data.data_quality.freshness);
  const metrics: {
    question: string;
    label: string;
    value: string;
    comparison: {
      value: number;
      percent: number;
      direction: "up" | "down" | "flat";
      label: string;
    };
    confidence: "high" | "medium" | "low";
    detail?: string;
  }[] = [];

  if (data.profit) {
    const diff = data.profit.ytd - data.profit.comparison_ytd;
    metrics.push({
      question: "Går bedriften med overskudd?",
      label: "Driftsresultat hittil i år",
      value: formatCurrency(data.profit.ytd),
      comparison: {
        value: diff,
        percent: data.profit.change_percent,
        direction: direction(data.profit.change_percent),
        label: "vs. samme periode i fjor",
      },
      confidence,
    });
  }

  if (data.revenue) {
    const diff = data.revenue.ytd - data.revenue.comparison_ytd;
    const margin =
      data.revenue.ytd && data.profit
        ? (data.profit.ytd / data.revenue.ytd) * 100
        : null;
    metrics.push({
      question: "Vokser bedriften?",
      label: "Omsetning hittil i år",
      value: formatCurrency(data.revenue.ytd),
      comparison: {
        value: diff,
        percent: data.revenue.change_percent,
        direction: direction(data.revenue.change_percent),
        label: "vs. samme periode i fjor",
      },
      confidence,
      detail:
        margin != null
          ? `Driftsmargin: ${margin.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} %`
          : undefined,
    });
  }

  if (data.cash) {
    metrics.push({
      question: "Har bedriften nok penger?",
      label: "Bokført likviditet",
      value: formatCurrency(data.cash.current),
      comparison: {
        value: data.cash.forecast_60_day_min,
        percent: 0,
        direction: "flat",
        label: "laveste punkt neste 60 dager",
      },
      // A forward-looking minimum is a projection, never a confirmed figure.
      confidence: "medium",
      detail: "Bokført saldo, ikke live banksaldo.",
    });
  }

  if (data.receivables) {
    metrics.push({
      question: "Hvem skylder oss penger?",
      label: "Utestående kundefordringer",
      value: formatCurrency(data.receivables.total),
      comparison: {
        value: data.receivables.overdue,
        percent: 0,
        direction: data.receivables.overdue > 0 ? "down" : "flat",
        label: "forfalt",
      },
      confidence,
    });
  }

  if (data.upcoming_obligations_30d != null) {
    metrics.push({
      question: "Hva må vi betale snart?",
      label: "Forpliktelser neste 30 dager",
      value: formatCurrency(data.upcoming_obligations_30d),
      comparison: {
        value: 0,
        percent: 0,
        direction: "flat",
        label: "forfaller innen 30 dager",
      },
      confidence,
    });
  }

  return metrics;
}
