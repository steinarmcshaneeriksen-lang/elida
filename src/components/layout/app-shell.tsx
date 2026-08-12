"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { MessageCircle } from "lucide-react";

interface AppShellProps {
  children: React.ReactNode;
  title: string;
}

export function AppShell({ children, title }: AppShellProps) {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      {/* Main content area — offset by sidebar width */}
      <div className="flex flex-1 flex-col pl-[260px] transition-all duration-300">
        <Header title={title} />

        <main className="flex-1 p-6">{children}</main>
      </div>

      {/* Floating chat button */}
      <button
        onClick={() => setChatOpen(!chatOpen)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg hover:bg-primary-light active:bg-primary-dark"
        aria-label="Spør Elida"
      >
        <MessageCircle size={24} />
      </button>

      {/* Chat panel placeholder */}
      {chatOpen && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[480px] w-[380px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-border bg-primary px-4 py-3">
            <span className="font-semibold text-white">Spør Elida</span>
            <button
              onClick={() => setChatOpen(false)}
              className="text-white/70 hover:text-white"
            >
              &times;
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-foreground-muted">
            <div>
              <p className="mb-2 text-lg">Hei!</p>
              <p>
                Spør meg om hva som helst om økonomien til Fjordtech AS.
                For eksempel: &quot;Har vi nok penger til å betale MVA neste måned?&quot;
              </p>
            </div>
          </div>
          <div className="border-t border-border p-3">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Skriv et spørsmål..."
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light">
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
