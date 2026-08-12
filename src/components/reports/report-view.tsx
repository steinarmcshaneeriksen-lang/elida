"use client";

import { Fragment } from "react";
import type { ReportDataset } from "@/lib/reports/dataset";
import type { ReportConfiguration } from "@/lib/reports/types";
import { reportTypeByKey } from "@/lib/reports/types";
import {
  CoverPage,
  Disclaimer,
  PageFoot,
  ReportPage,
  RunningHead,
  type Branding,
} from "./document";
import {
  BridgeSection,
  BudgetSection,
  CashSection,
  CostSection,
  CustomerSection,
  DataQualitySection,
  ExecutiveSummarySection,
  ForecastSection,
  KpiSection,
  ManagementCommentSection,
  ObservationSection,
  PayrollSection,
  RecurringSection,
  ResultSection,
  RevenueSection,
  RiskSection,
  SupplierSection,
  WorkingCapitalSection,
} from "./sections";

/**
 * Renders a dataset as a document.
 *
 * Sections are grouped into pages: a new page starts wherever the
 * configuration asks for a break, so the same component produces both the
 * on-screen preview and what comes out of the printer.
 */
export function ReportView({
  data,
  config,
  generatedBy,
}: {
  data: ReportDataset;
  config: ReportConfiguration;
  generatedBy?: string | null;
}) {
  const type = reportTypeByKey(data.report_type);

  const branding: Branding = {
    useCompanyBranding: config.branding.useCompanyBranding,
    companyName: data.company.name,
    orgNumber: data.company.org_number,
    logoUrl: config.branding.logoUrl,
    footerText: config.branding.footerText,
    confidentiality: config.branding.confidentiality,
    showElidaCredit: config.branding.showElidaCredit,
  };

  // Sections the dataset cannot support are dropped rather than rendered
  // empty — a heading with nothing under it reads as a fault in the report.
  const sections = config.sections.filter((key) => hasContent(key, data, config));

  const pages: string[][] = [];
  let page: string[] = [];

  for (const section of sections) {
    if (page.length > 0 && config.pageBreakBefore.includes(section)) {
      pages.push(page);
      page = [];
    }
    page.push(section);
  }
  if (page.length > 0) pages.push(page);

  return (
    <div className="report">
      <CoverPage
        branding={branding}
        title={type.title}
        subtitle={config.subtitle}
        periodLabel={data.period.label}
        generatedAt={data.generated_at}
        generatedBy={generatedBy ?? null}
      />

      {pages.map((pageSections, index) => (
        <ReportPage key={index}>
          <RunningHead
            companyName={data.company.name}
            title={type.title}
            periodLabel={data.period.label}
          />

          <div className="flex-1">
            {pageSections.map((key) => (
              <Fragment key={key}>{renderSection(key, data, config)}</Fragment>
            ))}
            {index === pages.length - 1 && <Disclaimer />}
          </div>

          <PageFoot
            confidentiality={branding.confidentiality}
            footerText={
              branding.footerText ??
              (branding.showElidaCredit ? "Generert med Elida" : null)
            }
          />
        </ReportPage>
      ))}
    </div>
  );
}

function renderSection(
  key: string,
  data: ReportDataset,
  config: ReportConfiguration
) {
  switch (key) {
    case "summary":
      return <ExecutiveSummarySection data={data} />;
    case "result":
      return <ResultSection data={data} />;
    case "revenue":
      return <RevenueSection data={data} />;
    case "costs":
      return <CostSection data={data} />;
    case "bridge":
      return <BridgeSection data={data} />;
    case "payroll":
      return <PayrollSection data={data} />;
    case "cash":
      return <CashSection data={data} />;
    case "working_capital":
      return <WorkingCapitalSection data={data} />;
    case "customers":
      return <CustomerSection data={data} />;
    case "suppliers":
      return <SupplierSection data={data} />;
    case "recurring":
      return <RecurringSection data={data} />;
    case "budget":
      return <BudgetSection data={data} />;
    case "forecast":
      return <ForecastSection data={data} />;
    case "kpis":
      return <KpiSection data={data} />;
    case "observations":
      return <ObservationSection data={data} />;
    case "risk":
      return <RiskSection data={data} />;
    case "management_comment":
      return <ManagementCommentSection comment={config.managementComment} />;
    case "data_quality":
      return <DataQualitySection data={data} />;
    default:
      return null;
  }
}

function hasContent(
  key: string,
  data: ReportDataset,
  config: ReportConfiguration
): boolean {
  switch (key) {
    case "bridge":
      return data.bridge.length >= 3;
    case "budget":
    case "forecast":
      return data.budget != null;
    case "recurring":
      return data.revenue.recurring != null;
    case "suppliers":
      return data.expenses.by_supplier.length > 0;
    case "customers":
      return data.revenue.by_customer.length > 0;
    case "management_comment":
      return config.managementComment.trim().length > 0;
    default:
      return true;
  }
}
