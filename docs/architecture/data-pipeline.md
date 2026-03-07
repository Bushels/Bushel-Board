# CGC Data Pipeline -- Architecture & Operations

## Overview

The Bushel Board data pipeline automatically imports Canadian Grain Commission (CGC) weekly grain statistics into Supabase every Thursday. The pipeline uses pg_cron for scheduling, pg_net for async HTTP calls, and a Deno Edge Function for CSV download, parsing, and batch upsert. Historical data is loaded via a one-time backfill script.

## Data Flow

```
  grainscanada.gc.ca
        |
        | CSV download (HTTP GET)
        v
  +---------------------+
  | pg_cron              |
  | (Thursday 8pm UTC)   |
  +---------------------+
        |
        | async HTTP POST via pg_net
        v
  +---------------------+
  | Edge Function        |
  | import-cgc-weekly    |
  +---------------------+
        |
        | 1. Download CSV from CGC
        | 2. Parse rows (lib/cgc/parser.ts)
        | 3. Batch upsert (500/batch)
        v
  +---------------------+
  | cgc_observations     |
  | (Supabase table)     |
  +---------------------+
        |
        | SQL views aggregate & filter
        v
  +---------------------+       +---------------------+
  | Dashboard Views      | ----> | Next.js Dashboard   |
  | (v_grain_deliveries, |       | (App Router SSR)    |
  |  v_grain_shipments,  |       +---------------------+
  |  v_grain_stocks,     |
  |  v_terminal_exports, |
  |  v_shipment_distrib, |
  |  v_latest_import,    |
  |  v_grain_overview)   |
  +---------------------+
```

## Components

### pg_cron Schedule

- **Job name:** `cgc-weekly-import`
- **Schedule:** `0 20 * * 4` (every Thursday at 8:00 PM UTC / 1:00 PM MST)
- **What it does:** Calls `net.http_post()` to invoke the Edge Function
- **Migration:** `supabase/migrations/20260305500000_schedule_cgc_weekly_import.sql`

The schedule runs 7 hours after the CGC typically publishes new data (~1pm MST), providing a comfortable buffer to ensure the CSV is available.

### pg_net

Makes asynchronous HTTP POST requests from within PostgreSQL. The cron job uses `net.http_post()` to call the Edge Function endpoint. Request and response details are logged in `net._http_response` for debugging.

### Vault

Supabase Vault securely stores two secrets used by the cron job:

| Secret name         | Purpose                                      |
|---------------------|----------------------------------------------|
| `project_url`       | Supabase project URL for Edge Function calls |
| `project_anon_key`  | Anon key for Authorization header            |

These are read at cron execution time via `vault.decrypted_secrets`, avoiding any hardcoded credentials in SQL.

### Edge Function: `import-cgc-weekly`

- **Location:** `supabase/functions/import-cgc-weekly/`
- **Runtime:** Deno (Supabase Edge Functions)
- **Auth:** Accepts anon key via Authorization header; uses service_role internally for writes
- **Process:**
  1. Downloads the current week's CSV from `grainscanada.gc.ca`
  2. Parses CSV using the shared parser (`lib/cgc/parser.ts`)
  3. Batch upserts parsed rows into `cgc_observations` (500 rows per batch)
  4. Logs import result to `cgc_imports` audit table
- **Idempotent:** Uses upsert on the composite unique constraint, so re-runs are safe

### Backfill Script: `scripts/backfill.ts`

- **Purpose:** One-time historical load or full re-import
- **Batch size:** 1,000 rows per batch (larger than Edge Function since it runs locally)
- **Usage:** `npm run backfill`
- **Accepts:** `--help` flag, outputs JSON to stdout, diagnostics to stderr
- **Idempotent:** Safe to re-run; upserts all rows

### Parser: `lib/cgc/parser.ts`

Shared CSV parsing module used by both the Edge Function and backfill script. Handles:
- CGC CSV format (Crop Year, Grain Week, Week Ending Date, worksheet, metric, period, grain, grade, Region, Ktonnes)
- Data type coercion (numeric fields, date parsing)
- Row validation and skip logic for malformed data

## Database Tables

### `cgc_observations`

The primary data table storing all CGC grain statistics in long format (one row per measurement).

| Column          | Type      | Description                           |
|-----------------|-----------|---------------------------------------|
| id              | uuid      | Primary key                           |
| crop_year       | text      | e.g., "2025-26"                       |
| grain_week      | integer   | Week number (1-52)                    |
| week_ending     | date      | Week ending date                      |
| worksheet       | text      | CGC worksheet identifier              |
| metric          | text      | Measurement type                      |
| period          | text      | Time period qualifier                 |
| grain           | text      | Grain type (33 varieties)             |
| grade           | text      | Grain grade                           |
| region          | text      | Geographic region                     |
| ktonnes         | numeric   | Value in kilotonnes                   |
| created_at      | timestamp | Row creation time                     |

**Current data:** 118,378 rows, crop year 2025-26, weeks 1-29, 33 grain types.

### `cgc_imports`

Audit log tracking every import operation.

| Column       | Type      | Description                        |
|--------------|-----------|------------------------------------|
| id           | uuid      | Primary key                        |
| status       | text      | "success" or "error"               |
| rows_upserted| integer   | Number of rows written             |
| rows_skipped | integer   | Number of rows skipped             |
| duration_ms  | integer   | Import duration in milliseconds    |
| error_message| text      | Error details (if status = error)  |
| imported_at  | timestamp | When the import ran                |

## Dashboard Views

| View                    | Purpose                                                |
|-------------------------|--------------------------------------------------------|
| `v_grain_deliveries`    | Weekly producer deliveries by grain and region         |
| `v_grain_shipments`     | Domestic and export shipment volumes                   |
| `v_grain_stocks`        | Current stocks in store by location type               |
| `v_terminal_exports`    | Terminal elevator export activity                      |
| `v_shipment_distribution` | Distribution of shipments across transport modes     |
| `v_latest_import`       | Most recent import metadata (freshness indicator)      |
| `v_grain_overview`      | Summary stats across all grains for dashboard cards    |

## Monitoring

### Check cron job status

```sql
SELECT * FROM cron.job;
```

### Check recent cron runs

```sql
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
```

### Check import audit log

```sql
SELECT * FROM cgc_imports ORDER BY imported_at DESC LIMIT 5;
```

### Check pg_net HTTP responses

```sql
SELECT * FROM net._http_response ORDER BY created DESC LIMIT 5;
```

### Check data freshness

```sql
SELECT * FROM v_latest_import;
```

### Quick data integrity check

```sql
SELECT
  COUNT(*) AS total_rows,
  COUNT(DISTINCT grain) AS grain_count,
  COUNT(DISTINCT grain_week) AS week_count,
  MIN(week_ending) AS earliest_week,
  MAX(week_ending) AS latest_week
FROM cgc_observations;
```

## Troubleshooting

### Import did not run on Thursday

1. Check that pg_cron is enabled: `SELECT * FROM cron.job WHERE jobname = 'cgc-weekly-import';`
2. Check cron run history for errors: `SELECT * FROM cron.job_run_details WHERE jobname = 'cgc-weekly-import' ORDER BY start_time DESC LIMIT 5;`
3. Verify Vault secrets are present: `SELECT name FROM vault.decrypted_secrets WHERE name IN ('project_url', 'project_anon_key');`
4. Check pg_net response for HTTP errors: `SELECT status_code, content FROM net._http_response ORDER BY created DESC LIMIT 5;`

### Edge Function returned an error

1. Check Supabase Dashboard > Edge Functions > import-cgc-weekly > Logs
2. Verify the CGC CSV URL is accessible (may be temporarily down)
3. Check `cgc_imports` for error messages: `SELECT * FROM cgc_imports WHERE status = 'error' ORDER BY imported_at DESC LIMIT 5;`

### Data looks stale or incomplete

1. Check freshness: `SELECT * FROM v_latest_import;`
2. Run a manual import by invoking the Edge Function directly via `curl` or the Supabase Dashboard
3. If needed, run `npm run backfill` to re-import all historical data (safe due to upsert)

### Duplicate or missing rows

The upsert strategy uses a composite unique constraint, so true duplicates should not exist. If rows appear missing:
1. Verify the CGC CSV contains the expected weeks
2. Check `cgc_imports` for partial imports (rows_skipped > 0)
3. Re-run backfill for a clean slate

## Key Files

| File                                                          | Purpose                                    |
|---------------------------------------------------------------|--------------------------------------------|
| `supabase/functions/import-cgc-weekly/index.ts`               | Edge Function for weekly import            |
| `lib/cgc/parser.ts`                                           | Shared CSV parser                          |
| `scripts/backfill.ts`                                         | Historical data loader                     |
| `supabase/migrations/20260305500000_schedule_cgc_weekly_import.sql` | pg_cron scheduling migration         |
| `docs/architecture/data-pipeline.md`                          | This document                              |
