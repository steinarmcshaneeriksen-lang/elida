"use client";

import { formatCurrency } from "@/lib/format";
import { useCompanyData } from "@/lib/hooks/use-company-data";
import {
  NoDataState,
  LoadingState,
  ErrorState,
} from "@/components/dashboard/empty-state";
import {
  Droplets,
  ArrowDownRight,
  ArrowUpRight,
  AlertTriangle,
  ShieldCheck,
  Info,
} from "lucide-react";

interface Party {
  id: string;
  name: string;
  amount: number;
}

interface CashflowResponse {
  has_data?: boolean;
  balances_are_stated: boolean;
  current_balance: number | null;
  period: { start: string; end: string } | null;
  lowest_point: { month: string; balance: number } | null;
  monthly: Array<{ month: string; movement: number; balance: number }>;
  receivables: { total: number; top: Party[] };
  payables: { total: number; top: Party[] };
}

const MONTHS = [
  "jan", "feb", "mar", "apr", "mai", "jun",
  "jul", "aug", "sep", "okt", "nov", "des",
];

function monthLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
}

export default function LikviditetPage() {
  const { data, isLoading, error, isEmpty } =
    useCompanyData<CashflowResponse>("cashflow");

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (isEmpty || !data?.has_data) {
    return (
      <NoDataState
        title="Ingen likviditetsdata ennå"
        description="Importer en SAF-T-fil, så viser Elida hvordan bankbeholdningen har utviklet seg, hvem som skylder deg penger og hva du skylder ut."
      />
    );
  }

  const positive = (data.current_balance ?? 0) > 0;

  const stated = data.balances_are_stated;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {!stated && (
        <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4">
          <Info size={18} className="mt-0.5 shrink-0 text-warning" />
          <p className="text-sm text-foreground-secondary">
            SAF-T-filen oppgir ikke inngående saldo på kontoene, bare
            posteringene i perioden. Tallene under viser derfor{" "}
            <em>bevegelsen</em> i perioden, ikke faktisk saldo. Last opp en fil
            som dekker hele regnskapsåret for korrekte balansetall.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow)]">
          <div className="flex items-center gap-2 text-foreground-muted">
            <Droplets size={16} />
            <span className="text-sm">
              {stated ? "Bokført likviditet" : "Endring i bankbeholdning"}
            </span>
          </div>
          <p
            className={`mt-2 text-2xl font-bold tracking-tight ${
              positive ? "text-foreground" : "text-danger"
            }`}
          >
            {formatCurrency(data.current_balance ?? 0)}
          </p>
          <p className="mt-1 text-xs text-foreground-muted">
            {stated
              ? "Bokført saldo, ikke live banksaldo"
              : "Bevegelse i perioden — ikke saldo"}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow)]">
          <div className="flex items-center gap-2 text-foreground-muted">
            <ArrowUpRight size={16} className="text-success" />
            <span className="text-sm">
              {stated ? "Kunder skylder oss" : "Endring kundefordringer"}
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-success">
            {formatCurrency(data.receivables.total)}
          </p>
          <p className="mt-1 text-xs text-foreground-muted">
            {data.receivables.top.length} kunder · inkl. mva
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow)]">
          <div className="flex items-center gap-2 text-foreground-muted">
            <ArrowDownRight size={16} className="text-danger" />
            <span className="text-sm">
              {stated ? "Vi skylder leverandører" : "Endring leverandørgjeld"}
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-danger">
            {formatCurrency(data.payables.total)}
          </p>
          <p className="mt-1 text-xs text-foreground-muted">
            {data.payables.top.length} leverandører · inkl. mva
          </p>
        </div>

        {data.lowest_point && (
          <div className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow)]">
            <div className="flex items-center gap-2 text-foreground-muted">
              {data.lowest_point.balance > 0 ? (
                <ShieldCheck size={16} className="text-success" />
              ) : (
                <AlertTriangle size={16} className="text-danger" />
              )}
              <span className="text-sm">Laveste punkt i perioden</span>
            </div>
            <p
              className={`mt-2 text-2xl font-bold tracking-tight ${
                data.lowest_point.balance > 0 ? "text-foreground" : "text-danger"
              }`}
            >
              {formatCurrency(data.lowest_point.balance)}
            </p>
            <p className="mt-1 text-xs text-foreground-muted">
              {monthLabel(data.lowest_point.month)}
            </p>
          </div>
        )}
      </div>

      <section className="rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow)]">
        <h3 className="mb-1 text-lg font-semibold text-foreground">
          Bankbeholdning over tid
        </h3>
        <p className="mb-5 text-sm text-foreground-muted">
          {stated
            ? "Bokført saldo på bankkontoer ved utgangen av hver måned."
            : "Akkumulert bevegelse på bankkontoer. Uten inngående saldo starter kurven på null."}
        </p>
        <BalanceChart points={data.monthly} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <PartyList
          title="Største utestående kundefordringer"
          icon={<ArrowUpRight size={18} className="text-success" />}
          parties={data.receivables.top}
          tone="success"
          empty="Ingen kunder har utestående saldo."
        />
        <PartyList
          title="Største leverandørgjeld"
          icon={<ArrowDownRight size={18} className="text-danger" />}
          parties={data.payables.top}
          tone="danger"
          empty="Ingen leverandørgjeld registrert."
        />
      </div>
    </div>
  );
}

function BalanceChart({
  points,
}: {
  points: Array<{ month: string; movement: number; balance: number }>;
}) {
  if (points.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-foreground-muted">
        Ingen bankposteringer i perioden.
      </p>
    );
  }

  const max = Math.max(...points.map((p) => p.balance), 0);
  const min = Math.min(...points.map((p) => p.balance), 0);
  const range = max - min || 1;

  return (
    <div className="space-y-1.5">
      {points.map((p) => {
        // Bars are drawn from the zero line so a negative balance reads as one.
        const zeroOffset = ((0 - min) / range) * 100;
        const barSize = (Math.abs(p.balance) / range) * 100;
        const negative = p.balance < 0;

        return (
          <div key={p.month} className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-xs text-foreground-muted">
              {monthLabel(p.month)}
            </span>
            <div className="relative h-5 flex-1 rounded bg-surface-hover">
              <div
                className={`absolute top-0 h-full rounded ${
                  negative ? "bg-danger" : "bg-primary"
                }`}
                style={{
                  left: negative
                    ? `${zeroOffset - barSize}%`
                    : `${zeroOffset}%`,
                  width: `${barSize}%`,
                }}
              />
            </div>
            <span
              className={`w-32 shrink-0 text-right text-sm tabular-nums ${
                negative ? "text-danger" : "text-foreground"
              }`}
            >
              {formatCurrency(p.balance)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PartyList({
  title,
  icon,
  parties,
  tone,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  parties: Party[];
  tone: "success" | "danger";
  empty: string;
}) {
  const toneClass = tone === "success" ? "text-success" : "text-danger";

  return (
    <section className="rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow)]">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
        {icon}
        {title}
      </h3>

      {parties.length === 0 ? (
        <p className="py-6 text-center text-sm text-foreground-muted">{empty}</p>
      ) : (
        <div className="space-y-2">
          {parties.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-lg border border-border-light px-3 py-2.5"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {p.name}
              </span>
              <span
                className={`ml-4 shrink-0 text-sm font-semibold tabular-nums ${toneClass}`}
              >
                {formatCurrency(p.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
