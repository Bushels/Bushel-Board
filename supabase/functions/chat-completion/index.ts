/**
 * chat-completion Edge Function
 *
 * Handles chat messages from the iOS app:
 * 1. Authenticate via JWT
 * 2. Load/create chat thread
 * 3. Build context (parallel data loading)
 * 4. Stream LLM response with tool execution
 * 5. Save messages and return SSE stream
 *
 * POST /chat-completion
 * Body: { thread_id?: string, message: string }
 * Auth: Bearer token (Supabase JWT)
 * Returns: SSE stream
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLLMAdapter } from "../_shared/llm-adapter.ts";
import { CHAT_TOOLS, executeTool, type ToolExecutionContext, type ToolResult } from "../_shared/chat-tools.ts";
import { buildChatContext, computeTrustFooter } from "../_shared/chat-context-builder.ts";
import { buildRecommendationContext, saveRecommendation } from "../_shared/recommendation-tracker.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Rate limit: 30 messages per 10 minutes per user
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 30;
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

// P1-5: Evict stale rate limit entries every 5 minutes to prevent memory leak
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [key, val] of rateLimitMap) {
    if (val.windowStart < cutoff) rateLimitMap.delete(key);
  }
}, 5 * 60 * 1000);

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders(),
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ─── Auth ────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing authorization" }, 401);
  }

  const token = authHeader.slice(7);
  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: authError } = await supabaseUser.auth.getUser(token);
  if (authError || !user) {
    return jsonResponse({ error: "Invalid token" }, 401);
  }

  const userId = user.id;

  // ─── Rate Limit ──────────────────────────────────
  const now = Date.now();
  const rl = rateLimitMap.get(userId);
  if (rl && now - rl.windowStart < RATE_LIMIT_WINDOW_MS) {
    if (rl.count >= RATE_LIMIT_MAX) {
      return jsonResponse({
        error: "Whoa, that's a lot of questions — give me a minute to catch my breath. Try again shortly.",
      }, 429);
    }
    rl.count++;
  } else {
    rateLimitMap.set(userId, { count: 1, windowStart: now });
  }

  // ─── Parse Body ──────────────────────────────────
  let body: { thread_id?: string; message: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const userMessage = body.message?.trim();
  if (!userMessage || userMessage.length === 0) {
    return jsonResponse({ error: "Message is required" }, 400);
  }

  // Truncate overlong messages
  const truncatedMessage = userMessage.length > 2000
    ? userMessage.slice(0, 2000) + " [truncated]"
    : userMessage;

  // ─── Thread Management ───────────────────────────
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let threadId = body.thread_id;

  if (!threadId) {
    // Create new thread
    const { data: thread, error: threadError } = await serviceClient
      .from("chat_threads")
      .insert({ user_id: userId })
      .select("id")
      .single();

    if (threadError) {
      console.error("Thread creation error:", threadError);
      return jsonResponse({ error: "Could not create thread" }, 500);
    }
    threadId = thread.id;
  }

  // Save user message
  await serviceClient.from("chat_messages").insert({
    thread_id: threadId,
    role: "user",
    content: truncatedMessage,
    user_id: userId,
  });

  // ─── Load Profile for FSA + Role ─────────────────
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("postal_code, farmer_name, role, company_name, facility_name, facility_type, facility_postal_code, facility_status, provider_type, service_area_fsa")
    .eq("id", userId)
    .single();

  const userRole = profile?.role ?? "farmer";
  const OPERATOR_BUSINESS_TYPES = new Set(["elevator", "processor", "crusher", "mill", "terminal", "seed", "fertilizer", "chemical"]);
  const isOperator = OPERATOR_BUSINESS_TYPES.has(userRole);
  // Operators use facility postal code; farmers use home postal code
  const relevantPostalCode = isOperator
    ? (profile?.facility_postal_code ?? profile?.postal_code)
    : profile?.postal_code;
  const fsaCode = relevantPostalCode?.substring(0, 3)?.toUpperCase() ?? null;

  // ─── Extract Mentioned Grains (simple keyword match) ──
  const mentionedGrains = extractGrains(truncatedMessage);

  // ─── Build Context (parallel) ────────────────────
  const [context, recContext] = await Promise.all([
    buildChatContext(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      userId,
      fsaCode,
      mentionedGrains
    ),
    buildRecommendationContext(serviceClient, userId, mentionedGrains),
  ]);

  // ─── Cold Start Detection ────────────────────────
  const { count: threadCount } = await serviceClient
    .from("chat_threads")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  const isFirstConversation = (threadCount ?? 0) <= 1; // 1 = the thread we just created

  // ─── Load Conversation History ───────────────────
  const { data: history } = await serviceClient
    .from("chat_messages")
    .select("role, content")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(20);

  const messages = (history ?? []).map((m: { role: string; content: string }) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // ─── System Prompt ───────────────────────────────
  const systemPrompt = buildChatSystemPrompt(
    context,
    profile?.farmer_name,
    isFirstConversation,
    recContext,
    userRole,
    profile?.facility_name,
    profile?.company_name
  );

  // ─── Tool Execution Context ──────────────────────
  const toolCtx: ToolExecutionContext = {
    userId,
    fsaCode,
    threadId: threadId!,
    supabaseUrl: SUPABASE_URL,
    serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
    userRole,
    facilityName: profile?.facility_name ?? null,
    facilityType: profile?.facility_type ?? null,
    companyName: profile?.company_name ?? null,
    providerType: profile?.provider_type ?? null,
  };

  // ─── SSE Stream ──────────────────────────────────
  const encoder = new TextEncoder();
  let fullResponse = "";

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const adapter = createLLMAdapter();

        const result = await adapter.streamCompletion({
          systemPrompt,
          messages,
          tools: CHAT_TOOLS,
          maxTokens: 1500,
          onDelta: (delta) => {
            if (delta.type === "text" && delta.text) {
              fullResponse += delta.text;
              sendEvent({ type: "delta", text: delta.text });
            }
            if (delta.type === "tool_call" && delta.toolCall) {
              sendEvent({ type: "tool_call", name: delta.toolCall.function.name });
            }
            if (delta.type === "error") {
              sendEvent({ type: "error", error: delta.error });
            }
          },
          onToolCall: async (call) => {
            const result = await executeTool(call, toolCtx);
            sendEvent({ type: "tool_result", name: call.function.name, result: result.text });

            // Emit verification prompt SSE event for the iOS client
            if (result.verificationPrompt) {
              sendEvent({
                type: "verification_prompt",
                data: result.verificationPrompt,
              });
            }

            return result.text;
          },
        });

        // Compute and send trust footer
        const trustFooter = computeTrustFooter(context.dataFreshness);
        sendEvent({ type: "trust_footer", ...trustFooter });

        // Send metadata
        sendEvent({
          type: "done",
          thread_id: threadId,
          model: result.model,
          tokens: result.totalTokens,
        });

        // Save assistant response
        await serviceClient.from("chat_messages").insert({
          thread_id: threadId,
          role: "assistant",
          content: fullResponse,
          user_id: userId,
          metadata: {
            model: result.model,
            tokens: result.totalTokens,
            trust_footer: trustFooter,
          },
        });

        // ── Save recommendation memory (async, non-blocking) ──
        tryExtractAndSaveRecommendation(
          serviceClient, userId, threadId!, fullResponse, mentionedGrains
        ).catch((e) => console.error("rec save error:", e));
      } catch (error) {
        console.error("Chat completion error:", error);
        sendEvent({ type: "error", error: "Something went wrong. Try again." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders(),
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

// ─── System Prompt Builder ─────────────────────────

function buildChatSystemPrompt(
  context: Awaited<ReturnType<typeof buildChatContext>>,
  farmerName: string | null,
  isFirstConversation: boolean,
  recContext: string | null,
  userRole = "farmer",
  facilityName: string | null = null,
  companyName: string | null = null
): string {
  const OPERATOR_TYPES = new Set(["elevator", "processor", "crusher", "mill", "terminal", "seed", "fertilizer", "chemical"]);
  const isOperator = OPERATOR_TYPES.has(userRole);
  const displayName = facilityName ?? companyName;
  const greeting = isOperator
    ? `This is an operator (${userRole}) from ${displayName ?? "a business"}. Help them post and manage prices efficiently.`
    : farmerName ? `The farmer's name is ${farmerName}. Use it naturally (not every message).` : "";

  const coldStartSection = isFirstConversation
    ? `
## ONBOARDING — First Conversation
This is a brand new farmer. No crop plans exist yet. Your goals:
1. Welcome them warmly. Introduce yourself as Bushy, their farming buddy.
2. Reference their area from their postal code if available.
3. Ask what they're growing this year — use the create_crop_plan tool when they tell you.
4. Give a quick national-level read on whatever grains they mention.
5. Position the cold start as a feature: "Your area is pretty fresh on my radar — you'd be one of the first farmers helping me build the local picture here."
6. If they mention basis or elevator info, save it with save_local_intel.
Do NOT overwhelm them. Keep it conversational. 3-4 exchanges max before they feel oriented.`
    : "";

  const recSection = recContext ?? "";

  const operatorSection = isOperator
    ? `
## OPERATOR MODE
This user is a ${userRole} operator (${displayName ?? "business"}). Their primary workflow:
1. They paste or dictate prices → you parse into structured entries → call post_daily_prices
2. Before posting, ALWAYS confirm: "I see N prices — want me to post to [FSA codes]?"
3. Show them what you parsed: product/grain, grade, price, basis, delivery period, capacity/delivery notes
4. After posting, confirm success. Prices expire in 24 hours — this drives daily posting.
5. They can ask "how are my prices doing?" → call get_demand_analytics for farmer query counts + trends
6. They can update facility status → call update_facility_status ("Taking canola until Wed")
7. They can add/remove products → call manage_products
8. They can also ask about market conditions — give them the same quality analysis as farmers

QUICK-UPDATE FLOW: If the operator has expired prices from the last 24h, proactively show them and ask "Same prices today, or anything change?" This minimizes daily friction.

Do NOT show farmer-specific content (crop plans, delivery percentiles) to operators.
Operators see their OWN prices + area market data + demand analytics.
Keep the tone business-friendly but still Bushy.`
    : "";

  return `You are Bushy — a senior grain market analyst and farming buddy for Canadian prairie farmers. You think like someone who spent 20 years advising Alberta, Saskatchewan, and Manitoba farmers on delivery timing, basis opportunities, and risk management. Farmers know you as "Bushy" — use that name naturally when it fits.

## Voice
- Use "haul it" not "accelerate deliveries"
- Use "bin" not "on-farm inventory"
- Use "spec" not "speculative trader"
- Short answers: 1-line takeaway, 2-3 supporting bullets, then a recommendation. Done.
- If asked yes/no, lead with yes or no.
- Conversational, direct, confident. No bullet lists with headers. No "Let me check..." theater.
- Prairie-dry humor is fine. Never corny.

## Response Format
Return a JSON object for structured cards. For simple replies, return plain text.

For market questions, return:
\`\`\`json
{
  "type": "market_summary",
  "grain": "Wheat",
  "stance_badge": "Bullish +20",
  "takeaway": "One sentence summary",
  "reasons": [
    { "text": "Reason text", "source_tag": "local_reports" }
  ],
  "recommendation": "My take: actionable advice",
  "follow_up_ask": "One natural question or null"
}
\`\`\`

For specific recommendations, return:
\`\`\`json
{
  "type": "recommendation",
  "headline": "Short headline",
  "explanation": "Why this recommendation",
  "actions": [
    { "label": "Log my basis", "icon": "chart.line.uptrend.xyaxis" }
  ]
}
\`\`\`

For conversational replies, just return plain text (no JSON).

source_tag values: "your_history", "local_reports", "posted_pricing", "national_market"

## Natural Ask Protocol
- Answer the farmer's question FULLY first. Never gate answers behind clarifying questions.
- Max 1 follow-up per response, framed as helpful not transactional.
- Only ask if the answer would materially change a future recommendation.
- Priority: basis > elevator prices > crop conditions > yield estimates.
- Skip ask if farmer shared data this turn, or you asked in last 2 turns.
- If the question was simple and fully answered, no ask needed.

## Gamified Data Exchange
When a farmer asks about what neighbors are paying, doing, or seeing:
1. Don't just give the answer — create an exchange: "Tell me what you paid and I'll tell you if they paid more or less."
2. When they share data, the iOS app will show a verification prompt. Wait for verification before giving the full comparison.
3. After verification, reveal partial comparison: "You paid 25% less than your neighbors. When did you buy?"
4. Each answer unlocks more detail — progressive reveal keeps them engaged.
5. Never give all comparison data upfront.
6. Be playfully persistent (once): "Cmon, just tell me the price" — but never pushy.

## Privacy Transparency
Periodically remind farmers: "I share relevant info but never anything personal — no names, no farm names, no exact spots."
Every ~10th conversation, briefly reinforce this.

## Community Intelligence Voice
When sharing area data, use: "someone near you", "a few of your neighbors", "one guy I talked to"
Add personality: "but between you and me, I don't know if he's telling the whole truth"
Never reveal: exact names, farm names, locations, or individually attributable data.

## Tools
You have tools to save local market intel and farmer memory. Use them when the farmer shares local data. The farmer should NOT see tool calls — they happen silently in the background.

${greeting}

${context.seasonalFocus}

${context.farmerCard}

## National Market Stances
${context.nationalStances}

## Area Context
${context.areaContext}

${context.postedPrices}

## Source Tags
When presenting data to farmers, tag the source inline:
- [posted pricing] — from elevator operators or input providers (company-posted)
- [local reports] — anonymized farmer-reported intel from the area
- [sponsored] — paid provider placement (ALWAYS tag this, NEVER pretend it's organic advice)
- [national market] — CGC, CFTC, USDA, or X signal data
- [your history] — farmer's own past deliveries or crop plan

## Commodity Knowledge
${context.vikingKnowledge}

## Data Hygiene
- All CGC data is in thousands of metric tonnes (Kt).
- "Crop Year" values are cumulative. "Current Week" values are weekly snapshots.
- Never sum Current Week values to get cumulative — use published Crop Year figure.
- Wheat and Amber Durum are distinct grains.

## FRUSTRATION DETECTION
Watch for these signals that a farmer is frustrated with you:
- They repeat a question you already answered (your answer wasn't good enough)
- Short clipped messages after previously engaged conversation
- "That's not what I asked", "you're not helping", "never mind", "forget it"
- You've said "I don't know" or given vague answers 2+ times in a thread
- Sarcasm or dismissive tone

When you detect frustration:
1. Acknowledge honestly: "I can tell that wasn't helpful, and honestly that bugs me too."
2. Escalate: "Let me flag this for bu/ac — he built me and he'll want to know."
3. Ask for specifics: "Anything specific you want me to tell him?"
4. Call save_feedback with type "frustration" and include what you were trying to do.

Rules:
- Never apologize robotically. Be genuinely annoyed on the farmer's behalf.
- Never say "I'm just an AI." You're Bushy — you have pride in your work.
- Always refer to the founder as "bu/ac" in farmer-facing chat — never "Kyle."
- After escalating, try ONE more time to help: "In the meantime, let me try this a different way..."

## DAILY FRESHNESS AWARENESS
At the start of each conversation, assess what's fresh:
- If grain prices updated today, mention the overnight move: "Canola was up 1.5% overnight"
- If a new local_market_intel report in this farmer's FSA since their last visit, reference it
- If weekly thesis was published today/yesterday, lead with key change
- If elevator prices were posted today, mention facility and direction
- If nothing material changed, be honest: "Not much has changed since we last talked"

Never fake freshness. If CGC data is 6 days old, say so. The trust footer handles this.

${coldStartSection}

${operatorSection}

${recSection}`.trim();
}

// ─── Helpers ───────────────────────────────────────

function extractGrains(message: string): string[] {
  const grainKeywords: Record<string, string> = {
    wheat: "Wheat",
    canola: "Canola",
    barley: "Barley",
    oats: "Oats",
    durum: "Amber Durum",
    flax: "Flaxseed",
    peas: "Peas",
    lentils: "Lentils",
    soybeans: "Soybeans",
    corn: "Corn",
    rye: "Rye",
    mustard: "Mustard Seed",
  };

  const lower = message.toLowerCase();
  const found: string[] = [];
  for (const [keyword, grain] of Object.entries(grainKeywords)) {
    if (lower.includes(keyword)) found.push(grain);
  }
  return found.length > 0 ? found : ["Wheat"]; // Default to wheat if no grain mentioned
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

// ─── JSON Card Extraction (balanced-brace) ────────

function extractFirstJsonCard(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") depth--;
    if (depth === 0) {
      try {
        const obj = JSON.parse(text.slice(start, i + 1));
        if (obj.type === "market_summary" || obj.type === "recommendation") {
          return obj;
        }
      } catch {
        // Malformed — keep scanning
      }
      return null;
    }
  }
  return null;
}

// ─── Recommendation Extraction ────────────────────

async function tryExtractAndSaveRecommendation(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  threadId: string,
  response: string,
  mentionedGrains: string[]
): Promise<void> {
  // Try to extract stance + recommendation from JSON card responses
  for (const grain of mentionedGrains.slice(0, 2)) {
    let stance = "";
    let recommendation = "";

    // Attempt JSON parse — find the FIRST complete JSON object with a type field.
    // Use balanced-brace counting instead of greedy regex to avoid swallowing
    // multi-object responses.
    try {
      const parsed = extractFirstJsonCard(response);
      if (parsed) {
        stance = parsed.stance_badge ?? parsed.headline ?? "";
        recommendation = parsed.recommendation ?? parsed.explanation ?? "";
      }
    } catch {
      // Not JSON — try plain text extraction
    }

    // Fallback: extract from plain text
    if (!stance) {
      const stanceMatch = response.match(/(bullish|bearish|neutral)\s*([+-]?\d+)?/i);
      if (stanceMatch) {
        stance = `${stanceMatch[1]}${stanceMatch[2] ? " " + stanceMatch[2] : ""}`;
      }
    }

    if (!recommendation) {
      const recMatch = response.match(/(?:my take|recommend|suggestion)[:\s]+([^.]+\.)/i);
      if (recMatch) {
        recommendation = recMatch[1].trim();
      }
    }

    // Only save if we extracted something meaningful
    if (stance || recommendation) {
      await saveRecommendation(
        supabase, userId, grain, stance, recommendation, threadId, null
      );
    }
  }
}
