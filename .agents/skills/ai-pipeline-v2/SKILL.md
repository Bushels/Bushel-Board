---
name: ai-pipeline-v2
description: Archived Grok/xAI pipeline tombstone. Use only to confirm that the old Senior Analyst / Grok chain is retired, not as a live pipeline skill.
---

# AI Pipeline v2 - Archived Grok Chain

The old Senior Analyst pipeline is retired. Do not invoke, recover, repair, or
use it as a fallback for Wheat, Track 54, or any live thesis work.

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

## Current Live Pattern

```
Codex CGC importer -> cgc_observations -> Claude/Codex desk workflow -> market_analysis / farm_summaries
```

- CGC import: `npm run import-cgc`
- Analysis: Claude Agent Desk / Codex-authored desk routines
- X/Twitter input for production writers: future direct X API v2 gateway, not the retired Grok `search-x-intelligence` chain.
- Track 54 exception: Grok/Hermes may create local no-write X scout artifacts only through the reviewed Track 54 path. That path is evidence discovery, not pipeline recovery, and must not write Supabase rows or thesis rows without the explicit promotion gate.
- Legacy table: `grain_intelligence` is read-only history

## Archive Rule

Keep this skill available as a tombstone/reference only. Do not expand it with
new recovery steps, writer prompts, deployment commands, or Wheat scoring logic.

## Key Rule

If a task asks to fix, restart, or deploy the Grok pipeline, stop and clarify that
the workflow is intentionally deprecated. Deploy only if the task is explicitly
to publish a tombstone.
