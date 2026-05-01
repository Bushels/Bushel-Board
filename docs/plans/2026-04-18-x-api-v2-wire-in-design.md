# X API v2 Wire-In — Design Doc

**Author:** Claude (Opus 4.7) • **Date:** 2026-04-18 • **Status:** scoping, not yet approved

## TL;DR

Replace Grok's bundled `x_search` tool with direct X API v2 calls so tweet discovery is decoupled from LLM reasoning. Two consumers share one gateway:
1. **Background collector** (scheduled): harvests farming-relevant tweets into `x_market_signals` for the Friday Claude Agent Desk swarm + overview feed.
2. **Bushy chat real-time** (on-demand): the existing `search_x` tool stub in `lib/bushy/tools/x-api.ts` becomes live, with a value gate that prefers cached signals over fresh API calls.

Credentials already in Vercel env: `XAPI_CONSUMER_KEY`, `XAPI_SECRET_KEY`, `XAPI_BEARER_TOKEN`.
Storage already in place: `x_market_signals` (from v1 Grok pipeline), `x_api_query_log` (migration 20260416060000).

## Why

- Grok's `x_search` costs ~$0.10–0.30 per grain per run and roll-ups into reasoning tokens. Direct API is ~$2 per 1000 tweets — an order of magnitude cheaper for equivalent coverage.
- The Friday desk swarm's `macro-scout` is the only agent that still needs live X/web search (xAI Responses API). A native collector also feeds `sentiment-scout`, which today reads from `x_market_signals` built by `search-x-intelligence` (v1, paused since 2026-03-17).
- Bushy chat needs real-time X lookup for alpha users who ask "what's the market chatter on canola today?" — the stub returns `not_wired` today.

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│              Shared X API v2 gateway (Edge Function)           │
│                supabase/functions/x-api-search                  │
│ - Auth: XAPI_BEARER_TOKEN                                       │
│ - Dedup: query_hash lookup in x_api_query_log (30-day cache)    │
│ - Rate budget: soft cap per mode, hard cap total                │
│ - Relevance scoring: FARMING_RELEVANCE_KEYWORDS + grain tags    │
│ - Writes: x_market_signals (persist), x_api_query_log (audit)   │
└────────────────────────────────────────────────────────────────┘
         ▲                                              ▲
         │ mode="background"                            │ mode="chat_realtime"
         │                                              │
┌────────────────────────┐                   ┌─────────────────────────┐
│ Background collector    │                   │ Bushy chat tool         │
│ scheduled (Mon–Fri)     │                   │ lib/bushy/tools/x-api.ts│
│ 2 queries/grain/day     │                   │ 3/turn, 10/conversation │
│ batch size 4            │                   │ value gate first        │
└────────────────────────┘                   └─────────────────────────┘
```

## Component 1 — Shared gateway Edge Function

**Path:** `supabase/functions/x-api-search/index.ts`
**Auth:** `verify_jwt = false`, `x-bushel-internal-secret` header check (same pattern as other internal chain functions).
**Input:**
```ts
{
  query: string,              // X API v2 search string
  mode: "background" | "chat_realtime",
  grain: string | null,       // optional: persist to x_market_signals with this grain
  lookback_days: number,      // 1-7
  triggered_by_user?: string  // for chat_realtime audit
}
```

**Flow:**
1. Hash query → lookup `x_api_query_log` WHERE `query_hash = $1 AND searched_at > now() - '30 days'`. If hit, return cached tweet IDs from `x_market_signals`. Skip API.
2. Budget check: `SELECT count(*) FROM x_api_query_log WHERE mode = $mode AND searched_at > date_trunc('day', now())`. If over soft cap (80 background / 40 chat_realtime per day), respond 429.
3. Call `https://api.twitter.com/2/tweets/search/recent?query=<q>&max_results=25&tweet.fields=author_id,created_at,public_metrics,entities&expansions=author_id&user.fields=username,verified`.
4. Score each tweet: keyword match ∈ FARMING_RELEVANCE_KEYWORDS, author domain bonus (AgCanada handles, AAFC, provincial ag depts, known farmer accounts), grain mention match. Drop tweets below threshold (score < 30).
5. Upsert relevant tweets to `x_market_signals` (dedup on post_url). Skip LLM scoring for background mode — that happens in the Friday swarm. For chat_realtime, attach a lightweight category tag so Bushy can cite context.
6. Insert audit row in `x_api_query_log` with `tweets_returned`, `tweets_relevant`, `value_score` (rel/ret ratio * 100).

**Error handling:** surface rate limit (429) to caller with `retry_after_ms`; surface auth errors (401) as config problem.

## Component 2 — Background collector scheduler

**Approach:** add 6th scheduled task via scheduled-tasks MCP: `collect-x-signals` running Mon/Wed/Fri at 10:00 MST (before the 11:00 collector window ends).

**Scan strategy** (mirrors v1 `search-x-intelligence` pulse mode, now direct):
- **Tier major** (Canola, Wheat, Barley, Corn, Soybeans, Oats, Peas, Lentils): 3 queries per grain per run. Templates: price chatter / basis / logistics.
- **Tier mid** (Flaxseed, Rye, Amber Durum, Chick Peas, Beans, Mustard Seed): 2 queries per run.
- **Tier minor** (Canaryseed, Sunflower): 1 query per run.
- Total ≈ 8·3 + 6·2 + 2·1 = 38 queries per run, ×3 runs/week = **~114 queries/week**.
- At 25 tweets/query and ~30% relevance pass rate → ~855 relevant signals/week stored.

**Trigger pattern:** `curl -X POST $FN_URL/x-api-search` with `x-bushel-internal-secret`. Task config becomes a loop across the tiered grain list.

## Component 3 — Bushy chat real-time tool

**Path:** `lib/bushy/tools/x-api.ts` (existing stub).
**Wire-up:**
1. Replace the `not_wired` branch with a call to `supabase/functions/x-api-search` using the service-role client (Bushy runs server-side via `/api/bushy/chat` SSE endpoint).
2. Pass `mode: "chat_realtime"`, `triggered_by_user: ctx.userId`.
3. Return top 5 tweets to the model (filtered by relevance score); return cached flag when the gateway served from the 30-day cache.
4. Keep existing per-turn / per-conversation rate limits (3 / 10) enforced by the harness.

## Data model changes

**None required.** Existing tables cover the use case:
- `x_market_signals` — already has `searched_at`, `search_mode`, `source` columns (from v1).
- `x_api_query_log` — already tracks mode, value_score, dedup hash.

**New column (optional):** `x_market_signals.upstream_source text` to distinguish `'grok_xsearch'` (v1 paused signals) from `'xapi_direct'` (new pipeline). Useful during cutover; can drop once v1 data ages out.

## Rollout

**Phase 1 — gateway only (this sprint):**
- Build `supabase/functions/x-api-search` with tests for dedup + budget.
- Wire Bushy tool stub to live gateway.
- Verify against 3-5 canola queries in dev; inspect `x_api_query_log` and `x_market_signals`.

**Phase 2 — background collector (next sprint):**
- Add `collect-x-signals` scheduled task once gateway shows stable cost + relevance profile.
- Backfill one week to validate the relevance filter against sentiment-scout's needs.

**Phase 3 — retire v1 `search-x-intelligence`:**
- Once Phase 2 shows ≥2 weeks of healthy coverage for all 16 grains, archive the v1 Edge Function.

## Budget

At $100/mo basic tier (500K tweets/mo reads):
- Background: 114 queries/wk × 25 tweets ≈ 2,850/wk × 4 weeks = 11.4K tweets/mo.
- Chat real-time: cap 40/day × 25 tweets × 30 days = 30K tweets/mo worst case (mostly cached).
- **Utilization:** ≤10% of plan — leaves huge headroom for bursty alpha users and collector expansion.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Relevance filter too lax → dashboard feed gets noisy | Start threshold at 30, tune after 1 week of user feedback |
| Relevance filter too strict → agents starve | `x_api_query_log.tweets_relevant / tweets_returned` dashboard; alarm if <10% for 3 days |
| Budget blowout from a runaway chat loop | Hard cap enforced in gateway (40 chat_realtime/day global, plus per-turn/conversation in harness) |
| X API key rotation | Vercel env var; same token lives in Supabase Edge Function secret — document dual rotation |
| Cached signals grow stale for breaking news | 30-day cache is soft; `force_refresh: true` param bypasses for chat tool |

## Open questions

1. Should the gateway also write to `chat_extractions` for chat_realtime mode so high-value tweets roll into the Hermes compression pipeline? (Leaning yes — aligns with tiered-memory design.)
2. Do we need per-grain query templates in a table, or hardcode in the Edge Function? (Table preferred for tuning without deploys.)

## Definition of Done

- [ ] Edge Function deployed and smoke-tested in dev (`curl` returns tweets for 3 sample grains)
- [ ] `x_api_query_log` dedup verified (same query twice within 30 days = 1 API call)
- [ ] Bushy chat tool returns live results instead of `not_wired` when `XAPI_BEARER_TOKEN` set
- [ ] Rate limit paths tested (simulate 41st chat_realtime call → 429)
- [ ] Secrets rotation runbook added to `docs/reference/data-sources.md`
