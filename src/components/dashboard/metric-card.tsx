"use client";

import { TrendingUp, TrendingDown, Minus, ShieldCheck, ShieldAlert, Shield } from "lucide-react";

interface MetricCardProps {
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
  onClick?: () => void;
}

const confidenceConfig = {
  high: {
    icon: ShieldCheck,
    label: "Høy sikkerhet",
    className: "bg-success-light text-success",
  },
  medium: {
    icon: ShieldAlert,
    label: "Middels sikkerhet",
    className: "bg-warning-light text-warning",
  },
  low: {
    icon: Shield,
    label: "Lav sikkerhet",
    className: "bg-danger-light text-danger",
  },
};

const directionConfig = {
  up: {
    icon: TrendingUp,
    className: "text-success",
  },
  down: {
    icon: TrendingDown,
    className: "text-danger",
  },
  flat: {
    icon: Minus,
    className: "text-foreground-muted",
  },
};

export function MetricCard({
  question,
  label,
  value,
  comparison,
  confidence,
  detail,
  onClick,
}: MetricCardProps) {
  const conf = confidenceConfig[confidence];
  const dir = directionConfig[comparison.direction];
  const ConfIcon = conf.icon;
  const DirIcon = dir.icon;

  return (
    <button
      onClick={onClick}
      className="group flex w-full flex-col rounded-xl border border-border bg-surface p-5 text-left shadow-[var(--shadow)] hover:shadow-[var(--shadow-md)]"
    >
      {/* Question */}
      <p className="mb-1 text-sm font-medium text-primary">{question}</p>

      {/* Label */}
      <p className="mb-3 text-xs text-foreground-muted">{label}</p>

      {/* Value */}
      <p className="mb-3 text-2xl font-bold tracking-tight text-foreground">
        {value}
      </p>

      {/* Comparison row */}
      <div className="mb-3 flex items-center gap-2">
        <DirIcon size={16} className={dir.className} />
        <span className={`text-sm font-medium ${dir.className}`}>
          {comparison.percent !== 0 && (
            <span>
              {comparison.direction === "up" ? "+" : comparison.direction === "down" ? "-" : ""}
              {comparison.percent.toFixed(1).replace(".", ",")} %
            </span>
          )}
        </span>
        <span className="text-xs text-foreground-muted">{comparison.label}</span>
      </div>

      {/* Detail */}
      {detail && (
        <p className="mb-3 text-xs leading-relaxed text-foreground-secondary">{detail}</p>
      )}

      {/* Confidence badge */}
      <div className="mt-auto flex items-center gap-1.5">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${conf.className}`}
        >
          <ConfIcon size={12} />
          {conf.label}
        </span>
      </div>
    </button>
  );
}
