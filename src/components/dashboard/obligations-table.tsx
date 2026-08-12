"use client";

import { formatCurrency, formatDateShort } from "@/lib/format";
import type { Obligation } from "@/lib/mock-data";

interface ObligationsTableProps {
  obligations: Obligation[];
}

export function ObligationsTable({ obligations }: ObligationsTableProps) {
  const total = obligations.reduce((sum, o) => sum + o.amount, 0);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-[var(--shadow)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-hover">
            <th className="px-4 py-3 text-left font-medium text-foreground-secondary">
              Hendelse
            </th>
            <th className="px-4 py-3 text-right font-medium text-foreground-secondary">
              Belop
            </th>
            <th className="px-4 py-3 text-left font-medium text-foreground-secondary">
              Forventet dato
            </th>
            <th className="px-4 py-3 text-left font-medium text-foreground-secondary">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {obligations.map((obligation) => (
            <tr
              key={obligation.id}
              className="border-b border-border-light last:border-b-0 hover:bg-surface-hover"
            >
              <td className="px-4 py-3 font-medium text-foreground">
                {obligation.event}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-foreground">
                {formatCurrency(obligation.amount)}
              </td>
              <td className="px-4 py-3 text-foreground-secondary">
                {formatDateShort(obligation.expectedDate)}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={obligation.status} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-surface-hover">
            <td className="px-4 py-3 font-semibold text-foreground">Totalt</td>
            <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
              {formatCurrency(total)}
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isEstimated = status === "Estimert";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        isEstimated
          ? "bg-warning-light text-warning"
          : "bg-success-light text-success"
      }`}
    >
      {isEstimated ? "Estimert" : "Bokfort"}
    </span>
  );
}
