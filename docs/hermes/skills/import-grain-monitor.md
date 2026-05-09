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

## Failure Handling — Tiered Autonomy Charter

The agent's job is to land a clean Week N row in `grain_monitor_snapshots` before the Friday swarm runs, not just to report problems. Three tiers govern how much you may do on your own.

### Tier 1 — Always do (diagnose + report)

When the import fails, the summary must state:
- Whether the **weekly PDF was missing** (source issue) or **parsing failed** (script issue).
- The exact error string and the script line it threw from.
- Whether any row was written. The script's `parseWeeklyReportFromPages` is atomic — full row or nothing — so the answer should always be **no** on parse failure.
- A cross-check dry-run against the **immediately prior week's PDF** (e.g. if Week 37 fails, run `--dry-run --pdf-url .../GMPGOCWeek202536.pdf`). If the prior week parses cleanly, the regression is week-specific (Quorum wording change). If it also fails, the regression is structural (script-side).

### Tier 2 — Auto-fix when the seatbelt holds (parser-side regex regressions)

If **all** of these hold, you may patch + verify + commit + backfill **on your own**, on the current branch:

1. Failure is inside `scripts/grain-monitor/parsers.ts` — i.e. a regex didn't match a single PDF wording delta.
2. The fix is mechanically derivable from a one-token diff of the PDF wording vs the prior week. Concrete examples that qualify:
   - Singular vs plural noun tolerance (`vessels` → `vessels?`, `cars` → `cars?`).
   - pdf-parse split-letter artifacts inside a known short word (`May`, `Aug`, `Sep`, `Oct`) — fix by widening the month token to `[A-Za-z]+(?:\s[A-Za-z]+)?`.
   - "was" / "were" or other auxiliary verb swaps already handled by an existing alternation.
   - Whitespace / punctuation drift (extra space, swapped en-dash for hyphen).
3. The prior week's PDF still parses cleanly with your patched script (mandatory cross-check — prevents over-permissive regex from corrupting old weeks).
4. A fixture-based Vitest test covering the new wording is added to `lib/__tests__/grain-monitor-weekly-parser.test.ts`, and `npm run test -- lib/__tests__/grain-monitor-weekly-parser.test.ts` passes with **both** the existing and the new fixture.
5. The dry-run on the failing week prints all 38 fields with values that pass a sanity sniff: `vessels_vancouver` between 0 and 100, `out_of_car_time_pct` between 0 and 50, `country_stocks_kt` between 1,000 and 15,000, `total_unloads_cars` between 0 and 25,000, `report_date` within 14 days of today.

When all five hold, proceed:

1. Commit on the current branch with `fix(grain-monitor): <one-line wording delta description>`. Include the diff stats and a `Verified:` block in the commit body listing the test result and both dry-run outputs.
2. Run the live importer: `npx tsx scripts/import-grain-monitor-weekly.ts` (or with `--pdf-url` if backfilling a specific week).
3. Run the post-import verification queries above.
4. Post the run summary as you would for a successful normal run, plus a one-paragraph "Self-fix applied" note describing the wording delta and the regex patched.

Do **not** push to remote, open a PR, or merge to master from a Tier 2 self-fix. The user reviews and pushes.

### Tier 3 — Always escalate (do not auto-fix)

Stop, do not patch, post a clear escalation summary if any of the following:

- **Schema-level changes** — new field expected, dropped column, type drift, the PDF added a row the importer doesn't know about.
- **Structural PDF reorg** — page count changed, an entire bullet section is missing (not just reworded), metric layout reshuffled across pages.
- **Authentication / network failure** — Supabase rejected the upsert, env vars missing, Quorum CDN returning 401/403.
- **DB-side error** — RLS, missing column, foreign key, constraint violation.
- **Sanity-sniff failure** in step 5 above — values out of plausible range. This is the strongest signal that a regex matched the wrong token.
- **Multi-week regression** — both this week and the prior week's PDFs now fail to parse with the unpatched script (suggests a wider Quorum format change, not a one-week wording tweak).
- **Ambiguous diagnosis** — you can't isolate the failure to a single regex / single PDF wording delta after two passes.

### Hard guardrails — never violate, even under pressure

- **Never** relax a regex to be permissive enough to match unrelated text. `.*` and `.*?` should not be added without a fixture proving they don't over-match. The current parsers use tight constructs (`vessels?`, `[A-Za-z]+(?:\s[A-Za-z]+)?`) by design.
- **Never** skip Vitest. If `npm run test` fails on the parser file, abort the self-fix and escalate.
- **Never** fall back to the monthly Excel workbook. A stale-but-clean row is better than a rich-but-wrong row; the Friday swarm is built to flag a missing week, not to detect a silently-degraded one.
- **Never** `git push --force`, `--no-verify`, or bypass hooks.
- **Never** run live backfill if the dry-run output mismatches the prior week's pattern (terminal stocks jump >25% WoW with no congestion bullet, vessel queue triples with no event in the bullets, etc.) — that signals parser drift, not data shift.
- **Never** delete or overwrite a row from a prior week. Upsert on `(crop_year, grain_week)` is the only write mode.

### Why these tiers exist

Autonomous self-healing is only safe when the agent has a **verifiable success criterion** that runs in seconds. For this importer, that criterion is the Vitest fixture in `lib/__tests__/grain-monitor-weekly-parser.test.ts`. The fixture must fail loudly on bad changes — otherwise "AI can fix it" reduces to "AI can guess and hope," which is worse than escalating to a human, because failures get committed quietly.

Tier 2 exists for **mechanical wording drift** — Quorum re-words a bullet, a number changes from singular to plural, pdf-parse mangles a word. These are common, low-risk, and the seatbelt catches them.

Tier 3 exists for **structural change** — a new field, a missing section, a layout reshuffle. These are rare, high-risk, and warrant a design pass, not a regex tweak.

## Related Files

- `scripts/import-grain-monitor-weekly.ts` - canonical weekly importer (runner, IO, Supabase writes)
- `scripts/grain-monitor/parsers.ts` - pure parser module (`parseVesselsAndWeather` and helpers; the file Tier 2 self-fixes patch)
- `lib/__tests__/grain-monitor-weekly-parser.test.ts` - Vitest fixtures locking in parser behavior; the seatbelt that gates Tier 2
- `scripts/import-grain-monitor.mjs` - **fallback / backfill only**
- `docs/reference/collector-task-configs.md` - routine schedule registry
- `docs/plans/2026-04-20-grain-monitor-fix-handoff.md` - design decisions behind this importer
- `.claude/agents/logistics-scout.md` - downstream consumer
