"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import { useCompanyData } from "@/lib/hooks/use-company-data";
import {
  NoDataState,
  LoadingState,
  ErrorState,
} from "@/components/dashboard/empty-state";
import { ArrowUpDown, AlertTriangle, ChevronRight } from "lucide-react";

interface CustomerRow {
  id: string;
  name: string;
  outstanding: number;
  overdue: number;
  avg_payment_days: number | null;
  late_payment_ratio: number | null;
  risk_score: number | null;
}

type SortKey = "name" | "outstanding" | "overdue" | "avg_payment_days";

/** Payment risk arrives as a 0-1 score; the badge shows three bands. */
function riskBand(score: number | null): "low" | "medium" | "high" {
  if (score == null) return "low";
  if (score >= 0.66) return "high";
  if (score >= 0.33) return "medium";
  return "low";
}

export default function KunderPage() {
  const router = useRouter();
  const { data, isLoading, error } =
    useCompanyData<{ customers: CustomerRow[] }>("customers");
  const [sortKey, setSortKey] = useState<SortKey>("outstanding");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const customers = data?.customers ?? [];

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...customers].sort((a, b) => {
    const aVal = a[sortKey] ?? 0;
    const bVal = b[sortKey] ?? 0;
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDir === "asc"
        ? aVal.localeCompare(bVal, "nb")
        : bVal.localeCompare(aVal, "nb");
    }
    return sortDir === "asc"
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number);
  });

  const totalOutstanding = customers.reduce((s, c) => s + c.outstanding, 0);
  const totalOverdue = customers.reduce((s, c) => s + c.overdue, 0);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (customers.length === 0) {
    return (
      <NoDataState
        title="Ingen kunder ennå"
        description="Importer en SAF-T-fil fra regnskapssystemet ditt, så viser Elida kundene dine med utestående beløp og betalingsatferd."
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow)]">
          <p className="text-sm text-foreground-muted">Totalt utestående</p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {formatCurrency(totalOutstanding)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow)]">
          <p className="text-sm text-foreground-muted">Forfalt</p>
          <p className="mt-1 text-2xl font-bold text-danger">
            {formatCurrency(totalOverdue)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow)]">
          <p className="text-sm text-foreground-muted">Antall kunder</p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {customers.length}
          </p>
        </div>
      </div>

      {/* Customer table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-[var(--shadow)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-hover">
              <SortableHeader
                label="Kunde"
                sortKey="name"
                currentKey={sortKey}
                direction={sortDir}
                onSort={toggleSort}
              />
              <SortableHeader
                label="Utestående"
                sortKey="outstanding"
                currentKey={sortKey}
                direction={sortDir}
                onSort={toggleSort}
                align="right"
              />
              <SortableHeader
                label="Forfalt"
                sortKey="overdue"
                currentKey={sortKey}
                direction={sortDir}
                onSort={toggleSort}
                align="right"
              />
              <SortableHeader
                label="Snitt betalingstid"
                sortKey="avg_payment_days"
                currentKey={sortKey}
                direction={sortDir}
                onSort={toggleSort}
                align="right"
              />
              <th className="px-4 py-3 text-left font-medium text-foreground-secondary">
                Risiko
              </th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((customer) => (
              <tr
                key={customer.id}
                onClick={() => router.push(`/kunder/${customer.id}`)}
                className="group cursor-pointer border-b border-border-light last:border-b-0 hover:bg-surface-hover"
              >
                <td className="px-4 py-3 font-medium text-foreground">
                  {customer.name}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {formatCurrency(customer.outstanding)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {customer.overdue > 0 ? (
                    <span className="flex items-center justify-end gap-1 text-danger">
                      <AlertTriangle size={12} />
                      {formatCurrency(customer.overdue)}
                    </span>
                  ) : (
                    <span className="text-foreground-muted">&mdash;</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground-secondary">
                  {customer.avg_payment_days != null
                    ? `${Math.round(customer.avg_payment_days)} dager`
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <RiskBadge risk={riskBand(customer.risk_score)} />
                </td>
                <td className="px-4 py-3">
                  <ChevronRight
                    size={16}
                    className="text-foreground-muted opacity-0 group-hover:opacity-100"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  currentKey,
  direction,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  direction: "asc" | "desc";
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const isActive = currentKey === sortKey;
  return (
    <th
      className={`cursor-pointer px-4 py-3 font-medium text-foreground-secondary hover:text-foreground ${
        align === "right" ? "text-right" : "text-left"
      }`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown
          size={12}
          className={isActive ? "text-primary" : "text-foreground-muted"}
        />
        {isActive && (
          <span className="text-xs text-primary">
            {direction === "asc" ? "↑" : "↓"}
          </span>
        )}
      </span>
    </th>
  );
}

function RiskBadge({ risk }: { risk: "low" | "medium" | "high" }) {
  const config = {
    low: { label: "Lav", className: "bg-success-light text-success" },
    medium: { label: "Medium", className: "bg-warning-light text-warning" },
    high: { label: "Høy", className: "bg-danger-light text-danger" },
  };
  const c = config[risk];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${c.className}`}
    >
      {c.label}
    </span>
  );
}
