---
name: ai-pipeline-v2
description: Retired Grok/xAI pipeline reference. Use only to confirm that the old Senior Analyst / Grok chain is tombstoned and should not be restarted.
---

# AI Pipeline v2 - Retired Grok Chain

The old Senior Analyst pipeline is retired. Do not invoke or recover it.

## Tombstoned Runtime Paths

- `/api/pipeline/run`
- `supabase/functions/analyze-grain-market`
- `supabase/functions/search-x-intelligence`
- `supabase/functions/analyze-market-data`
- `supabase/functions/generate-intelligence`
- `supabase/functions/generate-farm-summary`

These entrypoints should return HTTP 410-style tombstones and must not write new
rows to `market_analysis`, `grain_intelligence`, `farm_summaries`, or
`x_market_signals`.

## Current Pattern

```
Codex CGC importer -> cgc_observations -> Claude/Codex desk workflow -> market_analysis / farm_summaries
```

- CGC import: `npm run import-cgc`
- Analysis: Claude Agent Desk / Codex-authored desk routines
- X/Twitter input for production writers: future direct X API v2 gateway, not the retired Grok `search-x-intelligence` chain.
- Track 54 exception: Grok/Hermes may create local no-write X scout artifacts only through the reviewed Track 54 path. That path is evidence discovery, not pipeline recovery, and must not write Supabase rows or thesis rows without the explicit promotion gate.
- Legacy table: `grain_intelligence` is read-only history

## Key Rule

If a task asks to fix, restart, or deploy the Grok pipeline, stop and clarify that
the workflow is intentionally deprecated. Deploy only if the task is explicitly
to publish a tombstone.
