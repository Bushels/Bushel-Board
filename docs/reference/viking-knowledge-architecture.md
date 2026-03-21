# Viking Knowledge Architecture

How distilled book knowledge reaches the AI advisor and pipeline.

## Overview

The Viking system extracts actionable knowledge from 8 grain marketing textbooks and makes it available to Grok (the AI model) at query time. The design goal: **give Grok the expertise of 8 books in ~3,000-5,000 tokens**, loaded dynamically based on what the farmer is actually asking.

```
Farmer question
    │
    ▼
┌─────────────────────────────────┐
│  Our code (pre-assembly layer)  │
│                                 │
│  1. Regex intent detection      │
│  2. Grain-based topic inference │
│  3. L2 RPC query (advisor only) │
└─────────┬───────────────────────┘
          │  Assembled flat text
          ▼
┌─────────────────────────────────┐
│  Grok system prompt             │
│                                 │
│  - Farmer card (their data)     │
│  - L0 worldview (always)        │
│  - L1 topic summaries (matched) │
│  - L2 specific chunks (if any)  │
│  - Live data sections           │
│  - Voice/format rules           │
└─────────────────────────────────┘
```

**Key insight:** Grok never decides which knowledge to load. Our code detects intents and assembles the context BEFORE Grok sees anything. Grok receives flat text and is told: *"Apply frameworks ONLY if they appear in the Retrieved Book Knowledge section above."*

## The Three Tiers

### L0 — Core Worldview (~420 tokens, always loaded)

**What:** A compressed analyst personality distilled from all 8 books. Think of it as "how a grain market expert thinks" — not specific formulas, but the mental model.

**Where it lives:**
- Next.js: `lib/knowledge/viking-l0.ts`
- Deno (Edge Functions): embedded in `supabase/functions/_shared/viking-knowledge.ts`

**When loaded:** Every single request — both pipeline analysis and advisor chat. It's cheap enough to always include.

**Contains:** Worldview principles like "basis tells the local story that futures miss", seasonal rhythm awareness, risk-first thinking, Canadian prairie context.

### L1 — Topic Summaries (~750 tokens each, loaded by intent)

**What:** 7 cross-book topic compilations. Each synthesizes relevant knowledge from ALL 8 books into a single coherent summary for one domain (basis, storage, hedging, etc.).

**Where it lives:**
- Next.js: `lib/knowledge/viking-l1.ts` (TypeScript constants + intent patterns)
- Deno: `supabase/functions/_shared/viking-knowledge.ts` (content only, no intent detection)

**The 7 topics:**

| Topic | Key Frameworks | Tokens |
|-------|---------------|--------|
| `basis_pricing` | Basis Signal Matrix, Bull/Bear 3-of-5 checklist, seasonal patterns | ~800 |
| `storage_carry` | Storage Decision Algorithm, True Carrying Cost Formula, pre-harvest trap | ~800 |
| `hedging_contracts` | Strategic Pricing Decision Matrix, HTA vs Basis selection, synthetic minimum price | ~800 |
| `logistics_exports` | Terminal flow, rail disruption, producer cars, vessel queue signals | ~650 |
| `market_structure` | Subsidy capitalization, oligopsony defense, COT interpretation, currency effects | ~750 |
| `risk_management` | Cobweb trap, yield skewness, demand destruction, margin call handling | ~800 |
| `grain_specifics` | Canadian grading, IP premiums, input optimization, crush economics | ~750 |

**How topics are selected (two mechanisms working together):**

1. **Regex intent detection** — Pattern matching on the farmer's message text. Example: "basis is -45 under" triggers `basis_pricing`; "margin call" triggers `risk_management`. See `VIKING_INTENT_PATTERNS` in `viking-l1.ts`.

2. **Grain-based inference** — The grain name itself triggers relevant topics. Every grain gets `grain_specifics`. Major traded grains add `market_structure`. Crush crops (canola, soybean, flax) add `risk_management`. Thin-futures crops (peas, lentils) also add `risk_management`. See `inferGrainTopics()` in `viking-retrieval.ts`.

**Typical load:** 2-4 topics = ~1,600-3,200 L1 tokens + 420 L0 = **~2,000-3,600 total**.

### L2 — Specific Chunks (via Supabase RPC, advisor chat only)

**What:** PostgreSQL full-text search against ingested book passages. Returns up to 3 specific chunks that match the farmer's query + grain + detected topics.

**Where it lives:**
- Tables: `knowledge_documents` + `knowledge_chunks` (with tsvector trigger)
- RPC: `get_knowledge_context(p_query, p_grain, p_topics, p_limit)`
- Called from: `fetchL2Chunks()` in `lib/knowledge/viking-retrieval.ts`

**Current status:** Infrastructure exists (tables, RPC, trigger) but `knowledge_chunks` is likely empty. Needs `npm run ingest-knowledge` to populate. The system gracefully degrades — if L2 returns nothing, only L0+L1 are used.

**When loaded:** Advisor chat only. The pipeline (analyze-grain-market) does NOT use L2 because it already has its own data brief with specific CGC numbers.

## Two Consumers, Two Entry Points

### Pipeline (Edge Function: `analyze-grain-market`)

```
buildVikingPipelineContext(grain)
  → L0 (always)
  → L1: basis_pricing + storage_carry + logistics_exports (defaults)
       + grain-inferred topics (grain_specifics, market_structure, etc.)
  → NO L2
  → ~2,500-3,500 tokens
```

The pipeline analyzes each of the 16 grains weekly. It gets the same L0 worldview plus grain-relevant L1 topics. No L2 because the pipeline's data brief already contains the specific CGC numbers.

### Advisor Chat (Next.js: `lib/advisor/context-builder.ts`)

```
buildVikingAdvisorContext({ messageText, grain, supabase })
  → L0 (always)
  → L1: intent-detected topics from message + grain-inferred topics
  → L2: up to 3 chunks from knowledge_chunks (if populated)
  → ~2,000-5,000 tokens depending on query complexity
```

The advisor chat responds to individual farmer questions. Intent detection on the message text determines which L1 topics to load. L2 adds specificity if the knowledge_chunks table has data.

## Where Knowledge Gets Injected

In `lib/advisor/system-prompt.ts`:

1. **Line 48-49:** L1 context injected as `## Grain Marketing Knowledge (from 8 source books)`
2. **Line 90:** L0 injected separately (always present, acts as baseline worldview)
3. **Line 101:** The critical instruction: *"Apply frameworks ONLY if they appear in the Retrieved Book Knowledge section above. Do not invent or hallucinate frameworks."*

## Conflict Resolution: Viking vs Grok's Pre-Training

Grok has its own pre-trained knowledge about grain markets. When Viking book knowledge and Grok's training disagree:

- **Frameworks and formulas:** Viking wins. The system prompt says "Apply frameworks ONLY if they appear in the Retrieved Book Knowledge section." Grok should use the Basis Signal Matrix from the books, not invent its own.
- **Current market conditions:** Grok wins. Viking knowledge is from textbooks (some decades old). Grok's `x_search` tool provides real-time market data. Current prices, tariffs, weather — always defer to live data.
- **General principles:** They usually agree. Both understand basis, carry, hedging fundamentals. Viking adds Canadian prairie specificity that Grok's training may lack.

## Dual-Module Sync Requirement

The L0/L1 content exists in TWO places that must be kept in sync manually:

| Module | Runtime | Used By |
|--------|---------|---------|
| `lib/knowledge/viking-l0.ts` | Next.js (Node) | Advisor chat |
| `lib/knowledge/viking-l1.ts` | Next.js (Node) | Advisor chat (intent detection + content) |
| `supabase/functions/_shared/viking-knowledge.ts` | Deno (Edge Functions) | Pipeline analysis (content only) |

**Why two copies?** Deno Edge Functions cannot import from Next.js `lib/`. They need their own copy. The Deno copy has content only (no intent detection) because the pipeline uses grain-based inference, not message-based intent detection.

**Sync process:** After editing `viking-l1.ts`, manually update the corresponding section in `viking-knowledge.ts`. The SKILL.md playbook (`distill-knowledge`) documents this step.

## Security: Gitignored Content

All knowledge content files are gitignored (proprietary distillations from copyrighted books):

```
lib/knowledge/viking-l0.ts          # L0 worldview
lib/knowledge/viking-l1.ts          # L1 topic summaries + intent patterns
supabase/functions/_shared/viking-knowledge.ts    # Deno copy
supabase/functions/_shared/commodity-knowledge.ts  # Legacy commodity knowledge
```

The retrieval orchestration (`lib/knowledge/viking-retrieval.ts`) IS tracked in git — it contains only code logic, no proprietary content.

**Clone requirement:** New developers need local copies of the gitignored files. The distill-knowledge skill documents how to regenerate them from source PDFs.

## Token Efficiency

| System | Books | Tokens per query | How |
|--------|-------|-----------------|-----|
| Old (commodity-knowledge.ts) | 3 | ~7,000 (always loaded) | Static blob, everything every time |
| New (Viking L0/L1/L2) | 8 | ~2,000-5,000 (intent-loaded) | Only load what's relevant |

More books, fewer tokens, better relevance. The intent detection ensures a farmer asking about basis doesn't waste tokens on hedging contract details.

## Quality Scores (Gemini Review, 2026-03-20)

| Topic | Score | Strongest Aspect |
|-------|-------|-----------------|
| basis_pricing | 4.9/5.0 | Bull/Bear 3-of-5 checklist |
| storage_carry | 4.85/5.0 | Pre-harvest trap + carrying cost formula |
| hedging_contracts | 4.85/5.0 | Strategic Pricing Decision Matrix |
| logistics_exports | 4.35/5.0 | Weakest — needs ocean freight detail |
| market_structure | 4.6/5.0 | Subsidy capitalization + oligopsony defense |
| risk_management | 5.0/5.0 | Cobweb trap, yield skewness, demand destruction |
| grain_specifics | 5.0/5.0 | Canadian grading + IP premiums + input optimization |
| **Overall** | **4.79/5.0** | Production ready |
