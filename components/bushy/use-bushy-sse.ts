"use client";

import { useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  ChatMessage,
  SSEEvent,
  TrustFooterData,
  MessageContent,
  VerificationPromptData,
  ServerVerificationPrompt,
} from "./types";
import { gamifiedLabels } from "./types";

// ---------------------------------------------------------------------------
// SSE line parser
// ---------------------------------------------------------------------------

function parseSSELine(
  line: string,
  currentEvent: string
): { event?: string; data?: SSEEvent } {
  // "event: <type>" sets the event name for the next data line
  if (line.startsWith("event: ")) {
    return { event: line.slice(7).trim() };
  }

  // "data: <json>" carries the payload
  if (line.startsWith("data: ")) {
    const raw = line.slice(6);
    if (raw === "[DONE]") {
      return { data: { type: "done" } };
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return { data: toSSEEvent(currentEvent, parsed) };
    } catch {
      // Non-JSON data line — treat as text delta
      return { data: { type: "delta", content: raw } };
    }
  }

  return {};
}

/**
 * Map SSE payloads from the Edge Function to typed events.
 *
 * Server contract (chat-completion/index.ts):
 *   { type: "delta",               text: "..." }
 *   { type: "tool_call",           name: "..." }
 *   { type: "tool_result",         name: "...", result: "..." }
 *   { type: "verification_prompt", data: { prompt, grain, ... } }
 *   { type: "trust_footer",        cgcFreshness, ..., confidence }
 *   { type: "done",                thread_id: "...", model, tokens }
 *   { type: "error",               error: "..." }
 */
function toSSEEvent(
  eventType: string,
  parsed: Record<string, unknown>
): SSEEvent {
  // Edge Function embeds type in JSON payload (no separate event: line).
  // Resolve the actual type from the payload first.
  const resolvedType = (parsed.type as string) ?? eventType;

  switch (resolvedType) {
    case "delta":
      // Server sends { text }, not { content }
      return {
        type: "delta",
        content: (parsed.text as string) ?? (parsed.content as string) ?? "",
      };

    case "tool_call":
      return { type: "tool_call", name: (parsed.name as string) ?? "" };

    case "tool_result":
      return {
        type: "tool_result",
        name: (parsed.name as string) ?? "",
        result: parsed.result,
      };

    case "verification_prompt":
      // Server sends { data: { prompt, grain, dataType, ... } }
      return {
        type: "verification_prompt",
        data: (parsed.data ?? parsed) as unknown as ServerVerificationPrompt,
      };

    case "trust_footer":
      return {
        type: "trust_footer",
        data: parsed as unknown as TrustFooterData,
      };

    case "done":
      return {
        type: "done",
        threadId: (parsed.thread_id as string) ?? (parsed.threadId as string),
        cardData: parsed as Record<string, unknown>,
      };

    case "error":
      // Server sends { error }, not { message }
      return {
        type: "error",
        message:
          (parsed.error as string) ??
          (parsed.message as string) ??
          "Unknown error",
      };

    default:
      // Unknown event type — render as raw text so nothing is silently lost
      return { type: "delta", content: JSON.stringify(parsed) };
  }
}

// ---------------------------------------------------------------------------
// Card data parser (mirrors iOS parseCardData)
// ---------------------------------------------------------------------------

function parseCardData(
  text: string,
  trustFooter?: TrustFooterData
): MessageContent | undefined {
  let jsonText = text.trim();
  // Strip markdown code fences
  if (jsonText.startsWith("```json")) jsonText = jsonText.slice(7);
  if (jsonText.startsWith("```")) jsonText = jsonText.slice(3);
  if (jsonText.endsWith("```")) jsonText = jsonText.slice(0, -3);
  jsonText = jsonText.trim();

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    return undefined;
  }

  const type = json.type as string | undefined;
  if (!type) return undefined;

  const defaultFooter: TrustFooterData = trustFooter ?? {
    cgcFreshness: "unknown",
    futuresFreshness: "unknown",
    localReportCount: 0,
    localReportFreshness: "",
    confidence: "Early read",
  };

  switch (type) {
    case "market_summary": {
      const reasons = (
        (json.reasons as Array<Record<string, string>>) ?? []
      ).map((r) => ({
        text: r.text ?? "",
        sourceTag: (r.source_tag?.replace(/_/g, " ") ??
          "national market") as import("./types").SourceTag,
      }));

      return {
        type: "market_summary",
        data: {
          grain: (json.grain as string) ?? "Wheat",
          stanceBadge: (json.stance_badge as string) ?? "",
          takeaway: (json.takeaway as string) ?? "",
          reasons,
          recommendation: (json.recommendation as string) ?? "",
          followUpAsk: json.follow_up_ask as string | undefined,
          trustFooter: defaultFooter,
        },
      };
    }

    case "recommendation": {
      const actions = (
        (json.actions as Array<Record<string, string>>) ?? []
      ).map((a) => ({
        label: a.label ?? "",
        icon: a.icon ?? "arrow-right",
      }));

      return {
        type: "recommendation",
        data: {
          headline: (json.headline as string) ?? "",
          explanation: (json.explanation as string) ?? "",
          actions,
          trustFooter: defaultFooter,
        },
      };
    }

    case "verification_prompt": {
      const dataType = (json.data_type as string) ?? "";
      const labels = gamifiedLabels(dataType);
      return {
        type: "verification_prompt",
        data: {
          grain: (json.grain as string) ?? "",
          dataType,
          inferredValue: (json.inferred_value as string) ?? "",
          elevatorName: json.elevator_name as string | undefined,
          confirmLabel: (json.confirm_label as string) ?? labels.confirm,
          denyLabel: (json.deny_label as string) ?? labels.deny,
        },
      };
    }

    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Status line heuristic (mirrors iOS statusLineForMessage)
// ---------------------------------------------------------------------------

function statusLineForMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("wheat")) return "Checking wheat in your area...";
  if (lower.includes("canola")) return "Pulling canola data...";
  if (lower.includes("barley")) return "Looking at barley...";
  if (lower.includes("basis")) return "Checking local basis...";
  if (lower.includes("area")) return "Scanning your area...";
  return "Checking the market...";
}

function toolCallStatusLine(name: string): string {
  switch (name) {
    case "save_local_intel":
      return "Saving your local intel...";
    case "update_farmer_memory":
      return "Noting that for next time...";
    case "get_area_stance":
      return "Checking your area...";
    case "search_market":
      return "Pulling market data...";
    case "create_crop_plan":
      return "Updating your crop plan...";
    default:
      return "Working on it...";
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseBushySSEReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  sendMessage: (text: string) => Promise<void>;
  threadId: string | null;
}

export function useBushySSE(): UseBushySSEReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const threadIdRef = useRef<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);

  const sendMessage = useCallback(async (text: string) => {
    // Add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    // Show status line immediately
    const statusId = `status-${Date.now()}`;
    const statusMsg: ChatMessage = {
      id: statusId,
      role: "status",
      content: statusLineForMessage(text),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, statusMsg]);

    try {
      // Get access token
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        removeMessage(statusId);
        appendError("Not signed in. Please sign in and try again.");
        setIsLoading(false);
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/chat-completion`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: text,
            thread_id: threadIdRef.current,
          }),
        }
      );

      if (!response.ok) {
        removeMessage(statusId);
        const errBody = await response.text().catch(() => "");
        appendError(
          `Something went wrong (${response.status}). ${errBody}`.trim()
        );
        setIsLoading(false);
        return;
      }

      // Stream SSE response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      const responseId = `analyst-${Date.now()}`;
      let accumulatedText = "";
      let currentEventType = "";
      let trustFooter: TrustFooterData | undefined;
      let statusRemoved = false;

      if (reader) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          // Keep the last potentially-incomplete line in the buffer
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line === "") continue; // skip empty lines (SSE separator)

            const { event, data } = parseSSELine(line, currentEventType);

            if (event !== undefined) {
              currentEventType = event;
              continue;
            }

            if (!data) continue;

            switch (data.type) {
              case "delta": {
                // Remove status on first delta
                if (!statusRemoved) {
                  removeMessage(statusId);
                  statusRemoved = true;
                }
                accumulatedText += data.content;
                upsertAnalystMessage(responseId, accumulatedText);
                break;
              }

              case "tool_call": {
                updateStatusMessage(statusId, toolCallStatusLine(data.name));
                break;
              }

              case "tool_result":
                // Silent — tool results are for the LLM
                break;

              case "verification_prompt": {
                const serverPrompt = data.data;
                const labels = gamifiedLabels(serverPrompt.dataType);
                const vpData: VerificationPromptData = {
                  grain: serverPrompt.grain,
                  dataType: serverPrompt.dataType,
                  inferredValue: serverPrompt.dataDescription,
                  elevatorName: undefined,
                  confirmLabel:
                    serverPrompt.options[0]?.label ?? labels.confirm,
                  denyLabel: serverPrompt.options[1]?.label ?? labels.deny,
                  threadId: threadIdRef.current ?? undefined,
                };
                const vpMsg: ChatMessage = {
                  id: `vp-${Date.now()}`,
                  role: "analyst",
                  content: serverPrompt.prompt,
                  timestamp: new Date(),
                  cardData: { type: "verification_prompt", data: vpData },
                };
                setMessages((prev) => [...prev, vpMsg]);
                break;
              }

              case "trust_footer": {
                trustFooter = data.data;
                break;
              }

              case "done": {
                if (!statusRemoved) removeMessage(statusId);
                if (data.threadId) {
                  threadIdRef.current = data.threadId;
                  setThreadId(data.threadId);
                }

                // Try to parse accumulated text as structured card JSON
                const card = parseCardData(accumulatedText, trustFooter);
                if (card) {
                  upsertAnalystMessage(responseId, accumulatedText, card);
                } else if (trustFooter) {
                  // Plain text — attach trust footer
                  upsertAnalystMessage(
                    responseId,
                    accumulatedText,
                    undefined,
                    trustFooter
                  );
                }
                break;
              }

              case "error": {
                if (!statusRemoved) removeMessage(statusId);
                appendError(data.message);
                break;
              }
            }

            // Reset event type after processing data
            currentEventType = "";
          }
        }
      }
    } catch (err) {
      removeMessage(statusId);
      appendError(
        `Connection error. ${err instanceof Error ? err.message : ""}`
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  // -- helpers (stable because they use setMessages functional updates) --

  function removeMessage(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }

  function appendError(text: string) {
    setMessages((prev) => [
      ...prev,
      {
        id: `error-${Date.now()}`,
        role: "analyst" as const,
        content: text,
        timestamp: new Date(),
      },
    ]);
  }

  function updateStatusMessage(id: string, content: string) {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content } : m))
    );
  }

  function upsertAnalystMessage(
    id: string,
    content: string,
    cardData?: MessageContent,
    footer?: TrustFooterData
  ) {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === id);
      const msg: ChatMessage = {
        id,
        role: "analyst",
        content,
        timestamp: new Date(),
        ...(cardData ? { cardData } : {}),
        ...(footer ? { trustFooter: footer } : {}),
      };
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = msg;
        return next;
      }
      return [...prev, msg];
    });
  }

  return { messages, isLoading, sendMessage, threadId };
}
