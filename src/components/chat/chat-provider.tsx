"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  toolCalls?: ToolCallInfo[];
  isStreaming?: boolean;
}

export interface ToolCallInfo {
  tool: string;
  status: "running" | "complete" | "error";
}

interface ChatContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  messages: ChatMessage[];
  sendMessage: (text: string) => Promise<void>;
  uploadDocument: (file: File) => Promise<void>;
  isLoading: boolean;
  conversationId: string | null;
  activeTools: ToolCallInfo[];
  clearMessages: () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface ChatProviderProps {
  children: ReactNode;
  companyId: string;
  knowledgeLevel?: string;
}

export function ChatProvider({
  children,
  companyId,
  knowledgeLevel = "intermediate",
}: ChatProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [activeTools, setActiveTools] = useState<ToolCallInfo[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      // Cancel any in-flight request
      abortRef.current?.abort();
      const abortController = new AbortController();
      abortRef.current = abortController;

      // Add user message
      const userMessage: ChatMessage = {
        id: `user_${Date.now()}`,
        role: "user",
        content: text.trim(),
        timestamp: new Date(),
      };

      // Add placeholder assistant message for streaming
      const assistantId = `assistant_${Date.now()}`;
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        toolCalls: [],
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsLoading(true);
      setActiveTools([]);

      try {
        const response = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company_id: companyId,
            conversation_id: conversationId,
            message: text.trim(),
            knowledge_level: knowledgeLevel,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE events
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const dataLine = line.trim();
            if (!dataLine.startsWith("data: ")) continue;

            try {
              const event = JSON.parse(dataLine.slice(6));

              switch (event.type) {
                case "content_delta":
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, content: m.content + event.text }
                        : m
                    )
                  );
                  break;

                case "tool_use": {
                  const toolInfo: ToolCallInfo = {
                    tool: event.tool,
                    status: event.status,
                  };
                  if (event.status === "running") {
                    setActiveTools((prev) => [...prev, toolInfo]);
                  } else {
                    setActiveTools((prev) =>
                      prev.map((t) =>
                        t.tool === event.tool ? { ...t, status: event.status } : t
                      )
                    );
                  }
                  // Also attach to the message
                  setMessages((prev) =>
                    prev.map((m) => {
                      if (m.id !== assistantId) return m;
                      const existing = m.toolCalls || [];
                      if (event.status === "running") {
                        return {
                          ...m,
                          toolCalls: [...existing, toolInfo],
                        };
                      }
                      return {
                        ...m,
                        toolCalls: existing.map((t) =>
                          t.tool === event.tool
                            ? { ...t, status: event.status }
                            : t
                        ),
                      };
                    })
                  );
                  break;
                }

                case "message_complete":
                  if (event.conversation_id) {
                    setConversationId(event.conversation_id);
                  }
                  // Mark message as no longer streaming
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, isStreaming: false }
                        : m
                    )
                  );
                  break;

                case "error":
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? {
                            ...m,
                            content:
                              m.content ||
                              `Beklager, det oppstod en feil: ${event.message}`,
                            isStreaming: false,
                          }
                        : m
                    )
                  );
                  break;
              }
            } catch {
              // Skip malformed events
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    "Beklager, jeg klarte ikke å koble til. Vennligst prøv igjen.",
                  isStreaming: false,
                }
              : m
          )
        );
      } finally {
        setIsLoading(false);
        setActiveTools([]);
      }
    },
    [companyId, conversationId, isLoading, knowledgeLevel]
  );

  const uploadDocument = useCallback(
    async (file: File) => {
      if (isLoading) return;

      const userMessage: ChatMessage = {
        id: `user_${Date.now()}`,
        role: "user",
        content: `📎 Lastet opp: ${file.name}`,
        timestamp: new Date(),
      };

      const assistantId = `assistant_${Date.now()}`;
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsLoading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("company_id", companyId);

        const response = await fetch("/api/documents/analyze", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(
            errorData?.error ?? `Opplasting feilet (${response.status})`
          );
        }

        const result = await response.json();
        const extraction = result.extraction;
        const recommendation = result.recommendation;

        let content = "## Dokumentanalyse\n\n";

        if (extraction?.fields) {
          const fields = extraction.fields;
          if (fields.supplier_name || fields.vendor_name) {
            content += `**Leverandør:** ${fields.supplier_name ?? fields.vendor_name}\n`;
          }
          if (fields.invoice_number) {
            content += `**Fakturanr:** ${fields.invoice_number}\n`;
          }
          if (fields.invoice_date ?? fields.date) {
            content += `**Dato:** ${fields.invoice_date ?? fields.date}\n`;
          }
          if (fields.total_amount) {
            content += `**Totalbeløp:** ${Number(fields.total_amount).toLocaleString("nb-NO")} kr\n`;
          }
          if (fields.vat_amount) {
            content += `**MVA:** ${Number(fields.vat_amount).toLocaleString("nb-NO")} kr\n`;
          }
          content += "\n";
        }

        if (recommendation?.posting_suggestion) {
          const ps = recommendation.posting_suggestion;
          content += "### Konteringsforslag\n\n";
          content += `| | Konto | Navn |\n|---|---|---|\n`;
          content += `| Debet | ${ps.debit_account} | ${ps.debit_account_name} |\n`;
          content += `| Kredit | ${ps.credit_account} | ${ps.credit_account_name} |\n\n`;
          if (ps.vat_code) {
            content += `**MVA-kode:** ${ps.vat_code}\n\n`;
          }
        }

        if (recommendation?.notes?.length > 0) {
          content += "### Merknader\n\n";
          for (const note of recommendation.notes) {
            content += `- ${note}\n`;
          }
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content, isStreaming: false }
              : m
          )
        );
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: `Beklager, dokumentanalysen feilet: ${err instanceof Error ? err.message : "Ukjent feil"}`,
                  isStreaming: false,
                }
              : m
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    [companyId, isLoading]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setConversationId(null);
  }, []);

  return (
    <ChatContext.Provider
      value={{
        isOpen,
        setIsOpen,
        messages,
        sendMessage,
        uploadDocument,
        isLoading,
        conversationId,
        activeTools,
        clearMessages,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
