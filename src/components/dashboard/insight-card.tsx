"use client";

import { AlertTriangle, AlertCircle, Info, Bell, AlertOctagon, ChevronRight } from "lucide-react";
import type { InsightSeverity } from "@/lib/mock-data";
import { formatRelativeTime } from "@/lib/format";

interface InsightCardProps {
  severity: InsightSeverity;
  title: string;
  description: string;
  evidence?: string;
  category: string;
  createdAt: string;
}

const severityConfig: Record<
  InsightSeverity,
  { icon: typeof Info; bg: string; text: string; label: string }
> = {
  info: {
    icon: Info,
    bg: "bg-info-light",
    text: "text-info",
    label: "Info",
  },
  low: {
    icon: Bell,
    bg: "bg-surface-hover",
    text: "text-foreground-secondary",
    label: "Lav",
  },
  medium: {
    icon: AlertCircle,
    bg: "bg-warning-light",
    text: "text-warning",
    label: "Medium",
  },
  high: {
    icon: AlertTriangle,
    bg: "bg-warning-light",
    text: "text-warning",
    label: "Høy",
  },
  critical: {
    icon: AlertOctagon,
    bg: "bg-danger-light",
    text: "text-danger",
    label: "Kritisk",
  },
};

export function InsightCard({
  severity,
  title,
  description,
  evidence,
  category,
  createdAt,
}: InsightCardProps) {
  const config = severityConfig[severity];
  const Icon = config.icon;

  return (
    <div className="group flex items-start justify-between gap-4 rounded-xl border border-border bg-surface p-4 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow)]">
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${config.bg}`}
        >
          <Icon size={15} className={config.text} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-foreground-secondary">
            {description}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            {evidence && (
              <span className="text-xs text-foreground-muted">
                Kilde: {evidence}
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium text-foreground-secondary">
              {category}
            </span>
            <span className="text-xs text-foreground-muted">
              {formatRelativeTime(createdAt)}
            </span>
          </div>
        </div>
      </div>
      <ChevronRight
        size={18}
        className="mt-1 shrink-0 text-foreground-muted opacity-0 group-hover:opacity-100"
      />
    </div>
  );
}
