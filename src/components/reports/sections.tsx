"use client";

import {
  CashChart,
  RankedBars,
  RevenueProfitChart,
  WaterfallChart,
} from "./charts";
import { FigureRow, Footnote, PointList, Section } from "./document";
import type { ReportDataset } from "@/lib/reports/dataset";
import {
  buildExecutiveSummary,
  buildObservations,
  buildVarianceExplanation,
} from "@/lib/reports/narrative";

/**
 * The building blocks a report is assembled from. Each takes the dataset and
 * renders one section; the custom report builder picks which of them appear
 * and in what order, and the ready-made report types are just fixed lists.
 *
 * None of these compute a figure. Everything shown is read off the dataset.
 */

const nokFormatter = new Intl.NumberFormat("nb-NO", {
  maximumFractionDigits: 0,
});

export function nok(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${nokFormatter.format(n)} kr`;
}

function signedNok(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${nokFormatter.format(Math.abs(n))}`;
}

function pct(n: number | null | undefined, signed = false): string {
  if (n == null) return "—";
  const sign = signed && n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} %`;
}

/** Negative figures are set with a proper minus and in the negative ink. */
function Num({ value, signed = false }: { value: number | null; signed?: boolean }) {
  if (value == null) return <>—</>;
  const negative = value < 0;
  return (
    <span style={negative ? { color: "var(--report-negative)" } : undefined}>
      {signed ? signedNok(value) : nokFormatter.format(value)}
    </span>
  );
}

const MONTH_LABELS = [
  "januar", "februar", "mars", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "desember",
];

function monthName(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  return `${MONTH_LABELS[m - 1]} ${y}`;
}

// ---------------------------------------------------------------------------
// Executive summary
// ---------------------------------------------------------------------------

export function ExecutiveSummarySection({ data }: { data: ReportDataset }) {
  const summary = buildExecutiveSummary(data);

  return (
    <>
      <Section title="Sammendrag">
        <div className="space-y-3 text-[13.5px] leading-[1.65]">
          {summary.status.map((line, i) => (
            <p key={i} style={{ color: "var(--report-body)" }}>
              {line}
            </p>
          ))}
        </div>
      </Section>

      {summary.headline_kpis.length > 0 && (
        <Section title="Viktigste tall">
          <FigureRow figures={summary.headline_kpis} />
        </Section>
      )}

      <div className="grid grid-cols-2 gap-x-10">
        <Section title="Positive forhold">
          {summary.positives.length > 0 ? (
            <PointList items={summary.positives} />
          ) : (
            <p className="text-[13px]" style={{ color: "var(--report-muted)" }}>
              Ingen vesentlige positive endringer i perioden.
            </p>
          )}
        </Section>

        <Section title="Utfordringer">
          {summary.challenges.length > 0 ? (
            <PointList items={summary.challenges} />
          ) : (
            <p className="text-[13px]" style={{ color: "var(--report-muted)" }}>
              Ingen vesentlige negative avvik i perioden.
            </p>
          )}
        </Section>
      </div>

      {summary.ahead.length > 0 && (
        <Section title="Fremover">
          <PointList items={summary.ahead} />
        </Section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Profit and loss
// ---------------------------------------------------------------------------

export function ResultSection({ data }: { data: ReportDataset }) {
  const fs = data.financial_summary;
  const hasComparison = fs.comparison != null;

  return (
    <Section
      title="Økonomisk status"
      note={
        (hasComparison
          ? `${data.period.label} mot ${data.comparison?.label}`
          : data.period.label) + " · alle beløp eks. mva"
      }
    >
      <table>
        <thead>
          <tr>
            <th>&nbsp;</th>
            <th className="num">{data.period.label}</th>
            {hasComparison && <th className="num">{data.comparison?.label}</th>}
            {hasComparison && <th className="num">Endring</th>}
            {hasComparison && <th className="num">%</th>}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Omsetning</td>
            <td className="num"><Num value={fs.revenue} /></td>
            {hasComparison && <td className="num"><Num value={fs.comparison!.revenue} /></td>}
            {hasComparison && <td className="num"><Num value={fs.change?.revenue ?? null} signed /></td>}
            {hasComparison && <td className="num">{pct(fs.change?.revenue_percent, true)}</td>}
          </tr>
          <tr>
            <td>Driftskostnader</td>
            <td className="num"><Num value={fs.costs} /></td>
            {hasComparison && <td className="num"><Num value={fs.comparison!.costs} /></td>}
            {hasComparison && (
              <td className="num"><Num value={fs.costs - fs.comparison!.costs} signed /></td>
            )}
            {hasComparison && <td className="num">&nbsp;</td>}
          </tr>
          <tr className="total">
            <td>Driftsresultat</td>
            <td className="num"><Num value={fs.operating_profit} /></td>
            {hasComparison && <td className="num"><Num value={fs.comparison!.operating_profit} /></td>}
            {hasComparison && (
              <td className="num"><Num value={fs.change?.operating_profit ?? null} signed /></td>
            )}
            {hasComparison && <td className="num">{pct(fs.change?.operating_profit_percent, true)}</td>}
          </tr>
          <tr>
            <td>Driftsmargin</td>
            <td className="num">{pct(fs.operating_margin)}</td>
            {hasComparison && <td className="num">{pct(fs.comparison!.operating_margin)}</td>}
            {hasComparison && (
              <td className="num">
                {fs.change?.margin_points != null
                  ? `${fs.change.margin_points > 0 ? "+" : ""}${fs.change.margin_points.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} pp`
                  : "—"}
              </td>
            )}
            {hasComparison && <td className="num">&nbsp;</td>}
          </tr>
        </tbody>
      </table>

      {fs.change == null && (
        <Footnote>
          Sammenligningsperioden er ikke importert, så endringstall er utelatt.
        </Footnote>
      )}
    </Section>
  );
}

export function RevenueSection({ data }: { data: ReportDataset }) {
  return (
    <Section title="Omsetning" note="Utvikling per måned, med driftsresultat som linje · eks. mva">
      <RevenueProfitChart points={data.revenue.by_month} />

      {data.revenue.by_category.length > 1 && (
        <table className="mt-6">
          <thead>
            <tr>
              <th>Inntektstype</th>
              <th className="num">Beløp</th>
              {data.comparison && <th className="num">{data.comparison.label}</th>}
              {data.comparison && <th className="num">Endring</th>}
            </tr>
          </thead>
          <tbody>
            {data.revenue.by_category.map((c) => (
              <tr key={c.key}>
                <td>{c.label}</td>
                <td className="num"><Num value={c.amount} /></td>
                {data.comparison && <td className="num"><Num value={c.comparison} /></td>}
                {data.comparison && <td className="num"><Num value={c.change} signed /></td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {data.revenue.by_month.some((m) => !m.is_complete) && (
        <Footnote>
          Måneder regnskapet ikke dekker fullt ut er tegnet svakere og er ikke
          sammenlignbare med hele måneder.
        </Footnote>
      )}
    </Section>
  );
}

export function CostSection({ data }: { data: ReportDataset }) {
  return (
    <Section title="Kostnader" note="Fordelt på kostnadstype · eks. mva">
      <table>
        <thead>
          <tr>
            <th>Kostnadstype</th>
            <th className="num">Beløp</th>
            <th className="num">Andel av oms.</th>
            {data.comparison && <th className="num">{data.comparison.label}</th>}
            {data.comparison && <th className="num">Endring</th>}
            {data.comparison && <th className="num">%</th>}
          </tr>
        </thead>
        <tbody>
          {data.expenses.by_category
            .slice()
            .sort((a, b) => b.amount - a.amount)
            .map((c) => (
              <tr key={c.key}>
                <td>{c.label}</td>
                <td className="num"><Num value={c.amount} /></td>
                <td className="num">{pct(c.share_of_revenue)}</td>
                {data.comparison && <td className="num"><Num value={c.comparison} /></td>}
                {data.comparison && <td className="num"><Num value={c.change} signed /></td>}
                {data.comparison && <td className="num">{pct(c.change_percent, true)}</td>}
              </tr>
            ))}
          <tr className="total">
            <td>Sum driftskostnader</td>
            <td className="num"><Num value={data.expenses.total} /></td>
            <td className="num">&nbsp;</td>
            {data.comparison && <td className="num">&nbsp;</td>}
            {data.comparison && <td className="num">&nbsp;</td>}
            {data.comparison && <td className="num">&nbsp;</td>}
          </tr>
        </tbody>
      </table>
    </Section>
  );
}

export function BridgeSection({ data }: { data: ReportDataset }) {
  if (data.bridge.length < 3) return null;
  const steps = buildVarianceExplanation(data);

  return (
    <Section
      title="Hva endret resultatet"
      note={`Fra ${data.comparison?.label} til ${data.period.label}`}
    >
      <WaterfallChart steps={data.bridge} />

      <table className="mt-5">
        <tbody>
          {steps.map((step, i) => (
            <tr key={`${step.label}-${i}`}>
              <td>{step.label}</td>
              <td className="num"><Num value={step.amount} signed /></td>
            </tr>
          ))}
          <tr className="total">
            <td>Samlet endring</td>
            <td className="num">
              <Num value={data.financial_summary.change?.operating_profit ?? null} signed />
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  );
}

export function PayrollSection({ data }: { data: ReportDataset }) {
  return (
    <Section title="Personalkostnader">
      <FigureRow
        figures={[
          { label: "Lønn og arbeidsgiverkostnader", value: nok(data.payroll.total) },
          {
            label: "Andel av omsetning",
            value: pct(data.payroll.share_of_revenue),
          },
          {
            label: "Endring",
            value: pct(data.payroll.change_percent, true),
            detail: data.comparison ? `vs. ${data.comparison.label}` : null,
          },
          {
            label: "Vekst mot omsetningsvekst",
            value:
              data.payroll.growth_gap_points != null
                ? `${data.payroll.growth_gap_points > 0 ? "+" : ""}${data.payroll.growth_gap_points.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} pp`
                : "—",
            detail:
              data.payroll.growth_gap_points != null && data.payroll.growth_gap_points > 0
                ? "Lønn vokser raskere enn omsetning"
                : data.payroll.growth_gap_points != null
                  ? "Omsetning vokser raskere enn lønn"
                  : null,
          },
        ]}
      />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Cash and working capital
// ---------------------------------------------------------------------------

export function CashSection({ data }: { data: ReportDataset }) {
  return (
    <Section
      title="Likviditet"
      note="Bokført bankbeholdning ved utgangen av hver måned"
    >
      <FigureRow
        figures={[
          {
            label: "Bokført likviditet",
            value: nok(data.cash.booked),
            detail: "Ikke live banksaldo",
          },
          {
            label: "Laveste punkt i perioden",
            value: data.cash.lowest_point ? nok(data.cash.lowest_point.balance) : "—",
            detail: data.cash.lowest_point ? monthName(data.cash.lowest_point.month) : null,
          },
          { label: "Kundefordringer", value: nok(data.receivables.total) },
          { label: "Leverandørgjeld", value: nok(data.payables.total) },
        ]}
      />

      <div className="mt-6">
        <CashChart points={data.cash.by_month} />
      </div>

      {!data.cash.is_stated && (
        <Footnote>
          Regnskapsfilen oppgir ikke inngående saldo på bankkontoene, så kurven
          viser akkumulert bevegelse i perioden og ikke faktisk saldo.
        </Footnote>
      )}
    </Section>
  );
}

export function WorkingCapitalSection({ data }: { data: ReportDataset }) {
  return (
    <div className="grid grid-cols-2 gap-x-10">
      <Section
        title="Kundefordringer"
        note={`Sum ${nok(data.receivables.total)} inkl. mva`}
      >
        {data.receivables.top.length > 0 ? (
          <RankedBars
            rows={data.receivables.top.map((p) => ({
              label: p.name,
              value: p.amount,
              note: p.share != null ? pct(p.share) : null,
            }))}
            valueFormatter={(n) => nokFormatter.format(n)}
          />
        ) : (
          <p className="text-[13px]" style={{ color: "var(--report-muted)" }}>
            Ingen kunder har utestående saldo.
          </p>
        )}
        {!data.receivables.ageing_available && (
          <Footnote>
            Regnskapsfilen oppgir saldo per kunde, men ikke enkeltfakturaer med
            forfallsdato. Aldersfordeling kan derfor ikke beregnes.
          </Footnote>
        )}
      </Section>

      <Section
        title="Leverandørgjeld"
        note={`Sum ${nok(data.payables.total)} inkl. mva`}
      >
        {data.payables.top.length > 0 ? (
          <RankedBars
            rows={data.payables.top.map((p) => ({
              label: p.name,
              value: p.amount,
              note: p.share != null ? pct(p.share) : null,
            }))}
            valueFormatter={(n) => nokFormatter.format(n)}
          />
        ) : (
          <p className="text-[13px]" style={{ color: "var(--report-muted)" }}>
            Ingen leverandørgjeld registrert.
          </p>
        )}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Customers and suppliers
// ---------------------------------------------------------------------------

export function CustomerSection({ data }: { data: ReportDataset }) {
  const c = data.revenue.concentration;

  return (
    <Section
      title="Kunder"
      note={`Omsetning per kunde, ${data.period.label} · eks. mva`}
    >
      <FigureRow
        figures={[
          { label: "Antall kunder med omsetning", value: String(c.customer_count) },
          { label: "Største kunde", value: pct(c.top_1_share), detail: data.revenue.by_customer[0]?.name ?? null },
          { label: "Tre største", value: pct(c.top_3_share) },
          { label: "Fem største", value: pct(c.top_5_share) },
        ]}
      />

      <div className="mt-6">
        <RankedBars
          rows={data.revenue.by_customer.slice(0, 10).map((p) => ({
            label: p.name,
            value: p.amount,
            note: p.share != null ? pct(p.share) : null,
          }))}
          valueFormatter={(n) => nokFormatter.format(n)}
        />
      </div>

      {c.top_1_share != null && c.top_1_share > 25 && (
        <Footnote>
          Én kunde står for over en fjerdedel av omsetningen. Kundekonsentrasjon
          er en risiko som bør vurderes.
        </Footnote>
      )}
    </Section>
  );
}

export function SupplierSection({ data }: { data: ReportDataset }) {
  if (data.expenses.by_supplier.length === 0) return null;

  return (
    <Section
      title="Leverandører"
      note={`Kostnad per leverandør, ${data.period.label} · eks. mva`}
    >
      <RankedBars
        rows={data.expenses.by_supplier.slice(0, 10).map((p) => ({
          label: p.name,
          value: p.amount,
          note: p.share != null ? pct(p.share) : null,
        }))}
        valueFormatter={(n) => nokFormatter.format(n)}
      />
    </Section>
  );
}

export function RecurringSection({ data }: { data: ReportDataset }) {
  if (!data.revenue.recurring) return null;
  const r = data.revenue.recurring;

  return (
    <Section title="Gjentakende inntekter">
      <FigureRow
        figures={[
          { label: "MRR", value: nok(r.mrr) },
          { label: "ARR", value: nok(r.arr) },
          { label: "Andel av omsetning", value: pct(r.share_of_revenue) },
        ]}
      />
      <Footnote>
        Eks. mva.{" "}
        {r.based_on_product_list
          ? "Kvartals- og årskontrakter er fordelt ned på måned."
          : "Utledet fra posteringstekst fordi ingen liste over gjentakende fakturaer er lastet opp. Tallet er usikkert."}
      </Footnote>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Budget and forecast
// ---------------------------------------------------------------------------

export function BudgetSection({ data }: { data: ReportDataset }) {
  if (!data.budget) return null;

  return (
    <Section title="Budsjett mot faktisk" note={data.budget.name}>
      <table>
        <thead>
          <tr>
            <th>&nbsp;</th>
            <th className="num">Faktisk</th>
            <th className="num">Budsjett</th>
            <th className="num">Avvik</th>
            <th className="num">%</th>
          </tr>
        </thead>
        <tbody>
          {data.budget.lines.map((l) => (
            <tr key={l.key}>
              <td>{l.label}</td>
              <td className="num"><Num value={l.actual} /></td>
              <td className="num"><Num value={l.budget} /></td>
              <td className="num"><Num value={l.variance} signed /></td>
              <td className="num">{pct(l.variance_percent, true)}</td>
            </tr>
          ))}
          <tr className="total">
            <td>Driftsresultat</td>
            <td className="num"><Num value={data.budget.total_actual} /></td>
            <td className="num"><Num value={data.budget.total_budget} /></td>
            <td className="num">
              <Num value={data.budget.total_actual - data.budget.total_budget} signed />
            </td>
            <td className="num">&nbsp;</td>
          </tr>
        </tbody>
      </table>

      <Footnote>
        Positivt avvik betyr bedre enn budsjett: høyere inntekt eller lavere
        kostnad.
      </Footnote>
    </Section>
  );
}

export function ForecastSection({ data }: { data: ReportDataset }) {
  if (!data.forecast) return null;

  return (
    <Section title="Prognose">
      <FigureRow
        figures={[
          { label: "Omsetning, fullår", value: nok(data.forecast.full_year_revenue) },
          { label: "Driftsresultat, fullår", value: nok(data.forecast.full_year_profit) },
          {
            label: "Faktiske måneder",
            value: String(data.forecast.actual_months),
            detail: "resten er budsjett",
          },
        ]}
      />
      <Footnote>Estimat. {data.forecast.method}.</Footnote>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// KPIs, observations, risk
// ---------------------------------------------------------------------------

export function KpiSection({ data }: { data: ReportDataset }) {
  return (
    <Section title="Nøkkeltall">
      <table>
        <thead>
          <tr>
            <th>Nøkkeltall</th>
            <th className="num">{data.period.label}</th>
            {data.comparison && <th className="num">{data.comparison.label}</th>}
          </tr>
        </thead>
        <tbody>
          {data.kpis.map((k) => (
            <tr key={k.key}>
              <td>{k.label}</td>
              <td className="num">
                {k.unit === "percent" ? pct(k.value) : <Num value={k.value} />}
              </td>
              {data.comparison && (
                <td className="num">
                  {k.comparison == null
                    ? "—"
                    : k.unit === "percent"
                      ? pct(k.comparison)
                      : nokFormatter.format(k.comparison)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

export function ObservationSection({ data }: { data: ReportDataset }) {
  const observations = buildObservations(data);
  if (observations.length === 0) return null;

  return (
    <Section title="Elidas observasjoner">
      <div className="space-y-4">
        {observations.map((o, i) => (
          <div key={i}>
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--report-body)" }}>
              {o.text}
            </p>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--report-muted)" }}>
              {o.basis}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function RiskSection({ data }: { data: ReportDataset }) {
  const risks: string[] = [];
  const c = data.revenue.concentration;

  if (c.top_1_share != null && c.top_1_share > 25) {
    risks.push(
      `Kundekonsentrasjon: ${data.revenue.by_customer[0]?.name} står for ${pct(c.top_1_share)} av omsetningen.`
    );
  }
  if (c.top_3_share != null && c.top_3_share > 55) {
    risks.push(`De tre største kundene står for ${pct(c.top_3_share)} av omsetningen.`);
  }
  if (data.payroll.growth_gap_points != null && data.payroll.growth_gap_points > 5) {
    risks.push(
      `Personalkostnadene vokser vesentlig raskere enn omsetningen, ${data.payroll.growth_gap_points.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} prosentpoeng.`
    );
  }
  if (data.financial_summary.operating_margin != null && data.financial_summary.operating_margin < 5) {
    risks.push(
      `Driftsmarginen er ${pct(data.financial_summary.operating_margin)}, som gir liten margin for uforutsette kostnader.`
    );
  }
  if (data.cash.lowest_point && data.cash.lowest_point.balance < 0) {
    risks.push(
      `Bokført likviditet var negativ i ${monthName(data.cash.lowest_point.month)}.`
    );
  }
  if (
    data.receivables.total != null &&
    data.financial_summary.revenue > 0 &&
    data.receivables.total > data.financial_summary.revenue * 0.3
  ) {
    risks.push(
      `Kundefordringene tilsvarer over 30 % av omsetningen i perioden, ${nok(data.receivables.total)}.`
    );
  }

  const increases = data.expenses.largest_increases.filter(
    (i) => i.change_percent != null && i.change_percent > 25
  );
  for (const i of increases.slice(0, 2)) {
    risks.push(`${i.label} har økt ${pct(i.change_percent, true)} i perioden.`);
  }

  return (
    <Section title="Risiko">
      {risks.length > 0 ? (
        <PointList items={risks} />
      ) : (
        <p className="text-[13px]" style={{ color: "var(--report-muted)" }}>
          Ingen forhold i tallgrunnlaget peker på vesentlig risiko i denne
          perioden.
        </p>
      )}
    </Section>
  );
}

export function ManagementCommentSection({ comment }: { comment: string }) {
  if (!comment.trim()) return null;

  return (
    <Section title="Ledelsens kommentar">
      <div className="space-y-2.5 text-[13.5px] leading-[1.65]" style={{ color: "var(--report-body)" }}>
        {comment.split(/\n\s*\n/).map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
    </Section>
  );
}

export function DataQualitySection({ data }: { data: ReportDataset }) {
  const q = data.data_quality;

  return (
    <Section title="Datagrunnlag">
      <table>
        <tbody>
          <tr>
            <td>Regnskapet dekker</td>
            <td className="num">
              {q.books_cover ? `${q.books_cover.start} – ${q.books_cover.end}` : "—"}
            </td>
          </tr>
          <tr>
            <td>Posteringer i perioden</td>
            <td className="num">{q.transaction_count.toLocaleString("nb-NO")}</td>
          </tr>
          <tr>
            <td>Sist importert</td>
            <td className="num">
              {q.last_import ? q.last_import.slice(0, 10) : "—"}
            </td>
          </tr>
          <tr>
            <td>Kilde</td>
            <td className="num">SAF-T Regnskap</td>
          </tr>
        </tbody>
      </table>

      {q.notes.length > 0 && (
        <div className="mt-4">
          <PointList items={q.notes} />
        </div>
      )}
    </Section>
  );
}
