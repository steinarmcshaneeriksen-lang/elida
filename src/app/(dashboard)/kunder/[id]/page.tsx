"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatCurrency, formatDateShort } from "@/lib/format";
import { useUser } from "@/lib/hooks/use-user";
import { LoadingState, ErrorState } from "@/components/dashboard/empty-state";
import { ArrowLeft, Mail, Phone, MapPin, Building2 } from "lucide-react";

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
  payment_profile: {
    total_invoices: number | null;
    total_invoiced_amount: number | null;
    current_outstanding: number | null;
    current_overdue: number | null;
    avg_agreed_terms_days: number | null;
    avg_actual_payment_days: number | null;
    avg_days_after_due: number | null;
    late_payment_ratio: number | null;
    max_delay_days: number | null;
    last_payment_date: string | null;
  } | null;
  invoices: Array<{
    id: string;
    invoice_number: string | null;
    invoice_date: string | null;
    due_date: string | null;
    total_amount: number | null;
    remaining_amount: number | null;
    status: string | null;
  }>;
  monthly_revenue_trend: Array<{ month: string; amount: number }>;
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

          {data.payment_profile ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Utestående"
                value={formatCurrency(
                  data.payment_profile.current_outstanding ?? 0
                )}
              />
              <StatCard
                label="Forfalt"
                value={formatCurrency(
                  data.payment_profile.current_overdue ?? 0
                )}
                tone={
                  (data.payment_profile.current_overdue ?? 0) > 0
                    ? "danger"
                    : undefined
                }
              />
              <StatCard
                label="Snitt betalingstid"
                value={
                  data.payment_profile.avg_actual_payment_days != null
                    ? `${Math.round(data.payment_profile.avg_actual_payment_days)} dager`
                    : "—"
                }
                detail={
                  data.payment_profile.avg_agreed_terms_days != null
                    ? `Avtalt: ${Math.round(data.payment_profile.avg_agreed_terms_days)} dager`
                    : undefined
                }
              />
              <StatCard
                label="Fakturert totalt"
                value={formatCurrency(
                  data.payment_profile.total_invoiced_amount ?? 0
                )}
                detail={
                  data.payment_profile.total_invoices != null
                    ? `${data.payment_profile.total_invoices} fakturaer`
                    : undefined
                }
              />
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-surface px-5 py-6 text-center text-sm text-foreground-muted">
              Ingen betalingshistorikk beregnet for denne kunden ennå.
            </div>
          )}

          <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow)]">
            <h3 className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground">
              Fakturaer
            </h3>
            {data.invoices.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-foreground-muted">
                Ingen fakturaer registrert.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-foreground-muted">
                      <th className="px-5 py-2.5 font-medium">Fakturanr.</th>
                      <th className="px-5 py-2.5 font-medium">Dato</th>
                      <th className="px-5 py-2.5 font-medium">Forfall</th>
                      <th className="px-5 py-2.5 text-right font-medium">
                        Beløp
                      </th>
                      <th className="px-5 py-2.5 text-right font-medium">
                        Gjenstår
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.invoices.map((inv) => (
                      <tr
                        key={inv.id}
                        className="border-b border-border-light last:border-0"
                      >
                        <td className="px-5 py-2.5 text-foreground">
                          {inv.invoice_number ?? "—"}
                        </td>
                        <td className="px-5 py-2.5 text-foreground-secondary">
                          {inv.invoice_date
                            ? formatDateShort(inv.invoice_date)
                            : "—"}
                        </td>
                        <td className="px-5 py-2.5 text-foreground-secondary">
                          {inv.due_date ? formatDateShort(inv.due_date) : "—"}
                        </td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-foreground">
                          {formatCurrency(inv.total_amount ?? 0)}
                        </td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-foreground-secondary">
                          {(inv.remaining_amount ?? 0) > 0
                            ? formatCurrency(inv.remaining_amount ?? 0)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
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
  tone?: "danger";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow)]">
      <p className="text-sm text-foreground-muted">{label}</p>
      <p
        className={`mt-1 text-xl font-bold tracking-tight ${
          tone === "danger" ? "text-danger" : "text-foreground"
        }`}
      >
        {value}
      </p>
      {detail && (
        <p className="mt-1 text-xs text-foreground-muted">{detail}</p>
      )}
    </div>
  );
}
