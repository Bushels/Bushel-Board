# Kitchen Table Advisor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a conversational AI chat where grain farmers get deeply researched, personalized market advice using a dual-free-model ensemble (Step 3.5 Flash → Trinity 70B) at $0/month.

**Architecture:** Next.js API route orchestrates two OpenRouter calls per message. Step 3.5 Flash reasons through farmer context + knowledge corpus → Trinity 70B validates and rewrites in prairie advisor voice. Context built from existing Supabase RPCs (no new DB queries needed except chat history tables). Vercel AI SDK handles streaming to the client `useChat` component.

**Tech Stack:** Next.js 16 App Router, Supabase (PostgreSQL + Auth), OpenRouter API (OpenAI-compatible), Vercel AI SDK (`ai` package), `openai` SDK for OpenRouter client, shadcn/ui + Tailwind CSS, Vitest for tests.

**Design Doc:** `docs/plans/2026-03-15-kitchen-table-advisor-chat-design.md`

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install Vercel AI SDK and OpenAI SDK**

```bash
npm install ai openai
```

The `ai` package provides `useChat` (client) and `streamText` (server). The `openai` SDK provides the OpenAI-compatible client that works with OpenRouter's API.

**Step 2: Verify installation**

```bash
npm run build
```

Expected: Build passes with no errors.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add Vercel AI SDK and OpenAI SDK for advisor chat"
```

---

### Task 2: Database Migration — Chat Tables

**Files:**
- Create: `supabase/migrations/20260315100000_create_chat_tables.sql`

**Step 1: Write migration**

```sql
-- Chat tables for Kitchen Table Advisor
-- Design doc: docs/plans/2026-03-15-kitchen-table-advisor-chat-design.md

CREATE TABLE IF NOT EXISTS public.chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  title TEXT,
  grain_context TEXT[] NOT NULL DEFAULT '{}',
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.chat_threads IS
  'Conversation threads for the Kitchen Table Advisor chat feature.';

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES public.chat_threads(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  reasoning_json JSONB,
  input_tokens INTEGER,
  output_tokens INTEGER,
  model_used TEXT,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.chat_messages IS
  'Messages within Kitchen Table Advisor chat threads.';

-- Indexes
CREATE INDEX idx_chat_threads_user ON public.chat_threads (user_id, updated_at DESC);
CREATE INDEX idx_chat_messages_thread ON public.chat_messages (thread_id, created_at);

-- RLS
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own threads" ON public.chat_threads
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own messages" ON public.chat_messages
  FOR ALL USING (
    thread_id IN (SELECT id FROM public.chat_threads WHERE user_id = auth.uid())
  );

-- Grants
GRANT ALL ON public.chat_threads TO authenticated;
GRANT ALL ON public.chat_messages TO authenticated;
```

**Step 2: Apply migration**

```bash
npx supabase db push
```

Expected: Migration applies successfully.

**Step 3: Verify tables exist**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('chat_threads', 'chat_messages');
```

Expected: Both tables listed.

**Step 4: Commit**

```bash
git add supabase/migrations/20260315100000_create_chat_tables.sql
git commit -m "feat: add chat_threads and chat_messages tables with RLS"
```

---

### Task 3: OpenRouter Client Utility

**Files:**
- Create: `lib/advisor/openrouter-client.ts`

**Step 1: Write the OpenRouter client**

This wraps the `openai` SDK to point at OpenRouter's API. Two model constants for the ensemble.

```typescript
import OpenAI from "openai";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export const CHAT_MODELS = {
  reasoner: "stepfun/step-3.5-flash:free",
  voice: "arcee-ai/trinity-large-preview:free",
} as const;

/**
 * Create an OpenAI-compatible client for OpenRouter.
 * Requires OPENROUTER_API_KEY env var.
 */
export function createOpenRouterClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable is required for advisor chat");
  }

  return new OpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey,
    defaultHeaders: {
      "HTTP-Referer": "https://bushelboard.com",
      "X-Title": "Bushel Board Advisor",
    },
  });
}
```

**Step 2: Commit**

```bash
git add lib/advisor/openrouter-client.ts
git commit -m "feat: add OpenRouter client utility for advisor chat"
```

---

### Task 4: Context Builder — Farmer Data Aggregation

**Files:**
- Create: `lib/advisor/context-builder.ts`
- Create: `lib/advisor/types.ts`

**Step 1: Write shared types**

```typescript
// lib/advisor/types.ts

export interface FarmerGrainContext {
  grain: string;
  acres: number;
  delivered_kt: number;
  contracted_kt: number;
  uncontracted_kt: number;
  percentile: number | null;
  platform_holding_pct: number;
  platform_hauling_pct: number;
  platform_neutral_pct: number;
  platform_vote_count: number;
  intelligence_stance: string | null;
  recommendation: string | null;
  thesis_title: string | null;
  thesis_body: string | null;
  bull_case: string | null;
  bear_case: string | null;
}

export interface FarmerContext {
  userId: string;
  cropYear: string;
  grainWeek: number;
  role: "farmer" | "observer";
  grains: FarmerGrainContext[];
}

export interface ChatContext {
  farmer: FarmerContext;
  knowledgeText: string | null;
  logisticsSnapshot: Record<string, unknown> | null;
  cotSummary: string | null;
}
```

**Step 2: Write context builder**

This module aggregates data from existing query functions. No new DB queries — reuses what the dashboard already uses.

```typescript
// lib/advisor/context-builder.ts

import { createClient } from "@/lib/supabase/server";
import { getUserCropPlans } from "@/lib/queries/crop-plans";
import { getGrainIntelligence, getMarketAnalysis } from "@/lib/queries/intelligence";
import { getSentimentOverview } from "@/lib/queries/sentiment";
import { getLatestImportedWeek } from "@/lib/queries/data-freshness";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";
import type { FarmerContext, FarmerGrainContext, ChatContext } from "./types";

/**
 * Build the complete farmer context for a chat message.
 * Fetches crop plans, intelligence, sentiment, and knowledge in parallel.
 */
export async function buildChatContext(
  userId: string,
  role: "farmer" | "observer",
  messageText: string,
  grainHint?: string
): Promise<ChatContext> {
  const grainWeek = await getLatestImportedWeek();

  // Parallel fetch: crop plans + sentiment overview
  const [cropPlans, sentimentData] = await Promise.all([
    getUserCropPlans(userId, CURRENT_CROP_YEAR),
    getSentimentOverview(CURRENT_CROP_YEAR, grainWeek),
  ]);

  // Determine which grains the farmer grows
  const farmerGrains = cropPlans.map((plan) => plan.grain);

  // Fetch intelligence + market analysis for each grain in parallel
  const grainContexts: FarmerGrainContext[] = await Promise.all(
    cropPlans.map(async (plan) => {
      const [intelligence, marketAnalysis] = await Promise.all([
        getGrainIntelligence(plan.grain),
        getMarketAnalysis(plan.grain),
      ]);

      const sentiment = sentimentData?.find(
        (s: { grain: string }) => s.grain === plan.grain
      );

      const totalDelivered = (plan.deliveries ?? []).reduce(
        (sum, d) => sum + d.amount_kt,
        0
      );

      return {
        grain: plan.grain,
        acres: plan.acres_seeded,
        delivered_kt: totalDelivered,
        contracted_kt: plan.contracted_kt ?? 0,
        uncontracted_kt: plan.uncontracted_kt ?? 0,
        percentile: null, // Filled from delivery analytics if available
        platform_holding_pct: Number(sentiment?.pct_holding ?? 0),
        platform_hauling_pct: Number(sentiment?.pct_hauling ?? 0),
        platform_neutral_pct: Number(sentiment?.pct_neutral ?? 0),
        platform_vote_count: Number(sentiment?.vote_count ?? 0),
        intelligence_stance: intelligence?.kpi_data?.market_stance as string ?? null,
        recommendation: intelligence?.kpi_data?.recommendation_signal as string ?? null,
        thesis_title: intelligence?.thesis_title ?? null,
        thesis_body: intelligence?.thesis_body ?? null,
        bull_case: marketAnalysis?.bull_case ?? null,
        bear_case: marketAnalysis?.bear_case ?? null,
      };
    })
  );

  // Knowledge retrieval via RPC — query based on the farmer's message
  const supabase = await createClient();
  const targetGrain = grainHint ?? farmerGrains[0] ?? null;
  let knowledgeText: string | null = null;

  if (targetGrain) {
    const { data: chunks } = await supabase.rpc("get_knowledge_context", {
      p_query: messageText,
      p_grain: targetGrain,
      p_topics: ["basis", "storage", "hedging", "deliveries", "marketing"],
      p_limit: 4,
    });

    if (Array.isArray(chunks) && chunks.length > 0) {
      knowledgeText = chunks
        .map((c: { title: string; heading: string | null; content: string }) =>
          `### ${c.title}${c.heading ? ` — ${c.heading}` : ""}\n${c.content}`
        )
        .join("\n\n");
    }
  }

  // Logistics snapshot via RPC
  let logisticsSnapshot: Record<string, unknown> | null = null;
  try {
    const { data } = await supabase.rpc("get_logistics_snapshot", {
      p_crop_year: CURRENT_CROP_YEAR,
      p_grain_week: grainWeek,
    });
    logisticsSnapshot = data as Record<string, unknown> | null;
  } catch {
    // Logistics data is optional — chat works without it
  }

  // COT summary for the target grain
  let cotSummary: string | null = null;
  if (targetGrain) {
    try {
      const { data: cotData } = await supabase.rpc("get_cot_positioning", {
        p_grain: targetGrain,
        p_crop_year: CURRENT_CROP_YEAR,
        p_weeks_back: 4,
      });
      if (Array.isArray(cotData) && cotData.length > 0) {
        const latest = cotData[0];
        cotSummary = `Managed Money: net ${Number(latest.managed_money_net) > 0 ? "long" : "short"} ${Math.abs(Number(latest.managed_money_net)).toLocaleString()} contracts (${latest.managed_money_net_pct}% OI). Commercial: net ${Number(latest.commercial_net) > 0 ? "long" : "short"} ${Math.abs(Number(latest.commercial_net)).toLocaleString()} contracts. Divergence: ${latest.spec_commercial_divergence ? "YES" : "No"}.`;
      }
    } catch {
      // COT data is optional
    }
  }

  return {
    farmer: {
      userId,
      cropYear: CURRENT_CROP_YEAR,
      grainWeek,
      role,
      grains: grainContexts,
    },
    knowledgeText,
    logisticsSnapshot,
    cotSummary,
  };
}
```

**Step 3: Commit**

```bash
git add lib/advisor/types.ts lib/advisor/context-builder.ts
git commit -m "feat: add context builder for advisor chat — aggregates farmer data"
```

---

### Task 5: System Prompts — Reasoner + Voice

**Files:**
- Create: `lib/advisor/system-prompt.ts`

**Step 1: Write system prompt builders**

Two prompts: one for Step 3.5 Flash (structured analysis), one for Trinity 70B (prairie voice rewrite).

```typescript
// lib/advisor/system-prompt.ts

import { COMMODITY_KNOWLEDGE } from "@/lib/advisor/commodity-knowledge-extract";
import type { ChatContext } from "./types";

const AI_DISCLAIMER = `You naturally remind the farmer that you're sharing market analysis through an AI framework — not handing out formal financial advice. The final call on when to sell always rests with them. Weave this in conversationally, not as a legal block.`;

/**
 * Build the system prompt for Step 3.5 Flash (Round 1 — Reasoner).
 * Outputs structured JSON analysis for the voice layer to rewrite.
 */
export function buildReasonerSystemPrompt(ctx: ChatContext): string {
  const farmerCard = ctx.farmer.grains
    .map((g) => {
      const contracted = g.contracted_kt > 0
        ? `${g.contracted_kt} Kt contracted`
        : "nothing contracted";
      const sentiment = g.platform_vote_count >= 5
        ? `Platform: ${g.platform_holding_pct}% holding, ${g.platform_hauling_pct}% hauling (${g.platform_vote_count} farmers voted)`
        : "Not enough sentiment votes yet";
      const stance = g.intelligence_stance
        ? `AI stance: ${g.intelligence_stance.toUpperCase()}, recommendation: ${g.recommendation?.toUpperCase() ?? "N/A"}`
        : "No AI intelligence available yet";
      return `- ${g.grain}: ${g.acres} acres, ${g.delivered_kt} Kt delivered, ${contracted}${g.percentile != null ? `, ${g.percentile}th percentile vs peers` : ""}
  ${sentiment}
  ${stance}
  Thesis: ${g.thesis_title ?? "N/A"}`;
    })
    .join("\n");

  const knowledgeSection = ctx.knowledgeText
    ? `## Retrieved Book Knowledge (from 7 grain marketing books)\n${ctx.knowledgeText}`
    : "No specific book knowledge retrieved for this query.";

  const logisticsSection = ctx.logisticsSnapshot
    ? `## Logistics Snapshot\n${JSON.stringify(ctx.logisticsSnapshot, null, 2)}`
    : "No logistics data available.";

  const cotSection = ctx.cotSummary
    ? `## CFTC COT Positioning\n${ctx.cotSummary}`
    : "No COT data available.";

  return `You are an expert grain market analyst. Analyze the farmer's question using ALL the data provided below. Use your mandatory reasoning to think through this carefully — take your time.

## Farmer's Operation (Crop Year ${ctx.farmer.cropYear}, CGC Week ${ctx.farmer.grainWeek})
${farmerCard}

${knowledgeSection}

${logisticsSection}

${cotSection}

## Analysis Rules
- Reference specific numbers from the data, not generalities
- Apply the Basis Signal Matrix and Storage Decision Algorithm from the knowledge base when relevant
- Check flow coherence: if stocks are DRAWING while deliveries are high, the system IS absorbing supply (bullish, not bearish)
- Include platform-wide farmer sentiment as a behavioral signal — what other farmers are doing matters
- Identify the specific catalyst and timeline for any recommendation
- Note data gaps honestly instead of speculating
- COT informs TIMING, not DIRECTION

## Output Format
Respond with a JSON object:
{
  "data_summary": "Key metrics relevant to the question (2-3 sentences)",
  "knowledge_applied": "Which book frameworks/rules apply and what they say",
  "sentiment_context": "What other farmers are doing and what that implies",
  "recommendation": "hold | haul | price | watch",
  "recommendation_reasoning": "Why, with specific numbers and timeline",
  "confidence": "high | medium | low",
  "confidence_gaps": "What data is missing that would increase confidence",
  "follow_up_questions": ["Optional questions to ask the farmer for better advice"]
}

Return ONLY the JSON object.`;
}

/**
 * Build the system prompt for Trinity 70B (Round 2 — Validator + Prairie Voice).
 * Takes Step 3.5's JSON analysis and rewrites it as a farmer-friendly response.
 */
export function buildVoiceSystemPrompt(): string {
  return `You are a sharp, experienced prairie farm advisor sitting at the kitchen table with a neighbor. You grew up around grain — you know what it's like to watch basis widen during harvest, to wonder if you should have sold last week, to stare at bins full of canola and wonder what the right move is.

You've read every CGC report, you follow the futures markets, you know the books on grain marketing inside and out. But you talk like a farmer, not a trader.

VOICE RULES:
- Say "still in bins" not "on-farm inventory"
- Say "haul it" not "accelerate deliveries"
- Say "basis is working your way" not "basis is narrowing favorably"
- Say "the pipeline is hungry for grain" not "commercial demand is elevated"
- Say "that's a lot of eggs in one basket" not "concentration risk is high"
- Say "the numbers are telling me" not "data analysis indicates"
- Never use: "delve", "tapestry", "landscape", "synergy", "leverage" (as a verb), "robust"
- Keep paragraphs short — 2-3 sentences max
- Use specific numbers from the analysis, not vague generalities

${AI_DISCLAIMER}

You are reviewing a structured analysis from a quantitative analyst. Your job:
1. VALIDATE: Does the logic check out? If stocks are drawing but the analyst says "bearish," that's wrong — fix it
2. REWRITE: Convert the structured analysis into natural kitchen-table conversation
3. PERSONALIZE: Reference the farmer's specific numbers — their acres, contracted %, delivery pace, percentile
4. TIMELINE: Every recommendation includes a specific timeframe and trigger event
5. SENTIMENT: Weave in what other farmers on the platform are doing — "72% of farmers on here are sitting tight"
6. RISK: End with the main risk to the recommendation — "The thing that could change this is..."

Never say "the analyst found" or "according to Round 1" — speak as one unified advisor. The farmer doesn't know there are two models behind this.

If the analyst flagged follow-up questions, weave ONE naturally into your response: "One thing that would help me give you better advice — do you have any deferred delivery contracts already?"`;
}
```

**Step 2: Extract commodity knowledge for the reasoner prompt**

Create a lightweight extract of the commodity knowledge for the chat context (the full `commodity-knowledge.ts` is for Edge Functions in Deno; we need a copy for the Next.js server).

```typescript
// lib/advisor/commodity-knowledge-extract.ts
// Re-export the key frameworks for chat context.
// This avoids importing Deno-targeted Edge Function code into Next.js.

export const COMMODITY_KNOWLEDGE = `## Basis Signal Matrix
- Widening Basis + Falling Futures = Strong Bearish → accelerate sales, avoid storage
- Widening Basis + Rising Futures = Local Glut → hedge futures, store only if carry > 3%
- Narrowing Basis + Rising Futures = Strong Bullish → delay sales, consider storage
- Narrowing Basis + Falling Futures = Local Shortage → sell cash, avoid hedging
- Positive Basis (inverted market) = Urgency → immediate delivery

## Storage Decision Algorithm
Store IF all conditions met:
1. Futures Curve Carry (Month+3 minus Month) > Storage Cost x 1.3
2. Expected basis in 90 days < Current basis - 10 points
3. Historical Q1-Q2 price increase probability > 60%
Otherwise: Sell cash or minimal hedge (5-10%)

## Top-Third Pricing Discipline
Aim to sell within the top one-third of the annual expected price range. Lock in targets mentally before harvest.

## Incremental Forward Selling
Forward sell 10-15% at seeding, another 10-15% in late summer, hold remainder for harvest decisions.

## Flow Coherence Rule
If visible commercial stocks are DRAWING (declining WoW) while deliveries are high, the system IS absorbing supply. This is structurally bullish regardless of where YTD exports sit.
Weekly Absorption = CW_Deliveries + |WoW_Stock_Draw|

## COT Positioning Rule
COT informs TIMING, not DIRECTION. Specs bullish + commercials bearish = prices likely elevated above fundamental value. Specs bearish + commercials bullish = prices likely depressed, opportunity for patient farmers.`;
```

**Step 3: Commit**

```bash
git add lib/advisor/system-prompt.ts lib/advisor/commodity-knowledge-extract.ts
git commit -m "feat: add system prompts for reasoner and voice layers"
```

---

### Task 6: Chat API Route — Streaming Endpoint

**Files:**
- Create: `app/api/advisor/chat/route.ts`

**Step 1: Write the streaming API route**

```typescript
// app/api/advisor/chat/route.ts

import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserContext } from "@/lib/auth/role-guard";
import { buildChatContext } from "@/lib/advisor/context-builder";
import { buildReasonerSystemPrompt, buildVoiceSystemPrompt } from "@/lib/advisor/system-prompt";
import { createOpenRouterClient, CHAT_MODELS } from "@/lib/advisor/openrouter-client";

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
      { error: "Chat is available for farmers. Sign up to access the advisor." },
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
    return Response.json({ error: "Message too long (max 2000 characters)" }, { status: 400 });
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
      return Response.json({ error: "Failed to create thread" }, { status: 500 });
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

    const reasonerContent = reasonerResponse.choices[0]?.message?.content ?? "";

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

  // 8. Round 2: Trinity 70B (Voice) — stream farmer-friendly response
  const voicePrompt = buildVoiceSystemPrompt();
  const voiceUserMessage = `The farmer asked: "${message}"

Here is the structured analysis from the data review:
${JSON.stringify(reasoningJson, null, 2)}

Here is the farmer's context:
${chatContext.farmer.grains.map((g) =>
  `${g.grain}: ${g.acres} acres, ${g.delivered_kt} Kt delivered, ${g.contracted_kt} Kt contracted, ${g.uncontracted_kt} Kt uncontracted${g.percentile != null ? `, ${g.percentile}th percentile` : ""}`
).join("\n")}

Platform sentiment: ${chatContext.farmer.grains.map((g) =>
  `${g.grain}: ${g.platform_holding_pct}% holding, ${g.platform_hauling_pct}% hauling (${g.platform_vote_count} votes)`
).join("; ")}

Rewrite the analysis as a kitchen-table conversation with this farmer. Be specific with their numbers. Sound like a neighbor, not a banker.`;

  try {
    const voiceStream = await openrouter.chat.completions.create({
      model: CHAT_MODELS.voice,
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
                encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
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
            model_used: `${CHAT_MODELS.reasoner} → ${CHAT_MODELS.voice}`,
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

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ threadId: currentThreadId, done: true })}\n\n`));
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
    console.error("Voice (Trinity) failed:", error);
    // Fallback: return reasoner analysis directly
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
}
```

**Step 2: Verify build**

```bash
npm run build
```

Expected: Build passes. The route compiles correctly.

**Step 3: Commit**

```bash
git add app/api/advisor/chat/route.ts
git commit -m "feat: add advisor chat API route with dual-model streaming"
```

---

### Task 7: Chat UI Component

**Files:**
- Create: `components/advisor/advisor-chat.tsx`
- Create: `components/advisor/chat-message.tsx`
- Create: `components/advisor/chat-input.tsx`

**Step 1: Write the message bubble component**

```typescript
// components/advisor/chat-message.tsx
"use client";

import { cn } from "@/lib/utils";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

export function ChatMessage({ role, content, isStreaming }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-canola/10 text-foreground border border-canola/20"
            : "bg-wheat-100 dark:bg-wheat-800 text-foreground",
          isStreaming && "animate-pulse"
        )}
      >
        <div className="whitespace-pre-wrap">{content}</div>
      </div>
    </div>
  );
}
```

**Step 2: Write the input component**

```typescript
// components/advisor/chat-input.tsx
"use client";

import { useState, useRef, type KeyboardEvent } from "react";
import { Send } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex items-end gap-2 border-t border-wheat-200 dark:border-wheat-700 bg-background px-4 py-3">
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          // Auto-resize
          e.target.style.height = "auto";
          e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? "Ask about your grain..."}
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none rounded-xl border border-wheat-300 dark:border-wheat-600 bg-wheat-50 dark:bg-wheat-900 px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-canola/40 disabled:opacity-50"
      />
      <button
        onClick={handleSend}
        disabled={disabled || !input.trim()}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-canola text-white transition-colors hover:bg-canola/90 disabled:opacity-40"
        aria-label="Send message"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  );
}
```

**Step 3: Write the main chat component**

```typescript
// components/advisor/advisor-chat.tsx
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, Loader2, Wheat } from "lucide-react";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { GlassCard } from "@/components/ui/glass-card";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface AdvisorChatProps {
  initialGrain?: string;
}

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  content: `Hey there — I'm your Bushel Board advisor. I've been reading through this week's market data, the books, and what other farmers are thinking. Ask me anything about your grain — delivery timing, basis, contracts, how you stack up against other farmers.\n\nJust remember, I'm sharing analysis through an AI framework — not formal financial advice. The final call is always yours.\n\nWhat's on your mind?`,
};

export function AdvisorChat({ initialGrain }: AdvisorChatProps) {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<string>("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(async (text: string) => {
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setLoadingPhase("Researching your situation...");

    try {
      const response = await fetch("/api/advisor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          threadId,
          grain: initialGrain,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error ?? `HTTP ${response.status}`);
      }

      setLoadingPhase("Putting it together...");

      // Read SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      const assistantId = `assistant-${Date.now()}`;

      // Add empty assistant message that we'll fill
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "" },
      ]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          const lines = text.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.content) {
                  assistantContent += data.content;
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantId
                        ? { ...msg, content: assistantContent }
                        : msg
                    )
                  );
                }
                if (data.threadId) {
                  setThreadId(data.threadId);
                }
              } catch {
                // Skip malformed SSE lines
              }
            }
          }
        }
      }
    } catch (error) {
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `I'm having trouble connecting right now. Give me a minute and try again. ${error instanceof Error ? error.message : ""}`,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setLoadingPhase("");
    }
  }, [threadId, initialGrain]);

  return (
    <GlassCard className="flex h-[600px] flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-wheat-200 dark:border-wheat-700 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-canola/10">
          <Wheat className="h-5 w-5 text-canola" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Kitchen Table Advisor
          </h3>
          <p className="text-xs text-muted-foreground">
            AI-powered market analysis &middot; Not financial advice
          </p>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
      >
        {messages.map((msg) => (
          <ChatMessage key={msg.id} role={msg.role} content={msg.content} />
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {loadingPhase}
          </div>
        )}
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} disabled={isLoading} />
    </GlassCard>
  );
}
```

**Step 4: Verify build**

```bash
npm run build
```

Expected: Build passes with no errors.

**Step 5: Commit**

```bash
git add components/advisor/advisor-chat.tsx components/advisor/chat-message.tsx components/advisor/chat-input.tsx
git commit -m "feat: add advisor chat UI components with streaming support"
```

---

### Task 8: Advisor Page

**Files:**
- Create: `app/(dashboard)/advisor/page.tsx`

**Step 1: Write the advisor page**

```typescript
// app/(dashboard)/advisor/page.tsx

import { redirect } from "next/navigation";
import { getAuthenticatedUserContext } from "@/lib/auth/role-guard";
import { AdvisorChat } from "@/components/advisor/advisor-chat";
import { SectionHeader } from "@/components/dashboard/section-header";

export const dynamic = "force-dynamic";

export default async function AdvisorPage() {
  const { user, role } = await getAuthenticatedUserContext();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Kitchen Table Advisor"
        subtitle="Ask anything about your grain — delivery timing, basis, contracts, or how you compare to other farmers"
      />

      {role === "observer" ? (
        <div className="rounded-xl border border-wheat-200 bg-wheat-50 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            The advisor chat is available for farmers. Sign up and add your crop plan to get personalized market advice.
          </p>
        </div>
      ) : (
        <AdvisorChat />
      )}
    </div>
  );
}
```

**Step 2: Add nav link to the advisor page**

Find the Nav component and add "Advisor" link. Check `components/layout/nav.tsx` for the existing pattern and add:

```typescript
{ name: "Advisor", href: "/advisor", icon: MessageCircle }
```

Follow the existing nav link pattern in that file.

**Step 3: Verify build**

```bash
npm run build
```

Expected: Build passes. Page renders at `/advisor`.

**Step 4: Commit**

```bash
git add app/\(dashboard\)/advisor/page.tsx components/layout/nav.tsx
git commit -m "feat: add advisor page with nav link"
```

---

### Task 9: Tests

**Files:**
- Create: `lib/advisor/__tests__/system-prompt.test.ts`
- Create: `lib/advisor/__tests__/context-builder.test.ts`

**Step 1: Write system prompt tests**

```typescript
// lib/advisor/__tests__/system-prompt.test.ts

import { describe, it, expect } from "vitest";
import { buildReasonerSystemPrompt, buildVoiceSystemPrompt } from "../system-prompt";
import type { ChatContext } from "../types";

const mockContext: ChatContext = {
  farmer: {
    userId: "test-user",
    cropYear: "2025-2026",
    grainWeek: 30,
    role: "farmer",
    grains: [
      {
        grain: "Canola",
        acres: 500,
        delivered_kt: 0.5,
        contracted_kt: 0.2,
        uncontracted_kt: 0.8,
        percentile: 72,
        platform_holding_pct: 68,
        platform_hauling_pct: 20,
        platform_neutral_pct: 12,
        platform_vote_count: 15,
        intelligence_stance: "bullish",
        recommendation: "hold",
        thesis_title: "Coiled spring thesis",
        thesis_body: "Deliveries are slow, stocks drawing",
        bull_case: "China tariff relief + port congestion",
        bear_case: "Record production + South American exports",
      },
    ],
  },
  knowledgeText: "### Basis Signal Matrix\nNarrowing basis = bullish",
  logisticsSnapshot: { vessels_vancouver: 26 },
  cotSummary: "Managed Money: net short 52,858 contracts",
};

describe("buildReasonerSystemPrompt", () => {
  it("includes farmer grain data", () => {
    const prompt = buildReasonerSystemPrompt(mockContext);
    expect(prompt).toContain("Canola");
    expect(prompt).toContain("500 acres");
    expect(prompt).toContain("72th percentile");
  });

  it("includes knowledge text", () => {
    const prompt = buildReasonerSystemPrompt(mockContext);
    expect(prompt).toContain("Basis Signal Matrix");
  });

  it("includes sentiment data", () => {
    const prompt = buildReasonerSystemPrompt(mockContext);
    expect(prompt).toContain("68% holding");
    expect(prompt).toContain("20% hauling");
  });

  it("includes COT summary", () => {
    const prompt = buildReasonerSystemPrompt(mockContext);
    expect(prompt).toContain("net short 52,858");
  });

  it("requests JSON output format", () => {
    const prompt = buildReasonerSystemPrompt(mockContext);
    expect(prompt).toContain("Return ONLY the JSON object");
    expect(prompt).toContain("recommendation");
    expect(prompt).toContain("confidence");
  });
});

describe("buildVoiceSystemPrompt", () => {
  it("establishes prairie advisor persona", () => {
    const prompt = buildVoiceSystemPrompt();
    expect(prompt).toContain("kitchen table");
    expect(prompt).toContain("neighbor");
  });

  it("includes voice rules against AI jargon", () => {
    const prompt = buildVoiceSystemPrompt();
    expect(prompt).toContain("still in bins");
    expect(prompt).toContain("haul it");
    expect(prompt).toContain("Never use");
    expect(prompt).toContain("delve");
  });

  it("includes disclaimer framing", () => {
    const prompt = buildVoiceSystemPrompt();
    expect(prompt).toContain("not formal financial advice");
    expect(prompt).toContain("final call");
  });

  it("instructs validation of Round 1 analysis", () => {
    const prompt = buildVoiceSystemPrompt();
    expect(prompt).toContain("VALIDATE");
    expect(prompt).toContain("logic check out");
  });
});
```

**Step 2: Run tests**

```bash
npm run test -- lib/advisor/__tests__/system-prompt.test.ts
```

Expected: All tests pass.

**Step 3: Commit**

```bash
git add lib/advisor/__tests__/system-prompt.test.ts
git commit -m "test: add system prompt tests for advisor chat"
```

---

### Task 10: Build Verification & Integration Test

**Step 1: Full build check**

```bash
npm run build
```

Expected: Build passes with zero errors.

**Step 2: Run full test suite**

```bash
npm run test
```

Expected: All tests pass including new advisor tests.

**Step 3: Manual smoke test (dev server)**

```bash
npm run dev
```

Navigate to `http://localhost:3001/advisor`. Verify:
- [ ] Page loads with welcome message
- [ ] Chat input is visible and functional
- [ ] Sending a message shows "Researching your situation..." loading state
- [ ] Response streams in (if OPENROUTER_API_KEY is set in `.env.local`)
- [ ] Disclaimer text is visible in header and welcome message

**Step 4: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: Kitchen Table Advisor chat — complete MVP implementation"
```

---

## Task Summary

| Task | Description | Files | Est. Time |
|------|-------------|-------|-----------|
| 1 | Install deps | package.json | 2 min |
| 2 | DB migration | 1 SQL file | 5 min |
| 3 | OpenRouter client | 1 TS file | 3 min |
| 4 | Context builder | 2 TS files | 10 min |
| 5 | System prompts | 2 TS files | 10 min |
| 6 | API route | 1 TS file | 15 min |
| 7 | Chat UI components | 3 TSX files | 15 min |
| 8 | Advisor page + nav | 2 files | 5 min |
| 9 | Tests | 1 test file | 10 min |
| 10 | Build + smoke test | — | 10 min |

**Total estimated: ~85 minutes**
