"use client";

import { useMemo, useState } from "react";
import { formatCurrency, formatChange, formatPercent } from "@/lib/format";
import { useCompanyData } from "@/lib/hooks/use-company-data";
import {
  PERIOD_LABELS,
  comparisonRange,
  periodRange,
  type PeriodKey,
  type YearBounds,
} from "@/lib/periods";
import {
  NoDataState,
  LoadingState,
  ErrorState,
} from "@/components/dashboard/empty-state";
import { BarChart3, TrendingUp, TrendingDown, Minus, Repeat } from "lucide-react";

interface FinancialsResponse {
  has_data?: boolean;
  monthly: Array<{
    month: string;
    revenue: number;
    costs: number;
    profit: number;
  }>;
  revenue: {
    total: number;
    previous_period_total: number;
    change_percent: number | null;
  } | null;
  costs: {
    total: number;
    by_category: Record<string, number>;
    previous_period_total: number;
    change_percent: number | null;
  } | null;
  profit: {
    operating_profit: number;
    operating_margin_percent: number;
    previous_operating_profit: number;
    previous_operating_margin_percent: number | null;
    operating_margin_change_points: number | null;
    operating_profit_change_percent: number | null;
    change_percent: number | null;
  } | null;
}

/** Maps the selected period onto the date range the API expects. */
const MONTH_NAMES = [
  "jan", "feb", "mar", "apr", "mai", "jun",
  "jul", "aug", "sep", "okt", "nov", "des",
];

function monthLabel(isoMonth: string): string {
  const [, month] = isoMonth.split("-");
  return MONTH_NAMES[Number(month) - 1] ?? isoMonth;
}

interface RecurringResponse {
  has_data: boolean;
  /** contracts: stated by an uploaded list. ledger: inferred from postings. */
  source?: "contracts" | "ledger";
  totals: {
    product: number;
    licensed: number;
    regular: number;
    one_off: number;
    total: number;
    recurring_share: number;
    has_product_list: boolean;
    mrr?: number;
    contract_count?: number;
    contracts_total?: number;
  } | null;
  items: Array<{
    description: string;
    months_active: number;
    total: number;
    avg_per_month: number;
    category: "product" | "licensed" | "regular" | "one_off";
    matched_product: string | null;
  }>;
}

export default function OkonomiPage() {
  const [period, setPeriod] = useState<PeriodKey>("ytd");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const yearsQuery = useCompanyData<{ years: YearBounds[] }>("years");
  const years = useMemo(() => yearsQuery.data?.years ?? [], [yearsQuery.data]);

  // Defaults to the most recent year held, which is what someone opening the
  // page expects to see.
  const bounds =
    years.find((y) => y.year === selectedYear) ?? years[0] ?? null;

  const path = useMemo(() => {
    if (!bounds) return null;
    const range = periodRange(period, bounds);
    const previous = comparisonRange(range);
    return (
      `financials?period_start=${range.start}&period_end=${range.end}` +
      `&comparison_start=${previous.start}&comparison_end=${previous.end}`
    );
  }, [period, bounds]);

  const { data, isLoading, error, isEmpty } =
    useCompanyData<FinancialsResponse>(path ?? "financials");
  const recurring = useCompanyData<RecurringResponse>("recurring-revenue");

  const monthly = data?.monthly ?? [];
  const maxRevenue = Math.max(1, ...monthly.map((m) => m.revenue));

  const costCategories = useMemo(() => {
    const byCategory = data?.costs?.by_category ?? {};
    const total = data?.costs?.total ?? 0;
    return Object.entries(byCategory)
      .map(([category, amount]) => ({
        category,
        amount,
        percent: total > 0 ? (amount / total) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [data]);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex rounded-lg border border-border bg-surface p-1">
          {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                period === p
                  ? "bg-primary text-white"
                  : "text-foreground-secondary hover:bg-surface-hover"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {years.length > 1 && (
          <div className="flex rounded-lg border border-border bg-surface p-1">
            {years.map((y) => (
              <button
                key={y.year}
                onClick={() => setSelectedYear(y.year)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  bounds?.year === y.year
                    ? "bg-primary text-white"
                    : "text-foreground-secondary hover:bg-surface-hover"
                }`}
              >
                {y.year}
              </button>
            ))}
          </div>
        )}

        {bounds && (
          <span className="text-xs text-foreground-muted">
            Viser {periodRange(period, bounds).start} til{" "}
            {periodRange(period, bounds).end}
            {!bounds.is_complete && " · året er ikke fullført"}
          </span>
        )}
      </div>

      {isLoading && <LoadingState />}
      {!isLoading && error && <ErrorState message={error} />}
      {isEmpty && <NoDataState />}

      {!isLoading && !error && !isEmpty && data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label="Omsetning"
              value={formatCurrency(data.revenue?.total ?? 0)}
              change={data.revenue?.change_percent ?? null}
            />
            <SummaryCard
              label="Kostnader"
              value={formatCurrency(data.costs?.total ?? 0)}
              change={data.costs?.change_percent ?? null}
              // Rising costs are unfavourable, so invert the colour cue.
              invert
            />
            <SummaryCard
              label="Driftsresultat"
              value={formatCurrency(data.profit?.operating_profit ?? 0)}
              change={data.profit?.operating_profit_change_percent ?? null}
            />
            <SummaryCard
              label="Driftsmargin"
              value={formatPercent(data.profit?.operating_margin_percent ?? 0)}
              change={data.profit?.operating_margin_change_points ?? null}
              // A margin moves in percentage points, not in percent.
              unit="points"
              detail={
                data.profit?.previous_operating_margin_percent != null
                  ? `I fjor ${formatPercent(data.profit.previous_operating_margin_percent)}`
                  : null
              }
            />
          </div>

          {monthly.length > 0 && (
            <section className="rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow)]">
              <div className="mb-6 flex items-center gap-2">
                <BarChart3 size={18} className="text-foreground-muted" />
                <h3 className="text-lg font-semibold text-foreground">
                  Omsetning per måned
                </h3>
              </div>
              <div className="space-y-3">
                {monthly.map((m) => (
                  <div key={m.month} className="flex items-center gap-4">
                    <span className="w-10 text-sm font-medium text-foreground-secondary">
                      {monthLabel(m.month)}
                    </span>
                    <div className="flex-1">
                      <div
                        className="h-8 rounded-md bg-primary"
                        style={{
                          width: `${Math.max(1, (m.revenue / maxRevenue) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="w-28 text-right text-sm font-medium tabular-nums text-foreground">
                      {formatCurrency(m.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {recurring.data?.has_data && recurring.data.totals && (
            <RecurringRevenue data={recurring.data} />
          )}

          {costCategories.length > 0 && (
            <section className="rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow)]">
              <h3 className="mb-6 text-lg font-semibold text-foreground">
                Kostnader etter kategori
              </h3>
              <div className="space-y-4">
                {costCategories.map((cat) => (
                  <div key={cat.category} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">
                        {cat.category}
                      </span>
                      <span className="text-sm tabular-nums text-foreground">
                        {formatCurrency(cat.amount)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-hover">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${cat.percent}%` }}
                      />
                    </div>
                    <p className="text-xs text-foreground-muted">
                      {cat.percent.toFixed(1).replace(".", ",")} % av totale
                      kostnader
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

const CATEGORY_LABELS: Record<string, { label: string; hint: string; className: string }> = {
  product: {
    label: "Lisensprodukt",
    hint: "Produktet ligger i en lisensgruppe i produktlisten din",
    className: "bg-success",
  },
  licensed: {
    label: "Lisens og abonnement",
    hint: "Teksten oppgir lisens, abonnement eller månedspris",
    className: "bg-accent",
  },
  regular: {
    label: "Gjentar seg månedlig",
    hint: "Samme linje i tre måneder eller mer, uten at teksten sier det",
    className: "bg-primary",
  },
  one_off: {
    label: "Engangsinntekter",
    hint: "Ingen av delene",
    className: "bg-surface-hover",
  },
};

/**
 * Where a contract list has been uploaded it states what recurs, so this reads
 * the same source as the dashboard's MRR card and the two agree. Without one,
 * the split is inferred and the signals behind it are named rather than hidden.
 */
function RecurringRevenue({ data }: { data: RecurringResponse }) {
  const totals = data.totals!;
  const fromContracts = data.source === "contracts";
  const top = data.items
    .filter((i) => i.category !== "one_off")
    .slice(0, fromContracts ? 12 : 8);

  return (
    <section className="rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow)]">
      <div className="mb-1 flex items-center gap-2">
        <Repeat size={18} className="text-foreground-muted" />
        <h3 className="text-lg font-semibold text-foreground">
          Gjentakende inntekter
        </h3>
      </div>

      {fromContracts ? (
        <>
          <p className="mb-5 text-sm text-foreground-muted">
            {totals.contract_count} aktive avtaler fra den opplastede
            fakturalisten, delt ned på måned. Alle beløp er eks. mva.
          </p>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-background px-3 py-2.5">
              <p className="text-xs font-medium text-foreground">MRR</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {formatCurrency(totals.mrr ?? 0)}
              </p>
            </div>
            <div className="rounded-lg bg-background px-3 py-2.5">
              <p className="text-xs font-medium text-foreground">ARR</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {formatCurrency(totals.total)}
              </p>
            </div>
            <div className="rounded-lg bg-background px-3 py-2.5">
              <p className="text-xs font-medium text-foreground">Avtaler</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {totals.contract_count} av {totals.contracts_total}
              </p>
              <p className="mt-0.5 text-xs text-foreground-muted">
                inaktive og utkast teller ikke med
              </p>
            </div>
          </div>
        </>
      ) : (
        <>
      <p className="mb-5 text-sm text-foreground-muted">
        {totals.recurring_share} % av omsetningen gjentar seg.{" "}
        {totals.has_product_list
          ? "Basert på produktlisten din, med tekst- og månedsmønster som supplement."
          : "Utledet fra posteringstekst og månedsmønster — usikkert. Last opp listen over repeterende fakturaer under «Importer data» for et sikkert svar."}
      </p>

      <div className="mb-5 flex h-3 overflow-hidden rounded-full">
        {(["product", "licensed", "regular", "one_off"] as const).map((key) => {
          const value = key === "one_off" ? totals.one_off : totals[key];
          const pct = totals.total > 0 ? (value / totals.total) * 100 : 0;
          if (pct <= 0) return null;
          return (
            <div
              key={key}
              className={CATEGORY_LABELS[key].className}
              style={{ width: `${pct}%` }}
              title={`${CATEGORY_LABELS[key].label}: ${formatCurrency(value)}`}
            />
          );
        })}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(["product", "licensed", "regular", "one_off"] as const).map((key) => {
          const value = key === "one_off" ? totals.one_off : totals[key];
          return (
            <div key={key} className="rounded-lg bg-background px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 rounded-full ${CATEGORY_LABELS[key].className}`}
                />
                <p className="text-xs font-medium text-foreground">
                  {CATEGORY_LABELS[key].label}
                </p>
              </div>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {formatCurrency(value)}
              </p>
              <p className="mt-0.5 text-xs leading-snug text-foreground-muted">
                {CATEGORY_LABELS[key].hint}
              </p>
            </div>
          );
        })}
      </div>
        </>
      )}

      {top.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-foreground-muted">
                <th className="py-2 font-medium">
                  {fromContracts ? "Avtale" : "Inntektslinje"}
                </th>
                <th className="py-2 text-right font-medium">
                  {fromContracts ? "Fakturaer/år" : "Måneder"}
                </th>
                <th className="py-2 text-right font-medium">Snitt/mnd</th>
                <th className="py-2 text-right font-medium">
                  {fromContracts ? "Per år" : "Totalt"}
                </th>
              </tr>
            </thead>
            <tbody>
              {top.map((item) => (
                <tr
                  key={item.description}
                  className="border-b border-border-light last:border-0"
                >
                  <td className="py-2.5 pr-4">
                    <span className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${CATEGORY_LABELS[item.category].className}`}
                      />
                      <span className="text-foreground">{item.description}</span>
                    </span>
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-foreground-muted">
                    {item.months_active}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-foreground-secondary">
                    {formatCurrency(item.avg_per_month)}
                  </td>
                  <td className="py-2.5 text-right font-medium tabular-nums text-foreground">
                    {formatCurrency(item.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SummaryCard({
  label,
  value,
  change,
  invert = false,
  unit = "percent",
  detail = null,
}: {
  label: string;
  value: string;
  change: number | null;
  invert?: boolean;
  /** Percentages compare as percent; a margin compares in points. */
  unit?: "percent" | "points";
  detail?: string | null;
}) {
  const isUp = (change ?? 0) > 0.5;
  const isDown = (change ?? 0) < -0.5;
  const favourable = invert ? isDown : isUp;

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow)]">
      <p className="text-sm text-foreground-muted">{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight text-foreground">
        {value}
      </p>
      <div className="mt-2 flex items-center gap-1">
        {change == null ? (
          <span className="text-xs text-foreground-muted">
            Ingen sammenligning tilgjengelig
          </span>
        ) : (
          <>
            {isUp ? (
              <TrendingUp
                size={14}
                className={favourable ? "text-success" : "text-danger"}
              />
            ) : isDown ? (
              <TrendingDown
                size={14}
                className={favourable ? "text-success" : "text-danger"}
              />
            ) : (
              <Minus size={14} className="text-foreground-muted" />
            )}
            <span
              className={`text-sm font-medium ${
                isUp || isDown
                  ? favourable
                    ? "text-success"
                    : "text-danger"
                  : "text-foreground-muted"
              }`}
            >
              {unit === "points"
                ? `${change > 0 ? "+" : ""}${change.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} pp`
                : formatChange(change)}
            </span>
            <span className="text-xs text-foreground-muted">vs. i fjor</span>
          </>
        )}
      </div>
      {detail && (
        <p className="mt-1 text-xs text-foreground-muted">{detail}</p>
      )}
    </div>
  );
}
