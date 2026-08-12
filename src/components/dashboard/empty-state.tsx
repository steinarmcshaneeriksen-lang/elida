"use client";

import Link from "next/link";
import { Database, Loader2 } from "lucide-react";

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
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface px-6 py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-hover">
        <Database size={22} className="text-foreground-muted" />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm text-foreground-secondary">
        {description}
      </p>
      <Link
        href="/import"
        className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light"
      >
        Importer regnskapsdata
      </Link>
    </div>
  );
}

export function LoadingState({ label = "Henter data …" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface px-6 py-14 text-center">
      <Loader2 size={24} className="animate-spin text-primary" />
      <p className="mt-3 text-sm text-foreground-muted">{label}</p>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-danger/30 bg-danger/5 px-6 py-8 text-center">
      <p className="text-sm font-medium text-foreground">
        Kunne ikke hente data
      </p>
      <p className="mt-1 text-sm text-foreground-secondary">{message}</p>
    </div>
  );
}
