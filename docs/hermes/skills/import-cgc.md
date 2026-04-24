# Import CGC Weekly Grain Statistics

## Purpose
Fetch the Canadian Grain Commission (CGC) weekly grain statistics CSV and upsert into `cgc_observations`. This table is the canonical long-format source for deliveries, terminal receipts/exports, stocks, and shipment distribution across 16 Canadian grains. Every CAD desk scout (`supply-scout`, `demand-scout`, `logistics-scout`) reads from it; the Friday `grain-desk-weekly` swarm anchors its thesis-of-record to the CGC `grain_week` that lands here.

After the import lands, the collector also fans out Phase 1 heartbeat rows to `score_trajectory` for each of the 16 canonical CAD grains (`scan_type='collector_cgc'`). That heartbeat layer is what downstream consumers use to distinguish "CGC data arrived this week" from "that grain has no weekday signal yet."

## Schedule
- **When:** Every Thursday, **2:33 PM America/New_York** (ET)
  - Cron expression: `33 14 * * 4` — minute 33, hour 14 ET, any day-of-month, any month, Thursday
  - CGC publishes the weekly CSV Thursday ~1:00 PM MST / 3:00 PM ET; our 2:33 PM ET slot is deliberately early to let the Vercel proxy discover the newly-posted CSV within a couple of retry ticks.
- **Frequency:** Weekly, year-round
- **Trigger:** Claude Desktop Routine `collect-cgc`
- **Tables written:**
  - `cgc_observations` — one row per `(crop_year, grain_week, worksheet, metric, period, grain, grade, region)` — long-format, ~4,000 rows per week
  - `score_trajectory` — 16 Phase 1 heartbeat rows (one per canonical CAD grain), `scan_type='collector_cgc'`

## Primary Task

Execute the canonical weekly importer:

```bash
python scripts/collect-cgc.py
```

Repo root: `C:\Users\kyle\Agriculture\bushel-board-app`

Useful flags:
- `--dry-run` — read the current `cgc_observations` head, preview the heartbeat plan, **do not** trigger the Vercel proxy and **do not** write heartbeats
- `--skip-ef` — skip the import trigger (assume the CSV was already landed some other way) and only emit the Phase 1 heartbeats
- `--direct-ef` — **emergency escape hatch.** Bypass the Vercel proxy and call the `import-cgc-weekly` Edge Function directly. Only works from non-blocklisted egress (CGC drops Supabase edge IPs at the TCP layer, so this will fail from a Supabase-triggered context — see Hard Rules)
- `--week N` — force a specific `grain_week` (e.g. `--week 37`). Omit for a full crop-year upsert

## Source Discovery Order

1. **Vercel proxy** (default, primary):
   `POST {BUSHEL_VERCEL_URL}/api/cron/import-cgc` with `Authorization: Bearer {CRON_SECRET}`.
   The Vercel route scrapes the current weekly CSV from `https://www.grainscanada.gc.ca/en/grain-research/statistics/grain-statistics-weekly/`, locates the active crop-year CSV link (pattern: `/grain-statistics-weekly/{crop-year}/gsw-shg-en.csv`), fetches the CSV, and forwards the raw text to the `import-cgc-weekly` Edge Function via the `csv_data` body parameter. The EF keeps its existing upsert, validation, and audit logic.

2. **Direct EF call** (legacy / emergency, via `--direct-ef`):
   `POST {SUPABASE_URL}/functions/v1/import-cgc-weekly` with the service-role key and the internal secret.
   The EF will try to scrape CGC itself. **This fails from Supabase's edge-region egress** because CGC's blocklist drops those IPs at the TCP layer (ECONNRESET). Only use this path from a known-good egress (local dev machine, a non-blocklisted cloud VM, etc.).

3. **Fail clearly** if neither succeeds:
   - Do **not** silently downgrade to a stale snapshot.
   - Do **not** write a partial week.
   - Stderr should include the full error envelope (`stage: "scrape" | "edge_function"`, upstream HTTP status, response body) so the operator can tell whether CGC is unreachable vs the EF is broken.

## Hard Rules

- **Long-format `crop_year` everywhere.** Database rows and API payloads use `"2025-2026"`. The short form `"2025-26"` is a bug trap and must never land in `cgc_observations`, `market_analysis`, or `score_trajectory`. `getCurrentCropYear()` in `supabase/functions/import-cgc-weekly/index.ts` returns the long form.
- **Vercel proxy is the default.** Scheduled runs must go through the proxy. `--direct-ef` is for human incident response only — never wire it into a cron or routine.
- **Never bypass the `week_ending_date` ordering.** `fetch_latest_cgc_week()` sorts by `week_ending_date.desc,grain_week.desc`. Sorting by `grain_week` first picks the historical `grain_week=52` row from a prior crop year.
- **Upsert, never delete.** The EF upserts on the full composite key; it never truncates the table or deletes prior weeks. A fresh run that "corrects" a week is allowed; a run that deletes last week's rows is a bug.
- **Heartbeats fan out to all 16 canonical CAD grains,** even grains that didn't have any `cgc_observations` rows this week. The heartbeat row still carries the prior stance/recommendation unchanged — its value is the "CGC ran at time T" signal. Consumers read `has_current_week_rows` from the evidence JSON to distinguish fresh data from carry-forward.
- **`grain_week` stamped on heartbeats comes from the DB, not the calendar.** After the EF runs, the wrapper re-queries `cgc_observations` to learn the newest `grain_week` and uses that value for the trajectory rows. Never compute grain_week from `NOW()`.

## Post-Import Verification

Run these three queries and include the results in the run summary.

```sql
-- 1. Latest CGC observations — confirm the week landed and row count is in the expected band
SELECT crop_year,
       grain_week,
       MAX(week_ending_date) AS week_ending_date,
       COUNT(*) AS rows_written,
       COUNT(DISTINCT grain) AS grains_present,
       COUNT(DISTINCT worksheet) AS worksheets_present
FROM cgc_observations
WHERE crop_year = '2025-2026'
GROUP BY crop_year, grain_week
ORDER BY grain_week DESC
LIMIT 3;

-- 2. Phase 1 heartbeats — confirm all 16 canonical CAD grains got a row for the new week
SELECT grain,
       grain_week,
       scan_type,
       stance_score,
       recommendation,
       created_at
FROM score_trajectory
WHERE scan_type = 'collector_cgc'
  AND crop_year = '2025-2026'
  AND grain_week = (SELECT MAX(grain_week) FROM cgc_observations WHERE crop_year='2025-2026')
ORDER BY grain;

-- Expected: exactly 16 rows (Amber Durum, Barley, Beans, Canaryseed, Canola, Chick Peas,
-- Corn, Flaxseed, Lentils, Mustard Seed, Oats, Peas, Rye, Soybeans, Sunflower, Wheat).

-- 3. CGC vs Grain Monitor lag check — CGC should lead Grain Monitor by 0-2 weeks
SELECT
  (SELECT MAX(grain_week) FROM cgc_observations
    WHERE crop_year = '2025-2026')         AS latest_cgc_week,
  (SELECT MAX(grain_week) FROM grain_monitor_snapshots
    WHERE crop_year = '2025-2026')         AS latest_grain_monitor_week;
```

## Run Summary (required output)

Every successful run must print (stdout JSON, stderr progress):

- `trigger_mode` — `"vercel_proxy"` (default) or `"edge_function_direct"` (legacy)
- `import_response` — the EF's response envelope: counts of rows upserted, week detected, any EF-side warnings
- `trajectory.crop_year` / `trajectory.grain_week` / `trajectory.week_ending` — the anchor used for the heartbeats
- `trajectory.written` / `trajectory.total` — heartbeat fan-out results (should be `16 / 16`)
- `trajectory.plan[].has_current_week_rows` — per-grain: `true` if `cgc_observations` has at least one row for this grain/week, `false` if it's carry-forward

Stderr should narrate:
- Which CSV URL the proxy discovered (for audit)
- EF response status + row count
- Any per-grain heartbeat failures (`results[].ok == false` with stderr excerpt)

## Failure Handling

If the import fails, the summary must state:

- **Which stage failed** — `"scrape"` (Vercel couldn't reach CGC), `"edge_function"` (EF rejected the CSV), or `"heartbeat"` (trajectory fan-out errored)
- **Exact error envelope** — HTTP status from upstream, first 500 chars of response body
- **Whether any row was written** — `import_response` is `null` or `{ef.status: >=400}` means **no** CGC rows landed; trajectory fan-out may still have appended heartbeats against the prior week (which is **wrong**, flag and remove)
- **Suggested next step:**
  1. Re-run via the Vercel proxy in ~15 min (CGC posts drift within an hour of scheduled release)
  2. If CGC itself is down, escalate — do NOT switch to `--direct-ef` unless you're on a non-Supabase egress
  3. If the EF rejects a valid-looking CSV, check `supabase functions logs import-cgc-weekly` for the parse error; the CSV schema is pinned to 10 columns (`crop_year, grain_week, week_ending_date, worksheet, metric, period, grain, grade, region, ktonnes`)

Never partial-write: if the EF fails, the wrapper should exit with non-zero and no heartbeats. If the EF succeeds but heartbeats fail, the run is "degraded, manual repair needed" — the Friday swarm will see fresh `cgc_observations` but no `collector_cgc` trajectory ticks.

## Related Files

- `scripts/collect-cgc.py` — canonical Phase 1 wrapper (this doc's primary task)
- `scripts/write-collector-heartbeat.py` — shared heartbeat primitive invoked 16× per run
- `app/api/cron/import-cgc/route.ts` — Vercel proxy that scrapes CGC + forwards CSV to the EF
- `supabase/functions/import-cgc-weekly/index.ts` — Edge Function (accepts `csv_data` body escape hatch)
- `supabase/functions/_shared/cgc-source.ts` — shared scrape helper (used by both the EF's built-in path and the Vercel proxy)
- `docs/reference/collector-task-configs.md` — routine schedule registry (Thursday 2:33 PM ET row)
- `docs/reference/collector-soft-update-prompt.md` — Phase 2 Opus soft-review prompt (separate routine, `opus_review_cgc`)
- `.claude/agents/supply-scout.md`, `demand-scout.md`, `logistics-scout.md` — downstream consumers
