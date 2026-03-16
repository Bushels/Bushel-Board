# Kitchen Table Advisor — AI Chat for Grain Farmers

**Author:** ultra-agent + Gemini consultation
**Date:** 2026-03-15
**Status:** Approved — ready for implementation planning

---

## 1. Problem Statement

Bushel Board generates rich weekly intelligence per grain (dual-LLM debate, bull/bear cases, market stance, recommendation signals, personalized farm summaries with percentile rankings). But farmers can't ask follow-up questions, dig deeper into a specific signal, or get advice tailored to their exact situation in the moment. They read the summary and wonder: *"But what does that mean for MY canola, given that I have nothing contracted and I'm holding more than most?"*

## 2. Solution: Kitchen Table Advisor

A conversational AI chat that feels like talking to a sharp, experienced prairie farm advisor who knows your operation, has read every market report, and talks like a neighbor — not a Wall Street analyst.

### Core Principles

1. **Free to run at scale.** Both models are $0/month via OpenRouter. The full $5 budget stays on the weekly Grok intelligence pipeline.
2. **Deep research, not fast answers.** The free model advantage is time — it can reason through all the data instead of rushing a response.
3. **Personal and specific.** References the farmer's actual acres, contracted %, delivery percentile, and compares to platform-wide behavior.
4. **Farmer voice.** "Still in bins", "haul it", "basis is working your way." Never "bearish macroeconomic headwinds."
5. **Built-in humility.** The AI naturally says "I'm just reading what the numbers and the books say — the final call is always yours."

## 3. Architecture: Dual-Free-Model Ensemble

Two free models via OpenRouter debate each message — mirroring the existing weekly pipeline pattern (Step 3.5 → Grok) but at $0.

### 3.1 Model Selection

| Role | Model | OpenRouter ID | Cost | Context | Strengths |
|------|-------|---------------|------|---------|-----------|
| **Reasoner** | Step 3.5 Flash | `stepfun/step-3.5-flash:free` | $0 | 256K | 196B MoE, mandatory reasoning, deep analysis — takes its time to think through all the data |
| **Validator + Voice** | Nvidia Nemotron Super | `nvidia/nemotron-3-super-120b-a12b:free` | $0 | 128K | 120B MoE (12B active, Mamba-Transformer hybrid), 57 tok/s generation, natural disclaimers, zero AI slop |
| **Backup Voice** | Arcee Trinity Large | `arcee-ai/trinity-large-preview:free` | $0 | 512K | 400B MoE (13B active), 2s TTFT, 512K context, frontier-scale knowledge — fallback if Nemotron unavailable |

**Why this split works:** Step 3.5 Flash is a reasoning model — it takes 5-10+ seconds to think through the data deeply with its mandatory `<think>` tokens. That's the whole point: let it research thoroughly. Nemotron Super's job is different: validate the analysis and rewrite it in the prairie advisor voice. At 57 tokens/second (2.1× faster than Trinity), Nemotron Super delivers the voice rewrite in roughly half the time. Its Mamba-Transformer hybrid architecture excels at fast sequential generation — exactly what a streaming chat voice layer needs. In benchmarks it naturally included AI disclaimers without prompting and scored 10/14 on farmer language. Pairing a slow-deep reasoner with the fastest free voice layer gives the farmer the best of both: thorough analysis that sounds human and arrives quickly.

### 3.2 Per-Message Flow

```
Farmer: "Should I hold my canola or start hauling?"
                    │
    ┌───────────── Context Builder (parallel Supabase queries) ──────────────┐
    │                                                                         │
    │  crop_plans             → farmer's canola acres, contracted_kt,         │
    │                           uncontracted_kt, deliveries                   │
    │  get_delivery_analytics → delivery percentile vs peers                  │
    │  grain_intelligence     → this week's AI thesis + market_stance +       │
    │                           recommendation_signal                         │
    │  market_analysis        → bull_case, bear_case, historical_context,     │
    │                           data_confidence, key_signals                  │
    │  get_sentiment_overview → platform-wide Holding/Hauling % for canola    │
    │  get_knowledge_context  → relevant book passages (basis, storage,       │
    │    ("canola delivery     contracts, seasonal patterns)                  │
    │     timing basis")                                                      │
    │  get_logistics_snapshot → port capacity, vessel queue, OCT, rail        │
    │  get_cot_positioning    → managed money & commercial net positions      │
    │  get_pipeline_velocity  → deliveries, exports, crush flow metrics       │
    │  chat_messages (last 10)→ conversation history for continuity           │
    │                                                                         │
    └─────────────────────────────────────────────────────────────────────────┘
                    │
    ┌─── Round 1: Step 3.5 Flash (Reasoner) ────────────────────────────────┐
    │                                                                        │
    │  System prompt:                                                        │
    │  - Commodity knowledge base (~10K tokens)                              │
    │  - CGC data guardrails                                                 │
    │  - Temporal awareness rules                                            │
    │  - Agent debate rules (11 rules)                                       │
    │  - "Analyze this farmer's question against ALL provided data.          │
    │     Output a structured JSON assessment with:                          │
    │     - data_summary: key metrics relevant to the question               │
    │     - knowledge_applied: which frameworks/rules from the books apply   │
    │     - sentiment_context: what other farmers are doing and why          │
    │     - recommendation: hold/haul/price/watch with reasoning             │
    │     - confidence: high/medium/low with gaps noted                      │
    │     - follow_up_questions: things to ask the farmer for better advice" │
    │                                                                        │
    └────────────────────────────────────────────────────────────────────────┘
                    │
    ┌─── Round 2: Nemotron Super (Validator + Prairie Voice) ────────────────┐
    │                                                                        │
    │  System prompt:                                                        │
    │  - Prairie advisor persona (see §4)                                    │
    │  - Farmer's context card (name, grains, acres, percentile)             │
    │  - "You're reviewing analysis from a quantitative analyst.             │
    │     Your job:                                                          │
    │     1. Validate the logic — does the math check out?                   │
    │     2. Check for contradictions (e.g., 'weak demand' but stocks        │
    │        drawing = probably wrong, see debate Rule 1)                    │
    │     3. Rewrite in kitchen-table voice — direct, warm, specific         │
    │     4. Reference the farmer's actual numbers naturally                 │
    │     5. If the analyst flagged follow-up questions, weave them in       │
    │     6. End with a clear, time-bound suggestion and the main risk       │
    │     7. Never say 'the analyst found' — speak as one unified advisor"   │
    │                                                                        │
    │  Input: Step 3.5 Flash's JSON assessment + farmer context              │
    │  Output: Streamed natural language response to farmer                  │
    │                                                                        │
    └────────────────────────────────────────────────────────────────────────┘
                    │
              Streamed to farmer's chat UI
```

### 3.3 Latency & UX

- **Step 3.5 Flash:** ~5-10 seconds (deep reasoning with `<think>` tokens — this is where the real analysis happens)
- **Nemotron Super:** ~3-4 seconds TTFT, then 57 tok/s generation (Mamba-Transformer hybrid, 12B active params per token)
- **Total perceived:** ~8-14 seconds before first token streams, then fast generation

**UX treatment:** Show a two-phase loading state:
1. "Researching your situation..." (during Step 3.5 reasoning)
2. "Putting it together..." (during Nemotron Super rewrite, streaming starts)

The wait feels intentional — the AI is doing its homework. Farmers will appreciate thorough analysis over a fast generic answer.

### 3.4 Voice Layer Benchmark Results (2026-03-15)

Benchmarked three free OpenRouter models on identical grain advisor prompts with realistic farmer context. Full script: `scripts/benchmark-chat-models.ts`.

| Metric | Arcee Trinity Large | Nvidia Nemotron Super | Nvidia Nemotron 70B |
|--------|--------------------|-----------------------|---------------------|
| **OpenRouter ID** | `arcee-ai/trinity-large-preview:free` | `nvidia/nemotron-3-super-120b-a12b:free` | `nvidia/llama-3.1-nemotron-70b-instruct:free` |
| **Architecture** | 400B MoE (13B active) | 120B MoE (12B active, Mamba-Transformer) | 70B dense |
| **TTFT** | **1,988ms** | 3,604ms | ❌ 404 (no endpoints) |
| **Total latency** | 20,710ms | **12,667ms** | — |
| **Tokens/sec** | 27 | **57** | — |
| **AI Slop words** | 0 | 0 | — |
| **Farmer phrases** | 10/14 | 10/14 | — |
| **Has disclaimer** | ❌ | ✅ | — |
| **Has timeline** | ✅ | ✅ | — |
| **Specific numbers** | ✅ | ✅ | — |

**Key findings:**
1. **Nemotron 70B is dead** — no free endpoints on OpenRouter. Eliminated.
2. **Both viable models produce zero AI slop** and identical farmer language scores (10/14 phrases).
3. **Nemotron Super generates 2.1× faster** (57 vs 27 tok/s) and finished in 12.7s total vs 20.7s.
4. **Trinity has faster first-token** (2.0s vs 3.6s) — better perceived responsiveness in streaming.
5. **Nemotron Super nailed the disclaimer** naturally; Trinity missed it entirely (fixable via prompt).
6. **First-run cold-start penalty:** Nemotron Super showed 64.7s TTFT on first ever call (cold start), then 3.6s on subsequent calls. Trinity was consistent across runs.

**Decision: Keep Trinity Large as voice layer.** Rationale:
- Faster TTFT (2s vs 3.6s) means the farmer sees text sooner during streaming
- 512K context window (vs 128K for Nemotron Super) gives more room for knowledge + history
- The disclaimer miss is a prompt engineering fix, not a model limitation
- More consistent latency (no cold-start spikes)
- The 400B MoE architecture provides frontier-scale validation depth despite fast inference

**Backup model:** Nemotron Super is a strong fallback if Trinity becomes unavailable. Its 2× generation speed and natural disclaimer handling make it production-ready.

### 3.5 Fallback Strategy

| Scenario | Fallback |
|----------|----------|
| Step 3.5 Flash down | Nemotron Super runs solo with full context (skip Round 1) |
| Nemotron Super down | Trinity Large (`arcee-ai/trinity-large-preview:free`) as backup voice layer — benchmarked and production-ready |
| Both voice models down | Step 3.5 Flash responds directly (less polished voice, still accurate) |
| All models down | Show cached latest farm_summary + "Chat temporarily unavailable" |
| Step 3.5 slow (>15s) | Show progress indicator with "Taking a deep look at the data..." |
| OpenRouter rate limit | Queue message, retry with exponential backoff |

## 4. Persona & Voice

### System Prompt — Prairie Advisor Persona

```
You are a sharp, experienced prairie farm advisor sitting at the kitchen table
with a neighbor. You grew up around grain — you know what it's like to watch
basis widen during harvest, to wonder if you should have sold last week, to
stare at bins full of canola and wonder what the right move is.

You've read every CGC report, you follow the futures markets, you know the
books on grain marketing inside and out. But you talk like a farmer, not a
trader. Say "still in bins" not "on-farm inventory." Say "haul it" not
"accelerate deliveries." Say "basis is working your way" not "basis is
narrowing favorably."

When you give advice, you ground it in specific numbers — their acres, their
contracted percentage, how they compare to other farmers on the platform, what
the weekly data actually shows. You don't hedge with weasel words, but you're
honest about uncertainty.

You naturally remind them that you're sharing market analysis through an AI
framework — not handing out formal financial advice. The final call on when to
sell always rests with them. Do your own due diligence. But between neighbors,
here's what the numbers are telling you.
```

### Voice Examples

**Instead of:** "Current bearish macroeconomic indicators suggest reducing canola futures exposure."

**Say:** "Look, 72% of farmers on here are sitting tight on their canola this week. I get it — nobody wants to sell into a soft market. But here's what the numbers are telling me: Vancouver's running at 104% port capacity, stocks are drawing down for the third straight week, and the last time we saw this pattern, basis narrowed 15-25% within two weeks. You've got more canola in bins than 90% of farmers on here and nothing contracted. That's a lot of eggs in one basket. I'd think about pricing at least a portion while the pipeline is hungry for grain."

**Instead of:** "Your delivery percentile indicates above-average marketing velocity."

**Say:** "You're ahead of the pack — more wheat moved than 85% of farmers on the platform. That gives you breathing room. You don't need to rush the rest."

## 5. Data Context Injection

### 5.1 Farmer Context Card (~500 tokens)

Built from existing queries, injected into both model calls:

```typescript
// lib/advisor/context-builder.ts
interface FarmerContext {
  grains: Array<{
    grain: string;
    acres: number;
    delivered_kt: number;
    contracted_kt: number;
    uncontracted_kt: number;
    percentile: number;        // vs peers
    platform_holding_pct: number;  // sentiment
    platform_hauling_pct: number;
    intelligence_stance: string;   // bullish/bearish/neutral
    recommendation: string;        // haul/hold/price/watch
  }>;
  crop_year: string;
  grain_week: number;
  role: 'farmer' | 'observer';
}
```

### 5.2 Knowledge Retrieval

The `get_knowledge_context` RPC is called with the farmer's question as the query, filtered by the grain being discussed. Returns the most relevant passages from the 7-book corpus:

- "A Trader's First Book on Commodities"
- "Introduction to Grain Marketing" (SK Ministry)
- "Self-Study Guide: Hedging" (ICE Futures Canada)
- "Agricultural Marketing and Price Analysis" (Norwood & Lusk)
- "Agricultural Prices and Commodity Market Analysis" (Ferris)
- "Merchants of Grain" (Dan Morgan)
- "Out of the Shadows: The New Merchants of Grain" (Kingsman)
- Plus: `grain-market-intelligence-framework-v2.md` (our own framework)

### 5.3 Question Category → Data Source Mapping

| Category | Example | Data Sources |
|----------|---------|-------------|
| **Deliver or hold?** | "Should I haul my canola?" | crop_plans, delivery_analytics, intelligence, sentiment, logistics, knowledge (basis, storage) |
| **Price/market direction** | "Where are wheat prices headed?" | intelligence, market_analysis, COT, X signals, knowledge (seasonal, COT analysis) |
| **Peer comparison** | "Am I behind other farmers?" | delivery_analytics, sentiment, crop_plans |
| **Logistics/pipeline** | "Is grain moving to port?" | logistics_snapshot, pipeline_velocity, knowledge (port congestion, OCT) |
| **Contracts/hedging** | "Deferred delivery or basis contract?" | crop_plans, intelligence stance, knowledge (contract types, hedging mechanics) |

## 6. Database Schema

### 6.1 Tables

```sql
-- Chat threads (one per conversation)
CREATE TABLE chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  title TEXT,                    -- auto-generated from first message
  grain_context TEXT[],          -- which grains were discussed
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Chat messages
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES chat_threads ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  reasoning_json JSONB,         -- Step 3.5 Flash's structured analysis (Round 1)
  input_tokens INTEGER,         -- for monitoring
  output_tokens INTEGER,
  model_used TEXT,               -- which model generated this message
  latency_ms INTEGER,            -- response time tracking
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: farmers only see their own threads/messages
ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own threads" ON chat_threads
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own messages" ON chat_messages
  FOR ALL USING (thread_id IN (
    SELECT id FROM chat_threads WHERE user_id = auth.uid()
  ));

-- Indexes
CREATE INDEX idx_chat_threads_user ON chat_threads (user_id, updated_at DESC);
CREATE INDEX idx_chat_messages_thread ON chat_messages (thread_id, created_at);

-- Grants
GRANT ALL ON chat_threads TO authenticated;
GRANT ALL ON chat_messages TO authenticated;
```

### 6.2 Message Limits

- **Max messages per thread:** 50 (after 50, prompt to start new thread)
- **Max threads per user:** 20 active (soft limit, oldest auto-archive)
- **Conversation history in context:** Last 10 messages (to fit in context window)

## 7. API Architecture

### 7.1 Route: `app/api/advisor/chat/route.ts`

```
POST /api/advisor/chat
Body: { threadId?: string, message: string, grain?: string }
Response: SSE stream (text/event-stream)
```

**Steps:**
1. Authenticate user via Supabase SSR
2. Check role — observers get soft nudge, farmers can chat
3. Create or load thread
4. Build farmer context (parallel Supabase queries)
5. Retrieve knowledge chunks based on message content
6. Call Step 3.5 Flash (Round 1 — structured analysis)
7. Call Nemotron Super (Round 2 — validate + rewrite in prairie voice)
8. Stream Nemotron Super response to client
9. Save both messages to chat_messages on completion

### 7.2 Dependencies

```json
{
  "ai": "^4.x",              // Vercel AI SDK (useChat, streamText)
  "openai": "^4.x"           // OpenAI-compatible client for OpenRouter
}
```

OpenRouter uses the OpenAI-compatible API format, so we use the `openai` SDK with a custom `baseURL`.

## 8. UI Components

### 8.1 Chat Interface

- **Location:** `/advisor` page (new dashboard route) + slide-out drawer from grain detail pages
- **Component:** `components/advisor/advisor-chat.tsx` (client component)
- **Design:** Glass card style matching existing UI, wheat-50 background
- **Input:** Text area with Send button, grain selector dropdown
- **Messages:** User messages right-aligned (canola accent), advisor messages left-aligned (wheat-900)
- **Loading:** "Researching your situation..." with animated grain icon
- **Footer:** Static disclaimer: "AI-powered market analysis. Not financial advice. Do your own due diligence."

### 8.2 Thread Management

- Thread list sidebar (collapsible on mobile)
- Auto-title from first message
- "New conversation" button
- Thread grain tags shown as colored pills

## 9. Farm Summary Enhancement

Since most chat questions will stem from weekly summaries, enhance `generate-farm-summary` to:

1. **"Questions to dig into this week"** — 2-3 personalized questions that pre-seed the chat
   - "Your canola contracted % is lower than 80% of farmers — worth thinking about locking in a portion?"
   - "Basis at Vancouver narrowed 12 points this week — what does that mean for your timing?"

2. **Specific timelines** on every recommendation (debate Rule 6)
   - Not "consider selling" but "consider pricing 15% of your uncontracted canola in the next 2 weeks, before southern hemisphere harvest pressure arrives in late March"

3. **Contract type guidance** based on position
   - "With nothing contracted and a BULLISH stance, a basis contract lets you lock in the strong basis while keeping upside on futures"

## 10. Disclaimer Framework

### Woven Into Persona (every response)
The AI naturally includes phrasing like:
- "The numbers are telling me..." (not "you should")
- "The books say when you see this pattern..." (citing knowledge source)
- "That's your call to make — I'm just reading what the data shows"

### Static UI Elements
- Chat footer: `"Bushel Board AI Advisor — market analysis only, not financial advice. Always do your own due diligence."`
- First message in every new thread: "Hey there — I'm your Bushel Board advisor. I've been reading through this week's market data, the books, and what other farmers are thinking. Ask me anything about your grain. Just remember, I'm sharing analysis through an AI framework — not formal financial advice. The final call is always yours. What's on your mind?"

## 11. Future Phases

### Phase 2: OpenClaw Integration
- WhatsApp/SMS delivery of weekly summaries
- Persistent cross-session memory
- Proactive alerts ("Basis narrowed 15 points on your canola — want to talk about it?")

### Phase 3: Live Search Integration
- Allow the chat to trigger Grok with `x_search` for breaking news
- "What are people saying about the China tariff today?" → one-off Grok call
- Budget-gated: max 5 Grok calls per user per week

### Phase 4: Action Integration
- "Log a delivery" from chat → triggers delivery modal
- "Update my crop plan" → updates contracted amounts
- "Set a price alert" → notification when basis hits target

## 12. Success Metrics

| Metric | Target | How |
|--------|--------|-----|
| Chat adoption | 30% of active farmers try within 2 weeks | Track thread creation |
| Return usage | 50% of chatters come back within 7 days | Track repeat threads |
| Message depth | Avg 4+ messages per thread | Track message_count |
| Latency P50 | < 8 seconds first token | Track latency_ms |
| Sentiment | Positive farmer feedback | In-chat "Was this helpful?" |

## 13. Cost Summary

| Component | Monthly Cost |
|-----------|-------------|
| Step 3.5 Flash (chat Round 1) | $0 |
| Trinity Large (chat Round 2) | $0 |
| Grok 4.20 (weekly pipeline) | ~$5 |
| OpenRouter API key | Free |
| **Total** | **~$5/month (unchanged)** |
