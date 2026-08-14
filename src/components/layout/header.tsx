"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, User, LogOut, ChevronDown } from "lucide-react";
import { formatRelativeTime } from "@/lib/format";
import { useUser } from "@/lib/hooks/use-user";
import {
  refreshCompanyData,
  useCachedFetch,
} from "@/lib/hooks/use-company-data";

interface HeaderProps {
  title: string;
  /** The overview leads with a greeting, so it carries no separate title. */
  showTitle?: boolean;
}

/**
 * The row above the page.
 *
 * It used to be a sticky bar with its own background and a rule beneath it,
 * which ate the top of every screen and made the content column start low. It
 * now sits in the page's own ground with no border: a title on the left, the
 * state of the data and the account on the right.
 */
export function Header({ title, showTitle = true }: HeaderProps) {
  const router = useRouter();
  const { user, company, signOut } = useUser();
  const companyId = company?.id;

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Read through the shared cache: the status is the same on every page, so it
  // is fetched once per tab rather than on each navigation.
  const { data: importStatus } = useCachedFetch<{
    runs?: Array<{ status: string; started_at: string }>;
  }>(companyId ? `/api/import/saft?company_id=${companyId}` : null);

  const lastImport =
    importStatus?.runs?.find((r) => r.status === "completed")?.started_at ??
    null;

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    // Drops every cached figure so the pages refetch, then re-renders the tree.
    refreshCompanyData();
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  return (
    <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 pt-6 lg:px-8">
      {showTitle ? (
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
      ) : (
        <span />
      )}

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground-secondary sm:flex">
          {/* The dot repeats what the words say; it is never the only signal. */}
          <span
            className={`h-2 w-2 rounded-full ${
              lastImport ? "bg-success" : "bg-foreground-muted"
            }`}
          />
          {lastImport
            ? `Data importert ${formatRelativeTime(lastImport)}`
            : "Ingen data importert"}
        </div>

        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground-secondary transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw
            size={14}
            className={isRefreshing ? "animate-spin" : undefined}
          />
          <span className="hidden sm:inline">Oppdater</span>
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface py-1.5 pl-2 pr-2.5 text-sm text-foreground-secondary transition-colors hover:bg-surface-hover hover:text-foreground"
            aria-label="Brukermeny"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-hover text-foreground-secondary">
              <User size={13} />
            </span>
            <ChevronDown size={14} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-lg)]">
              {user?.email && (
                <div className="border-b border-border px-4 py-2.5">
                  <p className="truncate text-sm text-foreground">
                    {user.email}
                  </p>
                  {company?.name && (
                    <p className="truncate text-xs text-foreground-muted">
                      {company.name}
                    </p>
                  )}
                </div>
              )}
              <button
                onClick={() => {
                  setMenuOpen(false);
                  signOut();
                }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-foreground-secondary hover:bg-surface-hover hover:text-foreground"
              >
                <LogOut size={14} />
                Logg ut
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
