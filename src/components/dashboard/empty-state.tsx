"use client";

import Link from "next/link";
import { Database, Loader2, AlertTriangle } from "lucide-react";

/**
 * Shown wherever a page has no synced accounting data to display.
 *
 * The point is to be explicit that nothing has been imported yet, rather
 * than rendering zeroes or placeholder figures that read as real numbers.
 */
export function NoDataState({
  title = "Ingen regnskapsdata ennå",
  description = "Importer en SAF-T-fil fra regnskapssystemet ditt, så fyller Elida ut denne siden med dine egne tall.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border bg-surface px-6 py-16 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-b from-[var(--primary-50)] to-white shadow-[inset_0_0_0_1px_var(--primary-100)]">
        <Database size={24} className="text-primary" />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-foreground-secondary">
        {description}
      </p>
      <Link
        href="/import"
        className="mt-6 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
      >
        Importer regnskapsdata
      </Link>
    </div>
  );
}

export function LoadingState({ label = "Henter data …" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-border bg-surface px-6 py-16 text-center">
      <Loader2 size={24} className="animate-spin text-primary" />
      <p className="mt-3 text-sm text-foreground-muted">{label}</p>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div
      data-tone="rose"
      className="tone-card flex flex-col items-center px-6 py-10 text-center"
    >
      <span className="tone-badge mb-3">
        <AlertTriangle size={16} strokeWidth={2.2} />
      </span>
      <p className="text-sm font-semibold text-foreground">
        Kunne ikke hente data
      </p>
      <p className="mt-1 max-w-md text-sm text-foreground-secondary">
        {message}
      </p>
    </div>
  );
}
