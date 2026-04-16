# Bushel Board - Lessons Learned

## 2026-04-16 — Missing bear_reasoning when stance drops (swarm-prompt gap)

**Symptom:** The Overview unified stance chart showed Barley with a -25 WoW stance drop but an empty Bear Case panel. A farmer legitimately asked "why is there no bear case when it is down 25 over the previous week?" — the answer was that our AI produced a directional score without producing structured reasoning to back it up.

**Root cause:** The Friday Claude Agent Desk swarm (Track 41) outputs `stance_score` and `bull_reasoning` / `bear_reasoning` JSONB arrays into `market_analysis`. The swarm prompt does not enforce the invariant that a negative WoW stance move must be accompanied by at least one entry in `bear_reasoning`. When the three specialist analysts all ended up leaning bullish long-term, the bear case got dropped even though the short-term stance tightened.

**Fix (short-term, UI):** `components/dashboard/unified-market-stance-chart.tsx` now renders a delta-aware empty state. When `bearPoints.length === 0 && delta <= -10`, the panel says "Stance softened N WoW, but no specific bearish drivers were captured this week" with a hint to check the grain's delivery/basis/terminal cards. This preserves honesty — we acknowledge the softening rather than silently omitting it.

**Fix (long-term, pipeline):** Add a rule to `docs/reference/grain-desk-swarm-prompt.md` and the desk-chief prompt: if `stance_score` drops >=10 WoW, `bear_reasoning` MUST contain >=1 driver (and vice versa for bullish moves >=10). The validator pass in `supabase/functions/analyze-grain-market` should reject outputs that violate this and re-prompt once before accepting.

**Also addressed in this commit:**
- Overview CA grains now ordered by prairie-acreage popularity (Wheat → Canola → Barley → Amber Durum → Peas → Oats → Lentils → Flaxseed → Soybeans → Corn) rather than by stance score. Most-clicked grains appear first.
- Added explainers under each section header and a top note explaining that CA/US stances diverge legitimately (different data streams: CGC vs USDA; different markets: prairie cash vs CBOT futures). Addresses the "why does Oats differ between CA and US?" farmer question.

**Tags:** #ai-pipeline #swarm #bear-reasoning #ux #overview #followup

## 2026-04-16 — Components orphaned by Overview bull/bear unification

**Symptom:** The Overview page was rewritten to render a single `UnifiedMarketStanceChart` grouped by region (CA + US). The CGC snapshot grid, Logistics Banner, Community Pulse, and the original single-region MarketStanceChart were removed from the page.

**Orphaned symbols (zero callers as of this commit):**
- Components: `MarketSnapshotGrid`, `LogisticsBanner`, `SignalStripWithVoting`, `MarketStanceChart` (the React component — its `BulletPoint` / `GrainStanceData` type exports are still imported by `UnifiedMarketStanceChart`, so the file stays).
- Queries: `getMarketOverviewSnapshot`, `getLogisticsSnapshotRaw`, `getAggregateTerminalFlow`, `getLatestXSignals`.

**Deliberately kept:** `SentimentBanner` (still imported by `app/(dashboard)/my-farm/page.tsx`).

**Decision:** NOT deleted in this PR. Removing them is a follow-up: want to confirm there are no in-flight branches that re-add these before removing, and want to make sure the underlying RPCs / tables behind the queries aren't relied on elsewhere (e.g. `get_aggregate_terminal_flow` may be reused for a future chart). File a separate cleanup PR after this deploys and sits for a week.

**Tags:** #overview #dead-code #followup #ui

## 2026-03-17 — LLM Attention Anchoring on First Number in Prompt

**Symptom:** The Advisor told a farmer "10,000 tonnes still sitting in your bins" when the farmer actually had 5,000 MT remaining (started with 10,000 MT, delivered 5,000 MT). The data injected into the prompt was correct — both numbers were present.

**Root cause:** The farmer card in the system prompt was formatted as `Started with 10.0 Kt, 5.0 Kt still in bins`. The LLM anchored on the first number it encountered (10 Kt) and treated it as the current bin inventory. This is a known LLM behavior — models disproportionately weight the first numeric value in a sequence, especially when both values are in similar units.

**Fix:** Reorder the inventory line to lead with the actionable figure: `5.0 Kt still in bins (of 10.0 Kt starting)`. The remaining quantity — what matters for marketing decisions — now appears first. The starting amount is parenthetical context.

**General principle:** When constructing LLM prompts with numeric data, always lead with the number the model should reference in its response. Background/historical figures should follow in parentheses.

**File:** `lib/advisor/system-prompt.ts:25-26`

**Tags:** #llm #prompt-engineering #advisor #attention-anchoring

## 2026-03-17 — grain_week Mismatch: Calendar Week vs Data Week

**Symptom:** After running the v2 pipeline (`analyze-grain-market`), the dashboard still showed old v1 analysis with stance -45 for Canola. The v2 results (stance +25) were in the database but invisible.

**Root cause:** The v1 pipeline used `getCurrentGrainWeek()` which returns the **calendar shipping week** (= 33 at the time). The v2 pipeline correctly queries `MAX(grain_week) FROM cgc_observations` which returns the **latest data week** (= 31). The dashboard query `ORDER BY grain_week DESC LIMIT 1` picked up the v1 week-33 row over the v2 week-31 row because 33 > 31.

**Fix:** Deleted the mislabeled week-33 rows from `market_analysis` and `grain_intelligence`. The v2 week-31 data (which accurately reflects what the CGC data actually covers) now surfaces correctly.

**Lesson:** Analysis should always be labeled with the week the data covers, not the calendar week when the analysis ran. The `MAX(grain_week) FROM cgc_observations` pattern is the correct approach. When transitioning between pipeline versions, clean up stale data from the old version to prevent ghost rows from masking new results.

**Tags:** #pipeline #grain-week #data-freshness #v1-to-v2-migration

## 2026-03-17 — Decision Rail Marker Position Must Scale with Confidence

**Symptom:** The recommendation card's HAUL/HOLD slider showed the marker at ~86% (far right) for a 55/100 "moderate conviction" HOLD recommendation. Visually, it looked like a high-conviction call when the data was actually borderline.

**Root cause:** `getDecisionPosition()` returned a fixed position based only on action + market stance, ignoring the confidence score. A 55/100 hold and a 95/100 hold had identical marker positions.

**Fix:** Interpolate the marker between center (50%) and the action target based on confidence: `position = 50 + (target - 50) * (confidence / 100)`. At 55/100, a bullish hold moves from 86% → ~70%, which visually reads as "leaning hold, not emphatic." The band width (uncertainty region) was already confidence-scaled — now the marker position matches.

**File:** `components/dashboard/recommendation-card.tsx:107-117`

**Tags:** #ux #visualization #confidence #recommendation-card

## 2026-03-17 — Edge Function 150s Wall-Clock Timeout with xAI Tool Use

**Symptom:** The v2 `analyze-grain-market` Edge Function returned 504 Gateway Timeout on the 3rd grain in the first benchmark run. The xAI API call with `web_search` + `x_search` tool use took 150,087ms.

**Root cause:** Supabase Edge Functions have a 150-second wall-clock limit. When the xAI model decides to use multiple search tools sequentially, each tool call adds latency. The Barley analysis (which involved extensive web search) came close at 124s. With BATCH_SIZE=1, only one grain per invocation, but tool-heavy grains can still hit the ceiling.

**Impact:** A 504 breaks the self-triggering chain — the function never reaches the `enqueue_internal_function` code for remaining grains. The chain must be manually restarted.

**Mitigation:** BATCH_SIZE=1 limits blast radius. If one grain 504s, restart the chain with the remaining grains. The xAI `max_output_tokens: 16384` setting helps but doesn't control tool use latency. A future fix could add a per-grain timeout with graceful fallback.

**Tags:** #edge-function #timeout #xai #pipeline-v2 #tool-use

## 2026-03-16 — CSS color-mix() vs hsl() for Hex CSS Variables

**Symptom:** Implementation plan specified `hsl(var(--prairie) / 0.65)` to apply 65% opacity to a CSS custom property for the TerminalFlowChart bar colors.

**Root cause:** The `hsl()` alpha syntax only works when the CSS variable contains raw HSL channel values (e.g., `--prairie: 100 60% 30%`). Bushel Board's design tokens store hex values (e.g., `--color-prairie: #437a22`), so `hsl(var(--color-prairie) / 0.65)` is invalid CSS and silently fails — the browser drops the declaration entirely, producing no color.

**Fix:** Use `color-mix(in srgb, var(--color-prairie) 65%, transparent)` instead. This works with any color format stored in the variable (hex, rgb, hsl, named colors).

**Caught by:** Gemini pre-review, before any code was written. This is exactly the kind of bug that would have been invisible until visual QA — no build error, no runtime error, just a missing fill color.

**Tags:** #css #design-tokens #color-mix #gemini-review #terminal-net-flow

## 2026-03-16 — PostgREST numeric-as-string in Sentiment/Logistics Pure Functions

**Symptom:** The `vesselSentiment()`, `octSentiment()`, and `shipmentYoySentiment()` pure functions in `logistics-utils.ts` performed numeric comparisons like `vessels > avg + 5`, but the comparisons produced wrong results for certain value ranges.

**Root cause:** Supabase PostgREST serializes `numeric` column values as **strings**, not numbers. When the Grain Monitor snapshot values (e.g., `vessels_vancouver: "9"`, `oct_pct: "205"`) were compared without conversion, JavaScript performed lexicographic string comparison: `"9" <= "205"` evaluates to `true` (because `"9"` > `"2"` in ASCII), but numerically 9 < 205. This is a recurring PostgREST footgun — see also the earlier `Number()` fix for `cgc_observations.ktonnes`.

**Fix:** Wrap all `grain_monitor_snapshots` values in `Number()` at the query boundary before passing to pure functions. The pure functions themselves accept `number` types, keeping the type-safety contract clean.

**Caught by:** Gemini mid-implementation review.

**Tags:** #postgrest #numeric #type-coercion #logistics #gemini-review #terminal-net-flow

## 2026-03-16 — Server/Client Module Boundary: "use client" Transitive Import of Server Module

**Symptom:** `terminal-flow-chart.tsx` (a `"use client"` component) imported types and pure functions from `logistics.ts`, which in turn imports `createClient` from `@/lib/supabase/server`. Build failed with a server-only module error.

**Root cause:** Next.js enforces that `"use client"` components cannot transitively import server-only modules. Even if the client component only uses exported types and pure functions from a module, if that module has *any* import of a server-only dependency (like `@/lib/supabase/server`), the entire dependency chain is invalid. The original `logistics.ts` mixed Supabase query functions (server-only) with pure utility functions and TypeScript types (client-safe) in a single file.

**Fix:** Split into two files:
1. `lib/queries/logistics-utils.ts` — client-safe: TypeScript types, interfaces, and pure functions (sentiment scoring, formatting). No Supabase imports.
2. `lib/queries/logistics.ts` — server-only: Supabase queries that re-export everything from `logistics-utils.ts` for backward compatibility.

Client components import from `logistics-utils.ts`. Server components and server actions import from `logistics.ts` (which provides both queries and re-exported utils).

**Caught by:** Task 6 subagent during component integration.

**Pattern:** When a query module contains both data-fetching functions and pure utility functions, proactively split them if any client component will need the utilities. This is the same pattern used by `lib/queries/observations.ts` (server) vs the composite metric types that live in shared scope.

**Tags:** #nextjs #use-client #module-boundary #server-components #terminal-net-flow

## 2026-03-16 — Float Formatting for Display Values (OCT% and YoY%)

**Symptom:** OCT percentage values rendered as `12.345678%` and YoY percentage values as `7.891234%` in the TerminalFlowChart and LogisticsBanner components. Long decimal strings cluttered the UI and looked unfinished.

**Root cause:** The raw `numeric` values from `grain_monitor_snapshots` (after `Number()` conversion) were interpolated directly into template strings without formatting. No `.toFixed()` call was applied before rendering.

**Fix:** Applied `.toFixed(1)` for OCT percentages (one decimal place provides meaningful precision for car-unloading times) and `.toFixed(0)` for YoY change percentages (whole numbers are sufficient for directional context). Applied at the component render level, not in the query layer, to keep raw precision available for calculations.

**Caught by:** Gemini final review.

**Tags:** #formatting #display #toFixed #gemini-review #terminal-net-flow

## 2026-03-15 — Delivery Gap Chart: Prototype Fidelity Failure (Missing Right Y-Axis + Gap Line)

**Symptom:** User provided exact HTML/Chart.js prototype with 3 datasets on 2 axes. Implementation produced 2 lines on 1 axis with fill-area approximation. The gap LINE on a secondary right Y-axis — the most important visual element ("the gap is the thesis") — was never built.

**Root Cause (process):** The design doc silently simplified the prototype without documenting deviations. Clarifying questions focused on UX (page position, style, toggle behavior) rather than structure (axes, datasets, visual layers). All reviewer agents validated against the derived design doc, not the original prototype. Gemini was consulted on a detail (color choice), not architecture.

**What was lost:**
1. **Right Y-axis** labeled "YoY Gap (Kt)" with green tick marks — completely dropped
2. **Gap as its own plotted LINE** on the right axis — replaced with fill-area between two lines
3. **Headline numbers** — prototype showed 293 Kt gap vs implementation's 563 Kt (different data period, not investigated)

**Process fixes applied:**
1. Gemini collab skill updated with "Prototype Fidelity Check" pattern (Pattern 4) and "Design Doc Deviation Check" (Pattern 5)
2. New Workflow 6 in gemini-collab: "Prototype Fidelity Review" — run BEFORE writing design doc when user provides source code
3. Rule: When user provides exact code, default to faithful reproduction first, improvements second
4. Rule: Spec reviewers must receive both original source AND design doc
5. Rule: Clarifying questions must inventory structural elements (axes, datasets, visual layers) before UX details

**Fix applied:** Rewrote `delivery-gap-chart.tsx` with dual Y-axes (`yAxisId="left"` for cumulative deliveries, `yAxisId="right"` for gap) and 3 datasets: current year Line, prior year dashed Line (both left axis), gap Area + Line (right axis with green ticks). Key Recharts lesson: when using multiple `<YAxis>` components, *every* `<Line>` and `<Area>` must specify a `yAxisId` prop or Recharts throws a runtime error.

**Takeaway for future prototype conversions:**
1. Inventory EVERY axis, dataset, and visual layer from the prototype BEFORE writing a design doc
2. Default to faithful reproduction first — improvements/simplifications second, and only if documented
3. Run the Prototype Fidelity Review workflow (gemini-collab Workflow 6) when user provides source code
4. Spec reviewers must receive both the original source AND the design doc

## 2026-03-15 — Exports Missing Producer Cars Component (112.6 vs 113.5 Kt)

**Symptom:** Dashboard showed Canola exports as 112.6 Kt for week 31 current week, but CGC Excel Summary!H27 showed 113.5 Kt. The 0.9 Kt gap was consistent and exact.

**Root Cause:** The CGC Summary "Exports" row has **THREE** components, not two:
1. **Terminal Exports** (vessels leaving ports, all grades summed): 112.5 Kt
2. **Primary Shipment Distribution "Export Destinations"** (direct cross-border from primary elevators): 0.1 Kt
3. **Producer Cars Shipment Distribution "Export"** (farmer-loaded railcars shipped direct to US): 0.9 Kt

Our code only included components 1+2. Component 3 — Producer Cars exports — was missed because for most grains it's 0 Kt (e.g., Wheat week 31 = 0.0 Kt), making the error invisible unless you checked Canola or other grains with active US rail shipments.

**Verification (cross-grain):**
- Canola week 31: 112.5 + 0.1 + 0.9 = 113.5 ✓ (matches CGC Excel Summary!H27)
- Wheat week 31: 420.7 + 21.4 + 0.0 = 442.1 ✓ (matches CGC Excel Summary!B27)

**Solution:** Added `Producer Cars.Shipment Distribution` with `region = 'Export'` to all exports queries:
1. `lib/queries/observations.ts` — WoW composite metric (new source + "producer_cars_export" region filter)
2. `get_pipeline_velocity()` — SQL exports CTE
3. `get_pipeline_velocity_avg()` — SQL exports CTE
4. `v_grain_yoy_comparison` — both `current_exports` and `prior_exports` CTEs
5. `supabase/functions/_shared/market-intelligence-config.ts` — CGC_DATA_GUARDRAILS documentation

**Also fixed:**
- `supabase/functions/import-cgc-weekly/index.ts` — changed `ignoreDuplicates: true` to `false` (same stale-data bug as the main import route, but in the legacy Edge Function)
- Identified `fetch-cgc-grain-data` as completely dead Edge Function (deployed on Supabase with no local source code, zero references in codebase)

**Prevention:**
- CGC "Exports" = Terminal Exports + PSD Export Destinations + Producer Cars Export. This is now the ONLY correct formula. Update CLAUDE.md to reflect all three components.
- When verifying export totals, always check grains with active Producer Cars US shipments (typically Canola, sometimes Wheat, Peas) — these are the only grains where the third component is non-zero.
- Cross-check new metric definitions against CGC Excel hardcoded values, not just against our own DB queries. Excel is the source of truth.

**Files modified:**
- `lib/queries/observations.ts` (3-component exports composite)
- `supabase/migrations/20260315400000_add_producer_cars_export_to_exports.sql`
- `supabase/functions/_shared/market-intelligence-config.ts` (guardrail docs)
- `supabase/functions/import-cgc-weekly/index.ts` (ignoreDuplicates fix)

**Tags:** #data-integrity #exports #producer-cars #cgc #pipeline #audit

## 2026-03-15 — Stale Prior-Week Data Caused Wrong WoW Direction (Stocks Showed -10.7% Instead of +3.2%)

**Symptom:** After fixing the Stocks formula (see next entry), the Canola Stocks card correctly showed 1,470.5 Kt for week 31, but the WoW change showed **-10.7% "Stock drawdown"** when it should have been **+3.2% "Stock build"**. CGC Excel confirmed week 30 Canola Summary Stocks = 1,424.4 Kt, but our database had 1,646.1 Kt for week 30.

**Root Cause (two compounding bugs):**

1. **Import route only captured current-week rows:** `app/api/cron/import-cgc/route.ts` filtered the full CGC CSV down to `grain_week === grainWeek` (line 106-108). CGC revises prior-week data when publishing new weeks (preliminary → final values). By discarding all non-current-week rows, we never picked up CGC's revisions to prior weeks. Week 30's preliminary value of 1,646.1 Kt was never corrected to the final 1,424.4 Kt.

2. **`ignoreDuplicates: true` prevented updates even if rows were included:** Both the import route (line 139) and the backfill script (line 160) used `ignoreDuplicates: true`, which maps to PostgreSQL's `ON CONFLICT DO NOTHING`. Even if prior-week rows had been included, they would have been silently skipped because the rows already existed. This meant once a row was inserted, it could never be corrected by the pipeline.

**Impact:** Every prior-week value in the database was potentially stale. Any WoW, YoY, or trend calculation that compared current-week values against prior-week values could show the wrong direction and magnitude. This affected all 16 grains, not just Canola.

**Solution:**
1. **Import route:** Changed filter from `grain_week === grainWeek` to `crop_year === cropYear` — now imports ALL rows for the current crop year on every weekly run. Changed `ignoreDuplicates: false` (= `ON CONFLICT DO UPDATE`) so revised values overwrite stale ones.
2. **Backfill script:** Changed `ignoreDuplicates: false`. Added `--live` flag to fetch directly from grainscanada.gc.ca instead of requiring a local CSV file.
3. **Data repair:** Ran `npm run backfill -- --live` to upsert all 126,776 rows from the live CGC CSV, correcting all stale prior-week values across the entire crop year.

**Verification (Canola Summary Stocks after backfill):**
- Week 29: 1,451.3 Kt ✓
- Week 30: 1,424.4 Kt ✓ (was 1,646.1 — now matches CGC Excel)
- Week 31: 1,470.5 Kt ✓
- WoW change: +3.2% (stock build) ✓ (was -10.7% drawdown)

**Prevention:**
- **Never use `ignoreDuplicates: true` for CGC data imports.** CGC revises prior-week data. The pipeline must always use `ON CONFLICT DO UPDATE` to accept revisions.
- **Never filter the CGC CSV to only the current week.** Import the full crop year to catch all prior-week revisions. The CSV is ~127K rows — well within Supabase upsert capacity.
- **Treat any WoW change >10% with suspicion.** A 10.7% swing in national commercial stocks in one week is implausible and should trigger a data freshness check.
- Add a validation rule to `validate-import` that compares prior-week values against the CSV and flags discrepancies.

**Files modified:**
- `app/api/cron/import-cgc/route.ts` (import full crop year, ignoreDuplicates: false)
- `scripts/backfill.ts` (ignoreDuplicates: false, --live flag)

**Tags:** #data-integrity #stale-data #import-pipeline #cgc #wow #revision

## 2026-03-15 — Exports and Commercial Stocks Under-Reported Across Entire Pipeline

**Symptom:** Dashboard showed Canola commercial stocks as 962.5 Kt instead of the CGC-reported 1,470.5 Kt (missing 508 Kt). Exports were under-counted by ~102 Kt across all grains. The user noticed the Stocks key metric card didn't match the CGC Excel, and the Exports pipeline velocity chart was below CGC Summary totals.

**Root Cause (Bug 1 — Stocks):** The `v_grain_yoy_comparison` view and the `getWeekOverWeekComparison()` TypeScript function both filtered `region IN ('Primary Elevators', 'Process Elevators')` for stocks. This excluded all six terminal port locations (Vancouver, Prince Rupert, Churchill, Thunder Bay, Bay & Lakes, St. Lawrence) which hold ~290-500 Kt of grain. The CGC "Total Commercial Stocks" includes ALL Summary Stocks regions. The `getStorageBreakdown()` function also only fetched Primary + Process, then queried a non-existent "Terminal Stocks" worksheet.

**Root Cause (Bug 2 — Exports):** The `get_pipeline_velocity()` RPC, `get_pipeline_velocity_avg()` RPC, and `v_grain_yoy_comparison` view all defined exports as only `Terminal Exports.Exports`. But the CGC "Exports" in Summary = Terminal Exports + Primary Shipment Distribution "Export Destinations" (direct cross-border exports bypassing terminals). This was already documented in CLAUDE.md but never applied to the SQL objects.

**Root Cause (Bug 3 — Delivery delta):** The key metrics card used `period = 'Current Week'` (460.2 Kt) while the Net Balance chart derived weekly deltas from `period = 'Crop Year'` cumulative data (462.0 Kt). The 1.8 Kt (<0.5%) difference is a CGC rounding artifact — they round weekly and cumulative values independently. Not a code bug.

**Solution:**
1. **Stocks:** Removed region filter from `current_stocks`/`prior_stocks` CTEs in `v_grain_yoy_comparison`, made Stocks a composite metric in WoW comparison (summing all Summary Stocks regions), fixed `getStorageBreakdown()` to pull all Summary regions and group terminal ports into "Terminal Elevators"
2. **Exports:** Added PSD Export Destinations to exports CTEs in `get_pipeline_velocity()`, `get_pipeline_velocity_avg()`, `v_grain_yoy_comparison` (current + prior year), and made Exports a composite metric in WoW comparison
3. **Delivery delta:** Documented as acceptable CGC rounding artifact

**Verification (Canola Week 31 vs CGC Excel):**
- Commercial stocks: 1,470.5 Kt ✓ (was 962.5)
- Exports CY: 4,585.8 Kt ✓ (was 4,484.3, Excel shows 4,586.7 — 0.9 Kt CGC rounding)
- Producer deliveries CW: 460.2 Kt ✓ (Excel: 460.1)
- Wheat, Barley, Oats also verified correct

**Prevention:**
- CGC "Exports" always means Terminal Exports + PSD Export Destinations + Producer Cars Export (3 components). Any new SQL/TypeScript that queries exports must include all three.
- CGC "Commercial Stocks" always means ALL Summary Stocks regions — never filter by region unless you explicitly want a subset.
- The fact that CLAUDE.md documented the correct formula didn't prevent the bug because the SQL was written before the documentation. New SQL must be audited against CLAUDE.md definitions before deployment.
- Run `npm run audit-data` after any pipeline SQL changes to catch definition drift.

**Files modified:**
- `lib/queries/observations.ts` (WoW comparison + StorageBreakdown)
- `supabase/migrations/20260315300000_fix_exports_and_stocks_definitions.sql`

**Tags:** #data-integrity #exports #stocks #cgc #pipeline #audit

## 2026-03-15 — Producer-Delivery Formula Drift Broke Week 31 Dashboard Totals

**Symptom:** Week 31 producer-delivery totals on the dashboard did not match the CGC workbook. For Canola, the CGC Summary sheet showed **460.1 Kt** current-week producer deliveries, while Bushel Board surfaced **455.6 Kt** in derived dashboard paths.

**Root Cause:** The repo had multiple competing definitions of "producer deliveries." The canonical framework doc was correct, but active SQL views/RPCs, repo AGENTS guidance, and skill docs still used an older `Primary + Process` shortcut. That shortcut omitted:
- `Primary.Deliveries` from **British Columbia**
- `Producer Cars.Shipments`

There was a second risk layered on top: some query helpers were not filtering `grade=''` on aggregate Primary rows, which can silently double-count grade detail rows. The local `gsw-shg-en.csv` cache was also stale at Week 30, so the audit path initially failed open instead of proving the mismatch against the live Week 31 source.

**Solution:**
1. Added `v_country_producer_deliveries` as the single canonical SQL definition
2. Rebuilt `v_grain_overview`, `v_grain_yoy_comparison`, `get_pipeline_velocity()`, `get_historical_average()`, `get_week_percentile()`, and `get_pipeline_velocity_avg()` on top of that canonical view
3. Hardened TypeScript helpers to require `grade=''` for aggregate Primary / Process / Producer Cars totals
4. Upgraded `scripts/audit-data.ts` to fall back to the live CGC CSV and to audit derived dashboard objects against the workbook Summary sheet
5. Updated AGENTS, agent docs, skills, and planning docs so the wrong formula is no longer documented as valid

**Prevention:**
- Define country producer deliveries in exactly two places only:
  - SQL: `v_country_producer_deliveries`
  - TypeScript: `lib/cgc/delivery-metrics.ts`
- Treat any query that says "Primary + Process" as incomplete unless it explicitly explains why Producer Cars and BC are excluded
- For aggregate Primary / Process / Producer Cars totals, decide explicitly between `grade=''` and per-grade rows; never leave grade handling implicit
- Never trust the local CGC CSV cache for a latest-week audit without checking whether the live source has advanced
- Do not run `npx supabase db push --linked` blindly when unrelated local migrations are still pending on the remote project

**Files modified:**
- `lib/cgc/delivery-metrics.ts`
- `lib/queries/observations.ts`
- `scripts/audit-data.ts`
- `supabase/migrations/20260315100000_fix_country_producer_deliveries.sql`
- `AGENTS.md`
- `docs/reference/data-sources.md`
- `docs/architecture/data-pipeline.md`

**Tags:** #data-integrity #deliveries #cgc #audit #documentation #migration-safety

## 2026-03-12 — v_grain_overview Statement Timeout From Full-Table Scan on 1M+ Rows

**Symptom:** The Overview page displayed "No grain data available yet" even though `v_grain_overview` contained 16 valid rows. No error was surfaced to the user.

**Root Cause:** The view's `latest_week` CTE used `GROUP BY crop_year` + `MAX(grain_week)` to find the current week, which forced Postgres to scan all 1M+ rows in `cgc_observations`. The query took 5.2 seconds, exceeding PostgREST's statement timeout for the `authenticated` role. The timeout caused the query to return no rows silently, triggering the empty-state fallback.

**Solution (migration `20260312180000_optimize_v_grain_overview.sql`):**
1. Added composite index `idx_cgc_obs_crop_year_grain_week (crop_year DESC, grain_week DESC)` on `cgc_observations`
2. Rewrote the `latest_week` CTE from `GROUP BY crop_year ORDER BY crop_year DESC LIMIT 1` to `ORDER BY crop_year DESC, grain_week DESC LIMIT 1` — this reads exactly 1 index entry via Index Only Scan (0 heap fetches) instead of scanning the full table

**Result:** Query time dropped from 5,200ms to 5.5ms (945x speedup).

**Prevention:**
- Any CTE or subquery against `cgc_observations` that uses `GROUP BY` + aggregate to find a single "latest" value should use `ORDER BY ... LIMIT 1` with a supporting index instead
- PostgREST statement timeouts fail silently from the client's perspective — always check whether an empty result could be a timeout rather than genuinely empty data
- Views that underpin primary dashboard pages should be tested with `EXPLAIN ANALYZE` after the table exceeds ~100K rows

**Files modified:**
- `supabase/migrations/20260312180000_optimize_v_grain_overview.sql`

**Tags:** #performance #postgresql #index #postgrest #timeout #overview

## 2026-03-12 — Hidden Scrollbar Styling Must Be Backed By A Real Local Utility

**Symptom:** The overview Community Pulse rail still showed a dated native horizontal scrollbar even though the component used a `scrollbar-hide` class.

**Root Cause:** The component assumed a `scrollbar-hide` utility existed, but this repo did not define one in `app/globals.css`. The browser therefore rendered its default scrollbar chrome, especially visibly on Windows.

**Solution:** Added an explicit `.scrollbar-none` utility in `app/globals.css` and rewired the overview signal rail to use that utility plus a custom scrubber/arrow treatment in `components/dashboard/compact-signal-strip.tsx`.

**Prevention:**
- Do not rely on utility-class names copied from prior projects unless they exist locally
- Any custom scroll treatment should be visually verified on Windows, where native scrollbar chrome is harder to ignore
- If a scrollbar is intentionally hidden, provide an explicit replacement affordance instead of relying on swipe discovery alone

**Files modified:**
- `app/globals.css`
- `components/dashboard/compact-signal-strip.tsx`

**Tags:** #ui #overview #scrollbar #windows #x-feed

## 2026-03-12 — Daylight Auth Variants Need Their Own Contrast Tokens

**Symptom:** The top third of the signup page became difficult to read in the daytime auth scene. The headline, description, and top-left chrome were too washed out against the pale gold background.

**Root Cause:** The auth shell reused a mostly white text/chip treatment that worked for the evening variant but did not hold enough contrast on the daylight gradient. The hero block also sat too close to the absolute-positioned brand chip at narrower widths.

**Solution:** Gave the daylight auth shell its own darker wheat text treatment, stronger badge/logo/proof-card styling, a subtle glass panel behind the hero copy, and extra top spacing in `components/auth/auth-shell.tsx`.

**Prevention:**
- Visual themes that change by time-of-day need separate contrast checks, not just palette swaps
- Absolute-positioned nav/brand chrome must be checked against hero spacing on narrower desktop widths
- Day and evening auth scenes should be visually QA'd in-browser as separate surfaces

**Files modified:**
- `components/auth/auth-shell.tsx`

**Tags:** #auth #signup #contrast #ui #daylight

## 2026-03-12 — Systemic Crop Year Format Mismatch (6 Competing Implementations)

**Symptom:** Historical RPCs (`get_historical_average`, `get_seasonal_pattern`, `get_week_percentile`) returned zero data. Intelligence tables (`grain_intelligence`, `x_market_signals`) couldn't join against `cgc_observations`. All cross-table queries silently returned empty results.

**Root Cause:** `cgc_observations` stores crop year in long format `"2025-2026"` (from CGC CSV), but `lib/utils/crop-year.ts` returned short format `"2025-26"`. There were 6 independent `getCurrentCropYear()` implementations: 1 in `lib/utils/crop-year.ts`, 5 in Edge Functions. Three Edge Functions used short format, creating a format split across all intelligence tables. 188 rows across 8 tables were written in short format that couldn't join to the 1.1M rows in `cgc_observations`.

**Solution:**
1. Standardized `lib/utils/crop-year.ts` to return long format `"2025-2026"`
2. Added `toShortFormat()` for display-only contexts
3. Fixed all 5 Edge Function `getCurrentCropYear()` implementations
4. Created migration `20260312130000` to convert 188 short-format rows to long format across 8 tables
5. Updated all tests to expect long format

**Prevention:**
- Crop year convention is now documented in CLAUDE.md and all agent docs
- `data-audit` agent is now a mandatory verification gate that checks format consistency
- Any shared utility that exists in multiple files must be grepped across the entire codebase when changed

**Tags:** #data-integrity #crop-year #cross-table-join #convention-mismatch

## 2026-03-12 — Primary-Only Historical Comparison Understates Deliveries by ~31%

**Symptom:** `get_historical_average()` for Canola Deliveries showed values ~31% lower than the YoY comparison view (`v_grain_yoy_comparison`), which combined Primary + Process worksheets.

**Root Cause:** `get_historical_average()` queried only `worksheet='Primary'` for deliveries. But crush-heavy grains like Canola send ~31% of deliveries directly to processors (tracked in the Process worksheet as "Producer Deliveries"). The YoY view correctly uses `FULL OUTER JOIN` of Primary + Process, but the historical RPC didn't.

**Solution:** Added a `CASE` expression: when `p_metric='Deliveries' AND p_worksheet='Primary'`, expand to `worksheet IN ('Primary', 'Process') AND metric IN ('Deliveries', 'Producer Deliveries')`. Applied same fix to `get_week_percentile()`.

**2026-03-15 correction:** `Primary + Process` was still an incomplete intermediate fix. The full country producer-delivery formula also requires:
- `Primary.Deliveries` from **AB, SK, MB, and BC**
- `Process.Producer Deliveries` national totals
- `Producer Cars.Shipments`

Treat any older doc or query that says "Primary + Process" as obsolete for producer-delivery totals.

**Prevention:** Any new RPC that aggregates deliveries must check whether Primary+Process combination is needed. See `v_grain_yoy_comparison` as the reference pattern.

**Tags:** #data-integrity #deliveries #primary-process #rpc

## 2026-03-12 — get_seasonal_pattern() GROUP BY Produces Multiple Rows in Scalar Function

**Symptom:** Would have caused runtime error on any call — function declared `RETURNS jsonb` (scalar) but `GROUP BY grain_week` produced multiple rows.

**Root Cause:** The function body had `GROUP BY grain_week` without wrapping the per-week results in an outer `jsonb_agg()`. PostgreSQL would error with "more than one row returned by a subquery used as an expression."

**Solution:** Wrapped per-week aggregation in a CTE (`weekly_agg`), then applied `jsonb_agg(... ORDER BY grain_week)` over the CTE to produce a single JSON array.

**Prevention:** Any `RETURNS jsonb` function must be verified to return exactly one row. A `GROUP BY` inside such a function is a red flag — it needs wrapping in `jsonb_agg()` or `jsonb_object_agg()`.

**Tags:** #postgresql #rpc #scalar-function #group-by

## 2026-03-12 — Agent Orchestration Failure: Zero Verification Gates Run

**Symptom:** 9 bugs shipped to production that should have been caught by existing agents.

**Root Cause:** Track #17 (12-task dual-LLM pipeline) was implemented in a single monolithic session without invoking any verification agents. The data-audit agent (designed to catch data integrity issues), security-auditor (designed to catch auth gaps), and documentation-agent (designed to maintain docs) were never run. The ultra-agent coordinator was never used to enforce workflow gates.

**Solution:**
1. Added mandatory DAG workflow to CLAUDE.md: Plan → Implement → Verify → Document → Ship
2. Upgraded data-audit agent to a mandatory verification gate
3. Upgraded security-auditor to a mandatory verification gate
4. Upgraded documentation-agent to a mandatory post-implementation gate
5. Added ultra-agent workflow enforcement with a critical lesson callout
6. Fixed stale conventions in agent docs (db-architect and data-audit had wrong crop year format)

**Prevention:** The mandatory workflow gates are now documented in CLAUDE.md and enforced through agent descriptions that explicitly state they MUST be invoked. The ultra-agent now includes a "CRITICAL LESSON" callout about Track #17.

**Tags:** #process #agent-orchestration #quality-gates #verification

## 2026-03-12 - CGC CSV Parser Used Positional Indexing Instead of Header Names

**Symptom:** Historical CGC CSV backfill (2020-2023) inserted 758K rows with `crop_year` values like `"1"`, `"2"`, `"3"` instead of `"2020-2021"`, `"2021-2022"`, etc. Historical RPC functions returned only 2 years of data instead of 5.

**Root Cause:** The CSV parser (`lib/cgc/parser.ts`) used hardcoded positional indexing (`parts[0]` = crop_year, `parts[1]` = grain_week). However, old CGC CSVs (2020-2023) have columns ordered `grain_week, crop_year, ...` while current CSVs (2024+) use `Crop Year, Grain Week, ...`. The swap put grain_week values (integers) into the crop_year field.

**Solution:** Changed the parser to build a column index map from the header row using case-insensitive, underscore-normalized header matching. Now detects column positions dynamically regardless of order: `const headerParts = lines[0].split(",").map(h => strip(h).toLowerCase().replace(/\s+/g, "_"))`. Deleted all bad rows (`WHERE crop_year NOT LIKE '____-____'`) and re-backfilled.

**Lesson:** CSV parsers should ALWAYS use header-name-based column mapping, never positional indexing. External data sources can change column order between years.

## 2026-03-11 - Hybrid Farm Units Need One Canonical Storage Unit

**Symptom:** Farmers plan and talk in a mix of `bu/ac`, pounds, and tonnes, but CGC and community comparisons are metric-tonne based. Without a canonical storage rule, the same crop could be entered in different units and become hard to compare honestly across dashboards, AI summaries, and analytics RPCs.

**Root Cause:** The crop-plan workflow originally assumed a single remaining-tonnes input. Once starting grain and yield calculations were added, the product needed to preserve the farmer's preferred unit while still normalizing data for government comparisons and percent-based analytics.

**Solution:** Added `inventory_unit_preference` and `bushel_weight_lbs` to `crop_plans`, converted all farmer-entered crop amounts to canonical metric tonnes before saving, and derived `bu/ac` plus `t/ac` from acres plus starting grain. Delivery logging now supports bushel entry too, but still stores canonical metric-tonne ledger rows.

**Prevention:**
- Choose one canonical storage unit for every workflow before adding multiple user-facing units
- Preserve the farmer's input preference separately from canonical numeric fields
- Treat bushel-weight assumptions as explicit data, not hidden app constants, whenever those assumptions affect yield or MT comparisons

**Files modified:**
- `app/(dashboard)/my-farm/actions.ts`
- `app/(dashboard)/my-farm/client.tsx`
- `components/dashboard/log-delivery-modal.tsx`
- `lib/utils/grain-units.ts`
- `supabase/migrations/20260312113000_crop_inventory_unit_preferences.sql`

**Tags:** #data-model #units #yield #crop-plans

## 2026-03-11 - Dashboard Brand Links Must Not Bounce Through Public Landing Routes

**Symptom:** The top-left dashboard brand chip looked empty, and clicking it briefly flashed the prairie landing page before returning to the dashboard. Users experienced it as a broken nav control rather than a purposeful transition.

**Root Cause:** The shared dashboard nav linked its brand control to `/`, which is the public landing page. The landing page then checked auth client-side and redirected back into the product after render. At the same time, the header used the full lockup SVG at a very small nav size, so the brand was not legible enough to read as a logo.

**Solution:** Changed the dashboard brand control to use the compact mark and route directly to the signed-in user's role-aware home. Moved authenticated `/` handling into a server redirect in `app/page.tsx`, so signed-in users no longer render the public landing page first. Added a shared day/evening auth shell so prairie visual treatment on auth routes is intentional rather than a side effect of bouncing through `/`.

**Prevention:**
- Treat dashboard brand controls as in-app home links, not generic site-home links
- Server-redirect authenticated users away from public marketing routes before render
- Use mark-sized brand assets in compact nav surfaces; reserve full lockups for larger hero placements

**Files modified:**
- `app/page.tsx`
- `components/landing/landing-page.tsx`
- `components/layout/nav.tsx`
- `components/layout/logo.tsx`
- `components/auth/`
- `lib/auth/auth-scene.ts`

**Tags:** #ux #navigation #branding #auth

## 2026-03-10 - Pipeline Velocity Chart: Silent Data Truncation

**Symptom:** Pipeline Velocity chart showed flat lines for Terminal Receipts and Terminal Exports. Terminal Receipts displayed ~4,226 kt at week 20 instead of the correct 11,087 kt. Lines appeared to stop increasing around week 8, and "lower totals plotted above higher totals."

**Root Cause:** Supabase's PostgREST enforces a server-side `max_rows=1000` limit on all queries. The Terminal Receipts and Terminal Exports worksheets in `cgc_observations` store data per-grade per-region (no pre-aggregated `grade=''` rows like Primary does), producing far more rows than the limit:

| Metric | Row count | Over limit? |
|--------|----------|-------------|
| Terminal Receipts (Wheat) | 3,648 | 3.6x over (20 grades x 6 ports x 30 weeks) |
| Terminal Exports (Wheat) | 1,050 | Slightly over (6 grades x 6 ports x 30 weeks) |
| Primary Deliveries | 90 | OK (3 provinces x 30 weeks, grade='' aggregates) |
| Processing | 30 | OK (national total, grade='' aggregates) |

PostgREST silently truncated the response - no error, no warning. The client code received 1,000 out of 3,648 rows (~first 8 weeks), summed them correctly, then the forward-fill logic carried the last known value flat for remaining weeks.

**Why `.limit(10000)` didn't work:** PostgREST's `max_rows` config acts as an upper ceiling. The client `.limit()` sets a `Range` header, but the server caps it at `max_rows=1000` regardless.

**Solution:** Created `get_pipeline_velocity(p_grain, p_crop_year)` RPC function (migration `20260310200000_pipeline_velocity_rpc.sql`) that aggregates all 5 metrics in PostgreSQL using `SUM() GROUP BY grain_week`. Returns exactly 30 rows per grain instead of 3,648+. Updated `getCumulativeTimeSeries()` in `lib/queries/observations.ts` to call this RPC.

**Additional fix:** Added `Number()` coercion for `ktonnes` values (Postgres `numeric` type may return as strings from PostgREST). Fixed tooltip formatter in `gamified-grain-chart.tsx` to show series names instead of blank labels.

**Prevention:**
- Always check row counts when querying denormalized/long-format tables with `.select()`
- If a query could exceed ~500 rows, prefer a server-side RPC with `GROUP BY`
- CGC Terminal Receipts and Terminal Exports have NO `grade=''` aggregate rows - must always sum across grades
- Test Pipeline Velocity with Wheat first (highest row count: ~3,648 for Terminal Receipts)

**Files modified:**
- `lib/queries/observations.ts` - replaced 5 client queries with single RPC call
- `components/dashboard/gamified-grain-chart.tsx` - fixed tooltip to show series names
- `supabase/migrations/20260310200000_pipeline_velocity_rpc.sql` - new RPC function

**Tags:** #supabase #postgrest #data-truncation #chart #pipeline-velocity #rpc

## 2026-03-10 - Internal Pipeline Auth Was Public-by-Default

**Symptom:** The weekly intelligence chain could be triggered by anyone who knew the function URLs because function-to-function calls used the public anon JWT.

**Root Cause:** Edge Functions were chained over HTTP with `Authorization: Bearer $SUPABASE_ANON_KEY` semantics, and the functions trusted that relay path as if it were private. In practice, the anon JWT is public and `verify_jwt = true` only proved the caller was anonymous, not internal.

**Solution:** Made the Vercel cron route the only public ingress, unscheduled the legacy `pg_cron` job, set the internal pipeline functions to `verify_jwt = false`, and required a shared `x-bushel-internal-secret` backed by `BUSHEL_INTERNAL_FUNCTION_SECRET`.

**Prevention:**
- Never use anon JWTs for internal workflow auth
- Any `verify_jwt = false` function must require an internal secret
- Keep the same internal secret in Vercel and Supabase

**Files modified:**
- `app/api/cron/import-cgc/route.ts`
- `supabase/functions/_shared/internal-auth.ts`
- `supabase/functions/import-cgc-weekly/index.ts`
- `supabase/functions/validate-import/index.ts`
- `supabase/functions/search-x-intelligence/index.ts`
- `supabase/functions/generate-intelligence/index.ts`
- `supabase/functions/generate-farm-summary/index.ts`
- `supabase/config.toml`
- `supabase/migrations/20260311110000_security_and_workflow_hardening.sql`

**Tags:** #security #edge-functions #vercel-cron #supabase

## 2026-03-10 - UI-Only Role Gating Is Not Authorization

**Symptom:** Observer accounts were hidden from farmer actions in the UI but could still mutate crop plans, deliveries, sentiment votes, and signal feedback by invoking server actions directly.

**Root Cause:** The role split was implemented primarily in the interface. Server actions only checked authentication, and RLS policies only checked row ownership.

**Solution:** Added deny-by-default role resolution in `lib/auth/role-guard.ts`, enforced farmer-only writes in server actions, and updated RLS to require both `auth.uid() = user_id` and `profiles.role = 'farmer'`.

**Prevention:**
- Never trust UI gating as the final write guard
- Every farmer-only workflow needs matching server-action and RLS enforcement
- Missing profiles must default to observer/deny

**Files modified:**
- `lib/auth/role-guard.ts`
- `app/(dashboard)/my-farm/actions.ts`
- `app/(dashboard)/grain/[slug]/actions.ts`
- `app/(dashboard)/grain/[slug]/signal-actions.ts`
- `supabase/migrations/20260311110000_security_and_workflow_hardening.sql`

**Tags:** #security #rls #authorization #server-actions

## 2026-03-10 - Remaining Inventory Was Treated As Total Plan Volume

**Symptom:** Delivery pace bars, analytics, and percentiles overstated or understated progress because the app divided deliveries by `volume_left_to_sell_kt`, even though that field stores current remaining inventory.

**Root Cause:** The UI wording and the stored column were changed to "remaining to sell," but the downstream math still assumed the field represented the original total target.

**Solution:** Standardized pace calculations on `delivered + remaining_to_sell`, updated UI copy to match, and moved the same denominator into `calculate_delivery_percentiles()` and `get_delivery_analytics()`.

**Prevention:**
- Treat `volume_left_to_sell_kt` as a live state field, not a static plan field
- Keep one shared utility for UI pace math
- Mirror the same formula in SQL analytics and percentile logic

**Files modified:**
- `lib/utils/crop-plan.ts`
- `tests/lib/crop-plan.test.ts`
- `app/(dashboard)/my-farm/client.tsx`
- `components/dashboard/delivery-pace-card.tsx`
- `supabase/functions/generate-farm-summary/index.ts`
- `supabase/migrations/20260311110000_security_and_workflow_hardening.sql`

**Tags:** #ux #analytics #data-integrity #crop-plans

## 2026-03-11 - Hardcoded Supply Source Names Rot Fast

**Symptom:** Supply disposition queries depended on a hardcoded source string (`AAFC_2025-11-24`), which would go stale as soon as the next AAFC refresh used a different source name.

**Root Cause:** The app queried `supply_disposition` directly with a fixed source literal instead of selecting the current canonical source per grain and crop year.

**Solution:** Added `v_supply_disposition_current` to rank sources by AAFC preference and latest `created_at`, then moved the query layer to read from that view instead of hardcoding a source string.

**Prevention:**
- Do not hardcode date-stamped source identifiers in app queries
- Select a canonical source in SQL whenever multiple snapshots can exist
- Keep `.single()` calls paired with a view that guarantees one row

**Files modified:**
- `supabase/migrations/20260311113000_delivery_ledger_and_canonical_supply.sql`
- `lib/queries/supply-disposition.ts`

**Tags:** #data-integrity #supply-disposition #query-layer

## 2026-03-11 - JSONB Delivery Logs Were Not Idempotent Or Auditable

**Symptom:** Delivery logging appended directly to `crop_plans.deliveries`, so double-submit races created duplicate entries and there was no append-only audit record behind the farmer-facing ledger.

**Root Cause:** Deliveries were stored as a mutable JSONB array inside `crop_plans`, which is convenient for reads but weak for idempotency, history, and operational debugging.

**Solution:** Added `crop_plan_deliveries` as an append-only delivery ledger with `submission_id` idempotency keys, then synchronized `crop_plans.deliveries` from that table as a compatibility projection.

**Prevention:**
- User-submitted event logs should use append-only rows, not only embedded JSON blobs
- Idempotency should use per-submission keys, not best-effort value matching
- Keep cached JSON projections as derived state, not the source of truth

**Files modified:**
- `supabase/migrations/20260311113000_delivery_ledger_and_canonical_supply.sql`
- `app/(dashboard)/my-farm/actions.ts`
- `components/dashboard/log-delivery-modal.tsx`

**Tags:** #data-integrity #idempotency #audit-trail #crop-plans

## 2026-03-11 - Fallback Grains Must Not Masquerade As Unlocked Personalization

**Symptom:** The overview used fallback grains for empty-plan farmers, but the cards looked unlocked and linked into grain pages that then hard-locked. The app felt misleading at the exact moment a skeptical farmer was deciding whether to trust it.

**Root Cause:** The app treated "which grains should we display?" and "which grains has this farmer actually unlocked?" as the same decision. That blurred sample market content and personalized entitlement state.

**Solution:** Split the overview into an explicit `ActiveGrainContext` with separate `activeGrains`, `unlockedSlugs`, and `isPersonalized` fields. Locked overview cards now route to `My Farm`, the page copy explains why farm data sharpens the product, and post-auth flows for farmers land on `My Farm` first instead of `Overview`.

**Prevention:**
- Keep fallback content and unlock state as separate concepts in code
- If a downstream route is locked, upstream summary cards must route to setup, not to the locked destination
- Empty states must explain the next unlock and the value unlocked by completing it

**Files modified:**
- `lib/auth/post-auth-destination.ts`
- `app/(auth)/login/page.tsx`
- `app/(auth)/signup/page.tsx`
- `components/landing/landing-page.tsx`
- `app/(dashboard)/overview/page.tsx`
- `app/(dashboard)/my-farm/page.tsx`
- `app/(dashboard)/my-farm/client.tsx`
- `components/dashboard/farm-summary-card.tsx`

**Tags:** #ux #onboarding #trust #personalization

## 2026-03-11 - Summarized Social Signals Need Canonical Source Links

**Symptom:** X signal cards summarized posts and asked farmers to vote on relevance, but users could not click through to verify the original source. That created unnecessary trust friction in the most subjective part of the product.

**Root Cause:** The ingestion pipeline stored summary, author, and date, but not the canonical post URL. Frontend components therefore had to fall back to summaries alone and could not reliably deep-link to the source post.

**Solution:** Added `post_url` to `x_market_signals`, extended `search-x-intelligence` to request and store canonical X URLs, exposed the field through signal RPCs, and added outbound "Open post" links to both the ticker and the main X feed.

**Prevention:**
- Any summarized third-party content should store a canonical outbound URL at ingest time
- Trust-sensitive cards should always let the user verify the source directly
- If the exact URL is unavailable, fall back to a search URL that includes the author when possible

**Files modified:**
- `supabase/functions/search-x-intelligence/index.ts`
- `supabase/migrations/20260311121500_x_market_signal_post_urls.sql`
- `lib/queries/x-signals.ts`
- `components/dashboard/signal-tape.tsx`
- `components/dashboard/x-signal-feed.tsx`

**Tags:** #ux #x-feed #trust #data-model

## 2026-03-11 - Full Logo Lockups Should Not Be Paired With A Second Wordmark

**Symptom:** The dashboard header looked broken and "tacky" because the navigation rendered the full Bushel Board lockup SVG and also rendered a separate `Bushel Board` text label beside it. In narrower widths this made the wordmark wrap and visually collide with the nav pills.

**Root Cause:** `public/logo.svg` already contains the Bushel Board wordmark and subtitle, but the shared nav treated `Logo` like an icon-only mark and added another text span next to it.

**Solution:** Normalized the `Logo` component to preserve the lockup aspect ratio, removed the duplicate nav text, and let the header brand render as a single lockup chip.

**Prevention:**
- Know whether a brand asset is a mark-only asset or a full lockup before pairing it with text
- If a header uses the full lockup, never render a second adjacent wordmark
- Test header composition at medium widths, not only wide desktop

**Files modified:**
- `components/layout/logo.tsx`
- `components/layout/nav.tsx`
- `components/layout/desktop-nav-links.tsx`

**Tags:** #ui #branding #navigation

## 2026-03-11 - Social Feed Previews Need To Look Like Posts, Not Motion Widgets

**Symptom:** The overview X section looked like a decorative ribbon instead of a trustworthy source surface. Farmers were being asked to trust a moving tape rather than recognizable post previews.

**Root Cause:** The component optimized for movement and density instead of recognizability. The result looked more like a market ticker than a source feed.

**Solution:** Replaced the ticker treatment with compact post-style cards that show grain context, author handle when available, sentiment, summary, and an explicit outbound action.

**Prevention:**
- Trust-sensitive content should resemble the source it summarizes
- Prefer readable cards over animated ribbons when the user may want to verify the source
- Motion should support scanning, not replace information hierarchy

**Files modified:**
- `components/dashboard/signal-tape.tsx`

**Tags:** #ux #ui #x-feed #trust

## 2026-03-11 - Supporting Social Context Should Stay Visually Subordinate To Core Market Data

**Symptom:** The grain-page X feed became readable and source-verifiable, but the first card treatment consumed too much vertical and visual space. The section started competing with the CGC and farm metrics instead of supporting them.

**Root Cause:** The redesign corrected the "ticker" problem by making the cards look more like posts, but overshot on card size, padding, and follow-on helper banners.

**Solution:** Compacted the feed into slimmer horizontally scrollable post cards, reduced summary depth to two lines, turned feedback states into small pills, and removed the extra full-width helper chrome so the section reads as secondary context.

**Prevention:**
- On analytics-heavy pages, supporting content should be glanceable first and explorable second
- When converting a ribbon into cards, revisit size hierarchy so the new treatment does not become the new primary module
- Keep trust cues, but compress them into lightweight inline affordances when the page already contains large data blocks

**Files modified:**
- `components/dashboard/x-signal-feed.tsx`

**Tags:** #ux #ui #x-feed #hierarchy

## 2026-03-11 - A Grain Page Should Have One Social Surface, Not Two

**Symptom:** The grain page showed X-derived content twice: once as a top preview strip near the thesis and again as the full interactive signal feed later on. Even after compacting the cards, the repeated presence still made the page feel cluttered and logically messy.

**Root Cause:** The app reused both the overview-style preview treatment and the dedicated grain-page feed on the same screen. That duplicated the source layer instead of clarifying it.

**Solution:** Removed the top `SignalTape` from the grain detail page and kept one dedicated X evidence/feed section lower in the page. The overview still uses the lighter cross-grain social preview, while grain detail now has a single source-of-truth social module.

**Prevention:**
- Distinguish clearly between overview preview components and detail-page evidence components
- Do not render two views of the same source data on the same page unless they answer different user questions
- On detail pages, supporting context should appear once in the hierarchy with a clear purpose

**Files modified:**
- `app/(dashboard)/grain/[slug]/page.tsx`

**Tags:** #ux #hierarchy #x-feed #grain-page

## 2026-03-11 - Delivery Ledgers Need Sale Classification, Not Just Volume

**Symptom:** The product could show deliveries and a remaining balance, but it could not honestly tell the farmer how much of the crop was contracted versus still open once deliveries started posting. Every new load made contract metrics drift.

**Root Cause:** `crop_plan_deliveries` stored amount and destination, but not whether the load was delivered against a contract or sold into the open market. That meant the system had no defensible way to decrement `contracted_kt` versus `uncontracted_kt`.

**Solution:** Added `marketing_type` to the delivery ledger, required new deliveries to be classified as `contracted` or `open`, and moved the crop-plan state update into a database trigger so `volume_left_to_sell_kt`, `contracted_kt`, and `uncontracted_kt` stay synchronized automatically.

**Prevention:**
- If a downstream metric depends on the type of transaction, capture that classification at write time
- Do not try to infer contract posture from delivery volume alone once real farmer decisions diverge
- Keep the append-only ledger canonical and derive cached UI projections from it

**Files modified:**
- `supabase/migrations/20260312110000_crop_inventory_marketing_tracking.sql`
- `app/(dashboard)/my-farm/actions.ts`
- `components/dashboard/log-delivery-modal.tsx`

**Tags:** #data-model #delivery-ledger #contracts #marketing

## 2026-03-11 - CGC Region Names Are Not Unique Keys

**Symptom:** React duplicate key warnings in the SupplyPipeline domestic breakdown after folding in domestic disappearance data. The console showed "two children with the same key: Pacific."

**Root Cause:** `getShipmentDistribution()` returns multiple rows with the same `region` value (e.g., "Pacific" appears for both terminal receipts and exports). The component used `key={d.region}` assuming region names were unique.

**Solution:** Changed to `key={`${d.region}-${i}`}` with array index suffix to guarantee uniqueness.

**Prevention:**
- CGC region names are descriptive labels, not unique identifiers — never use them as React keys
- When rendering lists from aggregated CGC data, always include an index or composite key
- Test collapsible sections with grains that have duplicate region rows (Canola is a good candidate)

**Files modified:**
- `components/dashboard/supply-pipeline.tsx`

**Tags:** #react #cgc-data #keys #supply-pipeline

## 2026-03-11 - HMR Does Not Clear Stale React Trees After Client Directive Changes

**Symptom:** After fixing the duplicate key bug, console errors persisted even though the source code was correct. The errors only cleared after a full dev server restart.

**Root Cause:** When a component gains or changes its `"use client"` directive, Hot Module Replacement may not fully unmount and remount the React tree. Stale component instances continue to render with old key logic.

**Solution:** Stopped and restarted the dev server to force a clean React tree rebuild.

**Prevention:**
- After adding/modifying `"use client"` directives or changing component key strategies, restart the dev server
- Don't debug console errors from stale HMR state — restart first, then investigate
- Preview verification should include a server restart step when `"use client"` changes are involved

**Files modified:** (none — operational fix)

**Tags:** #hmr #next.js #debugging #dev-server

## 2026-03-12 — CGC Freshness Badge Shows Historical Backfill Instead of Current Data

**Symptom:** App header displayed "CGC Wk 52 · 2023-2024" instead of "CGC Wk 30 · 2025-2026".

**Root cause:** `cgc-freshness.tsx` queried `cgc_imports` with `ORDER BY imported_at DESC`. Historical backfill imports (2020-2024) ran on March 12 and received newer `imported_at` timestamps than the actual current 2025-2026 Week 30 import from March 9. The query returned the most recently *imported* row, not the most *current* data.

**The lesson:** `imported_at` (wall-clock time of the job) ≠ logical data time (`crop_year`, `grain_week`). Any query that wants "the latest data" must order by the data's own temporal columns, not the import timestamp. Backfills, re-imports, and reconciliation jobs will always break timestamp-based ordering.

**Fix:** Changed ordering from `.order("imported_at", { ascending: false })` to `.order("crop_year", { ascending: false }).order("grain_week", { ascending: false })`. The `imported_at` field is still used for the freshness dot (green pulse vs amber) since that correctly reflects data staleness.

**Files modified:** `components/layout/cgc-freshness.tsx`

**Tags:** #freshness #ordering #backfill #cgc-imports

## 2026-03-13 — Supplementary Data Pipeline Added (Grain Monitor & Producer Cars)

**Scope:** Added a secondary logistics-focused data pipeline to supplement the core CGC weekly grain data.

**What was added:**
1. **New Supabase tables:**
   - `grain_monitor_snapshots` — system-wide logistics per grain week from Government Grain Monitor PDFs (port throughput, grain-in-storage, etc.)
   - `producer_car_allocations` — per-grain forward-looking rail car data from CGC Producer Car reports (advance allocations for future weeks)

2. **New RPC function:**
   - `get_logistics_snapshot(crop_year, grain_week)` — returns both tables' data as structured JSON for Edge Function integration

3. **Enhanced commodity knowledge:**
   - Updated `commodity-knowledge.ts` with two new sections: "Marketing Strategy & Contract Guidance" and "Logistics & Transport Awareness" (~1.5K tokens, total now ~5.5K)
   - Applied to both `analyze-market-data` and `generate-intelligence` prompts for context-aware logistics discussion

4. **Pipeline integration:**
   - Updated `market-intelligence-config.ts` version bumps: v4 for analyzeMarketData and generateIntelligence, v3 for knowledgeBase
   - `analyze-market-data` fetches logistics snapshot and injects into Step 3.5 Flash prompts
   - `generate-intelligence` receives logistics data in Grok prompts via updated `GrainContext` interface

5. **Data insertion:**
   - Week 30 Grain Monitor data (2025-2026 crop year, 1-week lagged: used for Week 31 analysis)
   - Week 33 Producer Car allocations (2025-2026 crop year, 2-week forward: for Week 31 analysis)
   - Manually inserted for now — automated scraping not yet implemented

6. **Migration file:**
   - `supabase/migrations/20260313120000_create_grain_monitor_and_producer_cars.sql` creates tables, RPC, and indexes

**Known Data Issues:**
- **Grain name mapping:** `producer_car_allocations` uses CGC commodity naming (e.g., "Durum") while `grains` table uses full names (e.g., "Amber Durum"). Grain disambiguation will be needed when joining these tables in future analysis queries.
- **Producer car cumulative semantics:** Data is cumulative forward-looking, not weekly-only. The RPC returns the latest available week ≤ `grain_week + 3` to ensure allocations don't "age out" mid-analysis.

**Prevention:**
- Grain name mismatches between external data sources and the canonical `grains` table should be documented at ingest time
- Forward-looking data (allocations, forecasts) and historical data (observations) need explicit time-semantic clarity in both schema and query documentation

**What remains:**
- Automated scraping from Government Grain Monitor PDFs and CGC Producer Car reports
- Historical backfill of older grain monitor and producer car data
- UI display components for logistics data (charts, summary tiles, context cards)

**Files modified:**
- `supabase/migrations/20260313120000_create_grain_monitor_and_producer_cars.sql` (new)
- `supabase/functions/_shared/commodity-knowledge.ts`
- `supabase/functions/_shared/market-intelligence-config.ts`
- `supabase/functions/analyze-market-data/index.ts`
- `supabase/functions/generate-intelligence/index.ts`
- `supabase/functions/generate-intelligence/prompt-template.ts`
- `lib/queries/observations.ts` (added `logisticsSnapshot` field to GrainContext)

**Tags:** #data-pipeline #logistics #government-data #supplementary-sources #commerce-context

## 2026-03-13 — Producer Car Grain Names Don't Match Canonical Grains Table

**Symptom:** QC check found that `producer_car_allocations` grain names ("Durum", "Chickpeas") didn't match the canonical `grains` table names ("Amber Durum", "Chick Peas"), causing silent JOIN failures in the `get_logistics_snapshot()` RPC.

**Root Cause:** CGC Producer Car reports use abbreviated commodity names that differ from the CGC weekly grain statistics CSV naming convention used in `grains`. No validation or mapping layer existed at ingest time.

**Solution:** Applied SQL UPDATEs to normalize names:
```sql
UPDATE producer_car_allocations SET grain = 'Amber Durum' WHERE grain = 'Durum';
UPDATE producer_car_allocations SET grain = 'Chick Peas' WHERE grain = 'Chickpeas';
```
Buckwheat left unmatched (minor grain, not in the tracked 16 Canadian grains).

**Prevention:**
- Every new external data source must have a grain-name mapping validation at ingest time
- Document known name discrepancies between CGC report types (weekly CSV vs producer car reports vs grain monitor)
- Future automated ingestion scripts should include a `CASE WHEN` or lookup table to normalize grain names before INSERT

**Tags:** #data-integrity #grain-naming #producer-cars #external-data

## 2026-03-13 — AI Thesis Contradiction: Step 3.5 Flash Bearish vs Grok Bullish on Canola

**Symptom:** The dual-LLM pipeline produced contradictory Canola Week 31 theses — Step 3.5 Flash called bearish (YTD exports -28% YoY), Grok called bullish (stock drawdown shows demand). A farmer reading both would receive conflicting advice.

**Root Cause:** Step 3.5 Flash anchored on cumulative YTD export position without checking whether current-week flow contradicted the conclusion. Three specific errors: (1) conflating YTD position with current flow, (2) ignoring stock draw as a bullish signal, (3) missing the logistics constraint explanation for weak exports.

**Resolution:** Claude moderated the debate using evidence: Week 31 stocks drew -175.6 Kt while 455.6 Kt of deliveries came in, implying 631 Kt absorbed in one week. Vancouver port at 107% capacity (26 vessels vs avg 20, 19.2% out-of-car time) explains the export lag. Corrected thesis: bullish with timing risk, not bearish.

**New references created:**
- `docs/lessons-learned/canola-week31-debate-moderation.md` — full moderation ruling with evidence
- `docs/reference/agent-debate-rules.md` — 8 codified rules for continuous agent improvement

**Prevention:**
- Added flow coherence rules to the pipeline: if thesis says bearish but stocks are drawing, flag the contradiction before publishing
- Added logistics data integration so both models can see port congestion, vessel queues, and out-of-car time
- Codified the "2 of 3 weeks confirmation" rule — don't wait for 2-3 more weeks when the data already shows a pattern

**Tags:** #ai-pipeline #thesis-quality #dual-llm #debate-moderation #canola

## 2026-03-13 — Phantom Migration: knowledge_corpus Recorded But DDL Never Executed

**Symptom:** `knowledge_documents` and `knowledge_chunks` tables did not exist in production, but `supabase_migrations.schema_migrations` showed version `20260312170000` as applied. Edge Functions calling `get_knowledge_context()` RPC silently returned empty results (function also didn't exist).

**Root cause:** Unknown — likely `supabase db push` marked the migration as applied after a transient error. The migration's `GENERATED ALWAYS AS` column with `to_tsvector()` would have failed because `to_tsvector(regconfig, text)` is `STABLE`, not `IMMUTABLE`. PostgreSQL requires `IMMUTABLE` expressions in generated columns. The error may have been swallowed.

**Fix:** Ran the DDL directly via Supabase MCP SQL. Replaced the `GENERATED ALWAYS AS` tsvector column with a trigger-based approach (`BEFORE INSERT OR UPDATE` trigger that populates `search_vector`). Updated the local migration file to match.

**Prevention:**
- Always verify tables exist after `supabase db push` — don't trust the migration history table alone
- Use `SELECT count(*) FROM <table>` as a smoke test after applying migrations
- For full-text search columns, prefer trigger-based tsvector over generated columns (Postgres classifies `to_tsvector` and `setweight` as STABLE, not IMMUTABLE)

**Tags:** #migration #supabase #postgresql #full-text-search #phantom-migration

## 2026-03-13 — Wrong xAI Model ID: grok-4-20 Does Not Exist

**Symptom:** `generate-intelligence` Edge Function returned 400 error: `"Model not found: grok-4-20"`. Canola intelligence generation failed.

**Root cause:** The xAI API uses a different naming convention than expected. The correct model ID for Grok 4.20 beta with reasoning is `grok-4.20-beta-0309-reasoning`, not `grok-4-20`. The model name includes dots, the beta tag, a date suffix, and a reasoning/non-reasoning mode suffix.

**Fix:** Updated the MODEL constant in `generate-intelligence/index.ts` to `grok-4.20-beta-0309-reasoning` and redeployed.

**Prevention:**
- Always verify model IDs against the official docs page (`docs.x.ai/developers/models`) before deploying
- xAI model naming pattern: `grok-{major}.{minor}-{variant}-{date}-{mode}`
- Consider storing model IDs in a configuration table or env var rather than hardcoding, so they can be updated without code deploys

**Tags:** #xai #grok #model-id #edge-function #api

## 2026-03-14 — CFTC Cron Was Disconnected From Intelligence Pipeline

**Symptom:** Friday CFTC COT import (`import-cftc-cot`) ran successfully but the intelligence pipeline (`analyze-market-data` → `generate-intelligence`) never re-ran. Farmers saw intelligence cards without COT context until the next weekly Thursday run.

**Root cause:** The CFTC cron route (`app/api/cron/import-cftc-cot/route.ts`) only called `import-cftc-cot` and returned — it didn't chain to downstream functions like the CGC Thursday pipeline does. The Thursday pipeline runs before CFTC data is available (CFTC publishes Friday), so the weekly intelligence never included COT positioning.

**Fix:** Added chain trigger in the cron route: after successful CFTC import, fire `analyze-market-data` which auto-chains to `generate-intelligence`. This re-runs the dual-LLM pipeline with COT data now available.

**Prevention:**
- Any new data source cron must chain to the intelligence pipeline if the data feeds into LLM analysis
- Document the canonical pipeline chain in CLAUDE.md when adding new ingress points

**Tags:** #cftc #cron #pipeline #chain-trigger #intelligence

## 2026-03-14 — get_cot_positioning() Leaked Future Data Into Historical Reruns

**Symptom:** Regenerating Week 30 intelligence after Week 32 COT data arrived would include Week 31-32 positioning data in the analysis — making historical intelligence non-reproducible.

**Root cause:** The `get_cot_positioning()` RPC only filtered by `p_grain` and `p_crop_year`, then `ORDER BY report_date DESC LIMIT p_weeks_back`. No upper bound on grain_week meant reruns could "see the future."

**Fix:** Added `p_max_grain_week` parameter (DEFAULT NULL for backwards compatibility). Both `analyze-market-data` and `generate-intelligence` now pass `p_max_grain_week: grainWeek` to scope COT data to the target analysis week.

**Prevention:**
- All time-series RPCs used by the intelligence pipeline must accept an "as-of" bound parameter
- Historical reproducibility should be a test case: "regenerating week N later produces the same data inputs"

**Tags:** #cftc #rpc #reproducibility #time-series #intelligence

## 2026-03-14 — CFTC Parser Field Names Mismatched Live SODA API Schema

**Symptom:** `managed_money_spread`, `traders_prod_merc_long/short`, and `traders_other_long` columns were silently null in `cftc_cot_positions` despite the upstream CFTC API having valid data.

**Root cause:** The parser interface (`CftcApiRow`) used field names that don't match the live `kh3c-gbw2` SODA endpoint:
- `m_money_positions_spread_all` → actual: `m_money_positions_spread` (no `_all` suffix)
- `traders_prod_merc_long` → actual: `traders_prod_merc_long_all` (missing `_all`)
- `traders_other_rept_long` → actual: `traders_other_rept_long_all` (missing `_all`)
- `traders_swap_long_all` / `short_all` / `spread_all` → don't exist in disaggregated dataset at all

**Fix:** Corrected field names in `CftcApiRow` interface and `parseCftcCotRows()` mapping. Swap trader counts hardcoded to null (not available in this dataset).

**Prevention:**
- Validate parser output against a live API response during integration testing
- Add a smoke test that fetches one CFTC row and asserts non-null values for key positioning fields

**Tags:** #cftc #parser #soda-api #field-mapping #silent-null

## 2026-03-13 — Dashboard Overhaul Data Audit Findings

Four findings from a systematic audit of the dashboard data layer during the Dashboard Overhaul work.

### Finding 1: Logistics Tables Have No Import Pipeline (HIGH)

**Symptom:** `LogisticsCard` shows empty state. AI intelligence narratives lack logistics context (port throughput, vessel queues, producer car allocations).

**Root cause:** `grain_monitor_snapshots` and `producer_car_allocations` tables exist with proper schema, and the `get_logistics_snapshot()` RPC is consumed by `analyze-market-data` and `generate-intelligence` Edge Functions — but there is NO automated import mechanism. No Edge Function, no cron job, and no script exists to populate these tables. They are likely empty in production.

**Impact:** HIGH. The logistics data path is fully wired (schema, RPC, AI prompts, UI card) but has no data source. This is a silent gap — no errors are thrown, the system simply operates without logistics context.

**Fix needed:** Build an import Edge Function that fetches Grain Monitor and Producer Car data, plus a cron trigger to run it on a regular schedule.

**Tags:** #data-pipeline #logistics #grain-monitor #producer-cars #missing-import

### Finding 2: Oats Missing from CFTC COT Mapping (MEDIUM)

**Symptom:** Oats intelligence narratives have no CFTC COT positioning context, even though CME trades Oats futures which are reported in CFTC COT data.

**Root cause:** The CFTC parser in `supabase/functions/_shared/cftc-cot-parser.ts` maps CME commodity names to CGC grain names, but Oats is not included in the mapping. 10 of 16 CGC grains correctly lack COT data (no futures contracts exist), but Oats is a genuine gap.

**Fix:** Add `{ "OATS": { cgcGrain: "Oats", mappingType: "primary" } }` to the commodity-to-grain mapping in the CFTC parser.

**Tags:** #cftc #parser #oats #mapping-gap

### Finding 3: AAFC Supply Data Static from November 2025 (MEDIUM)

**Symptom:** Supply pipeline card shows AAFC balance sheet data sourced from November 2025. By March 2026, carry-out and export estimates may be stale.

**Root cause:** Data was seeded via `scripts/seed-supply-disposition.ts` with source `AAFC_2025-11-24`. AAFC typically publishes 2-3 updated Outlooks per crop year, but there is no automated refresh mechanism — re-seeding is a manual process.

**Fix:** Re-run the seed script with updated AAFC numbers when a new Outlook is published. Consider adding an observability check that flags when supply data is more than 3 months old.

**Tags:** #aafc #supply-disposition #data-freshness #manual-process

### Finding 4: Deliveries WoW Redundancy Resolved (LOW — CLOSED)

**Prior issue:** Deliveries data was shown in 3 components simultaneously (NetBalanceKpi, IntelligenceKpis, WoWComparisonCard), creating visual redundancy on the grain detail page.

**Resolution:** The WS4 grain detail page restructure removed NetBalanceKpi and moved WoWComparisonCard into an expandable accordion. The remaining redundancy (IntelligenceKpis headline number + WoW table detail) is intentional — KPIs serve as a quick-scan summary while the WoW table provides detailed week-over-week context.

**Tags:** #ux #redundancy #resolved #grain-detail

## 2026-03-13 — Import Pipeline Build: Producer Cars + Grain Monitor

### Finding 5: CGC Blocks Supabase Edge Function IPs (HIGH — RESOLVED)

**Symptom:** The `import-producer-cars` Edge Function returned `error sending request for url: Connection reset by peer (os error 104)` when trying to fetch the CGC Producer Car CSV from `grainscanada.gc.ca`.

**Root cause:** The CGC website blocks connections from Supabase Edge Function IPs (AWS us-west-2). This is likely an IP-based WAF rule or rate limiter targeting cloud provider ranges.

**Fix:** Restructured the import to use a **Vercel cron route** (`app/api/cron/import-producer-cars/route.ts`) that fetches the CSV directly from Vercel's infrastructure (which CGC allows). The Edge Function remains deployed as a fallback but is not used in the production pipeline.

**Lesson:** When building import pipelines for government data sources, always test connectivity from the target execution environment before building the full pipeline. Government websites frequently block cloud provider IP ranges.

**Tags:** #import #cgc #edge-function #connectivity #producer-cars

### Finding 6: Grain Monitor Data is Monthly, Not Weekly (MEDIUM — DOCUMENTED)

**Symptom:** Expected weekly granularity from the Quorum Corp Grain Monitor data tables, but the `MonthlyReportDataTables.xlsx` (14.4 MB) contains monthly aggregates for stock levels, vessel data, and terminal volumes.

**Exception:** The Out-of-Car Time sheet (5C-5) has **weekly** granularity — each grain week gets its own column. This is the only weekly metric in the Excel.

**Fix:** The import script (`scripts/import-grain-monitor.mjs`) handles both granularities:
- Weekly OCT data: imported directly with correct grain week numbers (weeks 1-26 for current crop year)
- Monthly stock/terminal data: mapped to approximate grain week midpoints (AUG→wk3, SEP→wk7, etc.)
- Manual weekly entries (from PDF reports) are preserved and never overwritten by auto-import

**Data sources:**
- Weekly PDF reports: `grainmonitor.ca/Downloads/WeeklyReports/GMPGOCWeek{YYYYWW}.pdf` (rich but requires PDF parsing)
- Monthly Excel data tables: `grainmonitor.ca/Downloads/MonthlyReports/MonthlyReportDataTables.xlsx` (machine-readable, auto-importable)
- GMODS web UI: `grainmonitor.ca/GMODS/` (interactive, no REST API)

**Tags:** #import #grain-monitor #quorum #data-granularity

### Finding 7: Excel Crop Year Duplicate Column Trap (MEDIUM — FIXED)

**Symptom:** January stock values showed ~5 kt instead of ~6,929 kt after import.

**Root cause:** The Quorum Excel has a duplicate "JAN" column at the end of each crop year section — one for actual January data (col 274) and one for the YoY variance comparison (col 289). The parser's month-to-week mapping picked up both, with the variance column (value -0.21) overwriting the real data.

**Fix:** Stop scanning month columns when encountering "YTD AVG" or "YTD" labels, which marks the boundary between real data and variance/comparison columns.

**Tags:** #import #grain-monitor #excel #parsing-bug
