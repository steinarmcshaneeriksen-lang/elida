"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { ChatProvider } from "@/components/chat/chat-provider";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ChatButton } from "@/components/chat/chat-button";

interface AppShellProps {
  children: React.ReactNode;
  title: string;
  companyId?: string | null;
  companyName?: string | null;
  orgNumber?: string | null;
  knowledgeLevel?: string;
  /** The overview leads with a greeting, so it carries no separate title. */
  showTitle?: boolean;
}

export function AppShell({
  children,
  title,
  companyId,
  companyName,
  orgNumber,
  knowledgeLevel = "intermediate",
  showTitle = true,
}: AppShellProps) {
  // Held here rather than inside the sidebar so the content column moves with
  // it; previously collapsing left a 190px strip of empty background.
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        companyId={companyId}
        companyName={companyName}
        orgNumber={orgNumber}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />

      <div
        className={`flex min-w-0 flex-1 flex-col transition-all duration-300 ${
          collapsed ? "pl-[72px]" : "pl-[260px]"
        }`}
      >
        <Header title={title} showTitle={showTitle} />
        <main className="flex-1 px-6 pb-10 pt-6 lg:px-8">{children}</main>
      </div>

      {companyId ? (
        <ChatProvider companyId={companyId} knowledgeLevel={knowledgeLevel}>
          <ChatPanel />
          <ChatButton />
        </ChatProvider>
      ) : null}
    </div>
  );
}
