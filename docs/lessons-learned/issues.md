# Bushel Board — Lessons Learned

## 2026-03-10 — Pipeline Velocity Chart: Silent Data Truncation

**Symptom:** Pipeline Velocity chart showed flat lines for Terminal Receipts and Terminal Exports. Terminal Receipts displayed ~4,226 kt at week 20 instead of the correct 11,087 kt. Lines appeared to stop increasing around week 8, and "lower totals plotted above higher totals."

**Root Cause:** Supabase's PostgREST enforces a server-side `max_rows=1000` limit on all queries. The Terminal Receipts and Terminal Exports worksheets in `cgc_observations` store data per-grade per-region (no pre-aggregated `grade=''` rows like Primary does), producing far more rows than the limit:

| Metric | Row count | Over limit? |
|--------|----------|-------------|
| Terminal Receipts (Wheat) | 3,648 | 3.6x over (20 grades x 6 ports x 30 weeks) |
| Terminal Exports (Wheat) | 1,050 | Slightly over (6 grades x 6 ports x 30 weeks) |
| Primary Deliveries | 90 | OK (3 provinces x 30 weeks, grade='' aggregates) |
| Processing | 30 | OK (national total, grade='' aggregates) |

PostgREST silently truncated the response — no error, no warning. The client code received 1,000 out of 3,648 rows (~first 8 weeks), summed them correctly, then the forward-fill logic carried the last known value flat for remaining weeks.

**Why `.limit(10000)` didn't work:** PostgREST's `max_rows` config acts as an upper ceiling. The client `.limit()` sets a `Range` header, but the server caps it at `max_rows=1000` regardless.

**Solution:** Created `get_pipeline_velocity(p_grain, p_crop_year)` RPC function (migration `20260310200000_pipeline_velocity_rpc.sql`) that aggregates all 5 metrics in PostgreSQL using `SUM() GROUP BY grain_week`. Returns exactly 30 rows per grain instead of 3,648+. Updated `getCumulativeTimeSeries()` in `lib/queries/observations.ts` to call this RPC.

**Additional fix:** Added `Number()` coercion for `ktonnes` values (Postgres `numeric` type may return as strings from PostgREST). Fixed tooltip formatter in `gamified-grain-chart.tsx` to show series names instead of blank labels.

**Prevention:**
- Always check row counts when querying denormalized/long-format tables with `.select()`
- If a query could exceed ~500 rows, prefer a server-side RPC with `GROUP BY`
- CGC Terminal Receipts and Terminal Exports have NO `grade=''` aggregate rows — must always sum across grades
- Test Pipeline Velocity with Wheat first (highest row count: ~3,648 for Terminal Receipts)

**Files modified:**
- `lib/queries/observations.ts` — replaced 5 client queries with single RPC call
- `components/dashboard/gamified-grain-chart.tsx` — fixed tooltip to show series names
- `supabase/migrations/20260310200000_pipeline_velocity_rpc.sql` — new RPC function

**Tags:** #supabase #postgrest #data-truncation #chart #pipeline-velocity #rpc
