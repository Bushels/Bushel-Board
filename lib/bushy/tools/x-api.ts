// WS3 Task 3.6 — Bushy chat harness
// search_x tool. STUB implementation for initial launch.
//
// Real implementation (follow-up):
//   1. Value gate: check knowledge_state for cached result within 30 days
//      for the same query_hash. If found, return cached value with 'cached'
//      confidence — skip the API call.
//   2. Log the query to x_api_query_log so admin dashboards can track
//      budget consumption + tweet relevance ratio.
//   3. Call X API v2 /2/tweets/search/recent with the query.
//   4. Score each tweet for farming relevance (cross-check against
//      `FARMING_RELEVANCE_KEYWORDS`).
//   5. Persist high-value tweets to x_market_signals so the Friday swarm
//      sees them too.
//
// For WS3 we return a structured not-wired response so the harness can
// register the tool without hitting live X API. When Kyle approves the
// full implementation this file is where it lands.
//
// See design docs for the full architecture:
//   - docs/plans/2026-04-15-hermes-chat-agent-design.md §5 (X API)
//   - docs/plans/2026-04-16-bushy-chat-harness-design.md

import { z } from "zod";
import type { BushyTool } from "./types";

const SearchXArgs = z.object({
  query: z
    .string()
    .min(1, "query must be a non-empty search string")
    .max(256, "query must be <= 256 chars (X API v2 limit is 512 — leave headroom)"),
  /**
   * How many days back to search. X API v2 /search/recent only covers the
   * last 7 days on the basic tier; for the stub we honor but validate
   * against that ceiling.
   */
  lookback_days: z.number().int().min(1).max(7).default(2),
  /**
   * When true, skip the working-memory cache check and force a live
   * lookup. Default false — value gate prefers cached.
   */
  force_refresh: z.boolean().default(false),
});

export const searchXTool: BushyTool = {
  name: "search_x",
  description:
    "Search X/Twitter for recent farming-relevant posts (prices, elevator chatter, " +
    "weather, policy signals). Use sparingly — each search costs budget and is " +
    "rate-limited to 3 per turn / 10 per conversation. The stub currently returns " +
    "a 'not configured' response unless XAPI_BEARER_TOKEN is set + the live " +
    "implementation has been wired.",
  parameters: SearchXArgs,
  source: "native",
  costEstimateUsd: 0.002, // ~$2 per 1000 tweets on X API basic tier
  rateLimit: { perTurn: 3, perConversation: 10 },
  async execute(args, _ctx) {
    const start = Date.now();
    const parsed = SearchXArgs.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        error: `search_x validation failed: ${parsed.error.message}`,
        latencyMs: Date.now() - start,
      };
    }

    if (!process.env.XAPI_BEARER_TOKEN) {
      return {
        ok: false,
        error:
          "X API not configured. Set XAPI_BEARER_TOKEN env var to enable this tool.",
        latencyMs: Date.now() - start,
      };
    }

    // Token is set but implementation is not yet wired. Return a stable
    // not-implemented response rather than an error — the harness should
    // pass this through to the model, which can then try a different
    // approach (use query_working_memory, or just answer without X data).
    return {
      ok: true,
      data: {
        status: "not_wired",
        query: parsed.data.query,
        lookback_days: parsed.data.lookback_days,
        message:
          "X search is stubbed. Fall back to query_working_memory for any " +
          "previously-captured signals, or answer without external search.",
        tweets: [],
      },
      costUsd: 0,
      latencyMs: Date.now() - start,
    };
  },
};

export { SearchXArgs };
