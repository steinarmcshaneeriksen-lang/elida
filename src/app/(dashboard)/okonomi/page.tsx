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
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Repeat,
  Coins,
  Receipt,
  Percent,
  type LucideIcon,
} from "lucide-react";
import type { Tone } from "@/components/dashboard/metric-card";
import { Panel, SERIES_TONES } from "@/components/ui/panel";

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

/**
 * "jan–jul 2026". Whole months: periods run to a month boundary, so printing
 * the day only ever restated the length of a month.
 */
function formatRange({ start, end }: { start: string; end: string }): string {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);

  if (sy === ey && sm === em) return `${MONTH_NAMES[sm - 1]} ${ey}`;
  if (sy === ey) return `${MONTH_NAMES[sm - 1]}–${MONTH_NAMES[em - 1]} ${ey}`;
  return `${MONTH_NAMES[sm - 1]} ${sy} – ${MONTH_NAMES[em - 1]} ${ey}`;
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

  // Null until the year list resolves. It used to fall back to a bare
  // "financials" path, which fetched a range nothing on the page wanted and
  // then swapped to the real key — two loads, two spinners, every visit.
  const { data, isLoading, isRefreshing, error, isEmpty } =
    useCompanyData<FinancialsResponse>(path);
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
            Viser {formatRange(periodRange(period, bounds))}
            {/* Only on the year to date, where a reader might otherwise look
                for the month that is under way. */}
            {period === "ytd" && bounds.note ? ` · ${bounds.note}` : ""}
          </span>
        )}
      </div>

      {isLoading && <LoadingState />}
      {!isLoading && error && <ErrorState message={error} />}
      {isEmpty && <NoDataState />}

      {!isLoading && !error && !isEmpty && data && (
        // Dimmed, not replaced: the figures stay readable while a changed
        // period loads, and it is visible that they are about to be replaced.
        <div
          className={`space-y-8 transition-opacity duration-200 ${
            isRefreshing ? "opacity-60" : ""
          }`}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label="Omsetning"
              value={formatCurrency(data.revenue?.total ?? 0)}
              change={data.revenue?.change_percent ?? null}
              tone="ocean"
              icon={TrendingUp}
            />
            <SummaryCard
              label="Kostnader"
              value={formatCurrency(data.costs?.total ?? 0)}
              change={data.costs?.change_percent ?? null}
              // Rising costs are unfavourable, so invert the colour cue.
              invert
              tone="copper"
              icon={Receipt}
            />
            <SummaryCard
              label="Driftsresultat"
              value={formatCurrency(data.profit?.operating_profit ?? 0)}
              change={data.profit?.operating_profit_change_percent ?? null}
              tone="teal"
              icon={Coins}
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
              tone="violet"
              icon={Percent}
            />
          </div>

          {monthly.length > 0 && (
            <Panel tone="ocean" icon={BarChart3} title="Omsetning per måned">
              {/* Every bar the same hue at full strength. Fading the
                  also-rans to highlight the best month made one colour look
                  like several, which is exactly what a reader who cannot
                  separate hues has to fall back on. The lengths and the
                  figures say which month is biggest. */}
              <div className="space-y-2">
                {monthly.map((m) => {
                  const share = m.revenue / maxRevenue;
                  return (
                    <div
                      key={m.month}
                      className="group flex items-center gap-4 rounded-lg px-2 py-1 transition-colors hover:bg-surface-hover"
                    >
                      <span className="w-9 text-sm font-medium text-foreground-secondary">
                        {monthLabel(m.month)}
                      </span>
                      <div className="tone-track h-7 flex-1">
                        <div
                          className="tone-bar h-7 transition-[width] duration-500"
                          style={{
                            width: `${Math.max(share * 100, m.revenue > 0 ? 2 : 0)}%`,
                          }}
                        />
                      </div>
                      <span className="w-28 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
                        {formatCurrency(m.revenue)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}

          {recurring.data?.has_data && recurring.data.totals && (
            <RecurringRevenue data={recurring.data} />
          )}

          {costCategories.length > 0 && (
            <Panel tone="copper" icon={Receipt} title="Kostnader etter kategori">
              <div className="space-y-4">
                {costCategories.map((cat, i) => (
                  // Each category keeps its own hue down the list, so a row can
                  // be followed from its label to its bar.
                  <div
                    key={cat.category}
                    data-tone={SERIES_TONES[i % SERIES_TONES.length]}
                    className="space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--tone)]" />
                        <span className="truncate">{cat.category}</span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                        {formatCurrency(cat.amount)}
                      </span>
                    </div>
                    <div className="tone-track h-2.5 w-full overflow-hidden">
                      <div
                        className="tone-bar h-full transition-[width] duration-500"
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
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}

const CATEGORY_LABELS: Record<string, { label: string; hint: string; tone: Tone }> = {
  product: {
    label: "Lisensprodukt",
    hint: "Produktet ligger i en lisensgruppe i produktlisten din",
    tone: "teal",
  },
  licensed: {
    label: "Lisens og abonnement",
    hint: "Teksten oppgir lisens, abonnement eller månedspris",
    tone: "ocean",
  },
  regular: {
    label: "Gjentar seg månedlig",
    hint: "Samme linje i tre måneder eller mer, uten at teksten sier det",
    tone: "violet",
  },
  one_off: {
    label: "Engangsinntekter",
    hint: "Ingen av delene",
    tone: "slate",
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
    <Panel
      tone="teal"
      icon={Repeat}
      title="Gjentakende inntekter"
      description={
        fromContracts
          ? `${totals.contract_count} aktive avtaler fra den opplastede fakturalisten, delt ned på måned. Alle beløp er eks. mva.`
          : undefined
      }
    >
      {fromContracts ? (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            {([
              { tone: "teal", label: "MRR", value: formatCurrency(totals.mrr ?? 0) },
              { tone: "ocean", label: "ARR", value: formatCurrency(totals.total) },
              {
                tone: "violet",
                label: "Avtaler",
                value: `${totals.contract_count} av ${totals.contracts_total}`,
                hint: "inaktive og utkast teller ikke med",
              },
            ] as const).map((box) => (
              <div key={box.label} data-tone={box.tone} className="tone-card px-4 py-3">
                <p className="text-xs font-medium text-foreground-secondary">
                  {box.label}
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums text-foreground">
                  {box.value}
                </p>
                {"hint" in box && (
                  <p className="mt-0.5 text-xs text-foreground-muted">{box.hint}</p>
                )}
              </div>
            ))}
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
              data-tone={CATEGORY_LABELS[key].tone}
              className="bg-[var(--tone)]"
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
            <div
              key={key}
              data-tone={CATEGORY_LABELS[key].tone}
              className="tone-card px-4 py-3"
            >
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[var(--tone)]" />
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
              <tr className="border-b border-border text-left">
                <th className="th-label py-2">
                  {fromContracts ? "Avtale" : "Inntektslinje"}
                </th>
                <th className="th-label py-2 text-right">
                  {fromContracts ? "Fakturaer/år" : "Måneder"}
                </th>
                <th className="th-label py-2 text-right">Snitt/mnd</th>
                <th className="th-label py-2 text-right">
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
                        data-tone={CATEGORY_LABELS[item.category].tone}
                        className="h-2 w-2 shrink-0 rounded-full bg-[var(--tone)]"
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
    </Panel>
  );
}

function SummaryCard({
  label,
  value,
  change,
  invert = false,
  unit = "percent",
  detail = null,
  tone = "slate",
  icon: Icon,
}: {
  label: string;
  value: string;
  change: number | null;
  invert?: boolean;
  /** Percentages compare as percent; a margin compares in points. */
  unit?: "percent" | "points";
  detail?: string | null;
  tone?: Tone;
  icon?: LucideIcon;
}) {
  const isUp = (change ?? 0) > 0.5;
  const isDown = (change ?? 0) < -0.5;
  // Rising costs are a worse result than falling ones, so the colour follows
  // whether the movement is good, not whether the arrow points up.
  const favourable = invert ? isDown : isUp;
  const chip = !isUp && !isDown ? "flat" : favourable ? "up" : "down";
  const ChangeIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;

  return (
    <div data-tone={tone} className="tone-card flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-foreground-secondary">{label}</p>
        {Icon && (
          <span className="tone-badge shrink-0">
            <Icon size={16} strokeWidth={2.2} />
          </span>
        )}
      </div>
      <p className="mt-2 text-xl font-bold tracking-tight tabular-nums text-foreground">
        {value}
      </p>
      <div className="mt-2.5 flex h-6 items-center gap-2">
        {change == null ? (
          <span className="text-xs text-foreground-muted">
            Ingen sammenligning tilgjengelig
          </span>
        ) : (
          <>
            <span className={`chip chip--${chip}`}>
              <ChangeIcon size={13} strokeWidth={2.5} />
              {unit === "points"
                ? `${change > 0 ? "+" : ""}${change.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} pp`
                : formatChange(change)}
            </span>
            <span className="text-xs text-foreground-muted">vs. i fjor</span>
          </>
        )}
      </div>
      {detail && (
        <p className="mt-1.5 text-xs text-foreground-muted">{detail}</p>
      )}
    </div>
  );
}
