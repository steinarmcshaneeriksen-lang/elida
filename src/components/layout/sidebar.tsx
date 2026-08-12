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

interface SidebarProps {
  companyName?: string | null;
  orgNumber?: string | null;
}

export function Sidebar({ companyName, orgNumber }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={`
        fixed left-0 top-0 z-40 flex h-full flex-col
        transition-all duration-300 ease-in-out
        ${collapsed ? "w-[72px]" : "w-[260px]"}
      `}
      style={{ background: "var(--primary-900)" }}
    >
      {/* Logo */}
      <div
        className="flex h-16 items-center gap-3 px-5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold text-sm"
             style={{ background: "var(--primary)", color: "#fff" }}>
          E
        </div>
        {!collapsed && (
          <span className="text-lg font-semibold tracking-tight text-white">
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
                    ${collapsed ? "justify-center" : ""}
                  `}
                  style={
                    active
                      ? { background: "rgba(255,255,255,0.12)", color: "#fff" }
                      : { color: "rgba(255,255,255,0.65)" }
                  }
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                      e.currentTarget.style.color = "#fff";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "rgba(255,255,255,0.65)";
                    }
                  }}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon
                    size={20}
                    className="shrink-0"
                    style={{ color: active ? "#fff" : "rgba(255,255,255,0.5)" }}
                  />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Company info & collapse button */}
      <div className="p-3" style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        {!collapsed && (
          <div className="mb-3 rounded-lg px-3 py-2.5"
               style={{ background: "rgba(255,255,255,0.08)" }}>
            <p className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>Bedrift</p>
            <p className="text-sm font-semibold text-white truncate">
              {companyName ?? "Laster..."}
            </p>
            {orgNumber && (
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>Org.nr: {orgNumber}</p>
            )}
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm"
          style={{ color: "rgba(255,255,255,0.5)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.08)";
            e.currentTarget.style.color = "rgba(255,255,255,0.7)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "rgba(255,255,255,0.5)";
          }}
          aria-label={collapsed ? "Vis sidemeny" : "Skjul sidemeny"}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          {!collapsed && <span>Skjul meny</span>}
        </button>
      </div>
    </aside>
  );
}
