"use client";

import { useCallback, useState } from "react";
import { useUser } from "@/lib/hooks/use-user";
import {
  refreshCompanyData,
  useCachedFetch,
  useCompanyData,
} from "@/lib/hooks/use-company-data";
import { ErrorState, LoadingState } from "@/components/dashboard/empty-state";
import { BudgetGridEditor } from "@/components/budget/grid-editor";
import { NewBudgetDialog } from "@/components/budget/new-budget-dialog";
import type { BudgetDetail } from "@/components/budget/types";
import { ArrowLeft, Copy, Plus } from "lucide-react";

interface BudgetRow {
  id: string;
  name: string;
  year: number;
  status: string;
  scenario: string;
  updated_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Utkast",
  approved: "Godkjent",
  archived: "Arkivert",
};

const SCENARIO_LABELS: Record<string, string> = {
  base: "Forventet",
  optimistic: "Optimistisk",
  cautious: "Forsiktig",
};

export default function BudsjettPage() {
  const { company } = useUser();
  const companyId = company?.id;

  const list = useCompanyData<{ budgets: BudgetRow[] }>("budgets");

  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copySource, setCopySource] = useState<BudgetRow | null>(null);

  const reload = useCallback(() => {
    refreshCompanyData();
  }, []);

  if (openId && companyId) {
    return (
      <BudgetDetailView
        companyId={companyId}
        budgetId={openId}
        onBack={() => {
          setOpenId(null);
          reload();
        }}
      />
    );
  }

  const budgets = list.data?.budgets ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Budsjett
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-foreground-secondary">
            Elida lager et førsteutkast fra det selskapet faktisk har gjort de
            siste tolv månedene, med sesongmønsteret intakt. Så justerer du.
          </p>
        </div>

        <button
          onClick={() => {
            setCopySource(null);
            setCreating(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-light"
        >
          <Plus size={16} />
          Nytt budsjett
        </button>
      </div>

      {list.isLoading && <LoadingState />}
      {list.error && <ErrorState message={list.error} />}

      {!list.isLoading && budgets.length === 0 && (
        <div className="rounded-xl border border-border bg-surface px-6 py-12 text-center">
          <p className="text-sm text-foreground-secondary">
            Du har ingen budsjetter ennå.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-light"
          >
            <Plus size={16} />
            Lag budsjett fra historikken
          </button>
        </div>
      )}

      {budgets.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-foreground-muted">
                <th className="px-5 py-2.5 font-medium">Budsjett</th>
                <th className="px-5 py-2.5 font-medium">År</th>
                <th className="px-5 py-2.5 font-medium">Scenario</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {budgets.map((b) => (
                <tr key={b.id} className="border-b border-border-light last:border-0">
                  <td className="px-5 py-3 font-medium text-foreground">{b.name}</td>
                  <td className="px-5 py-3 text-foreground-secondary">{b.year}</td>
                  <td className="px-5 py-3 text-foreground-secondary">
                    {SCENARIO_LABELS[b.scenario] ?? b.scenario}
                  </td>
                  <td className="px-5 py-3 text-foreground-muted">
                    {STATUS_LABELS[b.status] ?? b.status}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right">
                    <button
                      onClick={() => {
                        setCopySource(b);
                        setCreating(true);
                      }}
                      className="mr-4 inline-flex items-center gap-1 text-sm text-foreground-secondary hover:text-foreground"
                      title="Lag scenario basert på dette budsjettet"
                    >
                      <Copy size={14} />
                      Lag scenario
                    </button>
                    <button
                      onClick={() => setOpenId(b.id)}
                      className="text-sm font-medium text-primary hover:text-primary-light"
                    >
                      Åpne
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && companyId && (
        <NewBudgetDialog
          companyId={companyId}
          copyFrom={copySource}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            reload();
            setOpenId(id);
          }}
        />
      )}
    </div>
  );
}

function BudgetDetailView({
  companyId,
  budgetId,
  onBack,
}: {
  companyId: string;
  budgetId: string;
  onBack: () => void;
}) {
  // Read through the shared cache so returning to a budget is instant. The
  // editor keeps its own copy while editing and refreshes the cache after a
  // change, so the grid never flickers back to a stale value mid-edit.
  const { data, error } = useCachedFetch<BudgetDetail>(
    `/api/companies/${companyId}/budgets/${budgetId}`
  );

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-foreground-secondary hover:text-foreground"
      >
        <ArrowLeft size={16} />
        Tilbake til budsjetter
      </button>

      {error && <ErrorState message={error} />}
      {!error && !data && <LoadingState />}

      {data && (
        <BudgetGridEditor
          companyId={companyId}
          budgetId={budgetId}
          initial={data}
          onChanged={refreshCompanyData}
        />
      )}
    </div>
  );
}
