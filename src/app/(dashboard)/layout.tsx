"use client";

import { AppShell } from "@/components/layout/app-shell";
import { usePathname } from "next/navigation";
import { useUser } from "@/lib/hooks/use-user";

const pageTitles: Record<string, string> = {
  "/": "Oversikt",
  "/okonomi": "Økonomi",
  "/likviditet": "Likviditet",
  "/kunder": "Kunder",
  "/leverandorer": "Leverandører",
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
  const { company, knowledgeLevel } = useUser();

  return (
    <AppShell
      title={title}
      companyId={company?.id}
      companyName={company?.name}
      orgNumber={company?.org_number}
      knowledgeLevel={knowledgeLevel ?? "intermediate"}
    >
      {children}
    </AppShell>
  );
}
