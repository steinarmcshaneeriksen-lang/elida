"use client";

import { useState } from "react";
import { formatRelativeTime } from "@/lib/format";
import { companySettings } from "@/lib/mock-data";
import {
  GraduationCap,
  Briefcase,
  BarChart3,
  Link2,
  CheckCircle2,
  Building2,
  RefreshCw,
} from "lucide-react";

type KnowledgeLevel = "beginner" | "intermediate" | "expert";

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
    title: "Jeg vet lite om okonomi",
    description:
      "Elida forklarer alt i klarsprak, skjuler tekniske regnskapsdetaljer, og fokuserer pa de viktigste sporsmålene. Du far enkle svar uten okonomisk sjargong.",
  },
  {
    key: "intermediate",
    label: "Mellomniva",
    icon: Briefcase,
    title: "Jeg forstår grunnleggende okonomi",
    description:
      "Elida viser mer detaljert informasjon, inkludert nøkkeltall og trender. Du kan drille ned i kategorier og se sammenligninger mot tidligere perioder.",
  },
  {
    key: "expert",
    label: "Ekspert",
    icon: BarChart3,
    title: "Jeg er regnskapsekspert",
    description:
      "Full tilgang til alle data og analyser. Kontonummer, bilagsnummer, og detaljerte regnskapsrapporter er tilgjengelige. Elida gir tekniske forklaringer.",
  },
];

export default function InnstillingerPage() {
  const [level, setLevel] = useState<KnowledgeLevel>(
    companySettings.knowledgeLevel
  );
  const [payrollDate, setPayrollDate] = useState(
    String(companySettings.payrollDate)
  );
  const [taxZone, setTaxZone] = useState(companySettings.employerTaxZone);
  const [buffer, setBuffer] = useState(
    String(companySettings.minLiquidityBuffer)
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Knowledge level */}
      <section>
        <h2 className="mb-1 text-lg font-semibold text-foreground">
          Kunnskapsniva
        </h2>
        <p className="mb-4 text-sm text-foreground-muted">
          Velg ditt kunnskapsniva for å tilpasse hvordan Elida presenterer
          okonomisk informasjon.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {knowledgeLevels.map((kl) => {
            const Icon = kl.icon;
            const isSelected = level === kl.key;
            return (
              <button
                key={kl.key}
                onClick={() => setLevel(kl.key)}
                className={`flex flex-col rounded-xl border-2 p-5 text-left transition-all ${
                  isSelected
                    ? "border-primary bg-primary-50 shadow-[var(--shadow-md)]"
                    : "border-border bg-surface hover:border-primary-200 hover:shadow-[var(--shadow)]"
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

      {/* PowerOffice connection */}
      <section className="rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow)]">
        <div className="flex items-center gap-2 mb-4">
          <Link2 size={18} className="text-foreground-muted" />
          <h2 className="text-lg font-semibold text-foreground">
            PowerOffice Go-tilkobling
          </h2>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-surface-hover p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-light">
              <CheckCircle2 size={20} className="text-success" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Tilkoblet
              </p>
              <p className="text-xs text-foreground-muted">
                Sist synkronisert:{" "}
                {formatRelativeTime(companySettings.lastSync)}
              </p>
            </div>
          </div>
          <button className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground-secondary hover:bg-surface-hover">
            <RefreshCw size={14} />
            Synkroniser na
          </button>
        </div>
      </section>

      {/* Company settings */}
      <section className="rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow)]">
        <div className="flex items-center gap-2 mb-6">
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
                value={companySettings.name}
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
                value={companySettings.orgNumber}
                disabled
                className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-foreground-muted"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground-secondary">
                Lonnsdag
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
                Dag i måneden lonn utbetales
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
                <option>Sone 1 (14,1 %)</option>
                <option>Sone 1a (10,6 %)</option>
                <option>Sone 2 (10,6 %)</option>
                <option>Sone 3 (6,4 %)</option>
                <option>Sone 4 (5,1 %)</option>
                <option>Sone 4a (7,9 %)</option>
                <option>Sone 5 (0,0 %)</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground-secondary">
                Min. likviditetsbuffer
              </label>
              <input
                type="number"
                value={buffer}
                onChange={(e) => setBuffer(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <p className="mt-1 text-xs text-foreground-muted">
                Minimum banksaldo i kroner
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <button className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-light">
              Lagre endringer
            </button>
          </div>
        </div>
      </section>

      {/* Sync status */}
      <section className="rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow)]">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Synkroniseringsstatus
        </h2>
        <div className="space-y-3">
          {[
            { name: "Kontoplan", status: "ok", lastSync: "2026-08-12T09:47:00Z" },
            { name: "Bilag", status: "ok", lastSync: "2026-08-12T09:47:00Z" },
            { name: "Kunder", status: "ok", lastSync: "2026-08-12T09:45:00Z" },
            { name: "Leverandorer", status: "ok", lastSync: "2026-08-12T09:45:00Z" },
            { name: "Ansatte", status: "ok", lastSync: "2026-08-12T09:40:00Z" },
            { name: "Prosjekter", status: "ok", lastSync: "2026-08-12T09:40:00Z" },
          ].map((item) => (
            <div
              key={item.name}
              className="flex items-center justify-between rounded-lg border border-border-light px-4 py-2.5 hover:bg-surface-hover"
            >
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-success" />
                <span className="text-sm font-medium text-foreground">
                  {item.name}
                </span>
              </div>
              <span className="text-xs text-foreground-muted">
                {formatRelativeTime(item.lastSync)}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
