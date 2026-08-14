"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";

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
        <button
          onClick={onToggle}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground-muted hover:bg-surface hover:text-foreground-secondary"
          aria-label={collapsed ? "Vis sidemeny" : "Skjul sidemeny"}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          {!collapsed && <span>Skjul meny</span>}
        </button>
      </div>
    </aside>
  );
}
