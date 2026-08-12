"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Info,
} from "lucide-react";
import { useUser } from "@/lib/hooks/use-user";
import { formatRelativeTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

const SAFT_BUCKET = "saft-imports";

/**
 * Error responses do not always come from our own code — a platform-level
 * rejection (oversized body, gateway error) arrives as plain text, and
 * calling res.json() on it throws a parse error that hides the real cause.
 */
async function readError(res: Response, fallback: string): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(text) as { error?: string };
    if (parsed?.error) return parsed.error;
  } catch {
    // Not JSON; fall through to the raw text.
  }
  if (text.trim()) return `${fallback} (${text.trim().slice(0, 200)})`;
  return `${fallback} (HTTP ${res.status})`;
}

interface ImportCounts {
  accounts: number;
  customers: number;
  suppliers: number;
  taxCodes: number;
  departments: number;
  projects: number;
  vouchers: number;
  transactions: number;
}

interface ImportResult {
  header: {
    companyName: string | null;
    registrationNumber: string | null;
    periodStart: string | null;
    periodEnd: string | null;
    softwareName: string | null;
  };
  counts: ImportCounts;
  warnings: string[];
}

interface ImportRun {
  id: string;
  file_name: string | null;
  status: string;
  counts: ImportCounts | null;
  error_message: string | null;
  period_start: string | null;
  period_end: string | null;
  started_at: string;
}

const COUNT_LABELS: { key: keyof ImportCounts; label: string }[] = [
  { key: "accounts", label: "Kontoer" },
  { key: "customers", label: "Kunder" },
  { key: "suppliers", label: "Leverandører" },
  { key: "taxCodes", label: "MVA-koder" },
  { key: "departments", label: "Avdelinger" },
  { key: "projects", label: "Prosjekter" },
  { key: "vouchers", label: "Bilag" },
  { key: "transactions", label: "Posteringer" },
];

export default function ImportPage() {
  const { company } = useUser();
  const companyId = company?.id;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ImportRun[]>([]);

  // Bumped after an import so the history list refetches.
  const [historyVersion, setHistoryVersion] = useState(0);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;

    async function loadHistory() {
      try {
        const res = await fetch(`/api/import/saft?company_id=${companyId}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setHistory(data.runs ?? []);
      } catch {
        // History is supplementary; a failure here should not block importing.
      }
    }

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [companyId, historyVersion]);

  const upload = useCallback(
    async (file: File) => {
      if (!companyId || isUploading) return;

      setIsUploading(true);
      setError(null);
      setResult(null);

      try {
        // Upload straight to storage. Routing the file through the API would
        // hit the serverless request-body limit, which is far smaller than a
        // typical SAF-T export.
        const supabase = createClient();
        const objectPath = `${companyId}/${crypto.randomUUID()}.xml`;

        const { error: uploadError } = await supabase.storage
          .from(SAFT_BUCKET)
          .upload(objectPath, file, {
            contentType: "text/xml",
            upsert: false,
          });

        if (uploadError) {
          setError(`Opplasting feilet: ${uploadError.message}`);
          return;
        }

        const res = await fetch("/api/import/saft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company_id: companyId,
            storage_path: objectPath,
            file_name: file.name,
          }),
        });

        if (!res.ok) {
          setError(await readError(res, "Import feilet"));
          return;
        }

        setResult((await res.json()) as ImportResult);
        setHistoryVersion((v) => v + 1);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Kunne ikke laste opp filen. Sjekk nettforbindelsen og prøv igjen."
        );
      } finally {
        setIsUploading(false);
      }
    },
    [companyId, isUploading]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) upload(file);
    },
    [upload]
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Importer regnskapsdata
        </h2>
        <p className="mt-1 text-sm text-foreground-secondary">
          Last opp en SAF-T-fil fra regnskapssystemet ditt, så henter Elida inn
          kontoplan, kunder, leverandører, bilag og posteringer.
        </p>
      </div>

      {/* What SAF-T is and how to get it */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex gap-3">
          <Info size={20} className="mt-0.5 shrink-0 text-accent" />
          <div className="space-y-2 text-sm text-foreground-secondary">
            <p className="font-medium text-foreground">
              Hva er en SAF-T-fil?
            </p>
            <p>
              SAF-T Regnskap er et standardformat som alle norske
              regnskapssystemer må kunne eksportere. Du finner det som regel
              under <em>Rapporter</em>, <em>Eksport</em> eller{" "}
              <em>Bokføring</em> i systemet ditt — ofte kalt «SAF-T», «SAF-T
              Regnskap» eller «Eksport til Skatteetaten».
            </p>
            <p>
              Filen er en XML-fil. Velg gjerne hele regnskapsåret for å få best
              analyse. Du kan laste opp flere ganger — data oppdateres i stedet
              for å dupliseres.
            </p>
          </div>
        </div>
      </div>

      {/* Upload area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border bg-surface"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xml,text/xml,application/xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
        />

        {isUploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={32} className="animate-spin text-primary" />
            <p className="text-sm font-medium text-foreground">
              Importerer …
            </p>
            <p className="text-xs text-foreground-muted">
              Filen lastes opp, deretter leses den inn. Store filer kan ta et
              par minutter. Ikke lukk siden.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload size={32} className="text-foreground-muted" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Dra SAF-T-filen hit, eller
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!companyId}
                className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Velg fil
              </button>
            </div>
            <p className="text-xs text-foreground-muted">
              XML-fil, maks 500 MB
            </p>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4">
          <XCircle size={20} className="mt-0.5 shrink-0 text-danger" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Importen feilet
            </p>
            <p className="mt-1 text-sm text-foreground-secondary">{error}</p>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={20} className="text-success" />
            <p className="font-semibold text-foreground">Import fullført</p>
          </div>

          <div className="text-sm text-foreground-secondary">
            {result.header.companyName && (
              <p>
                <span className="text-foreground-muted">Selskap i filen:</span>{" "}
                {result.header.companyName}
                {result.header.registrationNumber
                  ? ` (org.nr ${result.header.registrationNumber})`
                  : ""}
              </p>
            )}
            {result.header.periodStart && result.header.periodEnd && (
              <p>
                <span className="text-foreground-muted">Periode:</span>{" "}
                {result.header.periodStart} – {result.header.periodEnd}
              </p>
            )}
            {result.header.softwareName && (
              <p>
                <span className="text-foreground-muted">Eksportert fra:</span>{" "}
                {result.header.softwareName}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {COUNT_LABELS.map(({ key, label }) => (
              <div
                key={key}
                className="rounded-lg bg-background px-3 py-2.5"
              >
                <p className="text-xs text-foreground-muted">{label}</p>
                <p className="text-lg font-semibold text-foreground">
                  {result.counts[key].toLocaleString("nb-NO")}
                </p>
              </div>
            ))}
          </div>

          {result.warnings.length > 0 && (
            <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-warning" />
                <p className="text-sm font-medium text-foreground">
                  Merk følgende
                </p>
              </div>
              <ul className="space-y-1 pl-6 text-sm text-foreground-secondary">
                {result.warnings.map((w, i) => (
                  <li key={i} className="list-disc">
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Tidligere importer
          </h3>
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-foreground-muted">
                  <th className="px-4 py-2.5 font-medium">Fil</th>
                  <th className="px-4 py-2.5 font-medium">Periode</th>
                  <th className="px-4 py-2.5 font-medium">Posteringer</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Tidspunkt</th>
                </tr>
              </thead>
              <tbody>
                {history.map((run) => (
                  <tr
                    key={run.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <FileText
                          size={14}
                          className="shrink-0 text-foreground-muted"
                        />
                        <span className="truncate text-foreground">
                          {run.file_name ?? "—"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-foreground-secondary">
                      {run.period_start && run.period_end
                        ? `${run.period_start} – ${run.period_end}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-foreground-secondary">
                      {run.counts?.transactions?.toLocaleString("nb-NO") ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge
                        status={run.status}
                        error={run.error_message}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-foreground-muted">
                      {formatRelativeTime(run.started_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  status,
  error,
}: {
  status: string;
  error: string | null;
}) {
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
        <CheckCircle2 size={12} />
        Fullført
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger"
        title={error ?? undefined}
      >
        <XCircle size={12} />
        Feilet
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium text-foreground-muted">
      <Loader2 size={12} className="animate-spin" />
      Pågår
    </span>
  );
}
