# Daily Data Collector — Scheduled Task Configurations

> **Purpose:** Reference copy of the 6 daily data collector scheduled tasks for Track 41 (Claude Agent Desk).
> These tasks feed Supabase with fresh data throughout the week so the Friday swarm reads current data.

## Task Summary

> **Timezone note (2026-04-24):** Claude Desktop Routine cron expressions fire in the scheduler's *local* time, which is America/Edmonton (MT) for this project. The `Time (MT)` column below is the authoritative fire time. The `Time (ET)` column is derived (+2h during DST, +2h during standard time) and shown for desk-operator convenience only. Historical revisions of this doc labelled the local cron as "ET" — that was drift. Cross-check every row against `list_scheduled_tasks` before trusting either column.
>
> The currently registered task set is the source of truth: if a cron here disagrees with the live task, the doc is wrong, not the task (unless a timing change has been deliberately deferred to a documented migration).

| Task ID | Cron (local / MT) | Day | Time (MT) | Time (ET, DST) | Source | Target Table |
|---------|-------------------|-----|-----------|----------------|--------|-------------|
| `collect-crop-progress` | `32 16 * * 1` | Mon | 4:32 PM | 6:32 PM | USDA NASS | `usda_crop_progress` |
| `collect-grain-monitor` | `17 14 * * 3` | Wed | 2:17 PM | 4:17 PM | grainmonitor.ca (weekly PDF) | `grain_monitor_snapshots` |
| `collect-export-sales` | `3 9 * * 4` | Thu | 9:03 AM | 11:03 AM | USDA FAS | `usda_export_sales` |
| `collect-cgc` | `33 15 * * 4` | Thu | 3:33 PM | 5:33 PM | grainscanada.gc.ca (via Vercel proxy) | `cgc_observations` |
| `collect-cftc-cot` | `0 14 * * 5` | Fri | 2:00 PM | 4:00 PM | cftc.gov | `cftc_cot_positions` |
| `collect-wasde` | `33 12 10-14 * 5` | Fri (10th–14th) | 12:33 PM | 2:33 PM | usda.gov | `usda_wasde_estimates` |

## Weekly Timeline (MT local, ET parenthesised)

```
MON  4:32 PM MT (6:32 PM ET) — USDA Crop Progress (Apr-Nov only)
WED  2:17 PM MT (4:17 PM ET) — Government Grain Monitor
THU  9:03 AM MT (11:03 AM ET) — USDA Export Sales
THU  3:33 PM MT (5:33 PM ET) — CGC Weekly Grain Stats (Vercel proxy → import-cgc-weekly EF)
FRI 12:33 PM MT (2:33 PM ET)  — USDA WASDE (monthly only, 10th-14th)
FRI  2:00 PM MT (4:00 PM ET)  — CFTC COT (triggers existing Edge Function)
FRI  6:00 PM MT (8:00 PM ET)  — prediction-market-weekly SWARM (Track 52 — reads PRIOR week's CAD/US + this Friday's Kalshi close)
FRI  6:47 PM MT (8:47 PM ET)  — grain-desk-weekly SWARM (reads all collected data)
```

> **Timing note for prediction-market-weekly:** Fires BEFORE the CAD desk swarm,
> intentionally. The brief compares Friday's Kalshi market close against our
> most recently published CAD + US stance (typically from the prior week, since
> CAD writes Friday 6:47 PM MT). The Phase 0.2 freshness check in
> `prediction-market-desk-swarm-prompt.md` records the lag and surfaces it in
> the lede when relevant ("our CAD desk hasn't posted this week's stance yet").
> If a future operator wants same-day CAD/US stance in the brief, move this
> swarm to ≥7:45 PM MT (≥9:45 PM ET) so both desks finish first.

### CGC Timing Rationale

CGC publishes the weekly CSV Thursday ~1:00 PM MT. The `collect-cgc` slot sits at 3:33 PM MT — 2h 33m after publish. That buffer covers both CGC posting drift and the Vercel proxy scrape+forward round-trip (typically 2-5s). Do not pull this earlier without first confirming CGC publish timing hasn't shifted; running before the CSV is live triggers a false-negative import and leaves `cgc_observations` stale for the week.

## Design Notes

- Times deliberately off-round to avoid API congestion
- Each collector is standalone — not a team, not a swarm
- `collect-cgc` and `collect-cftc-cot` trigger existing pipeline infrastructure
- `collect-crop-progress` uses the USDA NASS QuickStats API directly (not Firecrawl)
- `collect-grain-monitor`, `collect-export-sales`, `collect-wasde` use their source-specific fetch paths
- All collectors write data freshness metadata (source dates, grain weeks)
- If a collector fails, the Friday swarm runs with stale data and flags it

## Two-Phase Collector Architecture

Every weekday collector routine runs in two phases:

| Phase | Actor | Writes | scan_type |
|-------|-------|--------|-----------|
| 1. Mechanical | Python / TS importer | Source table + trajectory heartbeat | `collector_*` |
| 2. Reasoning | Opus routine agent (soft review) | Trajectory soft-update row | `opus_review_*` |

Phase 1 proves the data arrived and stamps a trajectory "heartbeat" with stance unchanged — Track 45-B contract. Phase 2 is the Opus soft-reviewer: it reads the fresh data + current `us_market_analysis` thesis + recent trajectory ticks, decides on a bounded stance/confidence delta, and appends a `opus_review_*` row to the trajectory. Phase 2 never mutates `us_market_analysis` — Friday's swarm (`weekly_debate`) is the only writer of the thesis-of-record.

**Why two phases:** If Opus errors or the routine times out, phase 1 still preserves the data and a clean audit trail. The UI sparkline / Friday swarm can always distinguish "data arrived" (mechanical) from "Opus interpreted it" (reasoning).

**Bounds per soft review** (enforced by `scripts/write-collector-soft-update.py`):

- `stance_delta`: `-5 … +5` per run
- `confidence_delta`: `-10 … +10` per run

Larger moves must wait for Friday. If Opus sees a regime shift, it emits `stance_delta=0` with the concern stashed in `--new-bullet-suggested` for Friday to weigh.

Full Opus prompt + decision framework: `docs/reference/collector-soft-update-prompt.md`.

**CAD migration applied (2026-04-21):** `score_trajectory.scan_type` CHECK constraint widened to accept both `collector_cftc_cot` and the 6 `opus_review_*` values. CAD-side weekday soft reviews are now enabled for all three CAD collectors (`collect-grain-monitor`, `collect-cgc`, `collect-cftc-cot`). `scripts/write-collector-soft-update.py --side cad` is live.

## Canonical Scripts (invoked by each collector)

| Collector | Phase 1 Script / Endpoint | Phase 2 Soft Review | Notes |
|---|---|---|---|
| `collect-crop-progress` | `scripts/import-usda-crop-progress.py` *(emits heartbeats via `write-collector-heartbeat.py`)* | `scripts/write-collector-soft-update.py --side us --scan-type opus_review_crop_progress` | USDA NASS QuickStats API |
| `collect-grain-monitor` | `scripts/import-grain-monitor-weekly.ts` *(fans out heartbeats to all 16 CAD grains after upsert)* | `scripts/write-collector-soft-update.py --side cad --scan-type opus_review_grain_monitor` | **Weekly Quorum PDF, deterministic parse.** `scripts/import-grain-monitor.mjs` is monthly-Excel fallback / backfill only — never schedule it. |
| `collect-export-sales` | `scripts/import-usda-export-sales.py` *(emits heartbeats per US market after upsert)* | `scripts/write-collector-soft-update.py --side us --scan-type opus_review_export_sales` | USDA FAS ESR API |
| `collect-cgc` | `scripts/collect-cgc.py` *(triggers `import-cgc-weekly` EF, then fans out heartbeats to all 16 CAD grains)* | `scripts/write-collector-soft-update.py --side cad --scan-type opus_review_cgc` | Wrapper reads latest `grain_week` from `cgc_observations` after EF success. |
| `collect-cftc-cot` | `scripts/collect-cftc-cot.py` *(triggers `import-cftc-cot` EF, then fans out heartbeats to mapped US + CAD markets)* | `scripts/write-collector-soft-update.py --side {us\|cad} --scan-type opus_review_cftc_cot` (one pass per side) | US: Corn/Soybeans/Wheat (Oats has no disaggregated series). CAD: Canola/Corn/Soybeans/Wheat. |
| `collect-wasde` | `scripts/import-usda-wasde.py` *(emits heartbeats per US market after upsert)* | `scripts/write-collector-soft-update.py --side us --scan-type opus_review_wasde` | Monthly only (10th–14th) |

### Phase 1 Heartbeat Primitive

All six collectors share a single mechanical writer: `scripts/write-collector-heartbeat.py`. It reads the latest trajectory row (drift-aware) for each market, carries the prior `stance_score` + `recommendation` forward unchanged, stamps `scan_type='collector_*'`, and attaches the severity + signal note passed by the calling collector. Python collectors invoke it directly; the TypeScript grain-monitor importer calls it via `child_process.spawnSync`.

**Deprecated workflows removed:**
- Claude parsing the Grain Monitor PDF with Firecrawl and hand-writing INSERT SQL at runtime — replaced by the deterministic `import-grain-monitor-weekly.ts` script (2026-04-20).
- Treating `data/grain-monitor-data-tables.xlsx` as a weekly source — it only carries a partial subset of the 38-column weekly schema. Monthly workbook is fallback / backfill only.

## Data Freshness Cross-Reference

| Data Source | Dating System | Potential Lag |
|-------------|---------------|---------------|
| CGC | grain_week (Aug 1 = week 1) | ~1 day (Thursday release) |
| Grain Monitor | shipping weeks | 1-2 weeks behind CGC grain_week |
| USDA weekly | week_ending date | Aligns to US marketing year |
| CFTC COT | Tuesday report_date, released Friday | 3 days inherent lag |
| USDA WASDE | monthly report_date | Released ~10th-12th of month |

## Collector → Swarm Data Flow

```
collect-crop-progress  → usda_crop_progress     → macro-scout reads
                      ↘ us_score_trajectory    → us-desk-weekly reads (mech + opus_review ticks)
collect-grain-monitor  → grain_monitor_snapshots → logistics-scout reads
                      ↘ score_trajectory       → grain-desk-weekly reads (mech tick; opus_review blocked)
collect-export-sales   → usda_export_sales       → demand-scout reads
                      ↘ us_score_trajectory    → us-desk-weekly reads (mech + opus_review ticks)
collect-cgc            → cgc_observations        → supply-scout, demand-scout, logistics-scout read
                      ↘ score_trajectory       → grain-desk-weekly reads (mech tick; opus_review blocked)
collect-cftc-cot       → cftc_cot_positions      → sentiment-scout reads
                      ↘ us_score_trajectory    → us-desk-weekly reads (mech + opus_review ticks)
collect-wasde          → usda_wasde_estimates     → macro-scout reads
                      ↘ us_score_trajectory    → us-desk-weekly reads (mech + opus_review ticks)
```

The phase-2 `opus_review_*` rows feed the Friday swarm as "weekday signal accumulator" — the desk chief checks cumulative stance drift vs the Friday anchor and prioritizes markets where drift is largest.

## Weekly Swarm — `prediction-market-weekly` (Track 52, added 2026-04-29)

The 6 daily collectors above feed the CAD + US grain-desk swarms. The
**prediction-market-weekly** swarm is a separate weekly Routine that does NOT
write to `score_trajectory` and does NOT feed the grain desks. It is a
read-from-many, write-to-one editorial layer over Kalshi prediction markets.

### Routine Config

| Field | Value |
|---|---|
| **Routine name** | `prediction-market-weekly` |
| **Cron (local / MT)** | `0 18 * * 5` |
| **Day** | Friday |
| **Time (MT)** | 6:00 PM |
| **Time (ET, DST)** | 8:00 PM |
| **Model** | `claude-opus-4-7` (Opus only — non-negotiable per `feedback_grain_desk_uses_opus.md`) |
| **Prompt source** | `docs/reference/prediction-market-desk-swarm-prompt.md` |
| **Read sources** | Kalshi public API (`api.elections.kalshi.com`), `market_analysis`, `us_market_analysis` |
| **Write target** | `predictive_market_briefs` only (UNIQUE on `week_ending`) |
| **Sub-agents** | `kalshi-state-scout` (Haiku), `divergence-scout` (Haiku), `macro-scout` (Sonnet, REUSED), `prediction-market-analyst` (Sonnet) |

### Timing Rationale

Fires BEFORE the CAD `grain-desk-weekly` swarm (6:47 PM MT). The brief compares
**Friday's Kalshi market close** against our **most recently published** CAD +
US stance — typically last week's, since the CAD desk writes its new stance
~47 min after this swarm. That's by design: the editorial point is "what is
the crowd paying for vs the most recent published view our farmers have read?"

If you want same-week CAD/US stance in the brief, move this swarm to
≥7:45 PM MT (after both desks finish writing). The orchestration prompt's
Phase 0.2 freshness check records the lag and surfaces it in the brief's
lede when stance is from a prior week.

### Data Flow (One-Way)

```
[Kalshi public API]          ──┐
[market_analysis]            ───┼──► swarm ──► predictive_market_briefs ──► /markets page
[us_market_analysis]         ───┘                  (UNIQUE on week_ending)
```

No write to `market_analysis`, `us_market_analysis`, `score_trajectory`,
`us_score_trajectory`, or any user-scoped table. The isolation fence is
enforced in every sub-agent definition; violations should write a failure
row to `pipeline_runs` and abort.

### Failure-Mode Reference (see swarm prompt for full table)

- Wrong model (Sonnet/Haiku): abort in Phase 0.0
- Both CAD + US desks >48h stale: abort in Phase 0.2
- Kalshi API outage: abort if all 7 markets unavailable; partial outage proceeds
- Upsert fails: retry once with same `week_ending`; second failure logs and exits

### Output Surface

Empty until first run completes. The `/markets` page (Phase 1 of Track 52,
shipped 2026-04-29) renders an "early days" placeholder via
`getLatestPredictiveMarketBrief()` returning null. First successful swarm
run replaces the placeholder with the real headline + lede + per-market takes.
