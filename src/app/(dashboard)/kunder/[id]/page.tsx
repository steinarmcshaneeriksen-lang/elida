"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatCurrency, formatDateShort } from "@/lib/format";
import { useUser } from "@/lib/hooks/use-user";
import { LoadingState, ErrorState } from "@/components/dashboard/empty-state";
import { ArrowLeft, Mail, Phone, MapPin, Building2, Info } from "lucide-react";

interface CustomerDetail {
  profile: {
    id: string;
    name: string;
    customer_number: string | null;
    org_number: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  };
  outstanding: number;
  outstanding_is_stated: boolean;
  revenue: number;
  posting_count: number;
  last_activity: string | null;
  monthly_revenue: Array<{ month: string; amount: number }>;
  products: Array<{ description: string; amount: number; count: number }>;
  postings: Array<{
    id: string;
    date: string;
    account_number: string;
    account_name: string | null;
    amount: number;
    description: string | null;
  }>;
}

const MONTHS = [
  "jan", "feb", "mar", "apr", "mai", "jun",
  "jul", "aug", "sep", "okt", "nov", "des",
];

function monthLabel(iso: string): string {
  const [, m] = iso.split("-").map(Number);
  return MONTHS[m - 1] ?? iso;
}

export default function KundeDetaljPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const customerId = params?.id;
  const { company, isLoading: isLoadingUser } = useUser();
  const companyId = company?.id;

  const key = companyId && customerId ? `${companyId}/${customerId}` : null;
  const [result, setResult] = useState<{
    key: string;
    data: CustomerDetail | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!key || !companyId || !customerId) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          `/api/companies/${companyId}/customers/${customerId}`
        );
        if (cancelled) return;

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          if (!cancelled) {
            setResult({
              key: key!,
              data: null,
              error:
                res.status === 404
                  ? "Fant ikke kunden."
                  : (body?.error ?? `Forespørselen feilet (${res.status})`),
            });
          }
          return;
        }

        const json = (await res.json()) as CustomerDetail;
        if (!cancelled) setResult({ key: key!, data: json, error: null });
      } catch {
        if (!cancelled) {
          setResult({ key: key!, data: null, error: "Kunne ikke koble til." });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [key, companyId, customerId]);

  const isFresh = result?.key === key;
  const isLoading = isLoadingUser || (key != null && !isFresh);
  const data = isFresh ? result.data : null;
  const error = isFresh ? result.error : null;

  const maxMonth = Math.max(
    1,
    ...(data?.monthly_revenue ?? []).map((m) => m.amount)
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <button
        onClick={() => router.push("/kunder")}
        className="flex items-center gap-2 text-sm text-foreground-secondary hover:text-foreground"
      >
        <ArrowLeft size={16} />
        Tilbake til kunder
      </button>

      {isLoading && <LoadingState />}
      {!isLoading && error && <ErrorState message={error} />}

      {!isLoading && !error && data && (
        <>
          <div className="rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow)]">
            <h2 className="text-xl font-bold text-foreground">
              {data.profile.name}
            </h2>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-foreground-secondary">
              {data.profile.org_number && (
                <span className="flex items-center gap-1.5">
                  <Building2 size={14} className="text-foreground-muted" />
                  Org.nr {data.profile.org_number}
                </span>
              )}
              {data.profile.email && (
                <span className="flex items-center gap-1.5">
                  <Mail size={14} className="text-foreground-muted" />
                  {data.profile.email}
                </span>
              )}
              {data.profile.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone size={14} className="text-foreground-muted" />
                  {data.profile.phone}
                </span>
              )}
              {data.profile.address && (
                <span className="flex items-center gap-1.5">
                  <MapPin size={14} className="text-foreground-muted" />
                  {data.profile.address}
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Omsetning i perioden"
              value={formatCurrency(data.revenue)}
            />
            <StatCard
              label={
                data.outstanding_is_stated
                  ? "Utestående"
                  : "Endring i kundefordring"
              }
              value={formatCurrency(data.outstanding)}
              detail={
                data.outstanding_is_stated
                  ? undefined
                  : "Ikke saldo — se merknad under"
              }
              tone={
                data.outstanding_is_stated && data.outstanding > 0
                  ? "warning"
                  : undefined
              }
            />
            <StatCard
              label="Siste aktivitet"
              value={
                data.last_activity ? formatDateShort(data.last_activity) : "—"
              }
              detail={`${data.posting_count} posteringer`}
            />
          </div>

          {!data.outstanding_is_stated && (
            <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4">
              <Info size={18} className="mt-0.5 shrink-0 text-warning" />
              <p className="text-sm text-foreground-secondary">
                SAF-T-filen oppgir ikke saldo per kunde, bare posteringene i
                perioden. Tallet over er derfor <em>endringen</em> i
                kundefordringen, ikke hva kunden skylder. En faktura fra i fjor
                som betales i år gir bare innbetalingen — og dermed et negativt
                tall. Last opp foregående år, eller hent saldoen fra
                regnskapssystemet, for et korrekt utestående.
              </p>
            </div>
          )}

          {data.monthly_revenue.length > 0 && (
            <section className="rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow)]">
              <h3 className="mb-4 text-sm font-semibold text-foreground">
                Omsetning per måned
              </h3>
              <div className="space-y-2">
                {data.monthly_revenue.map((m) => (
                  <div key={m.month} className="flex items-center gap-3">
                    <span className="w-10 text-xs text-foreground-muted">
                      {monthLabel(m.month)}
                    </span>
                    <div className="h-5 flex-1 rounded bg-surface-hover">
                      <div
                        className="h-full rounded bg-primary"
                        style={{
                          width: `${Math.max(2, (m.amount / maxMonth) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="w-28 text-right text-sm tabular-nums text-foreground">
                      {formatCurrency(m.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {data.products.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow)]">
              <h3 className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground">
                Hva kunden kjøper
              </h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-foreground-muted">
                    <th className="px-5 py-2.5 font-medium">Linje</th>
                    <th className="px-5 py-2.5 text-right font-medium">Antall</th>
                    <th className="px-5 py-2.5 text-right font-medium">Beløp</th>
                  </tr>
                </thead>
                <tbody>
                  {data.products.map((p) => (
                    <tr
                      key={p.description}
                      className="border-b border-border-light last:border-0"
                    >
                      <td className="px-5 py-2.5 text-foreground">
                        {p.description}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-foreground-muted">
                        {p.count}
                      </td>
                      <td className="px-5 py-2.5 text-right font-medium tabular-nums text-foreground">
                        {formatCurrency(p.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {data.postings.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow)]">
              <h3 className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground">
                Posteringer på kundefordring
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-foreground-muted">
                      <th className="px-5 py-2.5 font-medium">Dato</th>
                      <th className="px-5 py-2.5 font-medium">Konto</th>
                      <th className="px-5 py-2.5 font-medium">Beskrivelse</th>
                      <th className="px-5 py-2.5 text-right font-medium">
                        Beløp
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.postings.map((p) => (
                      <tr
                        key={p.id}
                        className="border-b border-border-light last:border-0"
                      >
                        <td className="whitespace-nowrap px-5 py-2.5 tabular-nums text-foreground-secondary">
                          {formatDateShort(p.date)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-foreground-muted">
                          {p.account_number} {p.account_name ?? ""}
                        </td>
                        <td className="px-5 py-2.5 text-foreground">
                          {p.description ?? "—"}
                        </td>
                        <td
                          className={`whitespace-nowrap px-5 py-2.5 text-right tabular-nums ${
                            p.amount >= 0 ? "text-foreground" : "text-success"
                          }`}
                        >
                          {formatCurrency(p.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "warning";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow)]">
      <p className="text-sm text-foreground-muted">{label}</p>
      <p
        className={`mt-1 text-xl font-bold tracking-tight ${
          tone === "warning" ? "text-warning" : "text-foreground"
        }`}
      >
        {value}
      </p>
      {detail && <p className="mt-1 text-xs text-foreground-muted">{detail}</p>}
    </div>
  );
}
