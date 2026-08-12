"use client";

import { MetricCard } from "@/components/dashboard/metric-card";
import { InsightCard } from "@/components/dashboard/insight-card";
import { ObligationsTable } from "@/components/dashboard/obligations-table";
import { dashboardMetrics, insights, obligations } from "@/lib/mock-data";
import { Calendar } from "lucide-react";
import { useUser } from "@/lib/hooks/use-user";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 10) return "God morgen!";
  if (hour < 17) return "God dag!";
  return "God kveld!";
}

export default function DashboardPage() {
  const { company } = useUser();

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          {getGreeting()}
        </h2>
        <p className="mt-1 text-sm text-foreground-secondary">
          Her er en oppsummering av den økonomiske situasjonen
          {company ? ` til ${company.name}` : ""}.
        </p>
      </div>

      {/* Six questions grid */}
      <section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dashboardMetrics.map((metric, index) => (
            <MetricCard
              key={index}
              question={metric.question}
              label={metric.label}
              value={metric.formattedValue}
              comparison={metric.comparison}
              confidence={metric.confidence}
              detail={metric.detail}
            />
          ))}
        </div>
      </section>

      {/* Insights section */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Dette bør du vite nå
            </h3>
            <p className="text-sm text-foreground-muted">
              Viktige hendelser og observasjoner fra Elida
            </p>
          </div>
        </div>
        <div className="space-y-3">
          {insights.map((insight) => (
            <InsightCard
              key={insight.id}
              severity={insight.severity}
              title={insight.title}
              description={insight.description}
              evidence={insight.evidence}
              category={insight.category}
              createdAt={insight.createdAt}
            />
          ))}
        </div>
      </section>

      {/* Obligations table */}
      <section>
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-foreground-muted" />
            <h3 className="text-lg font-semibold text-foreground">
              Kommende forpliktelser
            </h3>
          </div>
          <p className="mt-1 text-sm text-foreground-muted">
            Betalinger og avgifter som forfaller de neste 30 dagene
          </p>
        </div>
        <ObligationsTable obligations={obligations} />
      </section>
    </div>
  );
}
