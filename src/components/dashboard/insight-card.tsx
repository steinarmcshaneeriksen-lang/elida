"use client";

import { AlertTriangle, AlertCircle, Info, Bell, AlertOctagon } from "lucide-react";
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
  { icon: typeof Info; border: string; bg: string; text: string; dot: string; label: string }
> = {
  info: {
    icon: Info,
    border: "border-l-info",
    bg: "bg-info-light",
    text: "text-info",
    dot: "bg-info",
    label: "Info",
  },
  low: {
    icon: Bell,
    border: "border-l-foreground-muted",
    bg: "bg-surface-hover",
    text: "text-foreground-secondary",
    dot: "bg-foreground-muted",
    label: "Lav",
  },
  medium: {
    icon: AlertCircle,
    border: "border-l-warning",
    bg: "bg-warning-light",
    text: "text-warning",
    dot: "bg-warning",
    label: "Medium",
  },
  high: {
    icon: AlertTriangle,
    border: "border-l-[#f97316]",
    bg: "bg-[#fff7ed]",
    text: "text-[#ea580c]",
    dot: "bg-[#f97316]",
    label: "Hoy",
  },
  critical: {
    icon: AlertOctagon,
    border: "border-l-danger",
    bg: "bg-danger-light",
    text: "text-danger",
    dot: "bg-danger",
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
    <div
      className={`rounded-lg border border-border ${config.border} border-l-4 bg-surface p-4 shadow-[var(--shadow-sm)]`}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${config.bg}`}
          >
            <Icon size={14} className={config.text} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-foreground-secondary">
              {description}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 pl-10">
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
  );
}
