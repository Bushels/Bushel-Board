# Intelligence Pipeline Audit — 2026-03-06

Source: Codex code audit of `supabase/functions/generate-intelligence/` and `lib/queries/intelligence.ts`

**Status: All issues FIXED (2026-03-06)**

## Bug 1: Intelligence query missing crop_year filter (CRITICAL) — FIXED

**Symptom:** Once a second crop year exists in `grain_intelligence`, the detail page can show stale prior-year intelligence as if it were current. Week 52 of 2024-25 beats week 10 of 2025-26 in the ORDER BY.

**Root Cause:** `lib/queries/intelligence.ts:21` filters only by `grain` and orders by `grain_week DESC`, never filtering on `crop_year`.

**Fix Required:** Add `.eq("crop_year", CURRENT_CROP_YEAR)` to the query. Import from `@/lib/utils/crop-year`.

**Affected file:** `lib/queries/intelligence.ts` — `getGrainIntelligence()`

## Bug 2: Supply pipeline view not filtered by crop_year in Edge Function (HIGH)

**Symptom:** The `generate-intelligence` Edge Function loads all rows from `v_supply_pipeline` and maps by `grain_name` only. Once `supply_disposition` has multiple crop years, the model could narrate the wrong AAFC balance sheet.

**Root Cause:** `supabase/functions/generate-intelligence/index.ts:60-61` calls `supabase.from("v_supply_pipeline").select("*")` without a crop_year filter.

**Fix Required:** Add `.eq("crop_year", cropYear)` to the supply pipeline query in the Edge Function.

**Affected file:** `supabase/functions/generate-intelligence/index.ts`

## Bug 3: Fake "Estimated On-Farm" number in prompt (HIGH)

**Symptom:** The AI prompt presents `total_supply - cy_deliveries` as "Estimated On-Farm" — this is not defensible grain accounting. It ignores exports, processing, feed/waste, and carry-out that have already occurred. For a farmer audience, this is misleading.

**Root Cause:** `supabase/functions/generate-intelligence/prompt-template.ts:43-44` computes `onFarmEst = total_supply - cy_deliveries` and presents it as fact at line 68.

**Fix Required:** Either:
- Remove the "Estimated On-Farm" line entirely, or
- Use a proper formula: `total_supply - cy_deliveries - cy_exports - cy_crush` (approximate remaining), clearly labeled as a rough estimate with caveats

**Affected file:** `supabase/functions/generate-intelligence/prompt-template.ts`

## Issue 4: No structured outputs — relies on prompt obedience (HIGH)

**Symptom:** The function sends a raw prompt and then strips code fences + JSON.parse. This is the exact failure mode OpenAI's Structured Outputs feature eliminates.

**Root Cause:** `index.ts:107-117` calls `/v1/chat/completions` with no `response_format` parameter. Lines 131-134 do fragile regex stripping of markdown fences.

**Fix Required:** Switch to `response_format: { type: "json_schema", json_schema: { ... } }` with the intelligence schema defined. This guarantees valid JSON structure from the API.

**Reference:** [OpenAI Structured Outputs Guide](https://developers.openai.com/api/docs/guides/structured-outputs)

**Affected file:** `supabase/functions/generate-intelligence/index.ts`

## Issue 5: No retry, no observability (MEDIUM)

**Symptom:** If one OpenAI call fails on Thursday, that grain's intelligence stays empty/stale until manual intervention. No request IDs, token usage, finish reasons, or raw validation reports are stored.

**Root Cause:** `index.ts:120-123` records a failure string and `continue`s. `import-cgc-weekly/index.ts:196` treats the entire chain as best-effort with no retry.

**Fix Required:**
- Store `request_id`, `usage.total_tokens`, `finish_reason` per grain-week in `grain_intelligence` or a separate `intelligence_runs` audit table
- Add a simple retry (1 retry with backoff) for transient failures (429, 500, 502, 503)
- Add a `stale_grains` alert view that shows grains without intelligence for the current week

**Affected files:** `index.ts`, schema migration for audit columns

## Issue 6: Split-brain model documentation (MEDIUM)

**Symptom:** Multiple docs disagree on which model is used:
- Code: `gpt-4o` at `index.ts:19`
- Migration default: `claude-sonnet-4-5-20250514` at `20260306100000_grain_intelligence.sql:26`
- Intelligence implementation plan: References Claude/Anthropic at `docs/plans/...:591`
- CLAUDE.md: Says OpenAI (correct)
- README: Omits `OPENAI_API_KEY` in setup instructions

**Fix Required:**
- Update migration default column value (cosmetic, won't affect existing rows since Edge Function always sets `model_used`)
- Update implementation plan or add a note that model was changed during development
- Add `OPENAI_API_KEY` to README setup instructions

## Lessons Learned

### Always scope queries by crop_year
The CGC data model uses crop year as a fundamental dimension. Any query that reads `grain_intelligence`, `cgc_observations`, `supply_disposition`, or derived views MUST filter by crop_year. The current year is `2025-26` (short format from `lib/utils/crop-year.ts`), while the Edge Function uses long format `2025-2026`. These two formats coexist in the database — always check which format a table expects.

### Use structured outputs for LLM responses
When an LLM is expected to return JSON, always use the API's structured output feature rather than parsing raw text. This eliminates:
- Code fence stripping (`/^```json/`)
- JSON.parse failures
- Missing required fields
- Wrong data types

### Don't fabricate accounting numbers
If a derived metric isn't backed by proper accounting logic, label it clearly as an estimate with methodology notes, or omit it. Farmers and grain investors trust their dashboard data — a wrong "On-Farm" estimate erodes that trust more than no estimate at all.

### Store LLM call metadata
For any LLM-powered feature in production, always store: request_id, model version, token usage, finish_reason, and latency. This is essential for cost tracking, debugging failures, and evaluating model performance.
