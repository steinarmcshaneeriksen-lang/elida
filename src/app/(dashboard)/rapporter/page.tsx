"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@/lib/hooks/use-user";
import { useCompanyData } from "@/lib/hooks/use-company-data";
import { ErrorState, LoadingState } from "@/components/dashboard/empty-state";
import { ReportView } from "@/components/reports/report-view";
import { downloadReportWorkbook } from "@/lib/reports/excel";
import type { ReportDataset } from "@/lib/reports/dataset";
import {
  REPORT_TYPES,
  SECTION_LABELS,
  defaultConfiguration,
  reportTypeByKey,
  type ReportConfiguration,
} from "@/lib/reports/types";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Printer,
  Settings2,
} from "lucide-react";

interface ReportRow {
  id: string;
  report_type: string;
  title: string;
  period_start: string;
  period_end: string;
  generated_at: string;
}

interface BudgetRow {
  id: string;
  name: string;
  year: number;
  status: string;
}

const COMPARISON_LABELS: Record<string, string> = {
  same_period_last_year: "Samme periode i fjor",
  previous_period: "Forrige periode",
  budget: "Budsjett",
  none: "Ingen sammenligning",
};

export default function RapporterPage() {
  const { company, profile } = useUser();
  const companyId = company?.id;

  const library = useCompanyData<{ reports: ReportRow[] }>("reports");
  const budgets = useCompanyData<{ budgets: BudgetRow[] }>("budgets");

  const [reportType, setReportType] = useState("board");
  const [range, setRange] = useState(() => defaultRange());
  const [config, setConfig] = useState<ReportConfiguration>(() =>
    defaultConfiguration("board")
  );
  const [showOptions, setShowOptions] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    dataset: ReportDataset;
    config: ReportConfiguration;
    title: string;
  } | null>(null);

  const chooseType = useCallback((key: string) => {
    setReportType(key);
    setConfig(defaultConfiguration(key));
  }, []);

  const generate = useCallback(async () => {
    if (!companyId || generating) return;

    setGenerating(true);
    setError(null);

    try {
      const res = await fetch(`/api/companies/${companyId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_type: reportType,
          period_start: range.start,
          period_end: range.end,
          configuration: config,
        }),
      });

      const body = await res.json().catch(() => null);

      if (!res.ok) {
        setError(
          body?.detail ? `${body.error}. ${body.detail}` : (body?.error ?? "Kunne ikke generere rapporten")
        );
        return;
      }

      setResult({
        dataset: body.dataset as ReportDataset,
        config: body.configuration as ReportConfiguration,
        title: body.title as string,
      });
    } catch {
      setError("Kunne ikke koble til. Sjekk nettforbindelsen.");
    } finally {
      setGenerating(false);
    }
  }, [companyId, generating, reportType, range, config]);

  const openSaved = useCallback(
    async (id: string) => {
      if (!companyId) return;
      setGenerating(true);
      setError(null);

      try {
        const res = await fetch(`/api/companies/${companyId}/reports/${id}`);
        const body = await res.json().catch(() => null);

        if (!res.ok) {
          setError(body?.error ?? "Kunne ikke hente rapporten");
          return;
        }

        setResult({
          dataset: body.dataset as ReportDataset,
          config: body.configuration as ReportConfiguration,
          title: body.title as string,
        });
      } finally {
        setGenerating(false);
      }
    },
    [companyId]
  );

  if (result) {
    return (
      <ReportResult
        title={result.title}
        dataset={result.dataset}
        config={result.config}
        generatedBy={profile?.full_name ?? null}
        onBack={() => setResult(null)}
      />
    );
  }

  const type = reportTypeByKey(reportType);
  const budgetList = budgets.data?.budgets ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Rapporter
        </h2>
        <p className="mt-1 text-sm text-foreground-secondary">
          Velg hva rapporten skal dekke, så setter Elida den sammen fra
          regnskapet. Den er klar til å sendes videre.
        </p>
      </div>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-foreground">Rapporttype</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {REPORT_TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => chooseType(t.key)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                reportType === t.key
                  ? "border-primary bg-primary-50"
                  : "border-border bg-surface hover:bg-surface-hover"
              }`}
            >
              <p className="text-sm font-semibold text-foreground">{t.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-foreground-secondary">
                {t.description}
              </p>
              <p className="mt-2 text-[11px] text-foreground-muted">{t.useCase}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow)]">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Periode">
            <select
              value={presetFor(range)}
              onChange={(e) => setRange(rangeForPreset(e.target.value, range))}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            >
              <option value="this_month">Denne måneden</option>
              <option value="last_month">Forrige måned</option>
              <option value="this_quarter">Dette kvartalet</option>
              <option value="last_quarter">Forrige kvartal</option>
              <option value="ytd">Hittil i år</option>
              <option value="last_year">I fjor</option>
              <option value="rolling_12">Siste 12 måneder</option>
              <option value="custom">Egendefinert</option>
            </select>
          </Field>

          <Field label="Fra">
            <input
              type="date"
              value={range.start}
              onChange={(e) => setRange({ ...range, start: e.target.value })}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            />
          </Field>

          <Field label="Til">
            <input
              type="date"
              value={range.end}
              onChange={(e) => setRange({ ...range, end: e.target.value })}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            />
          </Field>

          <Field label="Sammenlign med">
            <select
              value={config.comparison}
              onChange={(e) =>
                setConfig({
                  ...config,
                  comparison: e.target.value as ReportConfiguration["comparison"],
                })
              }
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            >
              {Object.entries(COMPARISON_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {budgetList.length > 0 && (
          <div className="mt-4 max-w-xs">
            <Field label="Budsjett å måle mot">
              <select
                value={config.budgetId ?? ""}
                onChange={(e) =>
                  setConfig({ ...config, budgetId: e.target.value || null })
                }
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              >
                <option value="">Uten budsjett</option>
                {budgetList.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        <button
          onClick={() => setShowOptions(!showOptions)}
          className="mt-4 flex items-center gap-1.5 text-sm text-foreground-secondary hover:text-foreground"
        >
          <Settings2 size={15} />
          Innhold og utseende
          {showOptions ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>

        {showOptions && (
          <ReportOptions
            config={config}
            onChange={setConfig}
            availableSections={type.sections}
          />
        )}

        {error && (
          <p className="mt-4 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={generate}
            disabled={generating || !companyId}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-light disabled:opacity-50"
          >
            {generating ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <FileText size={16} />
            )}
            Generer rapport
          </button>
          <span className="text-xs text-foreground-muted">
            {type.title} · {range.start} til {range.end}
          </span>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          Tidligere rapporter
        </h3>

        {library.isLoading && <LoadingState />}
        {library.error && <ErrorState message={library.error} />}

        {!library.isLoading && (library.data?.reports.length ?? 0) === 0 && (
          <p className="rounded-xl border border-border bg-surface px-5 py-8 text-center text-sm text-foreground-muted">
            Ingen rapporter er generert ennå.
          </p>
        )}

        {(library.data?.reports.length ?? 0) > 0 && (
          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-foreground-muted">
                  <th className="px-5 py-2.5 font-medium">Rapport</th>
                  <th className="px-5 py-2.5 font-medium">Periode</th>
                  <th className="px-5 py-2.5 font-medium">Generert</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {library.data!.reports.map((r) => (
                  <tr key={r.id} className="border-b border-border-light last:border-0">
                    <td className="px-5 py-3 text-foreground">{r.title}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-foreground-secondary">
                      {r.period_start} – {r.period_end}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-foreground-muted">
                      {r.generated_at.slice(0, 10)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => openSaved(r.id)}
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
      </section>

      <p className="text-sm text-foreground-muted">
        Budsjettet ligger under{" "}
        <Link href="/budsjett" className="text-primary hover:text-primary-light">
          Budsjett
        </Link>
        .
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result view
// ---------------------------------------------------------------------------

function ReportResult({
  title,
  dataset,
  config,
  generatedBy,
  onBack,
}: {
  title: string;
  dataset: ReportDataset;
  config: ReportConfiguration;
  generatedBy: string | null;
  onBack: () => void;
}) {
  const stale =
    dataset.data_quality.days_since_last_posting != null &&
    dataset.data_quality.days_since_last_posting > 14;

  return (
    <div className="mx-auto max-w-[230mm]">
      {/* The toolbar belongs to the application, not the document, so it is
          hidden when the page is printed. */}
      <div className="report-hide-in-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-foreground-secondary hover:text-foreground"
        >
          <ArrowLeft size={16} />
          Tilbake til rapporter
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-white hover:bg-primary-light"
          >
            <Printer size={15} />
            Last ned PDF
          </button>
          <button
            onClick={() =>
              downloadReportWorkbook(dataset, `${slug(title)}.xlsx`)
            }
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-medium text-foreground-secondary hover:bg-surface-hover hover:text-foreground"
          >
            <FileSpreadsheet size={15} />
            Excel
          </button>
        </div>
      </div>

      {stale && (
        <div className="report-hide-in-print mb-6 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm text-foreground-secondary">
          Det er {dataset.data_quality.days_since_last_posting} dager siden det
          sist ble bokført transaksjoner. Rapporten kan være ufullstendig.
        </div>
      )}

      <div className="report-hide-in-print mb-4 text-xs text-foreground-muted">
        <Download size={12} className="mr-1 inline" />
        «Last ned PDF» åpner utskriftsdialogen. Velg «Lagre som PDF» som
        skriver, så får du filen slik den vises her.
      </div>

      <ReportView data={dataset} config={config} generatedBy={generatedBy} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

function ReportOptions({
  config,
  onChange,
  availableSections,
}: {
  config: ReportConfiguration;
  onChange: (c: ReportConfiguration) => void;
  availableSections: string[];
}) {
  const sections = useMemo(() => {
    // Sections belonging to this report type first, in their intended order,
    // then everything else so a custom report can reach all of them.
    const rest = Object.keys(SECTION_LABELS).filter(
      (s) => !availableSections.includes(s)
    );
    return [...availableSections, ...rest];
  }, [availableSections]);

  const toggle = (key: string) => {
    const next = config.sections.includes(key)
      ? config.sections.filter((s) => s !== key)
      : [...config.sections, key];
    // Keep the canonical order rather than order of clicking.
    onChange({ ...config, sections: sections.filter((s) => next.includes(s)) });
  };

  const move = (key: string, delta: number) => {
    const order = [...config.sections];
    const index = order.indexOf(key);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    onChange({ ...config, sections: order });
  };

  return (
    <div className="mt-4 space-y-5 border-t border-border pt-4">
      <div>
        <p className="mb-2 text-xs font-medium text-foreground-secondary">
          Seksjoner
        </p>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((key) => {
            const selected = config.sections.includes(key);
            return (
              <div key={key} className="flex items-center gap-1">
                <label className="flex flex-1 items-center gap-2 text-sm text-foreground-secondary">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggle(key)}
                    className="h-4 w-4 rounded border-border accent-[var(--primary)]"
                  />
                  {SECTION_LABELS[key]}
                </label>
                {selected && (
                  <span className="flex">
                    <button
                      onClick={() => move(key, -1)}
                      className="rounded p-0.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground"
                      aria-label={`Flytt ${SECTION_LABELS[key]} opp`}
                    >
                      <ChevronUp size={13} />
                    </button>
                    <button
                      onClick={() => move(key, 1)}
                      className="rounded p-0.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground"
                      aria-label={`Flytt ${SECTION_LABELS[key]} ned`}
                    >
                      <ChevronDown size={13} />
                    </button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Undertittel på forsiden">
          <input
            type="text"
            value={config.subtitle ?? ""}
            onChange={(e) => onChange({ ...config, subtitle: e.target.value || null })}
            placeholder="Valgfritt"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
        </Field>

        <Field label="Merking">
          <input
            type="text"
            value={config.branding.confidentiality ?? ""}
            onChange={(e) =>
              onChange({
                ...config,
                branding: {
                  ...config.branding,
                  confidentiality: e.target.value || null,
                },
              })
            }
            placeholder="Konfidensielt"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
        </Field>
      </div>

      <Field label="Ledelsens kommentar">
        <textarea
          value={config.managementComment}
          onChange={(e) => onChange({ ...config, managementComment: e.target.value })}
          rows={3}
          placeholder="Din egen kommentar. Vises som et eget avsnitt, atskilt fra Elidas analyse."
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
        />
      </Field>

      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-sm text-foreground-secondary">
          <input
            type="checkbox"
            checked={config.branding.useCompanyBranding}
            onChange={(e) =>
              onChange({
                ...config,
                branding: { ...config.branding, useCompanyBranding: e.target.checked },
              })
            }
            className="h-4 w-4 rounded border-border accent-[var(--primary)]"
          />
          Bruk firmanavnet på forsiden
        </label>

        <label className="flex items-center gap-2 text-sm text-foreground-secondary">
          <input
            type="checkbox"
            checked={config.branding.showElidaCredit}
            onChange={(e) =>
              onChange({
                ...config,
                branding: { ...config.branding, showElidaCredit: e.target.checked },
              })
            }
            className="h-4 w-4 rounded border-border accent-[var(--primary)]"
          />
          Vis «Generert med Elida»
        </label>
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

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

interface Range {
  start: string;
  end: string;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function defaultRange(): Range {
  const now = new Date();
  return {
    start: `${now.getFullYear()}-01-01`,
    end: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

function rangeForPreset(preset: string, current: Range): Range {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (preset) {
    case "this_month":
      return { start: iso(new Date(y, m, 1)), end: iso(new Date(y, m + 1, 0)) };
    case "last_month":
      return { start: iso(new Date(y, m - 1, 1)), end: iso(new Date(y, m, 0)) };
    case "this_quarter": {
      const q = Math.floor(m / 3) * 3;
      return { start: iso(new Date(y, q, 1)), end: iso(new Date(y, q + 3, 0)) };
    }
    case "last_quarter": {
      const q = Math.floor(m / 3) * 3 - 3;
      return { start: iso(new Date(y, q, 1)), end: iso(new Date(y, q + 3, 0)) };
    }
    case "ytd":
      return { start: `${y}-01-01`, end: iso(new Date(y, m + 1, 0)) };
    case "last_year":
      return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` };
    case "rolling_12":
      return { start: iso(new Date(y, m - 11, 1)), end: iso(new Date(y, m + 1, 0)) };
    default:
      return current;
  }
}

/** Which preset the current range corresponds to, so the select stays honest. */
function presetFor(range: Range): string {
  for (const preset of [
    "this_month",
    "last_month",
    "this_quarter",
    "last_quarter",
    "ytd",
    "last_year",
    "rolling_12",
  ]) {
    const candidate = rangeForPreset(preset, range);
    if (candidate.start === range.start && candidate.end === range.end) {
      return preset;
    }
  }
  return "custom";
}

function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[æå]/g, "a")
    .replace(/ø/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
