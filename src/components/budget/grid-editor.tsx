"use client";

import { useCallback, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  Check,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Loader2,
  Percent,
  Plus,
  UserPlus,
} from "lucide-react";
import {
  MONTH_LONG,
  MONTH_SHORT,
  type BudgetDetail,
} from "./types";
import { AddCostDialog, AddEmployeeDialog } from "./add-dialogs";

const nokFormat = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });

function compact(n: number): string {
  if (n === 0) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toLocaleString("nb-NO", { maximumFractionDigits: 1 })}m`;
  if (abs >= 10_000) return `${Math.round(n / 1000)}k`;
  return nokFormat.format(n);
}

/**
 * The budget grid.
 *
 * Twelve months across, categories down, editable in place. Only the primary
 * categories are shown to begin with — an owner budgets in a handful of lines,
 * and the rest are a click away.
 *
 * Every change goes to the server as a named operation rather than a raw grid
 * write, so the rules that matter (an employer cost, a seasonal distribution)
 * are applied in one place and cannot drift between the grid and the chat.
 */
export function BudgetGridEditor({
  companyId,
  budgetId,
  initial,
  onChanged,
}: {
  companyId: string;
  budgetId: string;
  initial: BudgetDetail;
  onChanged: () => void;
}) {
  const [data, setData] = useState(initial);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ key: string; month: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [adjustPercent, setAdjustPercent] = useState("10");
  const [dialog, setDialog] = useState<"cost" | "employee" | null>(null);

  const approved = data.budget.status === "approved";

  const apply = useCallback(
    async (operation: Record<string, unknown>) => {
      if (busy || approved) return;
      setBusy(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/companies/${companyId}/budgets/${budgetId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(operation),
          }
        );

        const body = await res.json().catch(() => null);

        if (!res.ok) {
          setError(body?.error ?? "Kunne ikke lagre endringen");
          return;
        }

        setData((d) => ({
          ...d,
          grid: body.grid,
          result: body.result,
          cash: body.cash,
        }));
        onChanged();
      } catch {
        setError("Kunne ikke koble til.");
      } finally {
        setBusy(false);
      }
    },
    [busy, approved, companyId, budgetId, onChanged]
  );

  const categories = useMemo(
    () => data.categories.filter((c) => showAll || c.is_primary || hasValue(data.grid[c.key])),
    [data.categories, data.grid, showAll]
  );

  const revenueCategories = categories.filter((c) => c.kind === "revenue");
  const costCategories = categories.filter((c) => c.kind === "cost");

  const commitCell = () => {
    if (!editing) return;
    const amount = parseAmount(draft);
    setEditing(null);
    if (amount == null) return;
    if (data.grid[editing.key]?.[editing.month - 1] === amount) return;

    apply({
      operation: "set_cell",
      category_key: editing.key,
      month: editing.month,
      amount,
    });
  };

  const exportExcel = () => {
    const rows: Array<Array<string | number | null>> = [
      [data.budget.name],
      [`Budsjettår ${data.budget.year}`],
      [],
      ["Kategori", ...MONTH_LONG, "År"],
    ];

    for (const c of data.categories) {
      const line = data.grid[c.key] ?? [];
      rows.push([c.label, ...line, line.reduce((t, v) => t + v, 0)]);
    }

    rows.push([]);
    rows.push([
      "Driftsresultat",
      ...data.result.months.map((m) => m.operating_profit),
      data.result.annual.operating_profit,
    ]);
    rows.push([
      "Estimert likviditet",
      ...data.cash.months.map((m) => m.balance),
      data.cash.closing,
    ]);

    if (data.assumptions.length > 0) {
      rows.push([]);
      rows.push(["Forutsetninger"]);
      rows.push(["Type", "Navn", "Verdi", "Fra"]);
      for (const a of data.assumptions) {
        rows.push([a.type, a.name, a.value, a.effective_from]);
      }
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 30 }, ...new Array(13).fill({ wch: 12 })];
    XLSX.utils.book_append_sheet(wb, ws, "Budsjett");
    XLSX.writeFile(wb, `${data.budget.name.replace(/[^\w]+/g, "-").toLowerCase()}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {data.budget.name}
          </h2>
          <p className="mt-1 text-sm text-foreground-secondary">
            Budsjettår {data.budget.year}
            {approved && " · Godkjent og låst"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!approved && (
            <>
              <button
                onClick={() => setDialog("employee")}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground-secondary hover:bg-surface-hover hover:text-foreground"
              >
                <UserPlus size={15} />
                Legg til ansatt
              </button>
              <button
                onClick={() => setDialog("cost")}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground-secondary hover:bg-surface-hover hover:text-foreground"
              >
                <Plus size={15} />
                Legg til kostnad
              </button>
            </>
          )}
          <button
            onClick={exportExcel}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground-secondary hover:bg-surface-hover hover:text-foreground"
          >
            <FileSpreadsheet size={15} />
            Excel
          </button>
          {!approved && (
            <button
              onClick={() => apply({ operation: "set_status", status: "approved" })}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-light"
            >
              <Check size={15} />
              Godkjenn
            </button>
          )}
        </div>
      </div>

      <SummaryStrip data={data} />

      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-[var(--shadow)]">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-foreground-muted">
              <th className="sticky left-0 z-10 bg-surface px-4 py-2.5 text-left font-medium">
                Kategori
              </th>
              {MONTH_SHORT.map((m, i) => (
                <th
                  key={m}
                  className={`px-2 py-2.5 text-right font-medium ${
                    i < data.actual_months ? "text-foreground-secondary" : ""
                  }`}
                >
                  {m}
                  {i < data.actual_months && (
                    <span className="ml-1 text-[9px] uppercase">f</span>
                  )}
                </th>
              ))}
              <th className="px-4 py-2.5 text-right font-medium">År</th>
              <th className="px-2 py-2.5" />
            </tr>
          </thead>

          <tbody>
            <GroupHeader label="Inntekter" />
            {revenueCategories.map((c) => (
              <CategoryRow
                key={c.key}
                category={c}
                values={data.grid[c.key] ?? []}
                actuals={data.actuals[c.key] ?? []}
                actualMonths={data.actual_months}
                editable={!approved}
                editing={editing}
                draft={draft}
                onStartEdit={(month) => {
                  setEditing({ key: c.key, month });
                  setDraft(String(data.grid[c.key]?.[month - 1] ?? 0));
                }}
                onDraft={setDraft}
                onCommit={commitCell}
                onAdjust={() => setAdjusting(adjusting === c.key ? null : c.key)}
                adjusting={adjusting === c.key}
                adjustPercent={adjustPercent}
                onAdjustPercent={setAdjustPercent}
                onApplyAdjust={(mode) => {
                  const percent = Number(adjustPercent.replace(",", "."));
                  if (!Number.isFinite(percent)) return;
                  setAdjusting(null);
                  apply({
                    operation: mode === "monthly" ? "monthly_growth" : "adjust_percent",
                    category_key: c.key,
                    percent,
                  });
                }}
              />
            ))}

            <GroupHeader label="Kostnader" />
            {costCategories.map((c) => (
              <CategoryRow
                key={c.key}
                category={c}
                values={data.grid[c.key] ?? []}
                actuals={data.actuals[c.key] ?? []}
                actualMonths={data.actual_months}
                editable={!approved}
                editing={editing}
                draft={draft}
                onStartEdit={(month) => {
                  setEditing({ key: c.key, month });
                  setDraft(String(data.grid[c.key]?.[month - 1] ?? 0));
                }}
                onDraft={setDraft}
                onCommit={commitCell}
                onAdjust={() => setAdjusting(adjusting === c.key ? null : c.key)}
                adjusting={adjusting === c.key}
                adjustPercent={adjustPercent}
                onAdjustPercent={setAdjustPercent}
                onApplyAdjust={(mode) => {
                  const percent = Number(adjustPercent.replace(",", "."));
                  if (!Number.isFinite(percent)) return;
                  setAdjusting(null);
                  apply({
                    operation: mode === "monthly" ? "monthly_growth" : "adjust_percent",
                    category_key: c.key,
                    percent,
                  });
                }}
              />
            ))}

            <tr className="border-t border-border bg-surface-hover/40 font-semibold">
              <td className="sticky left-0 z-10 bg-surface-hover/40 px-4 py-2.5 text-foreground">
                Driftsresultat
              </td>
              {data.result.months.map((m) => (
                <td
                  key={m.month}
                  className={`px-2 py-2.5 text-right tabular-nums ${
                    m.operating_profit < 0 ? "text-danger" : "text-foreground"
                  }`}
                >
                  {compact(m.operating_profit)}
                </td>
              ))}
              <td
                className={`px-4 py-2.5 text-right tabular-nums ${
                  data.result.annual.operating_profit < 0 ? "text-danger" : "text-foreground"
                }`}
              >
                {compact(data.result.annual.operating_profit)}
              </td>
              <td />
            </tr>

            <tr className="border-t border-border-light">
              <td className="sticky left-0 z-10 bg-surface px-4 py-2.5 text-foreground-secondary">
                Estimert likviditet
              </td>
              {data.cash.months.map((m) => (
                <td
                  key={m.month}
                  className={`px-2 py-2.5 text-right tabular-nums ${
                    m.balance < 0 ? "text-danger" : "text-foreground-secondary"
                  }`}
                >
                  {compact(m.balance)}
                </td>
              ))}
              <td className="px-4 py-2.5 text-right tabular-nums text-foreground-secondary">
                {compact(data.cash.closing)}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => setShowAll(!showAll)}
          className="inline-flex items-center gap-1.5 text-sm text-foreground-secondary hover:text-foreground"
        >
          {showAll ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          {showAll ? "Vis bare hovedkategorier" : "Vis alle kategorier"}
        </button>

        <p className="text-xs text-foreground-muted">
          Måneder merket <span className="font-medium">f</span> har faktiske
          tall bokført. Likviditeten er et grovt estimat: inntekter regnes inn
          en måned etter fakturering, leverandørkostnader en halv måned etter,
          lønn i samme måned.
        </p>
      </div>

      {data.assumptions.length > 0 && (
        <section className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow)]">
          <h3 className="text-sm font-semibold text-foreground">Forutsetninger</h3>
          <div className="mt-3 space-y-2">
            {data.assumptions.map((a) => (
              <div key={a.id} className="flex items-baseline justify-between gap-4 text-sm">
                <span className="text-foreground">{a.name}</span>
                <span className="text-foreground-muted">
                  {a.effective_from ? `fra ${MONTH_LONG[Number(a.effective_from.slice(5, 7)) - 1]}` : ""}
                  {a.value != null ? ` · ${nokFormat.format(a.value)} kr` : ""}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {dialog === "cost" && (
        <AddCostDialog
          categories={data.categories.filter((c) => c.kind === "cost")}
          onClose={() => setDialog(null)}
          onSubmit={(input) => {
            setDialog(null);
            apply({ operation: "add_cost", ...input });
          }}
        />
      )}

      {dialog === "employee" && (
        <AddEmployeeDialog
          onClose={() => setDialog(null)}
          onSubmit={(input) => {
            setDialog(null);
            apply({ operation: "add_employee", ...input });
          }}
        />
      )}

      {busy && (
        <p className="flex items-center gap-2 text-sm text-foreground-muted">
          <Loader2 size={14} className="animate-spin" />
          Lagrer…
        </p>
      )}
    </div>
  );
}

function GroupHeader({ label }: { label: string }) {
  return (
    <tr className="border-b border-border-light">
      <td
        colSpan={15}
        className="sticky left-0 bg-surface px-4 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wide text-foreground-muted"
      >
        {label}
      </td>
    </tr>
  );
}

function CategoryRow({
  category,
  values,
  actuals,
  actualMonths,
  editable,
  editing,
  draft,
  onStartEdit,
  onDraft,
  onCommit,
  onAdjust,
  adjusting,
  adjustPercent,
  onAdjustPercent,
  onApplyAdjust,
}: {
  category: { key: string; label: string; kind: "revenue" | "cost" };
  values: number[];
  actuals: number[];
  actualMonths: number;
  editable: boolean;
  editing: { key: string; month: number } | null;
  draft: string;
  onStartEdit: (month: number) => void;
  onDraft: (value: string) => void;
  onCommit: () => void;
  onAdjust: () => void;
  adjusting: boolean;
  adjustPercent: string;
  onAdjustPercent: (value: string) => void;
  onApplyAdjust: (mode: "total" | "monthly") => void;
}) {
  const annual = values.reduce((t, v) => t + v, 0);

  return (
    <>
      <tr className="border-b border-border-light last:border-0">
        <td className="sticky left-0 z-10 bg-surface px-4 py-1.5 text-foreground">
          {category.label}
        </td>

        {Array.from({ length: 12 }, (_, i) => {
          const month = i + 1;
          const value = values[i] ?? 0;
          const actual = actuals[i] ?? 0;
          const isActual = month <= actualMonths;
          const isEditing = editing?.key === category.key && editing.month === month;

          return (
            <td key={month} className="px-1 py-1 text-right">
              {isEditing ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => onDraft(e.target.value)}
                  onBlur={onCommit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onCommit();
                    if (e.key === "Escape") onDraft(String(value));
                  }}
                  className="w-full rounded border border-primary bg-surface px-1.5 py-1 text-right text-sm tabular-nums text-foreground"
                />
              ) : (
                <button
                  disabled={!editable}
                  onClick={() => editable && onStartEdit(month)}
                  className={`w-full rounded px-1.5 py-1 text-right text-sm tabular-nums ${
                    editable ? "hover:bg-surface-hover" : "cursor-default"
                  } text-foreground`}
                  title={
                    isActual
                      ? `Faktisk: ${nokFormat.format(actual)} kr · Budsjett: ${nokFormat.format(value)} kr`
                      : undefined
                  }
                >
                  {compact(value)}
                  {isActual && actual !== 0 && (
                    // The actual figure beside the budgeted one. Whether it
                    // came out well was conveyed by green or red alone at 9px,
                    // which is unreadable to a colour-blind reader; the arrow
                    // says it without colour.
                    <span
                      className={`ml-1 text-[11px] font-medium ${
                        isFavourable(category.kind, actual, value)
                          ? "text-success"
                          : "text-danger"
                      }`}
                    >
                      {isFavourable(category.kind, actual, value) ? "▲" : "▼"}
                      {compact(actual)}
                    </span>
                  )}
                </button>
              )}
            </td>
          );
        })}

        <td className="px-4 py-1.5 text-right font-medium tabular-nums text-foreground">
          {compact(annual)}
        </td>

        <td className="px-1 py-1.5 text-right">
          {editable && (
            <button
              onClick={onAdjust}
              className="rounded p-1 text-foreground-muted hover:bg-surface-hover hover:text-foreground"
              title={`Juster ${category.label} med prosent`}
            >
              <Percent size={13} />
            </button>
          )}
        </td>
      </tr>

      {adjusting && (
        <tr className="border-b border-border-light bg-surface-hover/40">
          <td colSpan={15} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-foreground-secondary">
                Juster {category.label} med
              </span>
              <input
                value={adjustPercent}
                onChange={(e) => onAdjustPercent(e.target.value)}
                className="w-20 rounded-lg border border-border bg-surface px-2 py-1.5 text-right text-sm text-foreground"
              />
              <span className="text-sm text-foreground-secondary">%</span>
              <button
                onClick={() => onApplyAdjust("total")}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-light"
              >
                For hele året
              </button>
              <button
                onClick={() => onApplyAdjust("monthly")}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground-secondary hover:bg-surface-hover"
              >
                Per måned, kumulativt
              </button>
              <span className="text-xs text-foreground-muted">
                Sesongmønsteret beholdes.
              </span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function SummaryStrip({ data }: { data: BudgetDetail }) {
  const figures = [
    {
      label: "Budsjettert omsetning",
      value: `${nokFormat.format(data.result.annual.revenue)} kr`,
    },
    {
      label: "Budsjettert driftsresultat",
      value: `${nokFormat.format(data.result.annual.operating_profit)} kr`,
      detail:
        data.result.annual.margin != null
          ? `Margin ${data.result.annual.margin.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} %`
          : null,
    },
    {
      label: "Laveste estimerte likviditet",
      value: `${nokFormat.format(data.cash.lowest.balance)} kr`,
      detail: MONTH_LONG[data.cash.lowest.month - 1],
      negative: data.cash.lowest.balance < 0,
    },
    {
      label: "Likviditet ved årsslutt",
      value: `${nokFormat.format(data.cash.closing)} kr`,
      detail: `Fra ${nokFormat.format(data.cash.opening_balance)} kr`,
    },
  ];

  return (
    <div className="grid gap-4 rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow)] sm:grid-cols-2 lg:grid-cols-4">
      {figures.map((f) => (
        <div key={f.label}>
          <p className="text-xs text-foreground-muted">{f.label}</p>
          <p
            className={`mt-1 text-xl font-bold tracking-tight tabular-nums ${
              f.negative ? "text-danger" : "text-foreground"
            }`}
          >
            {f.value}
          </p>
          {f.detail && (
            <p className="mt-0.5 text-xs text-foreground-muted">{f.detail}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function hasValue(line: number[] | undefined): boolean {
  return (line ?? []).some((v) => v !== 0);
}

/** Above budget is good for revenue, below budget is good for a cost. */
function isFavourable(kind: "revenue" | "cost", actual: number, budget: number) {
  return kind === "revenue" ? actual >= budget : actual <= budget;
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(/ /g, "").replace(",", ".");
  const value = Number(cleaned);
  return Number.isFinite(value) ? Math.round(value) : null;
}
