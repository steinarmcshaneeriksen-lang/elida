"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo, LogoMark } from "@/components/brand/logo";
import {
  Building2,
  HelpCircle,
  LayoutDashboard,
  TrendingUp,
  Droplets,
  Users,
  Truck,
  List,
  Upload,
  Settings,
  FileText,
  Target,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  LogOut,
  User,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/format";
import {
  refreshCompanyData,
  useCachedFetch,
} from "@/lib/hooks/use-company-data";
import { useUser } from "@/lib/hooks/use-user";

const navItems = [
  { label: "Oversikt", href: "/", icon: LayoutDashboard },
  { label: "Økonomi", href: "/okonomi", icon: TrendingUp },
  { label: "Likviditet", href: "/likviditet", icon: Droplets },
  { label: "Kunder", href: "/kunder", icon: Users },
  { label: "Leverandører", href: "/leverandorer", icon: Truck },
  { label: "Transaksjoner", href: "/transaksjoner", icon: List },
  { label: "Rapporter", href: "/rapporter", icon: FileText },
  { label: "Budsjett", href: "/budsjett", icon: Target },
  { label: "Importer data", href: "/import", icon: Upload },
];

interface SidebarProps {
  companyId?: string | null;
  companyName?: string | null;
  orgNumber?: string | null;
  collapsed: boolean;
  onToggle: () => void;
}

/**
 * The navigation sits on the page's own ground, one step below the cards, so
 * the content column reads as raised without needing a heavy divider.
 *
 * The company and the signed-in user live at the foot of it rather than in a
 * bar across the top: they are context, not controls, and putting them here
 * lets every page start at the top of the window.
 */
export function Sidebar({
  companyId,
  companyName,
  orgNumber,
  collapsed,
  onToggle,
}: SidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={`fixed left-0 top-0 z-40 flex h-full flex-col border-r border-border bg-background transition-all duration-300 ease-in-out ${
        collapsed ? "w-[72px]" : "w-[260px]"
      }`}
    >
      <div
        className={`flex h-16 items-center ${
          collapsed ? "justify-center px-3" : "px-6"
        }`}
      >
        <Link href="/" aria-label="Elida — til oversikten">
          {collapsed ? <LogoMark size={24} /> : <Logo size={26} />}
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    collapsed ? "justify-center" : ""
                  } ${
                    active
                      ? "bg-surface-hover font-semibold text-foreground"
                      : "font-medium text-foreground-secondary hover:bg-surface hover:text-foreground"
                  }`}
                >
                  <Icon
                    size={19}
                    className={`shrink-0 ${
                      active
                        ? "text-[var(--tone-ocean)]"
                        : "text-foreground-muted group-hover:text-foreground-secondary"
                    }`}
                  />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="space-y-1 px-3 pb-3">
        <Link
          href="/innstillinger"
          title={collapsed ? "Innstillinger" : undefined}
          className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <Settings size={19} className="shrink-0 text-foreground-muted" />
          {!collapsed && <span>Innstillinger</span>}
        </Link>
        <a
          href="mailto:support@avilo.no?subject=Elida"
          title={collapsed ? "Hjelp" : undefined}
          className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <HelpCircle size={19} className="shrink-0 text-foreground-muted" />
          {!collapsed && <span>Hjelp</span>}
        </a>
      </div>

      <div className="border-t border-border p-3">
        <DataStatus companyId={companyId} collapsed={collapsed} />

        {companyName && (
          <div
            className={`mb-1 flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 ${
              collapsed ? "justify-center px-2" : ""
            }`}
            title={collapsed ? companyName : undefined}
          >
            <Building2 size={17} className="shrink-0 text-foreground-muted" />
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {companyName}
                </p>
                {orgNumber && (
                  <p className="text-xs text-foreground-muted">
                    Org.nr {orgNumber}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        <AccountMenu collapsed={collapsed} />

        <button
          onClick={onToggle}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground-muted hover:bg-surface hover:text-foreground-secondary"
          aria-label={collapsed ? "Vis sidemeny" : "Skjul sidemeny"}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          {!collapsed && <span>Skjul meny</span>}
        </button>
      </div>
    </aside>
  );
}

/**
 * The signed-in account.
 *
 * It sat in the top-right of every page, one line above a sidebar foot that
 * already named the company — the same context stated twice, once in the place
 * with the least room for it. Who you are is context, like the company, so it
 * belongs in the same place.
 */
function AccountMenu({ collapsed }: { collapsed: boolean }) {
  const { user, signOut } = useUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!user?.email) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        title={collapsed ? user.email : undefined}
        aria-label="Brukermeny"
        aria-expanded={open}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-surface ${
          collapsed ? "justify-center px-2" : ""
        }`}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-hover text-foreground-secondary">
          <User size={14} />
        </span>
        {!collapsed && (
          <span className="min-w-0 flex-1 truncate text-left text-foreground-secondary">
            {user.email}
          </span>
        )}
      </button>

      {open && (
        // Upwards: there is nothing below the foot of the window to open into.
        <div className="absolute bottom-full left-0 z-50 mb-1 w-full min-w-[13rem] overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-lg)]">
          <button
            onClick={() => {
              setOpen(false);
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
  );
}

/**
 * When the figures were last imported, and the way to fetch them again.
 *
 * This used to run across the top of every page, where it was the first thing
 * read on a screen whose point is the numbers below it. It is a statement about
 * the data's age, not a task — so it sits at the foot of the navigation with
 * the company it describes, and the refresh sits with it because that is the
 * only thing anyone does about it.
 */
function DataStatus({
  companyId,
  collapsed,
}: {
  companyId?: string | null;
  collapsed: boolean;
}) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Through the shared cache: the status is the same on every page, so it is
  // fetched once per tab rather than on each navigation.
  const { data } = useCachedFetch<{
    runs?: Array<{ status: string; started_at: string }>;
  }>(companyId ? `/api/import/saft?company_id=${companyId}` : null);

  const lastImport =
    data?.runs?.find((r) => r.status === "completed")?.started_at ?? null;

  const refresh = () => {
    setIsRefreshing(true);
    // Drops every cached figure so the pages refetch, then re-renders the tree.
    refreshCompanyData();
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const label = lastImport
    ? `Importert ${formatRelativeTime(lastImport)}`
    : "Ingen data importert";

  if (collapsed) {
    return (
      <button
        onClick={refresh}
        disabled={isRefreshing}
        title={label}
        aria-label={`${label}. Hent på nytt.`}
        className="mb-1 flex w-full items-center justify-center rounded-lg px-3 py-2 text-foreground-muted hover:bg-surface hover:text-foreground-secondary disabled:opacity-50"
      >
        <RefreshCw size={16} className={isRefreshing ? "animate-spin" : undefined} />
      </button>
    );
  }

  return (
    <div className="mb-1 flex items-center gap-2 px-1">
      {/* The dot repeats what the words say; it is never the only signal. */}
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          lastImport ? "bg-success" : "bg-foreground-muted"
        }`}
      />
      <span className="min-w-0 flex-1 truncate text-xs text-foreground-muted">
        {label}
      </span>
      <button
        onClick={refresh}
        disabled={isRefreshing}
        title="Hent tallene på nytt"
        aria-label="Hent tallene på nytt"
        className="shrink-0 rounded-md p-1.5 text-foreground-muted hover:bg-surface hover:text-foreground-secondary disabled:opacity-50"
      >
        <RefreshCw size={14} className={isRefreshing ? "animate-spin" : undefined} />
      </button>
    </div>
  );
}
