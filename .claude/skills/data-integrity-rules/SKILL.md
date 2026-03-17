---
name: data-integrity-rules
description: Reference for CGC data integrity rules, PostgREST gotchas, RPC inventory, and country-level producer delivery formulas. Trigger when working with database queries, RPC functions, Edge Functions, or any code touching cgc_observations.
---

# Data Integrity Rules — Bushel Board

## Hard-Won Data Rules (15 Rules)

These rules were learned from production bugs. Violating any of them WILL break the dashboard.

1. **Always filter by `crop_year`** — queries without crop_year return multi-year data and produce wrong totals.
2. **Crop year format: ALWAYS long `"2025-2026"`** — matches CGC CSV. Short format `"2025-26"` is display-only via `toShortFormat()` in `lib/utils/crop-year.ts`. If you find short format in any database table, it's a bug.
3. **Terminal Receipts and Terminal Exports require grade summation in SQL** — unlike Primary worksheet (which has pre-aggregated `grade=''` rows), Terminal Receipts and Terminal Exports only have per-grade rows. Must `SUM(ktonnes) ... GROUP BY` all grades.
4. **Shipment Distribution needs explicit worksheet AND metric matching** — multiple worksheets share metric names. Always filter both.
5. **PostgREST `max_rows=1000` silently truncates** — no error returned. Terminal Receipts has ~3,648 rows per grain (20 grades × 6 ports × 30 weeks). Always use server-side RPC with `SUM() GROUP BY` for these worksheets. Client `.limit()` does NOT override the server cap. Any query returning exactly 1000 rows is a truncation signal.
6. **PostgREST returns `numeric` columns as strings** — always wrap in `Number()` when doing arithmetic in TypeScript.
7. **Internal Edge Function chaining uses `BUSHEL_INTERNAL_FUNCTION_SECRET`** — never use anon JWTs for internal chaining.
8. **User-scoped RPCs must derive identity from `auth.uid()`** — never accept a caller-supplied user ID.
9. **Sensitive RPCs must revoke execute from broad roles** before re-granting minimum access.
10. **`v_supply_pipeline` must be unique per `grain_slug, crop_year`** — duplicate rows break `.single()` queries.
11. **`volume_left_to_sell_kt` means remaining inventory** — pace math must use `delivered + remaining`, not just delivered.
12. **Delivery events: append-only rows with idempotency keys** — not mutable JSONB arrays.
13. **Source names are data, not contracts** — pick canonical supply sources in SQL, don't hardcode dated literals in app queries.
14. **Country producer deliveries formula (canonical):** `Primary.Deliveries` (AB/SK/MB/BC, `grade=''`) + `Process.Producer Deliveries` (national, `grade=''`) + `Producer Cars.Shipments` (AB/SK/MB, `grade=''`). Never ship a Primary+Process-only shortcut. View: `v_country_producer_deliveries`.
15. **Isolated hotfix workflow for migration drift** — if the linked remote is missing unrelated local migrations, do NOT run `npx supabase db push --linked` blindly. Use an isolated hotfix workdir or single-migration apply path.

## Aggregate Row Guardrail

For Primary, Process producer deliveries, and Producer Cars shipments, filter `grade=''` whenever you want the pre-aggregated total. Omitting that filter double-counts individual grade rows.

## Forward-Fill for Cumulative Series

Different CGC worksheets may report up to different grain weeks. When merging `period: "Crop Year"` data across worksheets, missing weeks must carry forward the last known cumulative value — NOT default to 0. See `getCumulativeTimeSeries()` in `lib/queries/observations.ts`.

## FULL OUTER JOIN Required

When combining Primary + Process data, not all grains appear in both worksheets. Always use FULL OUTER JOIN to avoid dropping data.

## Exports Formula (Complete)

CGC "Exports" in Summary = Terminal Exports + Primary Shipment Distribution "Export Destinations" (direct elevator-to-border) + Producer Cars Shipment Distribution "Export" (farmer railcars direct to US). All three components required.

## RPC Inventory

| Function | Purpose | Caller |
|----------|---------|--------|
| `get_pipeline_velocity(p_grain, p_crop_year)` | Aggregates 5 pipeline metrics server-side | `lib/queries/observations.ts` |
| `get_signals_with_feedback(p_grain, p_crop_year, p_grain_week)` | User-scoped X signal feed | `lib/queries/x-signals.ts` |
| `get_signals_for_intelligence(p_grain, p_crop_year, p_grain_week)` | Service-only X signals for LLM | `generate-intelligence` (v1) |
| `calculate_delivery_percentiles(p_crop_year)` | Delivery pace percentiles | `generate-farm-summary` |
| `get_delivery_analytics(p_crop_year, p_grain)` | Privacy-threshold farmer analytics (≥5 farmers) | `lib/queries/delivery-analytics.ts` |
| `enqueue_internal_function(p_function_name, p_body)` | Internal Edge Function chaining via pg_net | `analyze-grain-market` (v2) |
| `get_logistics_snapshot(p_crop_year, p_grain_week)` | Grain Monitor + Producer Car data as JSON | `analyze-grain-market`, `analyze-market-data` |
| `get_cot_positioning(p_grain, p_crop_year, p_weeks_back)` | CFTC managed money/commercial positions | `analyze-grain-market`, `lib/queries/cot.ts` |
| `get_processor_self_sufficiency(p_grain, p_crop_year)` | Producer vs non-producer delivery ratio | `analyze-grain-market` |
| `get_pipeline_velocity_avg(p_grain, p_crop_year, p_years_back)` | N-year average cumulative pipeline metrics | Dashboard charts |
| `get_weekly_terminal_flow(p_grain, p_crop_year)` | Per-grain weekly terminal receipts vs exports | `lib/queries/logistics.ts` |
| `get_aggregate_terminal_flow(p_crop_year)` | System-wide weekly terminal flow for sparkline | `lib/queries/logistics.ts` |
| `get_sentiment_overview(p_crop_year, p_grain_week)` | Per-grain sentiment aggregates | `lib/queries/sentiment.ts` |

## PostgREST Row-Count Audit

If your query targets a high-cardinality worksheet:
- **Terminal Receipts:** ~3,648 rows/grain (20 grades × 6 ports × 30 weeks)
- **Terminal Exports:** ~1,050 rows/grain

NEVER use raw PostgREST `.select()`. Use an RPC with `SUM() GROUP BY` instead.

## PostgREST Schema Cache

New RPC functions may not be immediately visible after migration. `NOTIFY pgrst, 'reload schema'` can be delayed through Supavisor pooling. Fix: `pg_notification_queue_usage()` to flush, or DROP + CREATE OR REPLACE. Verify with direct `curl` to `/rest/v1/rpc/<name>`.

## `ROUND()` Gotcha

`ROUND(double precision, integer)` doesn't exist in PostgreSQL. `PERCENTILE_CONT` returns `double precision`. Must cast: `ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY col))::numeric, 3)`.
