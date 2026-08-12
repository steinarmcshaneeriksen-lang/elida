import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { verifyCompanyAccess } from "@/app/api/_lib/auth";
import { checkRateLimit, rateLimitResponse } from "@/app/api/_lib/rate-limit";
import { TOOLS } from "@/lib/assistant/tools";
import { executeTool } from "@/lib/assistant/tool-handlers";
import { getSystemPrompt } from "@/lib/assistant/system-prompt";
import { getCoverage } from "@/lib/assistant/coverage";
import { classifyIntent } from "@/lib/assistant/intent-classifier";
import { routeToModel } from "@/lib/assistant/model-router";
import type { DataQuality } from "@/lib/assistant/system-prompt";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatRequest {
  company_id: string;
  conversation_id?: string;
  message: string;
  knowledge_level?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPlaceholderKey(key: string | undefined): boolean {
  return (
    !key ||
    key === "" ||
    key === "placeholder" ||
    key.startsWith("sk-placeholder") ||
    key === "your-api-key-here"
  );
}

async function getCompanyContext(companyId: string) {
  try {
    const supabase = await createClient();

    const { data: company } = await supabase
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .single();

    const { data: syncStates } = await supabase
      .from("integration_sync_state")
      .select("*")
      .eq("company_id", companyId)
      .order("last_sync_completed_at", { ascending: false })
      .limit(1);

    const lastSync = syncStates?.[0];
    const dataQuality: DataQuality = {
      lastSyncTime: lastSync?.last_sync_completed_at ?? null,
      dataFreshness: "unknown",
    };

    if (lastSync?.last_sync_completed_at) {
      const syncTime = new Date(lastSync.last_sync_completed_at);
      const hoursSince =
        (Date.now() - syncTime.getTime()) / (1000 * 60 * 60);
      dataQuality.dataFreshness = hoursSince < 24 ? "fresh" : "stale";
      if (hoursSince >= 24) {
        dataQuality.staleSince = lastSync.last_sync_completed_at;
      }
    }

    return {
      companyName: company?.name ?? "Ukjent selskap",
      dataQuality,
    };
  } catch {
    return {
      companyName: "Ukjent selskap",
      dataQuality: {
        lastSyncTime: null,
        dataFreshness: "unknown" as const,
      },
    };
  }
}

async function storeMessage(
  conversationId: string,
  role: "user" | "assistant" | "system",
  content: string,
  toolCalls?: unknown[],
  toolResults?: unknown[]
) {
  try {
    const supabase = await createClient();
    await supabase.from("assistant_messages").insert({
      conversation_id: conversationId,
      role,
      content,
      tool_calls: (toolCalls ?? null) as import("@/lib/types/database").Json | null,
      tool_results: (toolResults ?? null) as import("@/lib/types/database").Json | null,
    });
  } catch {
    console.error("Failed to store assistant message");
  }
}

async function getOrCreateConversation(
  companyId: string,
  userId: string,
  conversationId?: string
): Promise<string> {
  const supabase = await createClient();

  if (conversationId) {
    const { data } = await supabase
      .from("assistant_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("company_id", companyId)
      .single();

    if (data) return data.id;
  }

  const { data, error } = await supabase
    .from("assistant_conversations")
    .insert({
      company_id: companyId,
      user_id: userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return `temp_${Date.now()}`;
  }

  return data.id;
}

async function loadConversationHistory(
  conversationId: string
): Promise<OpenAI.ChatCompletionMessageParam[]> {
  if (conversationId.startsWith("temp_")) return [];

  try {
    const supabase = await createClient();
    const { data: messages } = await supabase
      .from("assistant_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true })
      .limit(20);

    if (!messages) return [];

    return messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();
    const { company_id, conversation_id, message, knowledge_level } = body;

    if (!company_id || !message) {
      return new Response(
        JSON.stringify({ error: "company_id og message er påkrevd" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Confirm the caller may act for this company before anything else.
    // Row-level security would block the data, but without this check an
    // unauthenticated request still reaches the billed OpenAI call.
    const auth = await verifyCompanyAccess(company_id);
    if (auth instanceof NextResponse) return auth;

    // Each assistant turn costs money, so cap per user rather than per IP.
    const limit = checkRateLimit(`chat:${auth.userId}`, 20, 60_000);
    if (!limit.allowed) return rateLimitResponse(limit);

    // Refuse oversized prompts outright instead of forwarding them.
    if (message.length > 8000) {
      return new Response(
        JSON.stringify({ error: "Meldingen er for lang (maks 8000 tegn)." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (isPlaceholderKey(apiKey)) {
      // Returning invented figures here would be indistinguishable from a
      // real answer, so fail loudly instead.
      return new Response(
        JSON.stringify({
          error:
            "OpenAI-nøkkel er ikke konfigurert. Sett OPENAI_API_KEY for å bruke assistenten.",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    const [{ companyName, dataQuality }, coverage] = await Promise.all([
      getCompanyContext(company_id),
      // Stated up front so the assistant knows which periods exist before it
      // reaches for a tool, rather than reporting 'no data' for a month the
      // books simply do not reach.
      getCoverage(company_id),
    ]);
    const convId = await getOrCreateConversation(
      company_id,
      auth.userId,
      conversation_id
    );
    const history = await loadConversationHistory(convId);
    await storeMessage(convId, "user", message);

    const systemPrompt = getSystemPrompt(
      knowledge_level || "intermediate",
      companyName,
      dataQuality,
      coverage
    );

    const intent = classifyIntent(message);
    const routing = routeToModel(intent.intent, message, false);

    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message },
    ];

    const openai = new OpenAI({ apiKey });

    const openaiTools: OpenAI.ChatCompletionTool[] = TOOLS.map((t) => ({
      type: "function" as const,
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      },
    }));

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let currentMessages = openaiMessages;
          let continueLoop = true;

          while (continueLoop) {
            const response = await openai.chat.completions.create({
              model: routing.model,
              max_completion_tokens: 4096,
              messages: currentMessages,
              tools: openaiTools,
              tool_choice: "auto",
            });

            continueLoop = false;

            const choice = response.choices[0];
            if (!choice) break;

            const assistantMessage = choice.message;
            const textContent = assistantMessage.content;
            const toolCalls = assistantMessage.tool_calls;

            if (textContent) {
              const event = JSON.stringify({
                type: "content_delta",
                text: textContent,
              });
              controller.enqueue(encoder.encode(`data: ${event}\n\n`));
            }

            const fnToolCalls = toolCalls?.filter(
              (tc): tc is OpenAI.ChatCompletionMessageToolCall & { type: "function" } =>
                tc.type === "function"
            );

            if (fnToolCalls && fnToolCalls.length > 0 && choice.finish_reason === "tool_calls") {
              const toolResults: OpenAI.ChatCompletionToolMessageParam[] = [];

              for (const toolCall of fnToolCalls) {
                const toolName = toolCall.function.name;

                const toolStartEvent = JSON.stringify({
                  type: "tool_use",
                  tool: toolName,
                  status: "running",
                });
                controller.enqueue(encoder.encode(`data: ${toolStartEvent}\n\n`));

                try {
                  const args = JSON.parse(toolCall.function.arguments);
                  const result = await executeTool(toolName, company_id, args);

                  toolResults.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: JSON.stringify(result),
                  });

                  const toolDoneEvent = JSON.stringify({
                    type: "tool_use",
                    tool: toolName,
                    status: "complete",
                  });
                  controller.enqueue(encoder.encode(`data: ${toolDoneEvent}\n\n`));
                } catch (toolError) {
                  toolResults.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: JSON.stringify({
                      error: `Feil ved kjøring av ${toolName}: ${toolError instanceof Error ? toolError.message : "Ukjent feil"}`,
                    }),
                  });

                  const toolErrorEvent = JSON.stringify({
                    type: "tool_use",
                    tool: toolName,
                    status: "error",
                  });
                  controller.enqueue(encoder.encode(`data: ${toolErrorEvent}\n\n`));
                }
              }

              currentMessages = [
                ...currentMessages,
                assistantMessage,
                ...toolResults,
              ];
              continueLoop = true;
            } else {
              const fullText = textContent ?? "";
              await storeMessage(
                convId,
                "assistant",
                fullText,
                fnToolCalls && fnToolCalls.length > 0
                  ? fnToolCalls.map((tc) => ({
                      id: tc.id,
                      name: tc.function.name,
                      arguments: tc.function.arguments,
                    }))
                  : undefined
              );
            }
          }

          const completeEvent = JSON.stringify({
            type: "message_complete",
            conversation_id: convId,
          });
          controller.enqueue(encoder.encode(`data: ${completeEvent}\n\n`));
          controller.close();
        } catch (err) {
          const errorEvent = JSON.stringify({
            type: "error",
            message:
              err instanceof Error
                ? err.message
                : "En uventet feil oppstod",
          });
          controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("Chat API error:", err);
    return new Response(
      JSON.stringify({
        error: "Intern feil i chat-tjenesten",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
