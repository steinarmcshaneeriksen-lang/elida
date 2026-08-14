"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/format";
import { useCompanyData } from "@/lib/hooks/use-company-data";
import {
  NoDataState,
  LoadingState,
  ErrorState,
} from "@/components/dashboard/empty-state";
import { ArrowUpDown, Receipt, ArrowDownRight, Truck } from "lucide-react";

interface SupplierRow {
  id: string;
  name: string;
  org_number: string | null;
  cost: number;
  outstanding: number;
  posting_count: number;
  last_activity: string | null;
  is_possible_private_person: boolean;
}

type SortKey = "name" | "cost" | "outstanding" | "last_activity";

export default function LeverandorerPage() {
  const { data, isLoading, error } =
    useCompanyData<{ suppliers: SupplierRow[] }>("suppliers");
  const [sortKey, setSortKey] = useState<SortKey>("cost");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const suppliers = data?.suppliers ?? [];

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...suppliers].sort((a, b) => {
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

  const totalCost = suppliers.reduce((s, sup) => s + sup.cost, 0);
  const totalOutstanding = suppliers.reduce(
    (s, sup) => s + Math.max(0, sup.outstanding),
    0
  );


  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (suppliers.length === 0) {
    return (
      <NoDataState
        title="Ingen leverandører ennå"
        description="Importer en SAF-T-fil fra regnskapssystemet ditt, så viser Elida leverandørene dine med kostnadsutvikling og forfall."
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Summary — costs keep the copper they have on Økonomi; what we owe
          out is rose, the outflow colour. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div data-tone="copper" className="tone-card p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-foreground-secondary">
              Totale kostnader i perioden
            </p>
            <span className="tone-badge shrink-0">
              <Receipt size={16} strokeWidth={2.2} />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums text-foreground">
            {formatCurrency(totalCost)}
          </p>
          <p className="mt-1 text-xs text-foreground-muted">Eks. mva</p>
        </div>
        <div data-tone="rose" className="tone-card p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-foreground-secondary">
              Vi skylder
            </p>
            <span className="tone-badge shrink-0">
              <ArrowDownRight size={16} strokeWidth={2.2} />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums text-foreground">
            {formatCurrency(totalOutstanding)}
          </p>
          <p className="mt-1 text-xs text-foreground-muted">
            Inkl. mva — fakturert beløp
          </p>
        </div>
        <div data-tone="slate" className="tone-card p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-foreground-secondary">
              Antall leverandører
            </p>
            <span className="tone-badge shrink-0">
              <Truck size={16} strokeWidth={2.2} />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums text-foreground">
            {suppliers.length}
          </p>
        </div>
      </div>

      {/* Supplier table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-[var(--shadow)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-hover">
              <SortableHeader
                label="Leverandør"
                sortKey="name"
                currentKey={sortKey}
                direction={sortDir}
                onSort={toggleSort}
              />
              <SortableHeader
                label="Kostnad hittil i år"
                sortKey="cost"
                currentKey={sortKey}
                direction={sortDir}
                onSort={toggleSort}
                align="right"
              />
              <SortableHeader
                label="Utestående"
                sortKey="outstanding"
                currentKey={sortKey}
                direction={sortDir}
                onSort={toggleSort}
                align="right"
              />
              <th className="px-4 py-3 text-right font-medium text-foreground-secondary">
                Siste aktivitet
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((supplier) => (
              <tr
                key={supplier.id}
                className="border-b border-border-light last:border-b-0 hover:bg-surface-hover"
              >
                <td className="px-4 py-3 font-medium text-foreground">
                  {supplier.name}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {formatCurrency(supplier.cost)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {supplier.outstanding > 0
                    ? formatCurrency(supplier.outstanding)
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground-muted">
                  {supplier.last_activity ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-surface-hover">
              <td className="px-4 py-3 font-semibold text-foreground">Totalt</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                {formatCurrency(totalCost)}
              </td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                {formatCurrency(totalOutstanding)}
              </td>
              <td />
              <td />
            </tr>
          </tfoot>
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
