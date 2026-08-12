"use client";

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
}

export function AppShell({
  children,
  title,
  companyId,
  companyName,
  orgNumber,
  knowledgeLevel = "intermediate",
}: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      <Sidebar companyName={companyName} orgNumber={orgNumber} />

      <div className="flex flex-1 flex-col pl-[260px] transition-all duration-300">
        <Header title={title} />
        <main className="flex-1 p-6">{children}</main>
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
