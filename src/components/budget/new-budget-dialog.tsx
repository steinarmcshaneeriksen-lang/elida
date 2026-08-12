"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";

/**
 * Creating a budget is two decisions — which year, and what to start from —
 * and the default answer to the second is "the last twelve months", because
 * that is the one that produces a usable draft rather than an empty grid.
 */
export function NewBudgetDialog({
  companyId,
  copyFrom,
  onClose,
  onCreated,
}: {
  companyId: string;
  copyFrom: { id: string; name: string; year: number } | null;
  onClose: () => void;
  onCreated: (budgetId: string) => void;
}) {
  const nextYear = new Date().getFullYear() + 1;

  const [year, setYear] = useState(copyFrom?.year ?? nextYear);
  const [name, setName] = useState(
    copyFrom ? `${copyFrom.name}, forsiktig` : `Budsjett ${nextYear}`
  );
  const [basedOn, setBasedOn] = useState("last_12_months");
  const [scenario, setScenario] = useState(copyFrom ? "cautious" : "base");
  const [revenueGrowth, setRevenueGrowth] = useState(copyFrom ? -15 : 10);
  const [costGrowth, setCostGrowth] = useState(copyFrom ? 0 : 5);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch(`/api/companies/${companyId}/budgets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          year,
          based_on: basedOn,
          scenario,
          revenue_growth_percent: revenueGrowth,
          cost_growth_percent: costGrowth,
          copy_from_budget_id: copyFrom?.id,
        }),
      });

      const body = await res.json().catch(() => null);

      if (!res.ok) {
        setError(body?.error ?? "Kunne ikke opprette budsjettet");
        return;
      }

      onCreated(body.budget.id as string);
    } catch {
      setError("Kunne ikke koble til.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-lg">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold text-foreground">
            {copyFrom ? "Lag scenario" : "Nytt budsjett"}
          </h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-foreground-muted hover:bg-surface-hover hover:text-foreground"
            aria-label="Lukk"
          >
            <X size={18} />
          </button>
        </div>

        {copyFrom && (
          <p className="mt-1 text-sm text-foreground-secondary">
            Kopierer «{copyFrom.name}» og justerer tallene.
          </p>
        )}

        <div className="mt-5 space-y-4">
          <Field label="Navn">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Budsjettår">
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              />
            </Field>

            <Field label="Scenario">
              <select
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              >
                <option value="base">Forventet</option>
                <option value="optimistic">Optimistisk</option>
                <option value="cautious">Forsiktig</option>
              </select>
            </Field>
          </div>

          {!copyFrom && (
            <Field label="Basert på">
              <select
                value={basedOn}
                onChange={(e) => setBasedOn(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              >
                <option value="last_12_months">Siste 12 måneder (anbefalt)</option>
                <option value="previous_year">Fjoråret</option>
                <option value="empty">Tomt budsjett</option>
              </select>
            </Field>
          )}

          {basedOn !== "empty" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Juster inntekter">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={revenueGrowth}
                    onChange={(e) => setRevenueGrowth(Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                  />
                  <span className="text-sm text-foreground-muted">%</span>
                </div>
              </Field>

              <Field label="Juster kostnader">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={costGrowth}
                    onChange={(e) => setCostGrowth(Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                  />
                  <span className="text-sm text-foreground-muted">%</span>
                </div>
              </Field>
            </div>
          )}

          <p className="text-xs leading-relaxed text-foreground-muted">
            Sesongmønsteret beholdes: en rolig januar og en travel november blir
            liggende når totalen justeres. Alt kan endres etterpå.
          </p>

          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-foreground-secondary hover:bg-surface-hover"
          >
            Avbryt
          </button>
          <button
            onClick={create}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light disabled:opacity-50"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            Opprett
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-foreground-secondary">
        {label}
      </span>
      {children}
    </label>
  );
}
