"use client";

import { useEffect, useState } from "react";
import { formatCurrency, formatDateNumeric } from "@/lib/format";
import { useCompanyData } from "@/lib/hooks/use-company-data";
import {
  NoDataState,
  LoadingState,
  ErrorState,
} from "@/components/dashboard/empty-state";
import { Search, Filter, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 25;

interface TransactionRow {
  id: string;
  date: string;
  account_number: string;
  account_name: string | null;
  amount: number;
  description: string | null;
  vat_code: string | null;
  project_name: string | null;
  department_name: string | null;
  voucher_number: number | null;
}

interface TransactionsResponse {
  transactions: TransactionRow[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

export default function TransaksjonerPage() {
  const [searchQuery, setSearchQuery] = useState("");
  // Debounced copy of searchQuery — avoids a request per keystroke.
  const [activeSearch, setActiveSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setActiveSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const query = new URLSearchParams({
    page: String(page),
    page_size: String(PAGE_SIZE),
  });
  if (activeSearch) query.set("text", activeSearch);

  const { data, isLoading, error } = useCompanyData<TransactionsResponse>(
    `transactions?${query}`
  );

  const transactions = data?.transactions ?? [];
  const total = data?.pagination.total ?? 0;
  const totalPages = data?.pagination.total_pages ?? 1;

  // An empty result with no active filter means nothing has been imported.
  if (!isLoading && !error && total === 0 && activeSearch === "") {
    return (
      <NoDataState
        title="Ingen transaksjoner ennå"
        description="Importer en SAF-T-fil fra regnskapssystemet ditt, så kan du søke i alle posteringene dine her."
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4 shadow-[var(--shadow)]">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-foreground-muted" />
          <span className="text-sm font-medium text-foreground-secondary">
            Filter:
          </span>
        </div>

        <div className="relative flex-1 sm:max-w-xs">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted"
          />
          <input
            type="text"
            placeholder="Søk i beskrivelse…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="text-sm text-primary hover:text-primary-light"
          >
            Nullstill
          </button>
        )}

        <span className="ml-auto text-xs text-foreground-muted">
          {total.toLocaleString("nb-NO")} transaksjoner
        </span>
      </div>

      {isLoading && <LoadingState label="Henter transaksjoner …" />}
      {!isLoading && error && <ErrorState message={error} />}

      {!isLoading && !error && (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-[var(--shadow)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-hover">
                  <th className="px-4 py-3 text-left font-medium text-foreground-secondary">
                    Dato
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-foreground-secondary">
                    Bilag
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-foreground-secondary">
                    Beskrivelse
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-foreground-secondary">
                    Konto
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-foreground-secondary">
                    Prosjekt
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-foreground-secondary">
                    Avdeling
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-foreground-secondary">
                    Beløp
                  </th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((txn) => (
                  <tr
                    key={txn.id}
                    className="border-b border-border-light last:border-b-0 hover:bg-surface-hover"
                  >
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-foreground-secondary">
                      {formatDateNumeric(txn.date)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-foreground-muted">
                      {txn.voucher_number ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">
                        {txn.description ?? "—"}
                      </p>
                      {txn.vat_code && (
                        <p className="text-xs text-foreground-muted">
                          MVA-kode {txn.vat_code}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-foreground-secondary">
                      <span className="text-xs text-foreground-muted">
                        {txn.account_number}
                      </span>{" "}
                      {txn.account_name ?? ""}
                    </td>
                    <td className="px-4 py-3 text-foreground-secondary">
                      {txn.project_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-foreground-secondary">
                      {txn.department_name ?? "—"}
                    </td>
                    <td
                      className={`whitespace-nowrap px-4 py-3 text-right tabular-nums font-medium ${
                        txn.amount >= 0 ? "text-success" : "text-danger"
                      }`}
                    >
                      {txn.amount >= 0 ? "+" : ""}
                      {formatCurrency(txn.amount)}
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-12 text-center text-sm text-foreground-muted"
                    >
                      Ingen transaksjoner funnet med gjeldende søk.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-foreground-muted">
                Viser {(page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, total)} av{" "}
                {total.toLocaleString("nb-NO")}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-foreground-secondary hover:bg-surface-hover disabled:opacity-40"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="px-2 text-sm text-foreground-secondary">
                  Side {page} av {totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-foreground-secondary hover:bg-surface-hover disabled:opacity-40"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
