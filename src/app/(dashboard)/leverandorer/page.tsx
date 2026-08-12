"use client";

import { useState } from "react";
import { formatCurrency, formatChange, formatDateShort } from "@/lib/format";
import { suppliers, type Supplier } from "@/lib/mock-data";
import { ArrowUpDown, TrendingUp, TrendingDown } from "lucide-react";

type SortKey = keyof Pick<
  Supplier,
  "name" | "costYTD" | "changeYoY" | "outstanding"
>;

export default function LeverandorerPage() {
  const [sortKey, setSortKey] = useState<SortKey>("costYTD");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...suppliers].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDir === "asc"
        ? aVal.localeCompare(bVal, "nb")
        : bVal.localeCompare(aVal, "nb");
    }
    return sortDir === "asc"
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number);
  });

  const totalCostYTD = suppliers.reduce((s, sup) => s + sup.costYTD, 0);
  const totalOutstanding = suppliers.reduce((s, sup) => s + sup.outstanding, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow)]">
          <p className="text-sm text-foreground-muted">Totale kostnader hittil i år</p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {formatCurrency(totalCostYTD)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow)]">
          <p className="text-sm text-foreground-muted">Utestående</p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {formatCurrency(totalOutstanding)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow)]">
          <p className="text-sm text-foreground-muted">Antall leverandører</p>
          <p className="mt-1 text-2xl font-bold text-foreground">
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
              <th className="px-4 py-3 text-left font-medium text-foreground-secondary">
                Kategori
              </th>
              <SortableHeader
                label="Kostnad hittil i år"
                sortKey="costYTD"
                currentKey={sortKey}
                direction={sortDir}
                onSort={toggleSort}
                align="right"
              />
              <SortableHeader
                label="Endring YoY"
                sortKey="changeYoY"
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
              <th className="px-4 py-3 text-left font-medium text-foreground-secondary">
                Neste forfall
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
                <td className="px-4 py-3 text-foreground-secondary">
                  {supplier.category}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {formatCurrency(supplier.costYTD)}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="inline-flex items-center gap-1">
                    {supplier.changeYoY > 0 ? (
                      <TrendingUp size={12} className="text-danger" />
                    ) : (
                      <TrendingDown size={12} className="text-success" />
                    )}
                    <span
                      className={`text-sm tabular-nums font-medium ${
                        supplier.changeYoY > 10
                          ? "text-danger"
                          : supplier.changeYoY > 0
                            ? "text-warning"
                            : "text-success"
                      }`}
                    >
                      {formatChange(supplier.changeYoY)}
                    </span>
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {supplier.outstanding > 0
                    ? formatCurrency(supplier.outstanding)
                    : "—"}
                </td>
                <td className="px-4 py-3 text-foreground-secondary">
                  {supplier.nextDueDate ? (
                    <span>
                      {formatDateShort(supplier.nextDueDate)}
                      {supplier.nextDueAmount && (
                        <span className="ml-1 text-xs text-foreground-muted">
                          ({formatCurrency(supplier.nextDueAmount)})
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-foreground-muted">&mdash;</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-surface-hover">
              <td className="px-4 py-3 font-semibold text-foreground">Totalt</td>
              <td />
              <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                {formatCurrency(totalCostYTD)}
              </td>
              <td />
              <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                {formatCurrency(totalOutstanding)}
              </td>
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
