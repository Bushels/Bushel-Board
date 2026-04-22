# Daily Data Collector — Scheduled Task Configurations

> **Purpose:** Reference copy of the 6 daily data collector scheduled tasks for Track 41 (Claude Agent Desk).
> These tasks feed Supabase with fresh data throughout the week so the Friday swarm reads current data.

## Task Summary

| Task ID | Schedule | Day | Time (ET) | Source | Target Table |
|---------|----------|-----|-----------|--------|-------------|
| `collect-crop-progress` | `32 16 * * 1` | Mon | 4:32 PM | USDA NASS | `usda_crop_progress` |
| `collect-grain-monitor` | `17 14 * * 3` | Wed | 2:17 PM | grainmonitor.ca (weekly PDF) | `grain_monitor_snapshots` |
| `collect-export-sales` | `3 9 * * 4` | Thu | 9:03 AM | USDA FAS | `usda_export_sales` |
| `collect-cgc` | `33 14 * * 4` | Thu | 2:33 PM | grainscanada.gc.ca | `cgc_observations` |
| `collect-cftc-cot` | `7 16 * * 5` | Fri | 4:07 PM | cftc.gov | `cftc_cot_positions` |
| `collect-wasde` | `33 12 10-14 * 5` | Fri (10th-14th) | 12:33 PM | usda.gov | `usda_wasde_estimates` |

## Weekly Timeline

```
MON  4:32 PM — USDA Crop Progress (Apr-Nov only)
WED  2:17 PM — Government Grain Monitor
THU  9:03 AM — USDA Export Sales
THU  2:33 PM — CGC Weekly Grain Stats (triggers existing import pipeline)
FRI 12:33 PM — USDA WASDE (monthly only, 10th-14th)
FRI  4:07 PM — CFTC COT (triggers existing Edge Function)
FRI  6:47 PM — grain-desk-weekly SWARM (reads all collected data)
```

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
