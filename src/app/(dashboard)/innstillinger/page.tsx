"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatRelativeTime } from "@/lib/format";
import { useUser } from "@/lib/hooks/use-user";
import { LoadingState, ErrorState } from "@/components/dashboard/empty-state";
import {
  GraduationCap,
  Briefcase,
  BarChart3,
  Link2,
  Building2,
  Database,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  Upload,
} from "lucide-react";

type KnowledgeLevel = "beginner" | "intermediate" | "advanced";

const knowledgeLevels: {
  key: KnowledgeLevel;
  label: string;
  icon: typeof GraduationCap;
  title: string;
  description: string;
}[] = [
  {
    key: "beginner",
    label: "Nybegynner",
    icon: GraduationCap,
    title: "Jeg vet lite om økonomi",
    description:
      "Elida forklarer alt i klarspråk, skjuler tekniske regnskapsdetaljer, og fokuserer på de viktigste spørsmålene. Du får enkle svar uten økonomisk sjargong.",
  },
  {
    key: "intermediate",
    label: "Mellomnivå",
    icon: Briefcase,
    title: "Jeg forstår grunnleggende økonomi",
    description:
      "Elida viser mer detaljert informasjon, inkludert nøkkeltall og trender. Du kan drille ned i kategorier og se sammenligninger mot tidligere perioder.",
  },
  {
    key: "advanced",
    label: "Ekspert",
    icon: BarChart3,
    title: "Jeg er regnskapsekspert",
    description:
      "Full tilgang til alle data og analyser. Kontonummer, bilagsnummer, og detaljerte regnskapsrapporter er tilgjengelige. Elida gir tekniske forklaringer.",
  },
];

const TAX_ZONES = [
  "Sone 1 (14,1 %)",
  "Sone 1a (10,6 %)",
  "Sone 2 (10,6 %)",
  "Sone 3 (6,4 %)",
  "Sone 4 (5,1 %)",
  "Sone 4a (7,9 %)",
  "Sone 5 (0,0 %)",
];

interface SettingsResponse {
  company: {
    name: string;
    org_number: string | null;
    normal_payroll_date: number | null;
    employer_tax_zone: string | null;
    min_liquidity_buffer: number | null;
  } | null;
  accounting_knowledge_level: string;
  data_status: Array<{ label: string; count: number }>;
  last_import: { started_at: string; file_name: string | null } | null;
  integration: { provider: string; is_active: boolean } | null;
}

export default function InnstillingerPage() {
  const { company } = useUser();
  const companyId = company?.id;

  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [level, setLevel] = useState<KnowledgeLevel>("intermediate");
  const [payrollDate, setPayrollDate] = useState("");
  const [taxZone, setTaxZone] = useState("");
  const [buffer, setBuffer] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/companies/${companyId}/settings`);
        if (cancelled) return;

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setLoadError(body?.error ?? "Kunne ikke hente innstillinger");
          return;
        }

        const data = (await res.json()) as SettingsResponse;
        if (cancelled) return;

        setSettings(data);
        setLevel(data.accounting_knowledge_level as KnowledgeLevel);
        setPayrollDate(
          data.company?.normal_payroll_date != null
            ? String(data.company.normal_payroll_date)
            : ""
        );
        setTaxZone(data.company?.employer_tax_zone ?? "");
        setBuffer(
          data.company?.min_liquidity_buffer != null
            ? String(data.company.min_liquidity_buffer)
            : ""
        );
      } catch {
        if (!cancelled) setLoadError("Kunne ikke koble til.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const handleSave = async () => {
    if (!companyId || isSaving) return;

    setIsSaving(true);
    setSaveMessage(null);
    setSaveError(null);

    try {
      const res = await fetch(`/api/companies/${companyId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accounting_knowledge_level: level,
          normal_payroll_date: payrollDate ? Number(payrollDate) : null,
          employer_tax_zone: taxZone || null,
          min_liquidity_buffer: buffer ? Number(buffer) : null,
        }),
      });

      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setSaveError(body?.error ?? "Kunne ikke lagre");
        return;
      }

      setSaveMessage("Endringene er lagret.");
    } catch {
      setSaveError("Kunne ikke koble til. Prøv igjen.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <LoadingState label="Henter innstillinger …" />;
  if (loadError) return <ErrorState message={loadError} />;

  const hasAnyData =
    settings?.data_status.some((d) => d.count > 0) ?? false;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <section>
        <h2 className="mb-1 text-lg font-semibold text-foreground">
          Kunnskapsnivå
        </h2>
        <p className="mb-4 text-sm text-foreground-muted">
          Velg ditt kunnskapsnivå for å tilpasse hvordan Elida presenterer
          økonomisk informasjon.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {knowledgeLevels.map((kl) => {
            const Icon = kl.icon;
            const isSelected = level === kl.key;
            return (
              <button
                key={kl.key}
                onClick={() => setLevel(kl.key)}
                className={`flex flex-col rounded-xl border p-5 text-left transition-all ${
                  isSelected
                    ? "border-border bg-primary-50 shadow-[var(--shadow-md)]"
                    : "border-border bg-surface hover:shadow-[var(--shadow)]"
                }`}
              >
                <div className="mb-3 flex items-center gap-2">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                      isSelected
                        ? "bg-primary text-white"
                        : "bg-surface-hover text-foreground-muted"
                    }`}
                  >
                    <Icon size={18} />
                  </div>
                  <span
                    className={`text-sm font-semibold ${
                      isSelected ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {kl.label}
                  </span>
                </div>
                <p className="mb-2 text-sm font-medium text-foreground">
                  {kl.title}
                </p>
                <p className="text-xs leading-relaxed text-foreground-secondary">
                  {kl.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Data sources */}
      <section className="rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow)]">
        <div className="mb-4 flex items-center gap-2">
          <Database size={18} className="text-foreground-muted" />
          <h2 className="text-lg font-semibold text-foreground">Datakilder</h2>
        </div>

        <div className="mb-5 flex items-center justify-between rounded-lg bg-surface-hover p-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                hasAnyData ? "bg-success-light" : "bg-warning-light"
              }`}
            >
              {hasAnyData ? (
                <CheckCircle2 size={20} className="text-success" />
              ) : (
                <AlertCircle size={20} className="text-warning" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {hasAnyData ? "Regnskapsdata importert" : "Ingen data ennå"}
              </p>
              <p className="text-xs text-foreground-muted">
                {settings?.last_import
                  ? `Sist importert ${formatRelativeTime(settings.last_import.started_at)}${
                      settings.last_import.file_name
                        ? ` — ${settings.last_import.file_name}`
                        : ""
                    }`
                  : "Last opp en SAF-T-fil for å komme i gang"}
              </p>
            </div>
          </div>
          <Link
            href="/import"
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground-secondary hover:bg-surface-hover"
          >
            <Upload size={14} />
            Importer
          </Link>
        </div>

        <div className="space-y-2">
          {(settings?.data_status ?? []).map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between rounded-lg border border-border-light px-4 py-2.5"
            >
              <div className="flex items-center gap-2">
                <div
                  className={`h-2 w-2 rounded-full ${
                    item.count > 0 ? "bg-success" : "bg-foreground-muted"
                  }`}
                />
                <span className="text-sm font-medium text-foreground">
                  {item.label}
                </span>
              </div>
              <span className="text-xs tabular-nums text-foreground-muted">
                {item.count > 0
                  ? `${item.count.toLocaleString("nb-NO")} rader`
                  : "Ingen data"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <PrivacySection companyId={companyId} />

      {/* Integration status */}
      <section className="rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow)]">
        <div className="mb-4 flex items-center gap-2">
          <Link2 size={18} className="text-foreground-muted" />
          <h2 className="text-lg font-semibold text-foreground">
            Regnskapsintegrasjon
          </h2>
        </div>

        <div className="rounded-lg bg-surface-hover p-4">
          {settings?.integration ? (
            <div className="flex items-center gap-3">
              <CheckCircle2 size={20} className="text-success" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Tilkoblet {settings.integration.provider}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <AlertCircle size={20} className="mt-0.5 shrink-0 text-warning" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Ingen integrasjon tilkoblet
                </p>
                <p className="mt-1 text-sm text-foreground-secondary">
                  Direkte integrasjon mot regnskapssystem er ikke satt opp
                  ennå. Inntil videre importerer du data ved å laste opp en
                  SAF-T-fil.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Company settings */}
      <section className="rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow)]">
        <div className="mb-6 flex items-center gap-2">
          <Building2 size={18} className="text-foreground-muted" />
          <h2 className="text-lg font-semibold text-foreground">
            Bedriftsinnstillinger
          </h2>
        </div>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground-secondary">
                Bedriftsnavn
              </label>
              <input
                type="text"
                value={settings?.company?.name ?? ""}
                disabled
                className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-foreground-muted"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground-secondary">
                Organisasjonsnummer
              </label>
              <input
                type="text"
                value={settings?.company?.org_number ?? "—"}
                disabled
                className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-foreground-muted"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground-secondary">
                Lønnsdag
              </label>
              <input
                type="number"
                min="1"
                max="31"
                value={payrollDate}
                onChange={(e) => setPayrollDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <p className="mt-1 text-xs text-foreground-muted">
                Dag i måneden lønn utbetales
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground-secondary">
                Arbeidsgiveravgift-sone
              </label>
              <select
                value={taxZone}
                onChange={(e) => setTaxZone(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">Ikke valgt</option>
                {TAX_ZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground-secondary">
                Min. likviditetsbuffer
              </label>
              <input
                type="number"
                min="0"
                value={buffer}
                onChange={(e) => setBuffer(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <p className="mt-1 text-xs text-foreground-muted">
                Minimum banksaldo i kroner
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            {saveMessage && (
              <span className="text-sm text-success">{saveMessage}</span>
            )}
            {saveError && (
              <span className="text-sm text-danger">{saveError}</span>
            )}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-light disabled:opacity-50"
            >
              {isSaving ? "Lagrer …" : "Lagre endringer"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

interface FlaggedSupplier {
  id: string;
  name: string;
  supplier_number: string | null;
  is_anonymised: boolean;
}

/**
 * Employees registered as suppliers for expense reimbursement carry personal
 * names. They are flagged on import so they can be anonymised here.
 */
function PrivacySection({ companyId }: { companyId: string | undefined }) {
  const [suppliers, setSuppliers] = useState<FlaggedSupplier[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [version, setVersion] = useState(0);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          `/api/companies/${companyId}/suppliers/privacy`
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setSuppliers(data.suppliers ?? []);
      } catch {
        // Section is supplementary; stay silent if it cannot load.
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [companyId, version]);

  const pending = suppliers.filter((s) => !s.is_anonymised);
  if (!companyId || pending.length === 0) return null;

  const anonymise = async () => {
    if (selected.size === 0 || isWorking) return;
    setIsWorking(true);
    try {
      await fetch(`/api/companies/${companyId}/suppliers/privacy`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplier_ids: [...selected] }),
      });
      setSelected(new Set());
      setVersion((v) => v + 1);
    } finally {
      setIsWorking(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section className="rounded-xl border border-warning/40 bg-surface p-6 shadow-[var(--shadow)]">
      <div className="mb-2 flex items-center gap-2">
        <ShieldAlert size={18} className="text-warning" />
        <h2 className="text-lg font-semibold text-foreground">
          Mulige privatpersoner
        </h2>
      </div>
      <p className="mb-4 text-sm text-foreground-secondary">
        Disse leverandørene mangler gyldig organisasjonsnummer og kan være
        ansatte registrert for utleggsrefusjon. Anonymisering erstatter navn,
        e-post, telefon og adresse. Posteringene og beløpene beholdes.
      </p>

      <div className="space-y-1.5">
        {pending.map((s) => (
          <label
            key={s.id}
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-border-light px-4 py-2.5 hover:bg-surface-hover"
          >
            <input
              type="checkbox"
              checked={selected.has(s.id)}
              onChange={() => toggle(s.id)}
              className="h-4 w-4 rounded border-border"
            />
            <span className="flex-1 text-sm text-foreground">{s.name}</span>
            {s.supplier_number && (
              <span className="text-xs text-foreground-muted">
                nr. {s.supplier_number}
              </span>
            )}
          </label>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={() =>
            setSelected(
              selected.size === pending.length
                ? new Set()
                : new Set(pending.map((s) => s.id))
            )
          }
          className="text-sm text-primary hover:text-primary-light"
        >
          {selected.size === pending.length ? "Fjern alle" : "Velg alle"}
        </button>
        <button
          onClick={anonymise}
          disabled={selected.size === 0 || isWorking}
          className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-light disabled:opacity-40"
        >
          {isWorking
            ? "Anonymiserer …"
            : `Anonymiser ${selected.size > 0 ? `(${selected.size})` : ""}`}
        </button>
      </div>
    </section>
  );
}
