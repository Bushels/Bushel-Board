# Viking Knowledge Architecture

How distilled grain-marketing book knowledge reaches Bushel Board advisor and desk workflows.

## Overview

The Viking system extracts durable grain-marketing knowledge from 8 source books and makes it available to Claude/Codex advisor and desk workflows at query time. The design goal is simple: give the model the parts of the books that matter for the farmer's question without letting book knowledge pretend to be live market data.

```
Farmer question or desk run
    |
    v
+-----------------------------------+
| Bushel Board pre-assembly layer   |
|                                   |
| 1. Regex intent detection         |
| 2. Grain-based topic inference    |
| 3. L2 RPC query where appropriate |
+-----------------------------------+
    |
    | assembled plain text
    v
+-----------------------------------+
| Advisor / desk prompt             |
|                                   |
| - Farmer or grain context         |
| - L0 worldview                    |
| - L1 topic summaries              |
| - L2 retrieved chunks if any      |
| - Verified live data sections     |
| - Voice and output rules          |
+-----------------------------------+
```

**Key insight:** the model does not decide which book knowledge to load. Bushel Board code detects intent and assembles context before the model sees it. The model receives flat text and is told to apply frameworks only when they appear in the retrieved book-knowledge section.

## The Three Tiers

### L0 - Core Worldview (~420 tokens, always loaded)

**What:** A compressed analyst personality distilled from all 8 books. It is the mental model for grain marketing, not a source of current prices or current production estimates.

**Where it lives:**
- Next.js: `lib/knowledge/viking-l0.ts`
- Deno Edge Function copy: `supabase/functions/_shared/viking-knowledge.ts`

**When loaded:** Every advisor request and every desk workflow that uses Viking context. It is cheap enough to always include.

**Contains:** principles like basis telling the local story that futures miss, seasonal rhythm awareness, risk-first thinking, and Canadian prairie context.

### L1 - Topic Summaries (~750 tokens each, loaded by intent)

**What:** 7 cross-book topic compilations. Each summary combines the relevant parts of all 8 books for one domain.

**Where it lives:**
- Next.js: `lib/knowledge/viking-l1.ts`
- Deno Edge Function copy: `supabase/functions/_shared/viking-knowledge.ts`

| Topic | Key Frameworks | Approx. Tokens |
|-------|----------------|----------------|
| `basis_pricing` | Basis Signal Matrix, Bull/Bear 3-of-5 checklist, seasonal patterns | 800 |
| `storage_carry` | Storage Decision Algorithm, True Carrying Cost Formula, pre-harvest trap | 800 |
| `hedging_contracts` | Strategic Pricing Decision Matrix, HTA vs basis selection, synthetic minimum price | 800 |
| `logistics_exports` | Terminal flow, rail disruption, producer cars, vessel queue signals | 650 |
| `market_structure` | Subsidy capitalization, oligopsony defense, COT interpretation, currency effects | 750 |
| `risk_management` | Cobweb trap, yield skewness, demand destruction, margin-call handling | 800 |
| `grain_specifics` | Canadian grading, IP premiums, input optimization, crush economics | 750 |

**How topics are selected:**

1. **Regex intent detection:** pattern matching on the farmer's message text. Example: "basis is -45 under" triggers `basis_pricing`.
2. **Grain-based inference:** the grain name adds default topics. Canola adds grain specifics, market structure, and risk management because crush, futures, and margin risk matter.

**Typical load:** 2-4 topics plus L0, usually ~2,000-3,600 tokens.

### L2 - Specific Chunks (via Supabase RPC)

**What:** PostgreSQL full-text retrieval against ingested book passages. It returns specific chunks that match the query, grain, and detected topics.

**Where it lives:**
- Tables: `knowledge_documents` and `knowledge_chunks`
- RPC: `get_knowledge_context(p_query, p_grain, p_topics, p_limit)`
- Caller: `fetchL2Chunks()` in `lib/knowledge/viking-retrieval.ts`

**Current status:** live Supabase had 19 `knowledge_documents` and 2019 `knowledge_chunks` after the 2026-05-04 scanned-book normalization. Re-check before relying on this as current production state.

**When loaded:** advisor chat can use L2. Desk workflows normally use L0+L1 only because the desk data brief already carries the specific CGC/source numbers.

## Consumers

### Desk Market-Read Workflow

```
buildVikingPipelineContext(grain)
  -> L0 always
  -> L1 basis_pricing + storage_carry + logistics_exports
     + grain-inferred topics
  -> no L2 by default
```

The Claude/Codex desk workflow gets durable market-structure context plus grain-relevant L1 topics. It should still ground facts in source packets such as CGC, Grain Monitor, AAFC/StatsCan, COT, prices, and other admitted live sources.

### Advisor Chat

```
buildVikingAdvisorContext({ messageText, grain, supabase })
  -> L0 always
  -> L1 from message intent + grain inference
  -> L2 up to 3 chunks when `knowledge_chunks` returns matches
```

The advisor responds to individual farmer questions. L2 adds source-book specificity when useful, but the answer must still separate book frameworks from current facts.

## Where Knowledge Gets Injected

In `lib/advisor/system-prompt.ts`:

1. L1/L2 context is injected as `## Grain Marketing Knowledge (from 8 source books)`.
2. L0 is injected separately as the baseline worldview.
3. The prompt instructs the advisor to apply frameworks only when they appear in the retrieved book-knowledge section.

## Conflict Resolution

When Viking book knowledge, model pre-training, and live source data disagree:

- **Frameworks and formulas:** Viking wins if the framework or formula appears in retrieved book knowledge.
- **Current market conditions:** verified live data wins. Books are durable principles, not live facts. Current conditions must come from admitted source lanes such as CGC, Grain Monitor, prices, COT, AAFC/StatsCan, weather, or a direct X API signal lane once wired.
- **General principles:** Viking should shape the prairie framing, especially basis, carry, hedging, storage, logistics, and risk language.

Never use Grok/xAI `x_search` as a production advisor or desk fallback. The retired Grok analysis workflow is no longer an operating path. Track 54 Grok/Hermes X scouting is a separate no-write evidence-artifact lane and must stay behind its artifact gate.

## Sync Requirement

The compact L0/L1 content exists in two runtime surfaces:

| Module | Runtime | Used By | Git Status |
|--------|---------|---------|------------|
| `lib/knowledge/viking-l0.ts` | Next.js | Advisor chat | tracked |
| `lib/knowledge/viking-l1.ts` | Next.js | Advisor chat | tracked |
| `supabase/functions/_shared/viking-knowledge.ts` | Deno Edge Functions | Desk workflow copy | gitignored local file |

**Why two copies?** Deno Edge Functions cannot import from the Next.js `lib/` tree. They need a local Deno-compatible copy.

**Sync process:** after editing `viking-l1.ts`, manually update the corresponding Deno copy before deploying any Edge Function path that uses Viking context.

## Local Knowledge Boundary

Raw books and derived distillation artifacts are local-only:

```
data/Knowledge/
supabase/functions/_shared/viking-knowledge.ts
supabase/functions/_shared/commodity-knowledge.ts
```

The source books and full distillations must not be committed. The retrieval orchestration in `lib/knowledge/viking-retrieval.ts` is tracked because it contains code logic, not raw book content.

## Current Quality Read (2026-05-04)

Quick audit of `data/Knowledge/raw/Grain Knowledge`:

- 8 raw grain-knowledge sources are present.
- 6 of 8 sources extract cleanly with the current dry-run ingestion path.
- 2 large scanned PDFs, Ferris and Norwood/Lusk, produce very low text yield under normal extraction and must use Gemini native PDF vision.
- `knowledge-redistilled-ferris` and `knowledge-redistilled-norwood` were regenerated from cached Gemini vision page batches on 2026-05-04 and normalized with `.distilled.json` metadata.
- The two weak Step-era Ferris/Norwood distillation files were archived locally under `data/Knowledge/tmp/deprecated-distillations/2026-05-04/` and removed from the live retrieval corpus.
- Live Supabase retrieval cleanup removed 2 stale weak distillation document rows, 8 legacy raw path rows, and 1843 total stale chunks. The only live Ferris/Norwood sources are the normalized redistilled documents.
- Repeatable command: `python scripts/gemini-ocr-distill.py --book ferris --force` or `python scripts/gemini-ocr-distill.py --book norwood --force` for a full current-model re-OCR; omit `--force` to reuse cached page batches and re-merge.

Practical verdict: Viking is useful now as a framework layer for internal analysis. It is still not enough by itself for public, source-cited claims; exact claims should trace back to source pages or admitted live data.

## Token Efficiency

| System | Books | Tokens per query | How |
|--------|-------|------------------|-----|
| Old static commodity blob | 3 | ~7,000 always loaded | everything every time |
| Viking L0/L1/L2 | 8 | ~2,000-5,000 intent-loaded | only load what is relevant |

More books can mean fewer tokens if the retrieval layer is deterministic and topic-scoped.
