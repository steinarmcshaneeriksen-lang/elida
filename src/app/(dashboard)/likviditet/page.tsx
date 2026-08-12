"use client";

import { formatCurrency, formatDateShort } from "@/lib/format";
import {
  cashPosition,
  expectedInflows,
  expectedOutflows,
  taxEstimates,
} from "@/lib/mock-data";
import {
  Droplets,
  ArrowDownRight,
  ArrowUpRight,
  AlertTriangle,
  ShieldCheck,
  Receipt,
} from "lucide-react";

export default function LikviditetPage() {
  const totalInflows = expectedInflows.reduce((s, i) => s + i.amount, 0);
  const totalOutflows = expectedOutflows.reduce((s, o) => s + o.amount, 0);
  const bufferOk =
    cashPosition.forecastMin >= cashPosition.bufferRequirement;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* Cash position cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow)]">
          <div className="flex items-center gap-2 text-foreground-muted">
            <Droplets size={16} />
            <span className="text-sm">Banksaldo na</span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {formatCurrency(cashPosition.currentBalance)}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow)]">
          <div className="flex items-center gap-2 text-foreground-muted">
            <ArrowUpRight size={16} className="text-success" />
            <span className="text-sm">Forventet innbetalinger</span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-success">
            {formatCurrency(totalInflows)}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow)]">
          <div className="flex items-center gap-2 text-foreground-muted">
            <ArrowDownRight size={16} className="text-danger" />
            <span className="text-sm">Forventet utbetalinger</span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-danger">
            {formatCurrency(Math.abs(totalOutflows))}
          </p>
        </div>

        <div
          className={`rounded-xl border p-5 shadow-[var(--shadow)] ${
            bufferOk
              ? "border-success/30 bg-success-light"
              : "border-danger/30 bg-danger-light"
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
            {formatCurrency(cashPosition.forecastMin)}
          </p>
          <p className="mt-1 text-xs text-foreground-secondary">
            {formatDateShort(cashPosition.forecastMinDate)} — Buffer:{" "}
            {formatCurrency(cashPosition.bufferRequirement)}
          </p>
        </div>
      </div>

      {/* Cash forecast placeholder */}
      <section className="rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow)]">
        <h3 className="mb-4 text-lg font-semibold text-foreground">
          Likviditetsprognose
        </h3>
        <div className="flex h-48 items-center justify-center rounded-lg border-2 border-dashed border-border bg-surface-hover">
          <p className="text-sm text-foreground-muted">
            Likviditetsgraf vises her nar API-et er tilkoblet
          </p>
        </div>
      </section>

      {/* Inflows and Outflows */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Inflows */}
        <section className="rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow)]">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <ArrowUpRight size={18} className="text-success" />
            Forventede innbetalinger
          </h3>
          <div className="space-y-3">
            {expectedInflows.map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border border-border-light p-3 hover:bg-surface-hover"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.label}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2">
                    {item.date && (
                      <span className="text-xs text-foreground-muted">
                        {formatDateShort(item.date)}
                      </span>
                    )}
                    <ConfidenceDot confidence={item.confidence} />
                  </div>
                </div>
                <span className="ml-4 text-sm font-semibold tabular-nums text-success">
                  {formatCurrency(item.amount)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm font-semibold text-foreground">Totalt</span>
            <span className="text-sm font-bold tabular-nums text-success">
              {formatCurrency(totalInflows)}
            </span>
          </div>
        </section>

        {/* Outflows */}
        <section className="rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow)]">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <ArrowDownRight size={18} className="text-danger" />
            Forventede utbetalinger
          </h3>
          <div className="space-y-3">
            {expectedOutflows.map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border border-border-light p-3 hover:bg-surface-hover"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.label}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2">
                    {item.date && (
                      <span className="text-xs text-foreground-muted">
                        {formatDateShort(item.date)}
                      </span>
                    )}
                    <ConfidenceDot confidence={item.confidence} />
                  </div>
                </div>
                <span className="ml-4 text-sm font-semibold tabular-nums text-danger">
                  {formatCurrency(Math.abs(item.amount))}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm font-semibold text-foreground">Totalt</span>
            <span className="text-sm font-bold tabular-nums text-danger">
              {formatCurrency(Math.abs(totalOutflows))}
            </span>
          </div>
        </section>
      </div>

      {/* Tax & VAT section */}
      <section className="rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow)]">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
          <Receipt size={18} className="text-foreground-muted" />
          Skatt og avgift
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-surface-hover p-4">
            <p className="text-xs font-medium text-foreground-muted">
              MVA {taxEstimates.vatTermPeriod}
            </p>
            <p className="mt-1 text-xl font-bold text-foreground">
              {formatCurrency(taxEstimates.vatNextTerm)}
            </p>
            <p className="mt-0.5 text-xs text-foreground-muted">
              Forfaller {formatDateShort(taxEstimates.vatDueDate)}
            </p>
          </div>
          <div className="rounded-lg bg-surface-hover p-4">
            <p className="text-xs font-medium text-foreground-muted">
              Arbeidsgiveravgift
            </p>
            <p className="mt-1 text-xl font-bold text-foreground">
              {formatCurrency(taxEstimates.employerTax)}
            </p>
            <p className="mt-0.5 text-xs text-foreground-muted">
              Forfaller {formatDateShort(taxEstimates.taxDueDate)}
            </p>
          </div>
          <div className="rounded-lg bg-surface-hover p-4">
            <p className="text-xs font-medium text-foreground-muted">Skattetrekk</p>
            <p className="mt-1 text-xl font-bold text-foreground">
              {formatCurrency(taxEstimates.taxWithholding)}
            </p>
            <p className="mt-0.5 text-xs text-foreground-muted">
              Forfaller {formatDateShort(taxEstimates.taxDueDate)}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function ConfidenceDot({
  confidence,
}: {
  confidence: "high" | "medium" | "low";
}) {
  const colors = {
    high: "bg-success",
    medium: "bg-warning",
    low: "bg-danger",
  };
  const labels = {
    high: "Hoy",
    medium: "Middels",
    low: "Lav",
  };
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${colors[confidence]}`} />
      <span className="text-xs text-foreground-muted">{labels[confidence]}</span>
    </span>
  );
}
