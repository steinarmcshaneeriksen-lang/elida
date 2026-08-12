/**
 * Excel export.
 *
 * The point of the Excel file is that someone can keep working in it — sort a
 * column, add a formula, paste it into a model. So it is written as proper
 * sheets with header rows and numeric cells, not a dumped object, and numbers
 * stay numbers rather than becoming pre-formatted strings.
 */

import * as XLSX from "xlsx";
import type { ReportDataset } from "./dataset";
import { reportTypeByKey } from "./types";

type Row = Array<string | number | null>;

function sheet(rows: Row[]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths sized to the longest cell, so nothing arrives as ####.
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      const length = cell == null ? 0 : String(cell).length;
      widths[i] = Math.max(widths[i] ?? 10, Math.min(length + 2, 48));
    });
  }
  ws["!cols"] = widths.map((w) => ({ wch: w }));

  return ws;
}

export function buildReportWorkbook(data: ReportDataset): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const type = reportTypeByKey(data.report_type);
  const fs = data.financial_summary;

  // --- Sammendrag --------------------------------------------------------

  const summary: Row[] = [
    [data.company.name],
    [type.title],
    [data.period.label],
    data.comparison ? [`Sammenlignet med ${data.comparison.label}`] : [],
    [],
    ["", data.period.label, data.comparison?.label ?? "", "Endring", "Endring %"],
    [
      "Omsetning",
      fs.revenue,
      fs.comparison?.revenue ?? null,
      fs.change?.revenue ?? null,
      fs.change?.revenue_percent ?? null,
    ],
    [
      "Driftskostnader",
      fs.costs,
      fs.comparison?.costs ?? null,
      fs.comparison ? fs.costs - fs.comparison.costs : null,
      null,
    ],
    [
      "Driftsresultat",
      fs.operating_profit,
      fs.comparison?.operating_profit ?? null,
      fs.change?.operating_profit ?? null,
      fs.change?.operating_profit_percent ?? null,
    ],
    [
      "Driftsmargin %",
      fs.operating_margin,
      fs.comparison?.operating_margin ?? null,
      fs.change?.margin_points ?? null,
      null,
    ],
    [],
    ["Nøkkeltall", "Verdi", "Sammenligning"],
    ...data.kpis.map((k): Row => [k.label, k.value, k.comparison]),
  ];

  XLSX.utils.book_append_sheet(wb, sheet(summary), "Sammendrag");

  // --- Resultat per måned ------------------------------------------------

  XLSX.utils.book_append_sheet(
    wb,
    sheet([
      ["Måned", "Omsetning", "Driftskostnader", "Driftsresultat", "Full måned"],
      ...data.revenue.by_month.map((m): Row => [
        m.month,
        m.revenue,
        m.costs,
        m.operating_profit,
        m.is_complete ? "Ja" : "Nei",
      ]),
    ]),
    "Per måned"
  );

  // --- Kostnader ---------------------------------------------------------

  XLSX.utils.book_append_sheet(
    wb,
    sheet([
      ["Kostnadstype", "Beløp", "Sammenligning", "Endring", "Endring %", "Andel av omsetning %"],
      ...data.expenses.by_category.map((c): Row => [
        c.label,
        c.amount,
        c.comparison,
        c.change,
        c.change_percent,
        c.share_of_revenue,
      ]),
      [],
      ["Konto", "Kontonavn", "Beløp", "Sammenligning", "Endring"],
      ...data.expenses.largest_accounts.map((a): Row => [
        a.account_number,
        a.name,
        a.amount,
        a.comparison,
        a.change,
      ]),
    ]),
    "Kostnader"
  );

  // --- Kunder ------------------------------------------------------------

  XLSX.utils.book_append_sheet(
    wb,
    sheet([
      ["Kunde", "Omsetning i perioden", "Andel av omsetning %"],
      ...data.revenue.by_customer.map((c): Row => [c.name, c.amount, c.share]),
      [],
      ["Kunde", "Utestående saldo", "Andel av fordringer %"],
      ...data.receivables.top.map((c): Row => [c.name, c.amount, c.share]),
    ]),
    "Kunder"
  );

  // --- Leverandører ------------------------------------------------------

  if (data.expenses.by_supplier.length > 0 || data.payables.top.length > 0) {
    XLSX.utils.book_append_sheet(
      wb,
      sheet([
        ["Leverandør", "Kostnad i perioden", "Andel av kostnader %"],
        ...data.expenses.by_supplier.map((s): Row => [s.name, s.amount, s.share]),
        [],
        ["Leverandør", "Vi skylder", "Andel av gjeld %"],
        ...data.payables.top.map((s): Row => [s.name, s.amount, s.share]),
      ]),
      "Leverandører"
    );
  }

  // --- Likviditet --------------------------------------------------------

  XLSX.utils.book_append_sheet(
    wb,
    sheet([
      ["Bokført likviditet", data.cash.booked],
      [],
      ["Måned", "Bevegelse", "Saldo ved månedsslutt"],
      ...data.cash.by_month.map((m): Row => [m.month, m.movement, m.balance]),
      [],
      ["Konto", "Kontonavn", "Saldo"],
      ...data.cash.accounts.map((a): Row => [a.account_number, a.name, a.balance]),
    ]),
    "Likviditet"
  );

  // --- Budsjett ----------------------------------------------------------

  if (data.budget) {
    XLSX.utils.book_append_sheet(
      wb,
      sheet([
        [data.budget.name],
        [],
        ["", "Faktisk", "Budsjett", "Avvik", "Avvik %"],
        ...data.budget.lines.map((l): Row => [
          l.label,
          l.actual,
          l.budget,
          l.variance,
          l.variance_percent,
        ]),
        [
          "Driftsresultat",
          data.budget.total_actual,
          data.budget.total_budget,
          data.budget.total_actual - data.budget.total_budget,
          null,
        ],
        ...(data.forecast
          ? [
              [] as Row,
              ["Prognose fullår"] as Row,
              ["Omsetning", data.forecast.full_year_revenue] as Row,
              ["Driftsresultat", data.forecast.full_year_profit] as Row,
              ["Metode", data.forecast.method] as Row,
            ]
          : []),
      ]),
      "Budsjett"
    );
  }

  // --- Endringsforklaring ------------------------------------------------

  if (data.bridge.length >= 3) {
    XLSX.utils.book_append_sheet(
      wb,
      sheet([
        ["Hva endret resultatet"],
        [],
        ["Post", "Beløp"],
        ...data.bridge.map((s): Row => [s.label, s.amount]),
      ]),
      "Endringsforklaring"
    );
  }

  // --- Datagrunnlag ------------------------------------------------------

  XLSX.utils.book_append_sheet(
    wb,
    sheet([
      ["Datagrunnlag"],
      [],
      ["Selskap", data.company.name],
      ["Org.nr", data.company.org_number],
      ["Periode", `${data.period.start} – ${data.period.end}`],
      ["Sammenligning", data.comparison ? `${data.comparison.start} – ${data.comparison.end}` : "—"],
      ["Regnskapet dekker", data.data_quality.books_cover
        ? `${data.data_quality.books_cover.start} – ${data.data_quality.books_cover.end}`
        : "—"],
      ["Posteringer i perioden", data.data_quality.transaction_count],
      ["Sist importert", data.data_quality.last_import?.slice(0, 10) ?? "—"],
      ["Kilde", "SAF-T Regnskap"],
      ["Generert", data.generated_at.slice(0, 19).replace("T", " ")],
      [],
      ...data.data_quality.notes.map((n): Row => [n]),
    ]),
    "Datagrunnlag"
  );

  return wb;
}

/** Builds the workbook and hands the browser a download. */
export function downloadReportWorkbook(data: ReportDataset, filename: string) {
  const wb = buildReportWorkbook(data);
  XLSX.writeFile(wb, filename);
}
