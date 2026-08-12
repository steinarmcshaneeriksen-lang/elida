"use client";

import { AppShell } from "@/components/layout/app-shell";
import { usePathname } from "next/navigation";

const pageTitles: Record<string, string> = {
  "/": "Oversikt",
  "/okonomi": "Okonomi",
  "/likviditet": "Likviditet",
  "/kunder": "Kunder",
  "/leverandorer": "Leverandorer",
  "/transaksjoner": "Transaksjoner",
  "/innstillinger": "Innstillinger",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const title = pageTitles[pathname] || "Elida";

  return <AppShell title={title}>{children}</AppShell>;
}
