# Daily Data Collector — Scheduled Task Configurations

> **Purpose:** Reference copy of the 6 daily data collector scheduled tasks for Track 41 (Claude Agent Desk).
> These tasks feed Supabase with fresh data throughout the week so the Friday swarm reads current data.

## Task Summary

| Task ID | Schedule | Day | Time (ET) | Source | Target Table |
|---------|----------|-----|-----------|--------|-------------|
| `collect-crop-progress` | `32 16 * * 1` | Mon | 4:32 PM | USDA NASS | `usda_crop_progress` |
| `collect-grain-monitor` | `17 14 * * 3` | Wed | 2:17 PM | grainmonitor.ca | `grain_monitor_snapshots` |
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
