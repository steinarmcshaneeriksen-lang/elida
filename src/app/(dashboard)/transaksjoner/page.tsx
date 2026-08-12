"use client";

import { useState, useMemo } from "react";
import { formatCurrency, formatDateNumeric } from "@/lib/format";
import { transactions, type Transaction } from "@/lib/mock-data";
import { Search, Filter, ChevronLeft, ChevronRight, Info } from "lucide-react";

const PAGE_SIZE = 10;

export default function TransaksjonerPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [page, setPage] = useState(1);

  const accounts = useMemo(
    () => [...new Set(transactions.map((t) => t.account))].sort(),
    []
  );

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      const matchesSearch =
        searchQuery === "" ||
        t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.supplier?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.customer?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.project?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesAccount =
        accountFilter === "" || t.account === accountFilter;

      return matchesSearch && matchesAccount;
    });
  }, [searchQuery, accountFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Beginner note */}
      <div className="flex items-start gap-3 rounded-lg border border-border bg-info-light p-4">
        <Info size={16} className="mt-0.5 shrink-0 text-info" />
        <p className="text-sm text-foreground-secondary">
          Denne visningen er tilgjengelig for brukere med mellomniva eller
          ekspertniva. For nybegynnere vises en forenklet oversikt pa
          hovedsiden.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4 shadow-[var(--shadow)]">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-foreground-muted" />
          <span className="text-sm font-medium text-foreground-secondary">
            Filter:
          </span>
        </div>

        {/* Text search */}
        <div className="relative flex-1 sm:max-w-xs">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted"
          />
          <input
            type="text"
            placeholder="Sok i beskrivelse, leverandor, kunde..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Account filter */}
        <select
          value={accountFilter}
          onChange={(e) => {
            setAccountFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        >
          <option value="">Alle kontoer</option>
          {accounts.map((acct) => (
            <option key={acct} value={acct}>
              {acct}
            </option>
          ))}
        </select>

        {/* Reset */}
        {(searchQuery || accountFilter) && (
          <button
            onClick={() => {
              setSearchQuery("");
              setAccountFilter("");
              setPage(1);
            }}
            className="text-sm text-primary hover:text-primary-light"
          >
            Nullstill
          </button>
        )}

        <span className="ml-auto text-xs text-foreground-muted">
          {filtered.length} transaksjoner
        </span>
      </div>

      {/* Transaction table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-[var(--shadow)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-hover">
              <th className="px-4 py-3 text-left font-medium text-foreground-secondary">
                Dato
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
                Belop
              </th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((txn) => (
              <tr
                key={txn.id}
                className="border-b border-border-light last:border-b-0 hover:bg-surface-hover"
              >
                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-foreground-secondary">
                  {formatDateNumeric(txn.date)}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">
                    {txn.description}
                  </p>
                  {(txn.supplier || txn.customer) && (
                    <p className="text-xs text-foreground-muted">
                      {txn.supplier || txn.customer}
                    </p>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-foreground-secondary">
                  <span className="text-xs text-foreground-muted">
                    {txn.accountNumber}
                  </span>{" "}
                  {txn.account}
                </td>
                <td className="px-4 py-3 text-foreground-secondary">
                  {txn.project || "—"}
                </td>
                <td className="px-4 py-3 text-foreground-secondary">
                  {txn.department || "—"}
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
            {paginated.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-sm text-foreground-muted"
                >
                  Ingen transaksjoner funnet med gjeldende filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-foreground-muted">
            Viser {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, filtered.length)} av{" "}
            {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-foreground-secondary hover:bg-surface-hover disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium ${
                  p === page
                    ? "bg-primary text-white"
                    : "border border-border text-foreground-secondary hover:bg-surface-hover"
                }`}
              >
                {p}
              </button>
            ))}
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
    </div>
  );
}
