---
name: cftc-cot
description: >
  Import, query, and analyze CFTC Commitment of Traders (COT) data for grain futures positioning.
  Use when the user says: 'import COT', 'CFTC data', 'COT report', 'check trader positioning',
  'spec positions', 'managed money', 'who is long wheat', 'canola futures positioning',
  'speculative positioning', 'commercial hedging data'.
  Do NOT use for: general Supabase queries (use Supabase MCP directly), deploying Edge Functions
  (use supabase-deploy skill), triggering CGC imports (use cgc-import skill), scoring Wheat
  direction by itself, or generating intelligence narratives. The old Grok writer chain is retired.
---

# CFTC COT Skill — Bushel Board

Import and query CFTC Commitments of Traders data for grain futures positioning analysis.

## Project Context

- **Supabase project:** `ibgsloyjxdopkvwqcqwh`
- **Data source:** CFTC SODA API (Disaggregated Combined dataset `kh3c-gbw2`)
- **HTML page:** https://www.cftc.gov/dea/options/ag_lof.htm
- **Update schedule:** Every Friday ~1:30pm MST (data as of prior Tuesday)
- **Automated import:** Vercel cron `GET /api/cron/import-cftc-cot` at 8:30pm UTC Fridays
- **Edge Function:** `import-cftc-cot` (internal-secret auth)
- **Table:** `cftc_cot_positions`
- **RPC:** `get_cot_positioning(p_grain, p_crop_year, p_weeks_back)`

## CFTC → CGC Grain Mapping

| CFTC Commodity | CGC Grain | Type |
|----------------|-----------|------|
| WHEAT-HRSpring (MIAX) | Wheat | primary |
| WHEAT-SRW (CBOT) | Wheat | secondary |
| WHEAT-HRW (CBOT) | Wheat | secondary |
| CANOLA (ICE) | Canola | primary |
| SOYBEANS (CBOT) | Soybeans | primary |
| SOYBEAN OIL (CBOT) | Canola | secondary |
| SOYBEAN MEAL (CBOT) | Canola | secondary |
| CORN (CBOT) | Corn | primary |
| OATS (CBOT) | Oats | primary |

Grains without CFTC match: Durum, Barley, Peas, Lentils, Flaxseed, Rye, Mustard Seed, Canaryseed, Chick Peas, Sunflower, Beans.

## Monitoring Queries

Run via Supabase MCP (`execute_sql` with project_id `ibgsloyjxdopkvwqcqwh`):

### Latest COT import
```sql
SELECT commodity, cgc_grain, report_date, open_interest,
       (managed_money_long - managed_money_short) AS mm_net,
       import_source
FROM cftc_cot_positions ORDER BY imported_at DESC LIMIT 10;
```

### Managed money net by grain (latest week)
```sql
SELECT cgc_grain, commodity, report_date,
       (managed_money_long - managed_money_short) AS mm_net,
       ROUND(((managed_money_long - managed_money_short) / NULLIF(open_interest, 0) * 100)::numeric, 1) AS mm_net_pct
FROM cftc_cot_positions
WHERE report_date = (SELECT MAX(report_date) FROM cftc_cot_positions)
  AND mapping_type = 'primary'
ORDER BY cgc_grain;
```

### Per-grain positioning with divergence (uses RPC)
```sql
SELECT * FROM get_cot_positioning('Wheat', '2025-2026', 4);
SELECT * FROM get_cot_positioning('Canola', '2025-2026', 4);
```

### Biggest WoW managed money shifts
```sql
SELECT cgc_grain, commodity, report_date,
       (COALESCE(change_managed_money_long, 0) - COALESCE(change_managed_money_short, 0)) AS wow_mm_net_change
FROM cftc_cot_positions
WHERE report_date = (SELECT MAX(report_date) FROM cftc_cot_positions)
  AND mapping_type = 'primary'
ORDER BY ABS(COALESCE(change_managed_money_long, 0) - COALESCE(change_managed_money_short, 0)) DESC;
```

## Trigger Import

### Via local wrapper (preferred during repo work)
```bash
python3 scripts/collect-cftc-cot.py --dry-run
python3 scripts/collect-cftc-cot.py --report-date YYYY-MM-DD
```

Important: `--dry-run` reads the current Supabase table and prints planned heartbeats. It does not call the Edge Function and does not prove whether the official CFTC SODA feed has a newer report. Before deciding "no newer CFTC", query the official dataset `kh3c-gbw2` for the mapped contracts.

### Via Vercel cron proxy (preferred)
```bash
curl https://bushel-board-app.vercel.app/api/cron/import-cftc-cot \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Via Edge Function directly
```bash
curl -X POST "https://ibgsloyjxdopkvwqcqwh.supabase.co/functions/v1/import-cftc-cot" \
  -H "Content-Type: application/json" \
  -H "x-bushel-internal-secret: $BUSHEL_INTERNAL_FUNCTION_SECRET" \
  -d '{}'
```

## Workflow

### 1. Check data freshness
- Query latest `report_date` in `cftc_cot_positions`
- Check the official CFTC SODA dataset for the mapped contracts before assuming the database is current
- Compare against expected Friday release (data as of prior Tuesday)
- If stale and the official feed has advanced, trigger import with the explicit `--report-date`

### 2. Trigger import
- Prefer Vercel cron proxy, fall back to Edge Function direct
- Verify: check `imported_at` and row count

### 3. Analyze positioning
- Use `get_cot_positioning()` RPC for computed metrics
- Look for: extreme positioning, spec/commercial divergence, multi-week trends
- Report findings to user in plain language
- For Wheat Bull/Bear work, treat CFTC as timing/crowding context. It can raise or lower confidence, but it should not become the primary direction creator without official supply/demand or price confirmation.

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| No data for this week | CFTC not yet published (check after 1:30pm MST Friday) | Wait and retry |
| Stale data despite cron | Vercel cron failed or CFTC API changed | Check Edge Function logs; manually import |
| Dry-run says latest row is old | Dry-run reads Supabase only | Query official SODA, then run wrapper with `--report-date` if feed has advanced |
| Soybean Oil/Meal mapping | Secondary mapping to Canola | These are crush demand proxies, not direct canola positioning |
| Missing Oats | Parser or deployed Edge Function is stale | Oats should be mapped as `OATS` -> `Oats` primary |
| Canola shows 0 | ICE Futures sometimes reported separately | Check if commodity name differs in API response |
