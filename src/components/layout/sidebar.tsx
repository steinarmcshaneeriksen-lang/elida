"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  Droplets,
  Users,
  Truck,
  List,
  Settings,
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
  { label: "Innstillinger", href: "/innstillinger", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={`
        fixed left-0 top-0 z-40 flex h-full flex-col border-r border-border bg-surface
        transition-all duration-300 ease-in-out
        ${collapsed ? "w-[72px]" : "w-[260px]"}
      `}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-border px-5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white font-bold text-sm">
          E
        </div>
        {!collapsed && (
          <span className="text-lg font-semibold tracking-tight text-foreground">
            Elida
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`
                    group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium
                    transition-colors duration-150
                    ${
                      active
                        ? "bg-primary-50 text-primary"
                        : "text-foreground-secondary hover:bg-surface-hover hover:text-foreground"
                    }
                    ${collapsed ? "justify-center" : ""}
                  `}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon
                    size={20}
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

      {/* Company info & collapse button */}
      <div className="border-t border-border p-3">
        {!collapsed && (
          <div className="mb-3 rounded-lg bg-surface-hover px-3 py-2.5">
            <p className="text-xs font-medium text-foreground-secondary">Bedrift</p>
            <p className="text-sm font-semibold text-foreground truncate">
              Fjordtech AS
            </p>
            <p className="text-xs text-foreground-muted">Org.nr: 923 456 789</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
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
