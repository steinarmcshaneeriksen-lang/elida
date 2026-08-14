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
import {
  ArrowUpDown,
  AlertTriangle,
  ChevronRight,
  Info,
  Receipt,
  TrendingUp,
  Users,
} from "lucide-react";

interface CustomerRow {
  id: string;
  name: string;
  org_number: string | null;
  outstanding: number | null;
  period_movement: number;
  revenue: number;
  posting_count: number;
  last_activity: string | null;
  outstanding_is_stated: boolean;
}

type SortKey = "name" | "outstanding" | "revenue" | "last_activity";

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

  const outstandingIsStated = customers.some((c) => c.outstanding_is_stated);
  const totalOutstanding = customers.reduce(
    (s, c) => s + Math.max(0, c.outstanding ?? 0),
    0
  );
  const totalRevenue = customers.reduce((s, c) => s + c.revenue, 0);
  const owingCount = customers.filter((c) => (c.outstanding ?? 0) > 0).length;

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
      {!outstandingIsStated && (
        <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4">
          <Info size={18} className="mt-0.5 shrink-0 text-warning" />
          <p className="text-sm text-foreground-secondary">
            SAF-T-filen oppgir ikke saldo per kunde, så Elida kan ikke si hva
            den enkelte kunden skylder. Posteringene i perioden viser bare
            bevegelsen — en faktura fra i fjor som betales i år framstår som en
            reduksjon. Omsetning og aktivitet under er derimot korrekt.
            Totalt utestående for selskapet finner du under Likviditet.
          </p>
        </div>
      )}

      {/* Summary — same card language as the dashboard: receivables copper,
          revenue ocean, so a figure keeps its colour from page to page. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div data-tone="copper" className="tone-card p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-foreground-secondary">
              Totalt utestående
            </p>
            <span className="tone-badge shrink-0">
              <Receipt size={16} strokeWidth={2.2} />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums text-foreground">
            {outstandingIsStated ? formatCurrency(totalOutstanding) : "—"}
          </p>
          <p className="mt-1 text-xs text-foreground-muted">
            {outstandingIsStated
              ? "Inkl. mva — fakturert beløp"
              : "Ikke oppgitt per kunde i filen"}
          </p>
        </div>
        <div data-tone="ocean" className="tone-card p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-foreground-secondary">
              Omsetning i perioden
            </p>
            <span className="tone-badge shrink-0">
              <TrendingUp size={16} strokeWidth={2.2} />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums text-foreground">
            {formatCurrency(totalRevenue)}
          </p>
          <p className="mt-1 text-xs text-foreground-muted">Eks. mva</p>
        </div>
        <div data-tone="slate" className="tone-card p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-foreground-secondary">
              Kunder
            </p>
            <span className="tone-badge shrink-0">
              <Users size={16} strokeWidth={2.2} />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums text-foreground">
            {customers.length}
          </p>
          {outstandingIsStated && (
            <p className="mt-1 text-xs text-foreground-muted">
              {owingCount} med utestående
            </p>
          )}
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
                label="Omsetning"
                sortKey="revenue"
                currentKey={sortKey}
                direction={sortDir}
                onSort={toggleSort}
                align="right"
              />
              <SortableHeader
                label="Siste aktivitet"
                sortKey="last_activity"
                currentKey={sortKey}
                direction={sortDir}
                onSort={toggleSort}
                align="right"
              />
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
                <td className="px-4 py-3 text-right tabular-nums">
                  {customer.outstanding_is_stated ? (
                    (customer.outstanding ?? 0) > 0 ? (
                      <span className="flex items-center justify-end gap-1 font-medium text-foreground">
                        <AlertTriangle size={12} className="text-warning" />
                        {formatCurrency(customer.outstanding ?? 0)}
                      </span>
                    ) : (
                      <span className="text-foreground-muted">—</span>
                    )
                  ) : (
                    <span
                      className="text-foreground-muted"
                      title="SAF-T-filen oppgir ikke saldo per kunde"
                    >
                      —
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground-secondary">
                  {customer.revenue !== 0
                    ? formatCurrency(customer.revenue)
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground-muted">
                  {customer.last_activity ?? "—"}
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
      className={`th-label cursor-pointer px-4 py-3 hover:text-foreground ${
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

