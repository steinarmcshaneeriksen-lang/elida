"use client";

import { RefreshCw, User } from "lucide-react";
import { formatRelativeTime } from "@/lib/format";
import { companySettings } from "@/lib/mock-data";

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  const lastSyncTime = formatRelativeTime(companySettings.lastSync);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-surface/80 px-6 backdrop-blur-md">
      {/* Page title */}
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {/* Sync status */}
        <div className="hidden items-center gap-2 text-sm text-foreground-muted sm:flex">
          <div className="h-2 w-2 rounded-full bg-success" />
          <span>Oppdatert fra PowerOffice {lastSyncTime}</span>
        </div>

        {/* Refresh button */}
        <button
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground-secondary hover:bg-surface-hover hover:text-foreground"
          onClick={() => {
            /* TODO: trigger sync */
          }}
        >
          <RefreshCw size={14} />
          <span className="hidden sm:inline">Oppdater nå</span>
        </button>

        {/* User avatar */}
        <button className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary hover:bg-primary-200">
          <User size={16} />
        </button>
      </div>
    </header>
  );
}
