# Grain Monitor Import Fix Handoff

## TL;DR

Fix the Grain Monitor collector so it becomes a **weekly PDF-based logistics importer** that writes a **full weekly row** into `grain_monitor_snapshots`.

Do **not** treat the monthly Excel workbook as the primary weekly source.

This task primarily feeds the **Canadian bull/bear thesis lane**, the logistics layer, and `get_logistics_snapshot()`.

---

## Why This Matters

Right now the repo has a known compromise:

- the table schema expects a **rich weekly logistics row**
- the weekly Quorum PDF is the **rich weekly source**
- the current repo importer uses the **monthly Excel workbook**
- the current importer fills only a **small subset** of the table
- the current importer manufactures `report_date` from a week approximation instead of using the real report date

This means the table, docs, and consumer expectations are ahead of the actual importer.

---

## Hard Decisions

1. **Use the weekly Quorum PDF as the primary source**
   - Naming pattern: `GMPGOCWeek{YYYY}{WW}.pdf`
   - Example: `GMPGOCWeek202535.pdf`

2. **Do not use the monthly Excel workbook as the primary weekly collector**
   - Keep it only as a fallback / backfill tool for machine-readable partial metrics.
   - It is not a faithful substitute for the weekly PDF.

3. **Use deterministic PDF parsing, not prompt-only scraping**
   - Direct fetch or discovery scrape is fine for locating the PDF.
   - The number extraction should be deterministic.

4. **`grain_monitor_snapshots` remains the canonical weekly logistics table**
   - One row per `(crop_year, grain_week)`
   - Real report provenance, real report date, real weekly metrics

5. **Schedule should follow the actual weekly release**
   - Current evidence points to **Wednesday**, not Thursday.
   - The collector should run after the weekly report is typically posted.

---

## Current Repo Mismatches

### 1. Current importer uses the monthly Excel workbook, not the weekly PDF

Current importer:

- `scripts/import-grain-monitor.mjs`

It downloads:

- `https://grainmonitor.ca/Downloads/MonthlyReports/MonthlyReportDataTables.xlsx`

instead of the weekly PDF.

### 2. Current importer fills only part of the schema

The table supports:

- country stocks and capacity
- terminal stocks and capacity
- country deliveries
- unload counts and 4-week average variance
- out-of-car time
- YTD shipments
- vessel lineup
- weather notes
- source notes

But the current script only extracts:

- out-of-car time
- country stocks
- terminal stocks

It does **not** fill:

- `country_deliveries_kt`
- unload metrics
- shipment metrics
- vessel metrics
- `weather_notes`

### 3. Current `report_date` is synthetic, not source-truth

The script currently estimates:

- `report_date = crop_start + grain_week * 7`

That is not the actual Quorum report date and should not be treated as provenance.

### 4. The repo already knows this is a compromise

Lessons learned file:

- `docs/lessons-learned/issues.md`

It explicitly states:

- the weekly PDF is rich but harder to parse
- the monthly Excel is machine-readable but coarser
- manual weekly PDF entries should be preserved

That is a strong signal that the current importer is a fallback, not the intended end-state collector.

### 5. Schedule documentation has drift

Repo docs currently point to a **Wednesday** Grain Monitor release.

The pasted task says:

- weekly
- 2:17 PM
- Thursdays

Current evidence suggests the routine should be aligned to **Wednesday**, not Thursday.

---

## Target Behavior

### Schedule

Target schedule:

- Wednesday
- after the weekly PDF is typically posted
- keep the off-round execution pattern if desired, but align the day to the actual source cadence

### Runtime flow

```text
discover latest weekly PDF
  -> compare latest imported grain_week
  -> fetch PDF
  -> parse weekly logistics metrics
  -> compare to latest CGC grain_week
  -> write one full weekly row
  -> verify
```

### Discovery strategy

Preferred order:

1. Try the direct weekly filename pattern first
   - `grainmonitor.ca/Downloads/WeeklyReports/GMPGOCWeek{YYYY}{WW}.pdf`
2. If not found, scrape the current-report page to identify the latest weekly PDF
3. If the weekly PDF is unavailable, fail clearly

Do **not** silently downgrade to the monthly Excel source for a weekly import run.

### Required metrics from the weekly PDF

Populate these table fields when present in the source report:

- `country_stocks_kt`
- `country_capacity_pct`
- `terminal_stocks_kt`
- `terminal_capacity_pct`
- `country_stocks_mb_kt`
- `country_stocks_sk_kt`
- `country_stocks_ab_kt`
- `terminal_stocks_vancouver_kt`
- `terminal_stocks_prince_rupert_kt`
- `terminal_stocks_thunder_bay_kt`
- `terminal_stocks_churchill_kt`
- `country_deliveries_kt`
- `country_deliveries_yoy_pct`
- `vancouver_unloads_cars`
- `prince_rupert_unloads_cars`
- `thunder_bay_unloads_cars`
- `churchill_unloads_cars`
- `total_unloads_cars`
- `four_week_avg_unloads`
- `var_to_four_week_avg_pct`
- `ytd_unloads_cars`
- `out_of_car_time_pct`
- `out_of_car_time_vancouver_pct`
- `out_of_car_time_prince_rupert_pct`
- `ytd_shipments_vancouver_kt`
- `ytd_shipments_prince_rupert_kt`
- `ytd_shipments_thunder_bay_kt`
- `ytd_shipments_total_kt`
- `ytd_shipments_yoy_pct`
- `ytd_shipments_vs_3yr_avg_pct`
- `vessels_vancouver`
- `vessels_prince_rupert`
- `vessels_cleared_vancouver`
- `vessels_cleared_prince_rupert`
- `vessels_inbound_next_week`
- `vessel_avg_one_year_vancouver`
- `vessel_avg_one_year_prince_rupert`
- `weather_notes`
- `source_notes`

### Provenance requirements

`source_notes` should include:

- Quorum Corporation Weekly Performance Update
- grain week
- crop year
- real report date
- period covered
- source PDF filename
- any caveats from the report
- vessel lineup timing note if Quorum distinguishes that subsection timing

### CGC lag handling

For every run:

1. query latest imported CGC `grain_week`
2. compare it to the Grain Monitor report week
3. log the lag in the run summary
4. include the lag note in `source_notes` if useful

Do not try to “correct” the lag by changing the Grain Monitor week. Record the lag clearly.

---

## Implementation Scope

### In scope

1. Build or rewrite the Grain Monitor collector so it reads the weekly PDF.
2. Preserve `grain_monitor_snapshots` as the canonical weekly table.
3. Write the real `report_date`.
4. Populate the full weekly schema as much as the source allows.
5. Keep upsert on `(crop_year, grain_week)`.
6. Compare the Grain Monitor week to CGC week and surface lag.
7. Update docs that currently imply the Excel fallback is the live weekly truth.

### Out of scope

1. Reworking the whole logistics layer
2. Reworking producer cars in the same pass
3. Broad dashboard redesign
4. General `source_runs` framework
5. Full historical backfill of all legacy weeks unless needed to validate the parser

---

## Recommended Implementation Path

### Step 1: Keep the table, change the collector

Do **not** redesign `grain_monitor_snapshots`.

The schema in:

- `supabase/migrations/20260313120000_create_grain_monitor_and_producer_cars.sql`

already matches the weekly PDF-style row shape well enough.

### Step 2: Separate weekly collector from monthly fallback

Recommended split:

- `scripts/import-grain-monitor-weekly.ts` or similar
  - primary weekly PDF collector
- keep `scripts/import-grain-monitor.mjs`
  - monthly Excel fallback / backfill helper

Do not keep calling the monthly fallback the canonical weekly importer.

### Step 3: Implement source discovery

The collector should:

1. determine current crop year / likely current report week
2. try the direct PDF URL pattern
3. if needed, scrape the site for the latest weekly PDF link
4. record the discovered filename in `source_notes`

### Step 4: Parse the PDF deterministically

Extract the weekly report tables into the canonical schema.

If one section cannot be extracted reliably:

- leave those fields null
- log the gap explicitly
- do not fabricate values

### Step 5: Preserve manual / richer rows

The current script already avoids overwriting manual rows. Preserve that principle.

But once the weekly PDF collector is the real source, it should itself be the authoritative weekly writer.

### Step 6: Verify against the logistics consumer

Review:

- `get_logistics_snapshot()` in `20260313120000_create_grain_monitor_and_producer_cars.sql`
- `.claude/agents/logistics-scout.md`
- any dashboard queries using logistics snapshot

Goal:

- the collector writes the fields the consumers already think exist

---

## Validation Checklist

### Table write validation

Run:

```sql
SELECT grain_week, report_date, vessels_vancouver, out_of_car_time_pct, created_at
FROM grain_monitor_snapshots
ORDER BY created_at DESC
LIMIT 1;
```

### Upsert validation

Re-run the same week and confirm:

- no duplicate row
- same `(crop_year, grain_week)` row is refreshed

### Provenance validation

Confirm the latest row includes:

- real PDF filename
- real report date
- source notes that describe the report provenance

### Consumer validation

Run:

```sql
SELECT get_logistics_snapshot('2025-2026', 35::smallint);
```

Confirm the JSON includes non-null values for the fields the logistics layer expects.

### Sanity checks

1. `report_date` is a real report date, not a synthetic week approximation
2. Grain Monitor week is preserved as-reported
3. Lag vs latest CGC week is surfaced, not hidden
4. `weather_notes` is null only when the report genuinely has no weather note
5. Vessel and unload sections are populated when present in the PDF

---

## Canada / US Impact

Primary impact:

- **Canadian thesis lane**
- logistics-scout
- logistics banner / logistics cards
- any advisor or chat path that uses `get_logistics_snapshot()`

Secondary impact:

- indirect only for US if any shared logistics summaries mention Canadian port congestion

This is mainly a **Canada logistics truth-layer fix**.

---

## Paste-Ready Prompt For New Session

```text
Fix the Grain Monitor collector so it becomes the canonical weekly logistics importer.

Context:
- Repo: C:\Users\kyle\Agriculture\bushel-board-app
- Read first: docs/plans/2026-04-20-grain-monitor-fix-handoff.md

Goal:
- Build a weekly PDF-based Grain Monitor importer
- Use the weekly Quorum PDF as the primary source, not the monthly Excel workbook
- Keep grain_monitor_snapshots as the canonical weekly table
- Write the real report_date, real grain_week, and rich source_notes
- Populate as much of the weekly schema as possible, especially vessel, unload, shipment, OCT, stocks, and weather fields
- Keep upsert on (crop_year, grain_week)
- Surface lag vs latest CGC week

Important:
- Do not silently downgrade to the monthly Excel workbook for the main weekly import path
- The monthly Excel importer can remain as a fallback/backfill tool, but not the primary collector
- Keep scope tight to this collector, any required parsing helpers, and minimal doc updates

Deliver:
1. code changes
2. any migration changes if needed
3. validation queries run
4. short summary of what was fixed and any remaining gaps
```

