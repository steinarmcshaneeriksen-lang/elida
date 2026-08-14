"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  Send,
  Upload,
  Sparkles,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { useChatContext } from "./chat-provider";
import { ChatMessage } from "./chat-message";

const SUGGESTED_QUESTIONS = [
  "Hvordan går det denne måneden?",
  "Hvorfor har resultatet blitt dårligere?",
  "Har jeg nok penger til lønn?",
  "Hvem skylder oss mest penger?",
  "Hvor mye MVA bør jeg sette av?",
  "Hva bruker vi mest penger på?",
];

export function ChatPanel() {
  const {
    isOpen,
    setIsOpen,
    messages,
    sendMessage,
    uploadDocument,
    isLoading,
    activeTools,
    clearMessages,
  } = useChatContext();
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTools]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return;
    const text = inputValue;
    setInputValue("");
    await sendMessage(text);
  }, [inputValue, isLoading, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleSuggestedQuestion = useCallback(
    (question: string) => {
      sendMessage(question);
    },
    [sendMessage]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        uploadDocument(file);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [uploadDocument]
  );

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) setIsOpen(false);
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, setIsOpen]);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}

      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[420px] md:w-[460px] bg-background shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Elida
              </h2>
              <p className="text-[11px] text-foreground-muted">
                Din økonomiassistent
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={clearMessages}
                className="p-2 text-foreground-muted hover:text-foreground-secondary hover:bg-surface-hover rounded-lg transition-colors"
                title="Ny samtale"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 text-foreground-muted hover:text-foreground-secondary hover:bg-surface-hover rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mb-4 shadow-lg">
                <Sparkles className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">
                Hei! Jeg er Elida
              </h3>
              <p className="text-sm text-foreground-muted text-center mb-6 max-w-[280px]">
                Spør meg om økonomien din, eller få hjelp med bokføring og
                regnskapsråd.
              </p>

              <div className="w-full space-y-2">
                <p className="text-xs font-medium text-foreground-muted uppercase tracking-wide px-1">
                  Forslag
                </p>
                {SUGGESTED_QUESTIONS.map((question) => (
                  <button
                    key={question}
                    onClick={() => handleSuggestedQuestion(question)}
                    className="w-full text-left px-3 py-2.5 rounded-xl bg-surface border border-border text-sm text-foreground-secondary hover:bg-surface-hover transition-colors"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}

              {isLoading && activeTools.some((t) => t.status === "running") && (
                <div className="flex items-center gap-2 px-3 py-2 mb-2 text-xs text-foreground-muted">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  <span>
                    {activeTools
                      .filter((t) => t.status === "running")
                      .map(
                        (t) =>
                          ({
                            get_financial_summary: "Henter data",
                            get_revenue_analysis: "Analyserer",
                            get_cost_analysis: "Analyserer",
                            get_customer_receivables: "Henter data",
                          })[t.tool] || "Jobber"
                      )
                      .join(", ")}
                    ...
                  </span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input area */}
        <div className="shrink-0 border-t border-border bg-surface px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-foreground-muted bg-surface-hover hover:bg-background disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Last opp bilag (PDF, JPG, PNG)"
            >
              <Upload className="w-3.5 h-3.5" />
              Last opp bilag
            </button>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Spør om økonomien din..."
                rows={1}
                className="w-full resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow"
                style={{
                  minHeight: "40px",
                  maxHeight: "120px",
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
                }}
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
              className="shrink-0 w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>

          <p className="mt-1.5 text-center text-[11px] text-foreground-muted">
            Elida kan gjøre feil. Verifiser viktige tall med regnskapsfører.
          </p>
        </div>
      </div>
    </>
  );
}
