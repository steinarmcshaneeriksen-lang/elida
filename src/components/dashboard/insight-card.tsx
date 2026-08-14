"use client";

import { AlertTriangle, AlertCircle, Info, Bell, AlertOctagon, ChevronRight } from "lucide-react";
import { formatRelativeTime } from "@/lib/format";

export type InsightSeverity =
  | "info"
  | "low"
  | "medium"
  | "high"
  | "critical";

interface InsightCardProps {
  severity: InsightSeverity;
  title: string;
  description: string;
  /** The figures the observation was derived from. */
  evidence?: string[];
  period?: string;
  createdAt: string;
}

const severityConfig: Record<
  InsightSeverity,
  { icon: typeof Info; tone: string; label: string }
> = {
  info: { icon: Info, tone: "ocean", label: "Info" },
  low: { icon: Bell, tone: "slate", label: "Lav" },
  medium: { icon: AlertCircle, tone: "copper", label: "Medium" },
  high: { icon: AlertTriangle, tone: "copper", label: "Høy" },
  critical: { icon: AlertOctagon, tone: "rose", label: "Kritisk" },
};

export function InsightCard({
  severity,
  title,
  description,
  evidence,
  period,
  createdAt,
}: InsightCardProps) {
  const config = severityConfig[severity] ?? severityConfig.info;
  const Icon = config.icon;

  return (
    <div
      data-tone={config.tone}
      className="tone-card group flex items-start justify-between gap-4 p-4"
    >
      <div className="flex items-start gap-3">
        <span className="tone-badge mt-0.5 shrink-0 rounded-full">
          <Icon size={15} strokeWidth={2.2} />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-foreground-secondary">
            {description}
          </p>
          {evidence && evidence.length > 0 && (
            <ul className="mt-2.5 space-y-0.5">
              {evidence.map((line) => (
                <li
                  key={line}
                  className="text-xs tabular-nums text-foreground-muted"
                >
                  {line}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            {period && (
              <span className="inline-flex items-center rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium text-foreground-secondary">
                {period}
              </span>
            )}
            <span className="text-xs text-foreground-muted">
              {formatRelativeTime(createdAt)}
            </span>
          </div>
        </div>
      </div>
      <ChevronRight
        size={18}
        className="mt-1 shrink-0 text-[var(--tone)] opacity-0 group-hover:opacity-100"
      />
    </div>
  );
}
