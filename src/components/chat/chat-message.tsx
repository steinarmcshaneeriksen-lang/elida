"use client";

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

// ---------------------------------------------------------------------------
// Tool name translations
// ---------------------------------------------------------------------------

const TOOL_LABELS: Record<string, string> = {
  get_financial_summary: "Henter okonomisammendrag",
  get_revenue_analysis: "Analyserer inntekter",
  get_profit_analysis: "Analyserer resultat",
  get_cost_analysis: "Analyserer kostnader",
  get_account_breakdown: "Henter kontodetaljer",
  get_customer_receivables: "Henter kundefordringer",
  get_customer_payment_profile: "Henter betalingsprofil",
  get_overdue_invoices: "Henter forfalte fakturaer",
  get_supplier_payables: "Henter leverandorgjeld",
  get_upcoming_obligations: "Henter kommende forpliktelser",
  get_cash_forecast: "Beregner kontantstromprognose",
  get_vat_estimate: "Estimerer MVA",
  get_tax_estimate: "Estimerer skatt",
  get_chart_of_accounts: "Henter kontoplan",
  find_similar_vendor_transactions: "Soker etter lignende transaksjoner",
  find_similar_description_transactions: "Soker i beskrivelser",
  get_vendor_posting_history: "Henter posteringshistorikk",
  search_accounting_rules: "Soker i regnskapsregler",
  run_scenario: "Kjorer scenarioanalyse",
};

// ---------------------------------------------------------------------------
// Simple markdown rendering
// ---------------------------------------------------------------------------

function renderMarkdown(text: string): string {
  let html = text
    // Escape HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Headers
    .replace(/^### (.+)$/gm, '<h4 class="text-sm font-semibold mt-3 mb-1">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-2">$1</h3>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-sm">$1</code>')
    // Blockquotes
    .replace(
      /^&gt; (.+)$/gm,
      '<blockquote class="border-l-3 border-amber-400 pl-3 py-1 my-2 text-sm text-gray-600 dark:text-gray-400 bg-amber-50 dark:bg-amber-950/30 rounded-r">$1</blockquote>'
    )
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    // Table rows (simple)
    .replace(/\|(.+)\|/g, (match) => {
      if (match.includes("---")) return "";
      const cells = match
        .split("|")
        .filter(Boolean)
        .map((c) => c.trim());
      const cellHtml = cells
        .map((c) => `<td class="px-2 py-1 border-b border-gray-200 dark:border-gray-700 text-sm">${c}</td>`)
        .join("");
      return `<tr>${cellHtml}</tr>`;
    })
    // Line breaks
    .replace(/\n\n/g, "</p><p class=\"mt-2\">")
    .replace(/\n/g, "<br/>");

  // Wrap in paragraph
  html = `<p class="mt-0">${html}</p>`;

  // Wrap consecutive <li> in <ul>
  html = html.replace(
    /(<li[^>]*>.*?<\/li>(?:<br\/>)?)+/g,
    (match) => `<ul class="my-2">${match.replace(/<br\/>/g, "")}</ul>`
  );

  // Wrap consecutive <tr> in <table>
  html = html.replace(
    /(<tr>.*?<\/tr>)+/g,
    (match) =>
      `<table class="w-full my-2 border-collapse">${match}</table>`
  );

  // Clean up empty paragraphs
  html = html.replace(/<p[^>]*><\/p>/g, "");

  return html;
}

// ---------------------------------------------------------------------------
// Accounting recommendation display
// ---------------------------------------------------------------------------

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
  // Try to detect structured accounting advice in the content
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
  if (lower.includes("hoy") || lower.includes("high")) return "high";
  if (lower.includes("lav") || lower.includes("low")) return "low";
  return "medium";
}

function AccountingRecommendationCard({
  rec,
}: {
  rec: AccountingRecommendation;
}) {
  const confidenceColors = {
    high: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    medium:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    low: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  };

  const confidenceLabels = {
    high: "Hoy",
    medium: "Middels",
    low: "Lav",
  };

  const riskColors = {
    low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    medium:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  };

  return (
    <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="bg-blue-50 dark:bg-blue-950/30 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
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
          <span className="text-gray-500 dark:text-gray-400">Konto:</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {rec.account_number} - {rec.account_name}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">
            MVA-behandling:
          </span>
          <span className="text-gray-900 dark:text-gray-100">
            {rec.vat_treatment}
          </span>
        </div>
        {rec.poweroffice_instructions && (
          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Slik gjor du det i PowerOffice
            </span>
            <p className="mt-1 text-gray-700 dark:text-gray-300">
              {rec.poweroffice_instructions}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool call indicator
// ---------------------------------------------------------------------------

function ToolCallIndicator({ tools }: { tools: ToolCallInfo[] }) {
  if (tools.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {tools.map((tool, i) => (
        <span
          key={`${tool.tool}-${i}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
        >
          {tool.status === "running" ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : tool.status === "complete" ? (
            <CheckCircle2 className="w-3 h-3 text-green-500" />
          ) : (
            <AlertTriangle className="w-3 h-3 text-red-500" />
          )}
          {TOOL_LABELS[tool.tool] || tool.tool}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const [showEvidence, setShowEvidence] = useState(false);
  const isUser = message.role === "user";

  // Try to parse accounting recommendation
  const recommendation =
    !isUser && message.content
      ? parseAccountingRecommendation(message.content)
      : null;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[85%] ${
          isUser
            ? "bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-2.5"
            : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm border border-gray-100 dark:border-gray-700"
        }`}
      >
        {/* Tool call indicators for assistant messages */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <ToolCallIndicator tools={message.toolCalls} />
        )}

        {/* Message content */}
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <>
            {message.content ? (
              <div
                className="text-sm prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-li:my-0"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(message.content),
                }}
              />
            ) : message.isStreaming ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Tenker...</span>
              </div>
            ) : null}
          </>
        )}

        {/* Streaming cursor */}
        {!isUser && message.isStreaming && message.content && (
          <span className="inline-block w-1.5 h-4 bg-gray-400 dark:bg-gray-500 animate-pulse ml-0.5 align-text-bottom" />
        )}

        {/* Accounting recommendation card */}
        {recommendation && <AccountingRecommendationCard rec={recommendation} />}

        {/* Evidence toggle for assistant messages */}
        {!isUser && message.content && !message.isStreaming && (
          <button
            onClick={() => setShowEvidence(!showEvidence)}
            className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
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
          <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded text-xs text-gray-500 dark:text-gray-400">
            {message.toolCalls && message.toolCalls.length > 0 ? (
              <>
                <p className="font-medium mb-1">Verktoy brukt:</p>
                <ul className="space-y-0.5">
                  {message.toolCalls.map((tool, i) => (
                    <li key={i} className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                      {TOOL_LABELS[tool.tool] || tool.tool}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>Svaret er basert paa generell kunnskap.</p>
            )}
          </div>
        )}

        {/* Timestamp */}
        <div
          className={`text-[10px] mt-1 ${
            isUser
              ? "text-blue-200"
              : "text-gray-400 dark:text-gray-500"
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
