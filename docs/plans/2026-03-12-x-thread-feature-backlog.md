# Feature Backlog — Extracted from X Thread Draft (2026-03-12)

Source: Kyle's X thread walkthrough notes. These are improvements and new features identified while writing the promotional thread.

## Priority: High (User-Facing UX Gaps)

### 1. Separate Y-axis for farmer deliveries on delivery chart
- **Problem:** Farmer delivers 5-6 loads/week. Pipeline moves thousands of kt. Farmer's line is invisible.
- **Fix:** Dual-axis chart — left axis for pipeline (kt), right axis for farmer deliveries (kt or loads).
- **Agents:** `frontend-dev` (Recharts dual-axis), `ux-agent` (axis labeling, legend clarity)
- **Page:** `/grain/[slug]` — delivery chart component

### 2. ~~Rename "Skip" → "Dismiss" on X signal cards~~ ✅ Done (2026-03-12)
- **Problem:** "Skip" implies the signal comes back. "Dismiss" is clearer intent.
- **Fix:** String change in signal feed component + server action.
- **Agents:** `frontend-dev` (trivial string change)
- **Page:** Signal feed on Overview + grain detail

### 3. ~~Remove "Where Does Canola Go?" chart~~ ✅ Done (2026-03-12)
- **Problem:** Redundant with Supply Pipeline section.
- **Fix:** Delete the component and its imports. Grep for references.
- **Agents:** `frontend-dev`, then `data-audit` (verify no orphaned queries)
- **Page:** `/grain/canola`

### 4. ~~Move Market Intelligence section above X feed on Overview~~ ✅ Done (2026-03-12)
- **Problem:** Currently below X signals on Overview. AI thesis is higher value content.
- **Fix:** Reorder sections in the Overview page layout. Section order is now Snapshot → Intelligence → Community Pulse.
- **Agents:** `ux-agent` (confirm hierarchy), `frontend-dev` (layout change)
- **Page:** Overview (`/`)

## Priority: Medium (Data Enrichment)

### 5. "% left in bin vs market" stat on farm card
- **Problem:** Farmer has no at-a-glance comparison of their remaining vs provincial remaining.
- **Fix:** Add a stat to the farm card showing `(farmer_remaining / farmer_starting)` vs `(market_remaining / market_starting)`.
- **Agents:** `frontend-dev` (card UI), `db-architect` (query or RPC if needed)
- **Page:** My Farm + grain detail farm card

### 6. Net producer deliveries vs domestic disappearance — top-of-page stat
- **Problem:** Farmers need to know if the market is absorbing more than farmers are delivering (bullish) or vice versa.
- **Fix:** New KPI card at top of grain detail: `Producer Deliveries WoW - Domestic Disappearance WoW`. WoW graph.
- **Agents:** `db-architect` (new RPC or query), `frontend-dev` (KPI card + WoW chart), `ux-agent` (placement)
- **Page:** `/grain/[slug]` — top section

### 7. ~~Province map: show MT + percentage~~ ✅ Done (2026-03-12)
- **Problem:** Map currently shows one unit only. Farmers think in both.
- **Fix:** Labels now show "AB\n4,200.0 kt (38.2%)" format with percentage of total.
- **Agents:** `frontend-dev` (map label formatting)
- **Page:** `/grain/[slug]` — province map component

### 8. Storage chart: add total line + WoW comparison
- **Problem:** Chart shows per-location stocks but no aggregate total or change indicator.
- **Fix:** Add a total summary line/label above the chart + WoW delta badges per bar.
- **Agents:** `frontend-dev` (Recharts reference line or annotation), `db-architect` (if aggregation needed)
- **Page:** `/grain/[slug]` — storage chart

### 9. Customize X feed grain selection on Overview
- **Problem:** Overview X feed shows signals across all grains. Farmer may only care about 2-3.
- **Fix:** Add a grain filter toggle to the Overview signal strip (default: user's unlocked grains).
- **Agents:** `ux-agent` (filter UX pattern), `frontend-dev` (filter state + query param), `db-architect` (filter RPC if needed)
- **Page:** Overview (`/`)

## Priority: Low (Analytics & Future Intelligence)

### 10. Save Community Pulse history
- **Problem:** Weekly sentiment is shown live but not archived. Can't compare sentiment vs actual data after CGC release.
- **Fix:** Snapshot weekly sentiment aggregates into a history table. Enable comparison view.
- **Agents:** `db-architect` (new table + snapshot trigger or Edge Function step), `frontend-dev` (history view), `innovation-agent` (analysis framework)
- **Tables:** New `sentiment_history` or extend `grain_sentiment_votes` aggregation

### 11. Sentiment poll must track CURRENT shipping week (not CGC release week)
- **Problem:** Farmer sentiment should reflect what they're doing THIS week, not the data release week (which lags by 1 week).
- **Fix:** Audit `sentiment-poll.tsx` and confirm `grain_week` parameter uses current shipping week. Add week label clarity in UI.
- **Agents:** `data-audit` (verify week numbering), `frontend-dev` (UI label), `db-architect` (if schema change needed)
- **Critical:** This affects future analytics — must be correct from the start.

### 12. Record sentiment snapshots — daily average per grain
- **Problem:** A single vote per farmer per week loses the intra-week sentiment trajectory.
- **Fix:** Record timestamped snapshots (or daily rollups) of per-grain sentiment averages.
- **Agents:** `db-architect` (snapshot table + aggregation), `innovation-agent` (analysis use cases)
- **Depends on:** #11 (correct week tracking)

### 13. AI week awareness — ensure prompts understand data lag
- **Problem:** Farmer inputs are always in shipping week N+1 while CGC data is for week N. AI must never confuse these.
- **Fix:** Audit all Edge Function prompts (`generate-intelligence`, `generate-farm-summary`) for explicit week context. Add a "data context" preamble to every prompt.
- **Agents:** `db-architect` (Edge Function prompt audit), `data-audit` (verify week references), `documentation-agent` (document the convention)
- **Critical:** Ongoing correctness concern for all future intelligence features.

---

## Agent Assignment Summary

| Agent | Items |
|-------|-------|
| `frontend-dev` | #1, #2, #3, #4, #5, #6, #7, #8, #9 |
| `ux-agent` | #1, #4, #6, #9 |
| `db-architect` | #5, #6, #8, #9, #10, #12, #13 |
| `data-audit` | #3, #11, #13 |
| `innovation-agent` | #10, #12 |
| `documentation-agent` | #13 |
| `security-auditor` | Any new tables (#10, #12) — RLS review |
| `qc-crawler` | Post-deploy verification for all items |
