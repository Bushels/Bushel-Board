// app/api/advisor/chat/route.ts

import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserContext } from "@/lib/auth/role-guard";
import { buildChatContext } from "@/lib/advisor/context-builder";
import { buildAdvisorSystemPrompt } from "@/lib/advisor/system-prompt";
import { CHAT_MODELS } from "@/lib/advisor/openrouter-client";

export const runtime = "nodejs";
export const maxDuration = 45; // Responses API with x_search may take longer

const XAI_RESPONSES_URL = "https://api.x.ai/v1/responses";

export async function POST(request: Request) {
  const startTime = Date.now();

  // 1. Auth check
  const { user, role } = await getAuthenticatedUserContext();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (role === "observer") {
    return Response.json(
      {
        error:
          "Chat is available for farmers. Sign up to access the advisor.",
      },
      { status: 403 }
    );
  }

  // 2. Parse request
  const body = await request.json();
  const { message, threadId, grain } = body as {
    message: string;
    threadId?: string;
    grain?: string;
  };

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }

  if (message.length > 2000) {
    return Response.json(
      { error: "Message too long (max 2000 characters)" },
      { status: 400 }
    );
  }

  const xaiKey = process.env.XAI_API_KEY;
  if (!xaiKey) {
    return Response.json(
      { error: "AI service not configured" },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const model = CHAT_MODELS.primary;

  // 3. Create or load thread
  let currentThreadId = threadId;
  if (!currentThreadId) {
    const { data: newThread, error: threadError } = await supabase
      .from("chat_threads")
      .insert({
        user_id: user.id,
        title: message.slice(0, 100),
        grain_context: grain ? [grain] : [],
      })
      .select("id")
      .single();

    if (threadError || !newThread) {
      return Response.json(
        { error: "Failed to create thread" },
        { status: 500 }
      );
    }
    currentThreadId = newThread.id;
  }

  // 4. Save user message
  await supabase.from("chat_messages").insert({
    thread_id: currentThreadId,
    role: "user",
    content: message.trim(),
  });

  // 5. Load conversation history (last 10 messages)
  const { data: history } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("thread_id", currentThreadId)
    .order("created_at", { ascending: true })
    .limit(10);

  const conversationHistory = (history ?? []).map((msg) => ({
    role: msg.role as "user" | "assistant",
    content: msg.content,
  }));

  // 6. Build farmer context
  const chatContext = await buildChatContext(user.id, role, message, grain);

  // 7. Stream via xAI Responses API with x_search for real-time data
  const systemPrompt = buildAdvisorSystemPrompt(chatContext);

  try {
    const xaiResponse = await fetch(XAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${xaiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: true,
        max_output_tokens: 2048,
        temperature: 0.6,
        tools: [{ type: "x_search" }],
        input: [
          { role: "system", content: systemPrompt },
          ...conversationHistory,
          { role: "user", content: message },
        ],
      }),
    });

    if (!xaiResponse.ok) {
      const errText = await xaiResponse.text();
      console.error(`Grok API ${xaiResponse.status}:`, errText.slice(0, 300));
      throw new Error(`Grok API error: ${xaiResponse.status}`);
    }

    let fullResponse = "";
    const encoder = new TextEncoder();

    const sseStream = new ReadableStream({
      async start(controller) {
        try {
          const reader = xaiResponse.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6).trim();
              if (payload === "[DONE]") continue;

              try {
                const event = JSON.parse(payload);

                // Extract text deltas from Responses API streaming
                if (event.type === "response.output_text.delta") {
                  const delta = event.delta ?? "";
                  if (delta) {
                    fullResponse += delta;
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({ content: delta })}\n\n`
                      )
                    );
                  }
                }
              } catch {
                // Skip unparseable events
              }
            }
          }

          // Save assistant message to DB
          const latencyMs = Date.now() - startTime;
          await supabase.from("chat_messages").insert({
            thread_id: currentThreadId,
            role: "assistant",
            content: fullResponse,
            model_used: model,
            latency_ms: latencyMs,
          });

          // Update thread
          await supabase
            .from("chat_threads")
            .update({
              message_count: (history?.length ?? 0) + 2,
              updated_at: new Date().toISOString(),
              grain_context: grain
                ? [grain]
                : chatContext.farmer.grains.map((g) => g.grain),
            })
            .eq("id", currentThreadId);

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ threadId: currentThreadId, done: true })}\n\n`
            )
          );
          controller.close();
        } catch (err) {
          console.error("Stream error:", err);
          controller.error(err);
        }
      },
    });

    return new Response(sseStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Thread-Id": currentThreadId!,
      },
    });
  } catch (error) {
    console.error("Grok API failed:", error);

    const fallbackContent =
      "I'm having trouble connecting right now. Check back in a few minutes.";

    await supabase.from("chat_messages").insert({
      thread_id: currentThreadId,
      role: "assistant",
      content: fallbackContent,
      model_used: "fallback",
      latency_ms: Date.now() - startTime,
    });

    return Response.json({
      content: fallbackContent,
      threadId: currentThreadId,
    });
  }
}
