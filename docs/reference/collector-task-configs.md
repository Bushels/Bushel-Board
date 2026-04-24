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
FRI  6:47 PM MT (8:47 PM ET)  — grain-desk-weekly SWARM (reads all collected data)
```

### CGC Timing Rationale

CGC publishes the weekly CSV Thursday ~1:00 PM MT. The `collect-cgc` slot sits at 3:33 PM MT — 2h 33m after publish. That buffer covers both CGC posting drift and the Vercel proxy scrape+forward round-trip (typically 2-5s). Do not pull this earlier without first confirming CGC publish timing hasn't shifted; running before the CSV is live triggers a false-negative import and leaves `cgc_observations` stale for the week.

## Design Notes

- Times deliberately off-round to avoid API congestion
- Each collector is standalone — not a team, not a swarm
- `collect-cgc` and `collect-cftc-cot` trigger existing pipeline infrastructure
- `collect-crop-progress`, `collect-grain-monitor`, `collect-export-sales`, `collect-wasde` use Firecrawl/web fetch
- All collectors write data freshness metadata (source dates, grain weeks)
- If a collector fails, the Friday swarm runs with stale data and flags it

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
collect-grain-monitor  → grain_monitor_snapshots → logistics-scout reads
collect-export-sales   → usda_export_sales       → demand-scout reads
collect-cgc            → cgc_observations        → supply-scout, demand-scout, logistics-scout read
collect-cftc-cot       → cftc_cot_positions      → sentiment-scout reads
collect-wasde          → usda_wasde_estimates     → macro-scout reads
```
