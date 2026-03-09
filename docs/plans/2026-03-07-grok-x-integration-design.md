# Grok API + X Agriculture Tweets Integration Design

**Date:** 2026-03-07
**Status:** Approved
**Author:** Kyle + Claude

## Problem

The intelligence pipeline currently uses OpenAI GPT-4o for generating grain market narratives. Switching to xAI's Grok API unlocks real-time X (Twitter) agriculture tweet search, enriching intelligence with live market sentiment and social signals — something OpenAI cannot provide.

## Decision

**Approach A: Single-Call Responses API** — Use Grok's Responses API (`/v1/responses`) with `x_search` tool and `response_format: json_schema` in one call per grain. Grok autonomously searches X for relevant agriculture tweets, then generates structured intelligence incorporating tweet context.

## Architecture

### API Migration

| Component | Current | New |
|-----------|---------|-----|
| Endpoint | `api.openai.com/v1/chat/completions` | `api.x.ai/v1/responses` |
| Model | `gpt-4o` | `grok-4-1-fast-reasoning` |
| Secret | `OPENAI_API_KEY` | `XAI_API_KEY` |
| Request format | `messages` array | `input` array |
| Search | None | `x_search` tool (real-time X posts) |

Both Edge Functions (`generate-intelligence` and `generate-farm-summary`) migrate to Grok.

### Request Format

**generate-intelligence** (per grain):

```json
{
  "model": "grok-4-1-fast-reasoning",
  "input": [
    { "role": "system", "content": "<system prompt>" },
    { "role": "user", "content": "<CGC data + prompt>" }
  ],
  "tools": [
    {
      "type": "x_search",
      "from_date": "<7 days ago ISO8601>",
      "to_date": "<today ISO8601>"
    }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "grain_intelligence",
      "strict": true,
      "schema": { "...existing schema..." }
    }
  }
}
```

**generate-farm-summary** (per user):

```json
{
  "model": "grok-4-1-fast-reasoning",
  "input": [
    { "role": "system", "content": "<farm analyst system prompt>" },
    { "role": "user", "content": "<user crop data + prompt>" }
  ],
  "tools": [
    {
      "type": "x_search",
      "from_date": "<7 days ago ISO8601>",
      "to_date": "<today ISO8601>"
    }
  ]
}
```

Farm summaries remain plain text (no json_schema).

### X Search Configuration

- **No handle restrictions** — broad search for Canadian grain market discussion
- **Date range:** Last 7 days (matching weekly cadence)
- **No image/video understanding** — text-only to keep costs low
- Grok's agentic search autonomously decides which tweets are relevant per grain

### Prompt Changes

**generate-intelligence** (`prompt-template.ts`):

1. System prompt updated to mention X/social media as a data source
2. New instruction: "Search X for recent market sentiment, farmer reports, and analyst commentary about {grain}. Reference specific posts when they provide meaningful signal."
3. New insight signal type: `"social"` added alongside `"bullish"`, `"bearish"`, `"watch"` — for tweet-driven insights
4. Existing CGC data context and all current rules preserved

**generate-farm-summary**:

1. System prompt updated: "Incorporate relevant market sentiment from X when writing personalized summaries"
2. Existing crop plan data and percentile context preserved

### Schema Changes

**Migration: `grain_intelligence.model_used` default**

```sql
ALTER TABLE grain_intelligence
  ALTER COLUMN model_used SET DEFAULT 'grok-4-1-fast-reasoning';
```

No other schema changes needed:
- `insights` is JSONB — new `"social"` signal type works without migration
- `llm_metadata` JSONB continues storing `request_id`, `total_tokens`, `finish_reason`
- Grok's response metadata fields may differ slightly from OpenAI — adapt extraction

### Secret Management

1. Set `XAI_API_KEY` in Supabase Edge Function secrets:
   ```
   npx supabase secrets set XAI_API_KEY=<key> --project-ref ibgsloyjxdopkvwqcqwh
   ```
2. Remove `OPENAI_API_KEY` after successful migration
3. Update `.env.local` for local development

### Response Parsing

The Responses API returns a different structure than Chat Completions:

```json
{
  "id": "resp_...",
  "output": [
    {
      "type": "message",
      "role": "assistant",
      "content": [
        { "type": "text", "text": "<JSON string>" }
      ]
    }
  ],
  "usage": {
    "input_tokens": 500,
    "output_tokens": 300,
    "total_tokens": 800
  }
}
```

Update response parsing in both Edge Functions:
- Extract text from `output[].content[].text` instead of `choices[0].message.content`
- Extract usage from `usage` (same field name, slightly different structure)
- Handle `x_search_call` entries in the output array (search tool results — log but don't store)

## Cost Estimate

**grok-4-1-fast-reasoning:** $0.20 input / $0.50 output per M tokens (cached: $0.05 input)

| Component | Weekly Tokens (est.) | Weekly Cost |
|-----------|---------------------|-------------|
| Intelligence (16 grains) | ~32K | ~$0.02 |
| Farm summaries (50 users) | ~25K | ~$0.01 |
| X search overhead | ~20K | ~$0.01 |
| **Total** | **~77K** | **~$0.04** |

Comparable to current GPT-4o costs (~$0.05-0.10/week). The `fast-reasoning` model is significantly cheaper than standard `grok-4` ($3/$15 per M tokens).

## Edge Cases

1. **X search returns no relevant tweets:** Grok generates intelligence from CGC data alone (graceful degradation)
2. **Grok API downtime:** Same error handling as current OpenAI integration — per-grain try-catch, non-blocking failures
3. **Rate limits:** 16 sequential calls per weekly run is well within typical API limits
4. **Response format differences:** Test thoroughly — Grok's json_schema with tools is newer than OpenAI's

## Testing Plan

1. Local test: Call Grok Responses API with x_search for one grain, verify structured output
2. Deploy updated Edge Functions to Supabase
3. Manual trigger of `generate-intelligence` for a single grain
4. Verify `grain_intelligence` table has new data with Grok model metadata
5. Full 16-grain run
6. Trigger `generate-farm-summary` chain
7. Monitor costs in xAI dashboard

## References

- [xAI Responses API docs](https://docs.x.ai/docs/guides/live-search)
- [X Search tool docs](https://docs.x.ai/developers/tools/x-search)
- [Structured Outputs docs](https://docs.x.ai/developers/model-capabilities/text/structured-outputs)
- [Models and pricing](https://docs.x.ai/developers/models)
- Current implementation: `../bushel-board-app/supabase/functions/generate-intelligence/`
