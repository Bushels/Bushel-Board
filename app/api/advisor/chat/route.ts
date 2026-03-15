// app/api/advisor/chat/route.ts

import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserContext } from "@/lib/auth/role-guard";
import { buildChatContext } from "@/lib/advisor/context-builder";
import {
  buildReasonerSystemPrompt,
  buildVoiceSystemPrompt,
} from "@/lib/advisor/system-prompt";
import {
  createOpenRouterClient,
  CHAT_MODELS,
} from "@/lib/advisor/openrouter-client";

export const runtime = "nodejs";
export const maxDuration = 60; // Allow up to 60s for dual-model pipeline

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

  const supabase = await createClient();
  const openrouter = createOpenRouterClient();

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

  // 7. Round 1: Step 3.5 Flash (Reasoner) — get structured analysis
  const reasonerPrompt = buildReasonerSystemPrompt(chatContext);
  let reasoningJson: Record<string, unknown> | null = null;

  try {
    const reasonerResponse = await openrouter.chat.completions.create({
      model: CHAT_MODELS.reasoner,
      messages: [
        { role: "system", content: reasonerPrompt },
        ...conversationHistory,
        { role: "user", content: message },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    });

    const reasonerContent =
      reasonerResponse.choices[0]?.message?.content ?? "";

    // Parse JSON from reasoning response (may be wrapped in markdown code block)
    const jsonMatch = reasonerContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        reasoningJson = JSON.parse(jsonMatch[0]);
      } catch {
        reasoningJson = { raw_analysis: reasonerContent };
      }
    } else {
      reasoningJson = { raw_analysis: reasonerContent };
    }
  } catch (error) {
    console.error("Reasoner (Step 3.5 Flash) failed:", error);
    // Fallback: proceed with voice layer only, using raw context
    reasoningJson = {
      fallback: true,
      data_summary: "Analysis unavailable — answering from context only.",
    };
  }

  // 8. Round 2: Nemotron Super (Voice) — stream farmer-friendly response
  const voicePrompt = buildVoiceSystemPrompt();
  const voiceUserMessage = `The farmer asked: "${message}"

Here is the structured analysis from the data review:
${JSON.stringify(reasoningJson, null, 2)}

Here is the farmer's context:
${chatContext.farmer.grains
  .map(
    (g) =>
      `${g.grain}: ${g.acres} acres, ${g.delivered_kt} Kt delivered, ${g.contracted_kt} Kt contracted, ${g.uncontracted_kt} Kt uncontracted${g.percentile != null ? `, ${g.percentile}th percentile` : ""}`
  )
  .join("\n")}

Platform sentiment: ${chatContext.farmer.grains
    .map(
      (g) =>
        `${g.grain}: ${g.platform_holding_pct}% holding, ${g.platform_hauling_pct}% hauling (${g.platform_vote_count} votes)`
    )
    .join("; ")}

Rewrite the analysis as a kitchen-table conversation with this farmer. Be specific with their numbers. Sound like a neighbor, not a banker.`;

  // Try primary voice model (Nemotron Super), fall back to Trinity
  const voiceModels = [CHAT_MODELS.voice, CHAT_MODELS.voiceFallback];

  for (const voiceModel of voiceModels) {
    try {
      const voiceStream = await openrouter.chat.completions.create({
        model: voiceModel,
        messages: [
          { role: "system", content: voicePrompt },
          { role: "user", content: voiceUserMessage },
        ],
        temperature: 0.7,
        max_tokens: 2048,
        stream: true,
      });

      // Collect the full response for saving to DB
      let fullResponse = "";

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of voiceStream) {
              const content = chunk.choices[0]?.delta?.content ?? "";
              if (content) {
                fullResponse += content;
                // SSE format compatible with Vercel AI SDK useChat
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ content })}\n\n`
                  )
                );
              }
            }

            // Save assistant message to DB
            const latencyMs = Date.now() - startTime;
            await supabase.from("chat_messages").insert({
              thread_id: currentThreadId,
              role: "assistant",
              content: fullResponse,
              reasoning_json: reasoningJson,
              model_used: `${CHAT_MODELS.reasoner} → ${voiceModel}`,
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
            console.error("Voice stream error:", err);
            controller.error(err);
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Thread-Id": currentThreadId!,
        },
      });
    } catch (error) {
      console.error(`Voice model ${voiceModel} failed:`, error);
      // Try next voice model in the fallback chain
      continue;
    }
  }

  // All voice models failed — return reasoner analysis directly
  const fallbackContent = reasoningJson
    ? `Here's what I'm seeing: ${JSON.stringify(reasoningJson)}`
    : "I'm having trouble connecting right now. Check back in a few minutes.";

  await supabase.from("chat_messages").insert({
    thread_id: currentThreadId,
    role: "assistant",
    content: fallbackContent,
    reasoning_json: reasoningJson,
    model_used: `${CHAT_MODELS.reasoner} (fallback)`,
    latency_ms: Date.now() - startTime,
  });

  return Response.json({
    content: fallbackContent,
    threadId: currentThreadId,
  });
}
