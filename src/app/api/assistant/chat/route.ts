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

/** How many turns are carried forward. */
const HISTORY_TURNS = 20;

/**
 * How many of the most recent turns keep their tool output. Figures are bulky
 * — a cost analysis is thousands of tokens — so older turns keep only what the
 * assistant said about them.
 */
const TURNS_WITH_TOOL_OUTPUT = 3;

/** Long enough for a table of figures, short enough to carry several. */
const MAX_RESULT_CHARS = 2500;

interface StoredMessage {
  role: "user" | "assistant";
  content: string | null;
  tool_calls: Array<{ id: string; name: string; arguments: string }> | null;
  tool_results: Array<{ id: string; content: string }> | null;
}

/**
 * What the assistant is allowed to remember.
 *
 * Two faults sat here, and together they are most of why the chat did not
 * behave like one.
 *
 * The rows were ordered oldest-first and then capped at twenty, so a
 * conversation longer than twenty messages kept its *opening* and dropped
 * everything since. The assistant answered the twenty-first question with the
 * first twenty in mind and nothing after them.
 *
 * And only the prose was kept. Every figure a tool returned was thrown away at
 * the end of the turn, so "og hva var kostnadene?" arrived at a model that no
 * longer held the revenue it had just quoted, and "ja, gjør det" arrived at one
 * that no longer had the proposal it was agreeing to. It re-fetched, re-derived
 * and sometimes re-answered differently — the same question, two answers, for
 * no reason the reader could see.
 */
async function loadConversationHistory(
  conversationId: string
): Promise<OpenAI.ChatCompletionMessageParam[]> {
  if (conversationId.startsWith("temp_")) return [];

  try {
    const supabase = await createClient();
    const { data } = (await supabase
      .from("assistant_messages")
      .select("role, content, tool_calls, tool_results")
      .eq("conversation_id", conversationId)
      .in("role", ["user", "assistant"])
      // The most recent, not the first: a chat is about what was just said.
      .order("created_at", { ascending: false })
      .limit(HISTORY_TURNS)) as { data: StoredMessage[] | null };

    if (!data) return [];

    const messages = [...data].reverse();
    const out: OpenAI.ChatCompletionMessageParam[] = [];

    // Which assistant turns are recent enough to keep their figures.
    const assistantTurns = messages.filter((m) => m.role === "assistant").length;
    let seen = 0;

    for (const m of messages) {
      if (m.role === "user") {
        out.push({ role: "user", content: m.content ?? "" });
        continue;
      }

      seen++;
      const recent = seen > assistantTurns - TURNS_WITH_TOOL_OUTPUT;
      const calls = m.tool_calls ?? [];
      const results = m.tool_results ?? [];

      /*
       * A tool call and its result travel together or not at all: the API
       * rejects a call with no answer, and an answer with no call. So the pair
       * is replayed only when every call has a matching result.
       */
      const paired =
        recent &&
        calls.length > 0 &&
        calls.every((c) => results.some((r) => r.id === c.id));

      if (paired) {
        // The stored text is what was written *after* the tools ran, so it
        // belongs below their results, not on the call that asked for them.
        out.push({
          role: "assistant",
          content: null,
          tool_calls: calls.map((c) => ({
            id: c.id,
            type: "function" as const,
            function: { name: c.name, arguments: c.arguments },
          })),
        });

        for (const call of calls) {
          const result = results.find((r) => r.id === call.id)!;
          out.push({
            role: "tool",
            tool_call_id: call.id,
            content: result.content.slice(0, MAX_RESULT_CHARS),
          });
        }

        if (m.content) out.push({ role: "assistant", content: m.content });
        continue;
      }

      if (m.content) out.push({ role: "assistant", content: m.content });
    }

    return out;
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

    /*
     * Everything the first model call needs, fetched at once.
     *
     * These ran one after another — company context and coverage together,
     * then the conversation, then its history, then the write — four round
     * trips to the database stacked in front of a request that had not
     * started yet. Only the history genuinely depends on the conversation id.
     */
    const [{ companyName, dataQuality }, coverage, convId] = await Promise.all([
      getCompanyContext(company_id),
      // Stated up front so the assistant knows which periods exist before it
      // reaches for a tool, rather than reporting 'no data' for a month the
      // books simply do not reach.
      getCoverage(company_id),
      getOrCreateConversation(company_id, auth.userId, conversation_id),
    ]);

    // The user's message is stored, not read back, so the write does not have
    // to finish before the model starts.
    const history = await loadConversationHistory(convId);
    const stored = storeMessage(convId, "user", message);

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

    /*
     * Only the tools the question could plausibly need.
     *
     * The classifier already worked out which those were, and the result was
     * computed and then thrown away — every one of the tools went to the model
     * on every turn. That cost a large prefill each round trip, and it meant
     * the routing added for VAT deadlines did nothing at all: the model still
     * had the whole toolbox in front of it and still reached for four things.
     *
     * An empty list means the classifier had no opinion, and then it gets
     * everything.
     */
    const allowed = new Set(intent.suggestedTools);
    const openaiTools: OpenAI.ChatCompletionTool[] = TOOLS.filter(
      (t) => allowed.size === 0 || allowed.has(t.function.name)
    ).map((t) => ({
      type: "function" as const,
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      },
    }));

    const encoder = new TextEncoder();
    const send = (
      controller: ReadableStreamDefaultController<Uint8Array>,
      payload: unknown
    ) => {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
    };

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let currentMessages = openaiMessages;
          let continueLoop = true;

          /*
           * Everything the tools were asked and everything they answered, kept
           * across the rounds of this turn so it can be stored with the reply.
           *
           * The columns for these have existed all along and only the calls
           * were ever written — never the results. So the next turn inherited
           * the questions without the answers, and the figures the assistant
           * had just quoted were gone by the time the user asked about them.
           */
          const turnCalls: Array<{ id: string; name: string; arguments: string }> = [];
          const turnResults: Array<{ id: string; content: string }> = [];

          while (continueLoop) {
            /*
             * Streamed.
             *
             * This call used to be made without `stream`, which meant the
             * whole answer was generated before a single byte left the server.
             * The route set up an SSE stream, announced each tool as it ran,
             * and then sat on "Tenker …" until the model had finished writing
             * — the entire response arriving as one lump. It was not slow so
             * much as silent, which reads as slower still.
             */
            const completion = await openai.chat.completions.create({
              model: routing.model,
              max_completion_tokens: 4096,
              /*
               * Reasoning effort was never set, so it defaulted to medium —
               * the model thought silently for tens of seconds before writing
               * anything, and did it twice, once to choose a tool and once to
               * answer. Streaming cannot help with that: there is nothing to
               * stream until the thinking stops.
               *
               * A chat answering from tool output does not need to deliberate.
               * The expert tier does — it is reached for foreign VAT,
               * capitalisation and shareholder questions, where the reasoning
               * is the product.
               */
              reasoning_effort: routing.tier === "expert" ? "medium" : "low",
              messages: currentMessages,
              tools: openaiTools,
              tool_choice: "auto",
              stream: true,
            });

            continueLoop = false;

            let textContent = "";
            let finishReason: string | null = null;
            // Tool calls arrive in fragments, keyed by their position in the
            // list; the name comes in one chunk and the arguments across many.
            const pending = new Map<
              number,
              { id: string; name: string; args: string }
            >();

            for await (const chunk of completion) {
              const choice = chunk.choices[0];
              if (!choice) continue;

              if (choice.delta?.content) {
                textContent += choice.delta.content;
                send(controller, {
                  type: "content_delta",
                  text: choice.delta.content,
                });
              }

              for (const part of choice.delta?.tool_calls ?? []) {
                const entry = pending.get(part.index) ?? {
                  id: "",
                  name: "",
                  args: "",
                };
                if (part.id) entry.id = part.id;
                if (part.function?.name) entry.name = part.function.name;
                if (part.function?.arguments) {
                  entry.args += part.function.arguments;
                }
                pending.set(part.index, entry);
              }

              if (choice.finish_reason) finishReason = choice.finish_reason;
            }

            const calls = [...pending.entries()]
              .sort((a, b) => a[0] - b[0])
              .map(([, v]) => v)
              .filter((v) => v.id && v.name);

            const assistantMessage: OpenAI.ChatCompletionAssistantMessageParam = {
              role: "assistant",
              content: textContent || null,
              ...(calls.length > 0
                ? {
                    tool_calls: calls.map((c) => ({
                      id: c.id,
                      type: "function" as const,
                      function: { name: c.name, arguments: c.args || "{}" },
                    })),
                  }
                : {}),
            };

            if (calls.length > 0 && finishReason === "tool_calls") {
              for (const call of calls) {
                send(controller, {
                  type: "tool_use",
                  tool: call.name,
                  status: "running",
                });
              }

              /*
               * In parallel.
               *
               * These ran one after another, each awaited before the next was
               * started. The tools are independent reads — a coverage check
               * does not depend on a VAT estimate — and several of them page
               * through the whole ledger, so the wait was the sum of four
               * round trips rather than the longest one.
               */
              const toolResults = await Promise.all(
                calls.map(async (call) => {
                  try {
                    const args = JSON.parse(call.args || "{}");
                    const result = await executeTool(call.name, company_id, args, auth.userId);
                    return {
                      message: {
                        role: "tool" as const,
                        tool_call_id: call.id,
                        content: JSON.stringify(result),
                      },
                      status: "complete" as const,
                      tool: call.name,
                    };
                  } catch (toolError) {
                    return {
                      message: {
                        role: "tool" as const,
                        tool_call_id: call.id,
                        content: JSON.stringify({
                          error: `Feil ved kjøring av ${call.name}: ${
                            toolError instanceof Error
                              ? toolError.message
                              : "Ukjent feil"
                          }`,
                        }),
                      },
                      status: "error" as const,
                      tool: call.name,
                    };
                  }
                })
              );

              for (const r of toolResults) {
                send(controller, {
                  type: "tool_use",
                  tool: r.tool,
                  status: r.status,
                });
              }

              for (const call of calls) {
                turnCalls.push({
                  id: call.id,
                  name: call.name,
                  arguments: call.args || "{}",
                });
              }
              for (const r of toolResults) {
                turnResults.push({
                  id: r.message.tool_call_id,
                  content: r.message.content,
                });
              }

              currentMessages = [
                ...currentMessages,
                assistantMessage,
                ...toolResults.map((r) => r.message),
              ];
              continueLoop = true;
            } else {
              await stored;
              await storeMessage(
                convId,
                "assistant",
                textContent,
                turnCalls.length > 0 ? turnCalls : undefined,
                turnResults.length > 0 ? turnResults : undefined
              );
            }
          }

          send(controller, {
            type: "message_complete",
            conversation_id: convId,
          });
          controller.close();
        } catch (err) {
          send(controller, {
            type: "error",
            message:
              err instanceof Error ? err.message : "En uventet feil oppstod",
          });
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
