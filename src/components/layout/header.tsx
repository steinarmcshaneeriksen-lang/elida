"use client";

import { useEffect, useRef, useState } from "react";
import { User, LogOut, ChevronDown } from "lucide-react";
import { useUser } from "@/lib/hooks/use-user";

interface HeaderProps {
  title: string;
  /** The overview leads with a greeting, so it carries no separate title. */
  showTitle?: boolean;
}

/**
 * The row above the page: what you are looking at, and who you are.
 *
 * It used to be a sticky bar with its own background and a rule beneath it,
 * carrying the page title, when the data was last imported, a refresh button
 * and the account menu. Most of that was not worth the top of every screen —
 * the import time is a statement about the data's age, not something you act
 * on before reading the figures, so it and the refresh moved to the foot of
 * the navigation, beside the company they describe.
 */
export function Header({ title, showTitle = true }: HeaderProps) {
  const { user, company, signOut } = useUser();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  return (
    <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 pt-6 lg:px-8">
      {showTitle ? (
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
      ) : (
        <span />
      )}

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
                <p className="truncate text-sm text-foreground">{user.email}</p>
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
    </header>
  );
}
