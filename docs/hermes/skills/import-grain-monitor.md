# Import Government Grain Monitor (Weekly)

## Purpose
Fetch the Quorum / Government Grain Monitor weekly PDF and upsert a full weekly logistics row into `grain_monitor_snapshots`. This table is the canonical source for Canadian rail + port + terminal flow and feeds `logistics-scout`, `get_logistics_snapshot()`, and the Friday CAD desk chief's logistics overlay.

The weekly PDF (`GMPGOCWeek{YYYY}{WW}.pdf`) is the only source that carries all 38 columns the schema expects. The legacy monthly Excel workbook is demoted to backfill / recovery only.

## Schedule
- **When:** Every Wednesday, first run **12:17 PM America/Edmonton** (2:17 PM ET)
- **Optional catch-up:** Wednesday 4:00 PM America/Edmonton if Quorum posts late
- **Frequency:** Weekly, year-round
- **Trigger:** Claude Desktop Routine `collect-grain-monitor`
- **Table written:** `grain_monitor_snapshots` (one row per `(crop_year, grain_week)`)

## Primary Task

Execute the canonical weekly importer:

```bash
npx tsx scripts/import-grain-monitor-weekly.ts
```

Repo root: `C:\Users\kyle\Agriculture\bushel-board-app`

Useful flags:
- `--dry-run` - parse + validate the PDF, print the row, do not write to Supabase
- `--pdf-url <url>` - force a specific weekly PDF (for backfill)
- `--url <url>` - legacy alias for `--pdf-url`
- `--crop-year 2025-2026 --grain-week 35` - override detected period (for backfill)

## Source Discovery Order

1. **Direct filename pattern** (primary):
   `https://grainmonitor.ca/Downloads/WeeklyReports/GMPGOCWeek{YYYY}{WW}.pdf`
   Example: `GMPGOCWeek202535.pdf`

2. **HTML discovery** (fallback):
   Scrape `https://grainmonitor.ca/current_report.html` for the latest weekly PDF link.

3. **Fail clearly** if neither produces a weekly PDF.
   - Do **not** silently downgrade to `data/grain-monitor-data-tables.xlsx`.
   - Do **not** write a partial row.
   - Open an inbox item / alert so the collector failure is visible to the Friday swarm.

## Hard Rules

- **Weekly PDF is the source of truth.** The monthly Excel workbook is not a substitute.
- **`scripts/import-grain-monitor.mjs` is fallback / backfill only.** Never invoke it as the scheduled weekly collector.
- **Real `report_date`** must come from the PDF header, not a synthesized week -> date map.
- **Upsert on `(crop_year, grain_week)`** - never insert duplicates, never delete prior weeks.
- **Full row or no row.** The importer validates `REQUIRED_WEEKLY_FIELDS` before writing.
- **`source_notes` must include PDF filename + CGC lag annotation.**

## Post-Import Verification

Run both queries and include the results in the run summary.

```sql
-- 1. Latest row written
SELECT crop_year, grain_week, report_date,
       country_stocks_kt, total_unloads_cars, out_of_car_time_pct,
       ytd_shipments_total_kt, vessels_vancouver, vessels_prince_rupert,
       source_notes
FROM grain_monitor_snapshots
ORDER BY crop_year DESC, grain_week DESC
LIMIT 1;

-- 2. Logistics snapshot RPC sees the new row
SELECT get_logistics_snapshot('2025-2026', 35::smallint);

-- 3. CGC lag check
SELECT
  (SELECT MAX(grain_week) FROM cgc_observations
    WHERE crop_year = '2025-2026') AS latest_cgc_week,
  (SELECT MAX(grain_week) FROM grain_monitor_snapshots
    WHERE crop_year = '2025-2026') AS latest_grain_monitor_week;
```

## Run Summary (required output)

Every successful run must print:

- PDF filename used (e.g. `GMPGOCWeek202535.pdf`)
- `crop_year`, `grain_week` imported
- Real `report_date` from PDF header
- Covered period (week start -> week end)
- Latest CGC `grain_week` in `cgc_observations`
- Lag in weeks vs CGC (0 = aligned, >0 = Grain Monitor behind)
- Key metrics: `country_stocks_kt`, `total_unloads_cars`, `out_of_car_time_pct`, `ytd_shipments_total_kt`, `vessels_vancouver`, `vessels_prince_rupert`

## Failure Handling

If the import fails, the summary must state:
- Whether the **weekly PDF was missing** (source issue) or **parsing failed** (script issue)
- The exact error string
- Whether any row was written (should be **no** on failure)
- Suggested next step (retry with `--pdf-url`, manual PDF inspection, escalate to repo owner)

Do **not** fall back to the monthly Excel workbook automatically. A stale-but-clean row is better than a rich-but-wrong row; the Friday swarm is built to flag a missing week, not to detect a silently-degraded one.

## Related Files

- `scripts/import-grain-monitor-weekly.ts` - canonical weekly importer
- `scripts/import-grain-monitor.mjs` - **fallback / backfill only**
- `docs/reference/collector-task-configs.md` - routine schedule registry
- `docs/plans/2026-04-20-grain-monitor-fix-handoff.md` - design decisions behind this importer
- `.claude/agents/logistics-scout.md` - downstream consumer
