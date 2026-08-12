"use client";

import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { formatDate } from "@/lib/reports/dataset";

/**
 * The document furniture every report shares: cover, running head, page foot,
 * section headings, tables and figure blocks.
 *
 * Kept deliberately plain. A board pack earns its authority from the numbers
 * and the layout, not from coloured panels — so there are no card borders, no
 * badges and no fills that do not carry information.
 */

export function ReportPage({
  children,
  landscape = false,
}: {
  children: ReactNode;
  landscape?: boolean;
}) {
  return (
    <section
      className={`report-page ${landscape ? "report-page--landscape" : ""}`}
    >
      {children}
    </section>
  );
}

export interface Branding {
  useCompanyBranding: boolean;
  companyName: string;
  orgNumber: string | null;
  logoUrl: string | null;
  footerText: string | null;
  confidentiality: string | null;
  showElidaCredit: boolean;
}

export function CoverPage({
  branding,
  title,
  subtitle,
  periodLabel,
  generatedAt,
  generatedBy,
}: {
  branding: Branding;
  title: string;
  subtitle?: string | null;
  periodLabel: string;
  generatedAt: string;
  generatedBy: string | null;
}) {
  return (
    <ReportPage>
      <div className="flex flex-1 flex-col">
        <div className="flex items-start justify-between">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoUrl}
              alt={branding.companyName}
              style={{ maxHeight: 44, maxWidth: 200 }}
            />
          ) : branding.useCompanyBranding ? (
            <span
              className="text-lg font-semibold"
              style={{ color: "var(--report-ink)" }}
            >
              {branding.companyName}
            </span>
          ) : (
            <Logo size={26} />
          )}

          {branding.confidentiality && (
            <span
              className="text-[11px] uppercase tracking-[0.14em]"
              style={{ color: "var(--report-muted)" }}
            >
              {branding.confidentiality}
            </span>
          )}
        </div>

        {/* The title block sits at the optical third rather than centred, the
            way a report cover is set rather than a slide. */}
        <div className="mt-[38mm] max-w-[135mm]">
          <p
            className="text-[13px] uppercase tracking-[0.16em]"
            style={{ color: "var(--report-muted)" }}
          >
            {branding.companyName}
            {branding.orgNumber ? ` · Org.nr ${branding.orgNumber}` : ""}
          </p>

          <h1
            className="mt-5 text-[42px] leading-[1.08] tracking-[-0.02em]"
            style={{ color: "var(--report-ink)" }}
          >
            {title}
          </h1>

          <p
            className="mt-4 text-[19px] font-light"
            style={{ color: "var(--report-body)" }}
          >
            {periodLabel}
          </p>

          {subtitle && (
            <p
              className="mt-6 max-w-[110mm] text-[14px] leading-relaxed"
              style={{ color: "var(--report-muted)" }}
            >
              {subtitle}
            </p>
          )}
        </div>

        <div className="mt-auto">
          <hr className="report-rule" />
          <div className="flex items-end justify-between pt-4">
            <div className="text-[11.5px]" style={{ color: "var(--report-muted)" }}>
              <p>Generert {formatDate(generatedAt.slice(0, 10))}</p>
              {generatedBy && <p className="mt-0.5">Av {generatedBy}</p>}
            </div>
            {branding.showElidaCredit && (
              <span className="text-[11px]" style={{ color: "var(--report-muted)" }}>
                Generert med Elida
              </span>
            )}
          </div>
        </div>
      </div>
    </ReportPage>
  );
}

export function RunningHead({
  companyName,
  title,
  periodLabel,
}: {
  companyName: string;
  title: string;
  periodLabel: string;
}) {
  return (
    <div className="mb-8">
      <div
        className="flex items-baseline justify-between text-[10.5px]"
        style={{ color: "var(--report-muted)" }}
      >
        <span>{companyName}</span>
        <span>
          {title} · {periodLabel}
        </span>
      </div>
      <hr className="report-rule mt-2" />
    </div>
  );
}

export function PageFoot({
  confidentiality,
  footerText,
}: {
  confidentiality: string | null;
  footerText: string | null;
}) {
  return (
    <div className="mt-auto pt-8">
      <hr className="report-rule" />
      <div
        className="flex justify-between pt-2 text-[10.5px]"
        style={{ color: "var(--report-muted)" }}
      >
        <span>{confidentiality ?? ""}</span>
        <span>{footerText ?? ""}</span>
      </div>
    </div>
  );
}

export function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string | null;
  children: ReactNode;
}) {
  return (
    <section className="report-avoid-break mb-9">
      <h2
        className="text-[15px] font-semibold tracking-[-0.008em]"
        style={{ color: "var(--report-ink)" }}
      >
        {title}
      </h2>
      {note && (
        <p className="mt-1 text-[12px]" style={{ color: "var(--report-muted)" }}>
          {note}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** A row of headline figures. No boxes — the rules carry the structure. */
export function FigureRow({
  figures,
}: {
  figures: Array<{ label: string; value: string; detail?: string | null }>;
}) {
  return (
    <div
      className="grid gap-x-8 gap-y-6"
      style={{
        gridTemplateColumns: `repeat(${Math.min(figures.length, 4)}, minmax(0, 1fr))`,
      }}
    >
      {figures.map((f) => (
        <div key={f.label}>
          <p className="text-[11.5px]" style={{ color: "var(--report-muted)" }}>
            {f.label}
          </p>
          <p
            className="mt-1.5 text-[22px] font-semibold tracking-[-0.015em] tabular-nums"
            style={{ color: "var(--report-ink)" }}
          >
            {f.value}
          </p>
          {f.detail && (
            <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--report-muted)" }}>
              {f.detail}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export function Footnote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 text-[11px] leading-relaxed" style={{ color: "var(--report-muted)" }}>
      {children}
    </p>
  );
}

/** A short list where each item is one observation, not a bullet-point essay. */
export function PointList({ items }: { items: string[] }) {
  if (items.length === 0) return null;

  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-[13px] leading-relaxed">
          <span
            className="mt-[7px] h-[3px] w-[3px] shrink-0 rounded-full"
            style={{ background: "var(--report-muted)" }}
          />
          <span style={{ color: "var(--report-body)" }}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function Disclaimer() {
  return (
    <p className="mt-6 text-[10.5px] leading-relaxed" style={{ color: "var(--report-muted)" }}>
      Rapporten er generert av Elida basert på tilgjengelige regnskapsdata og
      kan inneholde estimater. Den er ment som beslutningsstøtte og erstatter
      ikke kontroll av regnskapet eller profesjonell økonomisk, regnskapsmessig,
      skattemessig eller juridisk rådgivning.
    </p>
  );
}
