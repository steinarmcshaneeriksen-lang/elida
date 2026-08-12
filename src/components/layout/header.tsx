"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, User, LogOut } from "lucide-react";
import { formatRelativeTime } from "@/lib/format";
import { useUser } from "@/lib/hooks/use-user";
import {
  refreshCompanyData,
  useCachedFetch,
} from "@/lib/hooks/use-company-data";

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
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
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-surface/80 px-6 backdrop-blur-md">
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>

      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-2 text-sm text-foreground-muted sm:flex">
          <div
            className={`h-2 w-2 rounded-full ${
              lastImport ? "bg-success" : "bg-foreground-muted"
            }`}
          />
          <span>
            {lastImport
              ? `Data importert ${formatRelativeTime(lastImport)}`
              : "Ingen data importert"}
          </span>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground-secondary hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw
            size={14}
            className={isRefreshing ? "animate-spin" : undefined}
          />
          <span className="hidden sm:inline">Oppdater nå</span>
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary hover:bg-primary-200"
            aria-label="Brukermeny"
          >
            <User size={16} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
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
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-foreground-secondary hover:bg-surface-hover"
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
