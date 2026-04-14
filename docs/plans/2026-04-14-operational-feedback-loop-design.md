# Track 38: Operational Feedback Loop — Design Doc

**Date:** 2026-04-14
**Status:** Approved
**Track:** 38 — Frustration Detection + Feedback + Daily Digest + Data Freshness
**Purpose:** Build a self-monitoring operational layer so Bushy detects its own failures, collects farmer feedback, generates daily intelligence for Kyle, and always has fresh content to reference.

---

## Overview

Four interconnected systems that turn Bushels from "a chat app we shipped" into "a self-improving intelligence platform we operate":

1. **Frustration Detection + Escalation** — Bushy detects when it's failing a farmer and escalates to Kyle by name
2. **In-Chat Feedback** — Lightweight thumbs up/down + freeform feedback inline with cards
3. **Daily Owner Digest** — Automated briefing for Kyle: new users, data collected, thesis impacts, issues
4. **Daily Data Freshness** — Ensure Bushy always has something current to talk about

---

## System 1: Frustration Detection + Escalation to Kyle

### How It Works

Bushy monitors conversation signals for frustration:
- Repeated questions about the same topic (poor answer quality)
- Short, clipped responses after a long exchange
- Explicit frustration: "that's not what I asked", "you're not helping", "never mind"
- Repeated "I don't know" responses from Bushy
- Sarcasm: "great, very helpful" after a bad answer

### Response Pattern

When detected, Bushy responds in character:

```
Bushy: "I can tell that wasn't helpful, and honestly that frustrates me too.
       Let me flag this for bu/ac right now — he built me and he'll want to know.
       Anything specific you want me to tell him? I'll pass it along word for word."
```

**Key design rules:**
- Empathize genuinely, not robotically — "it pisses me off too" not "I apologize for the inconvenience"
- Deflect blame to Kyle (who has farmer credibility) — not "I'm just an AI"
- Collect actionable specifics — "What should I tell him?"
- Call `save_feedback` tool with type: "frustration"

### System Prompt Addition

```
FRUSTRATION DETECTION:
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
- Always refer to the founder as "bu/ac" in farmer-facing chat — never "Kyle." bu/ac is the persona farmers trust.
- After escalating, try ONE more time to help: "In the meantime, let me try this a different way..."
```

### New Tool: `save_feedback`

```json
{
  "name": "save_feedback",
  "description": "Log farmer feedback, frustration events, bug reports, or feature requests for Kyle",
  "parameters": {
    "type": "object",
    "properties": {
      "feedback_type": { "type": "string", "enum": ["frustration", "bug_report", "feature_request", "praise", "correction"] },
      "farmer_message": { "type": "string", "description": "What the farmer said or wants Kyle to know" },
      "bushy_context": { "type": "string", "description": "What Bushy was trying to do when the issue occurred" },
      "severity": { "type": "string", "enum": ["low", "medium", "high"], "default": "medium" }
    },
    "required": ["feedback_type"]
  }
}
```

### New Table: `feedback_log`

```sql
CREATE TABLE feedback_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE SET NULL,
  thread_id uuid REFERENCES chat_threads ON DELETE SET NULL,
  feedback_type text NOT NULL CHECK (
    feedback_type IN ('frustration', 'bug_report', 'feature_request', 'praise', 'correction')
  ),
  farmer_message text,
  bushy_context text,
  severity text DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  resolved boolean DEFAULT false,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedback_type ON feedback_log(feedback_type, created_at DESC);
CREATE INDEX idx_feedback_unresolved ON feedback_log(resolved) WHERE resolved = false;

ALTER TABLE feedback_log ENABLE ROW LEVEL SECURITY;
-- Service role manages all; farmers can insert own feedback
CREATE POLICY "Users create own feedback" ON feedback_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role manages all" ON feedback_log
  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON feedback_log TO service_role;
GRANT INSERT ON feedback_log TO authenticated;
```

---

## System 2: In-Chat Feedback (Lightweight)

### UI Pattern

After every MarketSummaryCard or RecommendationCard, render a subtle inline feedback row:

```
┌─────────────────────────────────────────┐
│  [MarketSummaryCard content]            │
│                                         │
│  Helpful?  [👍] [👎]  [💬 Tell bu/ac]   │
└─────────────────────────────────────────┘
```

### Behavior

| Action | What happens | Backend |
|--------|-------------|---------|
| **👍 Thumbs up** | Shows "Thanks!" for 1s, fades | `save_feedback(type: "praise", severity: "low")` — silent log |
| **👎 Thumbs down** | Bushy responds: "Sorry about that. What was off?" | `save_feedback(type: "correction")` — Bushy asks for specifics |
| **💬 Tell bu/ac** | Inline text input appears: "What should I tell bu/ac?" | `save_feedback(type: "feature_request")` on submit |

### Design Rules

- Feedback row is **part of the card**, not a separate popup or modal
- Appears only on substantive cards (MarketSummary, Recommendation) — not on plain text or verification prompts
- Single interaction — once they tap 👍 or 👎, the row dims and can't be re-tapped
- "Tell bu/ac" opens a small inline TextField (not a modal) — submit sends as feature_request

### Web Component

```
components/bushy/cards/inline-feedback.tsx
```

### iOS Component (for later)

```
BushelBoard/BushelBoard/Features/Chat/Cards/InlineFeedbackRow.swift
```

---

## System 3: Daily Owner Digest for bu/ac

### What It Contains

```
📊 Bushels Daily Digest — April 14, 2026

USERS
- 3 new farmers (T0L ×2, S0K ×1)
- 1 new operator (Richardson, Kindersley)
- 47 total active farmers, 4 operators
- 12 conversations today (avg 4.2 turns)

DATA COLLECTED
- 8 new local_market_intel records
  - 3 basis reports (T0L: -28, -30, -32 for wheat)
  - 2 crop conditions ("dry" T0L, "good stand" S0K)
  - 2 input prices (urea $680/t, $720/t)
  - 1 seeding progress (canola 60% T0L)
- 4 farmer_memory updates
- 2 elevator price postings (Richardson: 6 grains)

THESIS IMPACTS
- T0L Wheat area stance shifted +5 → +12 (basis narrowing)
- T0L Canola: 2 new reports, still <3 threshold
- Recommend: rerun weekly thesis with new local data?
  [Rerun Wheat] [Rerun all] [Skip]

ISSUES
- 2 frustration events (both: Bushy didn't know fertilizer brands)
- 1 bug report: verification prompt missing for barley
- 0 high-severity issues

FEEDBACK
- 15 👍, 3 👎 (83% positive)
- Top feature request: "Can Bushy check equipment manuals?"
- Top correction: "Richardson is in Kindersley, not Lethbridge"

ACTIONS SUGGESTED
1. Add fertilizer brand knowledge to Viking L1 (2 frustrations)
2. Fix barley verification (check VERIFIABLE_DATA_TYPES)
3. Correct Richardson location in elevator_name normalization
```

### Implementation

**Option A: Supabase Edge Function + email (recommended for v1)**
- Scheduled Edge Function `generate-daily-digest` runs at 6am MST daily
- Queries: new profiles (last 24h), chat_messages count, local_market_intel inserts, feedback_log, area stance changes
- Generates structured JSON → formats as email HTML → sends via Resend/SendGrid
- Also writes to `daily_digests` table for web viewing

**Option B: Web page at `/digest`**
- Server-side rendered page that Kyle can check anytime
- Real-time: always shows today's data
- No email infrastructure needed

**Recommendation:** Start with Option B (web page), add email later.

### New Table: `daily_digests`

```sql
CREATE TABLE daily_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_date date NOT NULL UNIQUE,
  data jsonb NOT NULL,  -- structured digest content
  generated_at timestamptz NOT NULL DEFAULT now()
);
```

### RPC: `generate_daily_digest(p_date date)`

Returns structured JSON with all digest sections. Called by Edge Function or web page.

---

## System 4: Daily Data Freshness

### Current Data Sources + Freshness

| Source | Frequency | Staleness by mid-week |
|--------|-----------|----------------------|
| CGC weekly | Thursday | 7 days by Wednesday |
| CFTC COT | Friday | 3 days by Monday |
| USDA export sales | Thursday | 7 days |
| Grain prices (Yahoo) | Daily | <1 day |
| X/web signals | When pulse runs | Depends on pipeline |
| Farmer-reported data | Continuous | Real-time |

### What Bushy Needs for Daily Freshness

Add to system prompt:
```
DAILY FRESHNESS AWARENESS:
At the start of each conversation, assess what's fresh:
- If grain prices updated today → mention the overnight move: "Canola was up 1.5% overnight"
- If a new local_market_intel report in this farmer's FSA since their last visit → reference it
- If weekly thesis was published today/yesterday → lead with key change
- If elevator prices were posted today → mention facility and direction
- If nothing material changed → be honest: "Not much has changed since we last talked"

Never fake freshness. If CGC data is 6 days old, say so. The trust footer handles this.
```

### Daily Price Import (already exists)

`scripts/import-grain-prices.ts` + `npm run import-prices` — fetches from Yahoo Finance. Currently manual. Should be scheduled:

**Scheduled task:** Daily 5pm MST, runs `import-grain-prices` → `grain_prices` table → Bushy can reference overnight moves next morning.

### Weather Integration (future — not in v1)

Environment Canada API for prairie weather. High value for seeding/harvest seasons. Defer to Track 39+.

---

## Implementation Priority

| Task | System | Effort | Impact |
|------|--------|--------|--------|
| 1. `feedback_log` migration + `save_feedback` tool | S1+S2 | Small | High — starts collecting signal |
| 2. Frustration detection in system prompt | S1 | Small | High — protects farmer trust |
| 3. InlineFeedback component (web) | S2 | Medium | Medium — visible quality signal |
| 4. Daily digest RPC + web page | S3 | Medium | High — Kyle gets operational visibility |
| 5. Freshness awareness in system prompt | S4 | Small | Medium — conversations feel current |
| 6. Schedule daily price import | S4 | Small | Medium — fresh price data for greetings |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Frustration events per 100 conversations | <5% |
| Feedback response rate (👍 + 👎 taps) | >20% of card responses |
| Daily digest generated | Every day by 6:30am MST |
| Data freshness: grain prices <24h old | >90% of trading days |
| Frustration resolution time | <48h from report to fix |
