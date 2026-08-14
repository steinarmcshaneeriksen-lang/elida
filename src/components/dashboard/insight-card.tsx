"use client";

import { useState } from "react";
import { AlertTriangle, AlertCircle, Info, Bell, AlertOctagon, ChevronRight } from "lucide-react";

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

/**
 * One observation, one line until asked.
 *
 * Every card used to state everything at once: a heading, a paragraph
 * explaining it, the two or three figures behind it, the period, and how long
 * ago the import ran. Six lines each, three of them stacked, with the chat open
 * over half the screen — a page nobody reads is a page that reports nothing.
 *
 * The heading already is the finding. "Bankbeholdningen dekker 1,2 måneder med
 * drift" needs no summary underneath it; what it needs is somewhere to put the
 * working for whoever doubts it. So the finding stands alone and the rest opens
 * on a click. The chevron pointed at nothing before — it looked like a control
 * and behaved like an ornament. Now it is the control.
 */
export function InsightCard({
  severity,
  title,
  description,
  evidence,
  period,
}: InsightCardProps) {
  const [open, setOpen] = useState(false);
  const config = severityConfig[severity] ?? severityConfig.info;
  const Icon = config.icon;

  return (
    <div data-tone={config.tone} className="tone-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="tone-badge shrink-0 rounded-full">
          <Icon size={15} strokeWidth={2.2} />
        </span>
        <h3 className="min-w-0 flex-1 text-sm font-semibold text-foreground">
          {title}
        </h3>
        <ChevronRight
          size={16}
          className={`shrink-0 text-[var(--tone-ink)] transition-transform ${
            open ? "rotate-90" : ""
          }`}
        />
      </button>

      {open && (
        <div className="border-t border-border px-4 pb-3.5 pt-3 pl-[3.25rem]">
          <p className="text-sm leading-relaxed text-foreground-secondary">
            {description}
          </p>
          {evidence && evidence.length > 0 && (
            <ul className="mt-2.5 space-y-0.5">
              {evidence.map((line) => (
                <li key={line} className="text-xs tabular-nums text-foreground-muted">
                  {line}
                </li>
              ))}
            </ul>
          )}
          {period && (
            <p className="mt-2.5 text-xs text-foreground-muted">{period}</p>
          )}
        </div>
      )}
    </div>
  );
}
