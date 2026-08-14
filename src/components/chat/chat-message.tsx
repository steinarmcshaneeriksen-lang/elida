"use client";

import { TOOL_LABELS } from "@/lib/assistant/tools";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Shield,
  Loader2,
} from "lucide-react";
import type { ChatMessage as ChatMessageType, ToolCallInfo } from "./chat-provider";


function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, '<h4 class="text-sm font-semibold mt-3 mb-1">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-2">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-surface-hover rounded text-sm">$1</code>')
    .replace(
      /^&gt; (.+)$/gm,
      '<blockquote class="border-l-3 border-warning pl-3 py-1 my-2 text-sm text-foreground-secondary bg-warning-light rounded-r">$1</blockquote>'
    )
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    .replace(/\|(.+)\|/g, (match) => {
      if (match.includes("---")) return "";
      const cells = match
        .split("|")
        .filter(Boolean)
        .map((c) => c.trim());
      const cellHtml = cells
        .map((c) => `<td class="px-2 py-1 border-b border-border text-sm">${c}</td>`)
        .join("");
      return `<tr>${cellHtml}</tr>`;
    })
    .replace(/\n\n/g, "</p><p class=\"mt-2\">")
    .replace(/\n/g, "<br/>");

  html = `<p class="mt-0">${html}</p>`;

  html = html.replace(
    /(<li[^>]*>.*?<\/li>(?:<br\/>)?)+/g,
    (match) => `<ul class="my-2">${match.replace(/<br\/>/g, "")}</ul>`
  );

  html = html.replace(
    /(<tr>.*?<\/tr>)+/g,
    (match) =>
      `<table class="w-full my-2 border-collapse">${match}</table>`
  );

  html = html.replace(/<p[^>]*><\/p>/g, "");

  return html;
}

interface AccountingRecommendation {
  account_number: string;
  account_name: string;
  vat_treatment: string;
  confidence: "high" | "medium" | "low";
  risk_level: "low" | "medium" | "high";
  poweroffice_instructions?: string;
}

function parseAccountingRecommendation(
  content: string
): AccountingRecommendation | null {
  const accountMatch = content.match(
    /(?:konto|account)[:\s]*(\d{4})\s*[-–]\s*(.+)/i
  );
  if (!accountMatch) return null;

  const vatMatch = content.match(
    /(?:mva|vat)[:\s-]*(.+?)(?:\n|$)/i
  );
  const confidenceMatch = content.match(
    /(?:konfidensn|confidence)[:\s]*(\w+)/i
  );

  return {
    account_number: accountMatch[1],
    account_name: accountMatch[2].trim(),
    vat_treatment: vatMatch ? vatMatch[1].trim() : "Ikke spesifisert",
    confidence: parseConfidence(confidenceMatch?.[1]),
    risk_level: "low",
  };
}

function parseConfidence(text?: string): "high" | "medium" | "low" {
  if (!text) return "medium";
  const lower = text.toLowerCase();
  if (lower.includes("høy") || lower.includes("hoy") || lower.includes("high")) return "high";
  if (lower.includes("lav") || lower.includes("low")) return "low";
  return "medium";
}

function AccountingRecommendationCard({
  rec,
}: {
  rec: AccountingRecommendation;
}) {
  const confidenceColors = {
    high: "bg-success-light text-success",
    medium: "bg-warning-light text-warning",
    low: "bg-danger-light text-danger",
  };

  const confidenceLabels = {
    high: "Høy",
    medium: "Middels",
    low: "Lav",
  };

  const riskColors = {
    low: "bg-success-light text-success",
    medium: "bg-warning-light text-warning",
    high: "bg-danger-light text-danger",
  };

  return (
    <div className="mt-3 rounded-lg border border-border overflow-hidden">
      <div className="bg-info-light px-3 py-2 border-b border-border">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-info">
            Anbefalt kontering
          </span>
          <div className="flex gap-1.5">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${confidenceColors[rec.confidence]}`}
            >
              {confidenceLabels[rec.confidence]} sikkerhet
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${riskColors[rec.risk_level]}`}
            >
              <Shield className="w-3 h-3 mr-0.5" />
              Risiko
            </span>
          </div>
        </div>
      </div>
      <div className="px-3 py-2 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-foreground-muted">Konto:</span>
          <span className="font-medium text-foreground">
            {rec.account_number} - {rec.account_name}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-foreground-muted">
            MVA-behandling:
          </span>
          <span className="text-foreground">
            {rec.vat_treatment}
          </span>
        </div>
        {rec.poweroffice_instructions && (
          <div className="mt-2 pt-2 border-t border-border-light">
            <span className="text-xs font-medium text-foreground-muted uppercase tracking-wide">
              Slik gjør du det i PowerOffice
            </span>
            <p className="mt-1 text-foreground-secondary">
              {rec.poweroffice_instructions}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCallIndicator({ tools }: { tools: ToolCallInfo[] }) {
  if (tools.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {tools.map((tool, i) => (
        <span
          key={`${tool.tool}-${i}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-surface-hover text-foreground-secondary"
        >
          {tool.status === "running" ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : tool.status === "complete" ? (
            <CheckCircle2 className="w-3 h-3 text-success" />
          ) : (
            <AlertTriangle className="w-3 h-3 text-danger" />
          )}
          {TOOL_LABELS[tool.tool] || tool.tool}
        </span>
      ))}
    </div>
  );
}

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const [showEvidence, setShowEvidence] = useState(false);
  const isUser = message.role === "user";

  const recommendation =
    !isUser && message.content
      ? parseAccountingRecommendation(message.content)
      : null;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[85%] ${
          isUser
            ? "bg-primary text-white rounded-2xl rounded-br-md px-4 py-2.5"
            : "bg-surface text-foreground rounded-2xl rounded-bl-md px-4 py-3 shadow-[var(--shadow-sm)] border border-border"
        }`}
      >
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <ToolCallIndicator tools={message.toolCalls} />
        )}

        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <>
            {message.content ? (
              <div
                className="text-sm prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-li:my-0"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(message.content),
                }}
              />
            ) : message.isStreaming ? (
              <div className="flex items-center gap-2 text-sm text-foreground-muted">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Tenker...</span>
              </div>
            ) : null}
          </>
        )}

        {!isUser && message.isStreaming && message.content && (
          <span className="inline-block w-1.5 h-4 bg-foreground-muted animate-pulse ml-0.5 align-text-bottom" />
        )}

        {recommendation && <AccountingRecommendationCard rec={recommendation} />}

        {!isUser && message.content && !message.isStreaming && (
          <button
            onClick={() => setShowEvidence(!showEvidence)}
            className="flex items-center gap-1 mt-2 pt-2 border-t border-border-light text-xs text-foreground-muted hover:text-foreground-secondary transition-colors"
          >
            {showEvidence ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            Vis hvordan dette er beregnet
          </button>
        )}

        {showEvidence && (
          <div className="mt-2 p-2 bg-surface-hover rounded text-xs text-foreground-muted">
            {message.toolCalls && message.toolCalls.length > 0 ? (
              <>
                <p className="font-medium mb-1">Verktøy brukt:</p>
                <ul className="space-y-0.5">
                  {message.toolCalls.map((tool, i) => (
                    <li key={i} className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-success" />
                      {TOOL_LABELS[tool.tool] || tool.tool}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>Svaret er basert på generell kunnskap.</p>
            )}
          </div>
        )}

        {/* 10px at 60 % opacity was 5.8:1 on the navy bubble — the smallest
            text in the product at the lowest contrast in it. 11px at 80 %
            reads at 9.1:1. */}
        <div
          className={`mt-1 text-[11px] ${
            isUser ? "text-white/80" : "text-foreground-muted"
          }`}
        >
          {message.timestamp.toLocaleTimeString("nb-NO", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
}
