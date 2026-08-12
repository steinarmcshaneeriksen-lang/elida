"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo, LogoMark } from "@/components/brand/logo";
import {
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
  { label: "Innstillinger", href: "/innstillinger", icon: Settings },
];

interface SidebarProps {
  companyName?: string | null;
  orgNumber?: string | null;
  collapsed: boolean;
  onToggle: () => void;
}

/**
 * The navigation sits on the same light ground as the rest of the app, with
 * the wordmark at the top. A dark slab down the left competed with the content
 * and did not belong to the brand.
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
      className={`fixed left-0 top-0 z-40 flex h-full flex-col border-r border-border bg-surface transition-all duration-300 ease-in-out ${
        collapsed ? "w-[72px]" : "w-[260px]"
      }`}
    >
      <div
        className={`flex h-16 items-center border-b border-border ${
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
                      ? "bg-primary-50 font-semibold text-primary"
                      : "font-medium text-foreground-secondary hover:bg-surface-hover hover:text-foreground"
                  }`}
                >
                  <Icon
                    size={19}
                    className={`shrink-0 ${
                      active
                        ? "text-primary"
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

      <div className="border-t border-border p-3">
        {!collapsed && companyName && (
          <div className="mb-2 px-3 py-2">
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
        <button
          onClick={onToggle}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground-muted hover:bg-surface-hover hover:text-foreground-secondary"
          aria-label={collapsed ? "Vis sidemeny" : "Skjul sidemeny"}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          {!collapsed && <span>Skjul meny</span>}
        </button>
      </div>
    </aside>
  );
}
