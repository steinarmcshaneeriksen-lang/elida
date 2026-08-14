/**
 * The written parts of a report.
 *
 * Every sentence here is assembled from figures already in the dataset. No
 * language model is involved: a board pack must not contain a number that
 * cannot be traced to a posting, and a summary that is regenerated must not
 * come back saying something different about the same period.
 *
 * The rules are the ones a finance lead would apply reading the same numbers —
 * is growth profitable, is the cost base outpacing revenue, when does cash dip.
 */

import type { ReportDataset } from "./dataset";
import { formatDate } from "./dataset";

export interface ExecutiveSummary {
  status: string[];
  headline_kpis: Array<{ label: string; value: string; detail: string | null }>;
  positives: string[];
  challenges: string[];
  ahead: string[];
}

const nok = (n: number) =>
  new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(n) + " kr";

const pct = (n: number) =>
  `${n > 0 ? "+" : ""}${n.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} %`;

const plainPct = (n: number) =>
  `${n.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} %`;

export function buildExecutiveSummary(data: ReportDataset): ExecutiveSummary {
  const status: string[] = [];
  const positives: string[] = [];
  const challenges: string[] = [];
  const ahead: string[] = [];

  const fs = data.financial_summary;
  const company = data.company.name;

  // --- Status ------------------------------------------------------------

  if (fs.change && fs.change.revenue_percent != null) {
    const direction = fs.change.revenue_percent >= 0 ? "vokst" : "falt";
    status.push(
      `${company} hadde en omsetning på ${nok(fs.revenue)} i ${data.period.label}. ` +
        `Det er ${pct(fs.change.revenue_percent)} sammenlignet med ${data.comparison?.label ?? "forrige periode"}, ` +
        `altså at omsetningen har ${direction}.`
    );
  } else {
    status.push(
      `${company} hadde en omsetning på ${nok(fs.revenue)} i ${data.period.label}.`
    );
  }

  const profitWord = fs.operating_profit >= 0 ? "overskudd" : "underskudd";
  if (fs.operating_margin != null) {
    status.push(
      `Driftsresultatet er ${nok(fs.operating_profit)}, et ${profitWord} som gir en driftsmargin på ${plainPct(fs.operating_margin)}.`
    );
  } else {
    status.push(`Driftsresultatet er ${nok(fs.operating_profit)}.`);
  }

  // The observation that matters most in a growing company: whether the cost
  // base is growing faster than what it produces.
  if (
    fs.change?.revenue_percent != null &&
    fs.change.operating_profit_percent != null &&
    fs.change.revenue_percent > 0
  ) {
    if (fs.change.operating_profit_percent < fs.change.revenue_percent - 2) {
      status.push(
        `Omsetningen har vokst ${pct(fs.change.revenue_percent)}, men driftsresultatet bare ${pct(fs.change.operating_profit_percent)}. ` +
          `Kostnadsbasen vokser derfor raskere enn inntektene.`
      );
    } else if (fs.change.operating_profit_percent > fs.change.revenue_percent + 2) {
      status.push(
        `Driftsresultatet vokser raskere enn omsetningen, ${pct(fs.change.operating_profit_percent)} mot ${pct(fs.change.revenue_percent)}. Veksten er lønnsom.`
      );
    }
  }

  if (data.cash.lowest_point && data.cash.booked != null) {
    status.push(
      `Bokført likviditet er ${nok(data.cash.booked)}. Laveste punkt i perioden var ${nok(data.cash.lowest_point.balance)} i ${monthName(data.cash.lowest_point.month)}.`
    );
  }

  // --- KPIs --------------------------------------------------------------

  const headline_kpis = data.kpis.slice(0, 5).map((k) => ({
    label: k.label,
    value:
      k.unit === "percent"
        ? plainPct(k.value)
        : k.unit === "NOK"
          ? nok(k.value)
          : String(k.value),
    detail:
      k.change_percent != null
        ? `${pct(k.change_percent)} vs. ${data.comparison?.label ?? "forrige periode"}`
        : null,
  }));

  // --- Positives ---------------------------------------------------------

  if (fs.change?.revenue_percent != null && fs.change.revenue_percent > 2) {
    positives.push(
      `Omsetningen er ${pct(fs.change.revenue_percent)} høyere enn ${data.comparison?.label ?? "forrige periode"}, en økning på ${nok(fs.change.revenue)}.`
    );
  }

  if (fs.change?.margin_points != null && fs.change.margin_points > 0.5) {
    positives.push(
      `Driftsmarginen er ${fs.change.margin_points.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} prosentpoeng bedre enn i sammenligningsperioden.`
    );
  }

  if (data.revenue.recurring?.mrr != null && data.revenue.recurring.share_of_revenue != null) {
    positives.push(
      `Gjentakende inntekter utgjør ${nok(data.revenue.recurring.mrr)} i måneden, ${plainPct(data.revenue.recurring.share_of_revenue)} av omsetningen. Det gir forutsigbarhet i inntektsgrunnlaget.`
    );
  }

  const fallingCosts = data.expenses.by_category
    .filter((c) => c.change != null && c.change < 0)
    .sort((a, b) => (a.change ?? 0) - (b.change ?? 0))[0];
  if (fallingCosts?.change != null && Math.abs(fallingCosts.change) > fs.revenue * 0.01) {
    positives.push(
      `${fallingCosts.label} er redusert med ${nok(Math.abs(fallingCosts.change))}.`
    );
  }

  // --- Challenges --------------------------------------------------------

  if (data.payroll.growth_gap_points != null && data.payroll.growth_gap_points > 3) {
    challenges.push(
      `Personalkostnadene vokser ${data.payroll.growth_gap_points.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} prosentpoeng raskere enn omsetningen.`
    );
  }

  for (const increase of data.expenses.largest_increases.slice(0, 2)) {
    if (increase.change_percent != null && increase.change_percent > 15) {
      challenges.push(
        `${increase.label} har økt ${pct(increase.change_percent)} til ${nok(increase.amount)}, en økning på ${nok(increase.change ?? 0)}.`
      );
    }
  }

  if (data.revenue.concentration.top_1_share != null && data.revenue.concentration.top_1_share > 25) {
    const top = data.revenue.by_customer[0];
    challenges.push(
      `${top.name} står for ${plainPct(data.revenue.concentration.top_1_share)} av omsetningen. Kundekonsentrasjonen er en risiko.`
    );
  }

  if (fs.change?.margin_points != null && fs.change.margin_points < -1) {
    challenges.push(
      `Driftsmarginen er svekket med ${Math.abs(fs.change.margin_points).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} prosentpoeng.`
    );
  }

  if (
    data.receivables.total != null &&
    fs.revenue > 0 &&
    data.receivables.total > fs.revenue * 0.25
  ) {
    challenges.push(
      `Utestående kundefordringer er ${nok(data.receivables.total)}, som tilsvarer ${plainPct((data.receivables.total / fs.revenue) * 100)} av omsetningen i perioden.`
    );
  }

  // --- Ahead -------------------------------------------------------------

  if (data.forecast) {
    ahead.push(
      `Fullårsprognosen er ${nok(data.forecast.full_year_revenue)} i omsetning og ${nok(data.forecast.full_year_profit)} i driftsresultat, basert på ${data.forecast.actual_months} måneder med faktiske tall og budsjett for resten av året.`
    );
  }

  if (data.budget) {
    const revenueLine = data.budget.lines.find((l) => l.key === "revenue");
    if (revenueLine && revenueLine.variance_percent != null) {
      ahead.push(
        revenueLine.variance >= 0
          ? `Omsetningen ligger ${nok(revenueLine.variance)} over budsjett hittil.`
          : `Omsetningen ligger ${nok(Math.abs(revenueLine.variance))} under budsjett hittil, ${plainPct(Math.abs(revenueLine.variance_percent))}.`
      );
    }
  }

  if (data.payables.total != null && data.payables.total > 0) {
    ahead.push(
      `Leverandørgjelden er ${nok(data.payables.total)} ved periodens slutt og forfaller i tiden framover.`
    );
  }

  return {
    status,
    headline_kpis,
    positives: positives.slice(0, 3),
    challenges: challenges.slice(0, 3),
    ahead: ahead.slice(0, 3),
  };
}

/**
 * The quantified explanation of a change in profit. The spec asks for this in
 * kroner per cause, which the bridge already holds — this turns it into the
 * lines a reader scans.
 */
export function buildVarianceExplanation(
  data: ReportDataset
): Array<{ label: string; amount: number }> {
  return data.bridge
    .filter((s) => s.kind === "change")
    .map((s) => ({ label: s.label, amount: s.amount }));
}

/**
 * Observations, each with what it was computed from. Derived rules first, then
 * anything the insight engine has stored, so a report always has substance
 * even before insights have been generated.
 */
export function buildObservations(
  data: ReportDataset
): Array<{ text: string; basis: string }> {
  const out: Array<{ text: string; basis: string }> = [];

  for (const increase of data.expenses.largest_increases) {
    if (increase.change_percent == null || increase.change_percent < 10) continue;
    out.push({
      text: `${increase.label} har økt ${pct(increase.change_percent)} til ${nok(increase.amount)}.`,
      basis: `${data.period.label} mot ${data.comparison?.label ?? "sammenligningsperioden"}`,
    });
  }

  if (data.revenue.concentration.top_1_share != null && data.revenue.by_customer[0]) {
    out.push({
      text: `${data.revenue.by_customer[0].name} står for ${plainPct(data.revenue.concentration.top_1_share)} av total omsetning.`,
      basis: `Omsetning per kunde, ${data.period.label}`,
    });
  }

  if (data.revenue.concentration.top_5_share != null && data.revenue.concentration.top_5_share > 60) {
    out.push({
      text: `De fem største kundene står for ${plainPct(data.revenue.concentration.top_5_share)} av omsetningen.`,
      basis: `Omsetning per kunde, ${data.period.label}`,
    });
  }

  if (data.payroll.growth_gap_points != null && Math.abs(data.payroll.growth_gap_points) > 2) {
    const faster = data.payroll.growth_gap_points > 0 ? "raskere" : "saktere";
    out.push({
      text: `Personalkostnaden vokser ${Math.abs(data.payroll.growth_gap_points).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} prosentpoeng ${faster} enn omsetningen.`,
      basis: `Konto 5000–5999, ${data.period.label} mot ${data.comparison?.label ?? "sammenligningsperioden"}`,
    });
  }

  if (data.payroll.share_of_revenue != null) {
    out.push({
      text: `Lønn og arbeidsgiverkostnader utgjør ${plainPct(data.payroll.share_of_revenue)} av omsetningen.`,
      basis: `Konto 5000–5999, ${data.period.label}`,
    });
  }

  if (data.cash.lowest_point) {
    out.push({
      text: `Laveste bokførte likviditet i perioden var ${nok(data.cash.lowest_point.balance)} i ${monthName(data.cash.lowest_point.month)}.`,
      basis: `Bankkontoer 1900–1999, saldo ved månedsslutt`,
    });
  }

  for (const insight of data.insights) {
    out.push({
      text: insight.description || insight.title,
      basis: insight.basis ?? "Elidas analysemotor",
    });
  }

  return out.slice(0, 10);
}

const MONTH_NAMES = [
  "januar", "februar", "mars", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "desember",
];

function monthName(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export { formatDate };
