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
  type LucideIcon,
} from "lucide-react";
import { Panel } from "@/components/ui/panel";
import type { Tone } from "@/components/dashboard/metric-card";

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

      {/* Money in is teal, money out is rose, the balance itself violet —
          the same directions the chart below uses. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          tone="violet"
          icon={<Droplets size={16} strokeWidth={2.2} />}
          label={stated ? "Bokført likviditet" : "Endring i bankbeholdning"}
          value={formatCurrency(data.current_balance ?? 0)}
          valueClass={positive ? "text-foreground" : "text-danger"}
          detail={
            stated
              ? "Bokført saldo, ikke live banksaldo"
              : "Bevegelse i perioden — ikke saldo"
          }
        />
        <StatCard
          tone="teal"
          icon={<ArrowUpRight size={16} strokeWidth={2.2} />}
          label={stated ? "Kunder skylder oss" : "Endring kundefordringer"}
          value={formatCurrency(data.receivables.total)}
          valueClass="text-[var(--tone-ink)]"
          detail={`${data.receivables.top.length} kunder · inkl. mva`}
        />
        <StatCard
          tone="rose"
          icon={<ArrowDownRight size={16} strokeWidth={2.2} />}
          label={stated ? "Vi skylder leverandører" : "Endring leverandørgjeld"}
          value={formatCurrency(data.payables.total)}
          valueClass="text-[var(--tone-ink)]"
          detail={`${data.payables.top.length} leverandører · inkl. mva`}
        />
        {data.lowest_point && (
          <StatCard
            tone="copper"
            icon={
              data.lowest_point.balance > 0 ? (
                <ShieldCheck size={16} strokeWidth={2.2} />
              ) : (
                <AlertTriangle size={16} strokeWidth={2.2} />
              )
            }
            label="Laveste punkt i perioden"
            value={formatCurrency(data.lowest_point.balance)}
            valueClass={
              data.lowest_point.balance > 0 ? "text-foreground" : "text-danger"
            }
            detail={monthLabel(data.lowest_point.month)}
          />
        )}
      </div>

      <Panel
        tone="violet"
        icon={Droplets}
        title="Bankbeholdning over tid"
        description={
          stated
            ? "Bokført saldo på bankkontoer ved utgangen av hver måned."
            : "Akkumulert bevegelse på bankkontoer. Uten inngående saldo starter kurven på null."
        }
      >
        <BalanceChart points={data.monthly} />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <PartyList
          title="Største utestående kundefordringer"
          icon={ArrowUpRight}
          parties={data.receivables.top}
          tone="teal"
          empty="Ingen kunder har utestående saldo."
        />
        <PartyList
          title="Største leverandørgjeld"
          icon={ArrowDownRight}
          parties={data.payables.top}
          tone="rose"
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
                data-tone={negative ? "rose" : "teal"}
                className="tone-bar absolute top-0 h-full"
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
  icon: LucideIcon;
  parties: Party[];
  tone: Tone;
  empty: string;
}) {
  return (
    <Panel tone={tone} icon={icon} title={title}>
      {parties.length === 0 ? (
        <p className="py-6 text-center text-sm text-foreground-muted">{empty}</p>
      ) : (
        <div className="space-y-1.5">
          {parties.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-hover"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {p.name}
              </span>
              <span className="ml-4 shrink-0 text-sm font-semibold tabular-nums text-[var(--tone-ink)]">
                {formatCurrency(p.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/** One liquidity figure with its icon and the colour it keeps on this page. */
function StatCard({
  tone,
  icon,
  label,
  value,
  valueClass,
  detail,
}: {
  tone: Tone;
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass: string;
  detail: string;
}) {
  return (
    <div data-tone={tone} className="tone-card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-foreground-secondary">{label}</p>
        <span className="tone-badge shrink-0">{icon}</span>
      </div>
      <p
        className={`mt-2 text-2xl font-bold tracking-tight tabular-nums ${valueClass}`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-foreground-muted">{detail}</p>
    </div>
  );
}
