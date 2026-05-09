# WASDE Monthly Density — Design Options

## Problem

The desk's `get_usda_wasde_context(p_cgc_grain, p_months_back)` RPC reads from `usda_wasde_mapped`, which derives from `usda_wasde_raw`. The raw table is populated by `scripts/import-usda-wasde.py` against the USDA FAS PSD OpenData API (`apps.fas.usda.gov/OpenData/api/psd`).

The PSD API has a **data-shape limit**: it returns only the **latest estimate** for each `(commodity, attribute, market_year)` tuple. There is no `as_of_date` parameter and no release-history endpoint. As a consequence:

- Today (2026-04-28) the desk has Wheat snapshots at MY 2023 (Nov 2025), MY 2024 (Jan 2026), MY 2025 (Apr 2026) — three different MYs at three different report dates.
- For any single MY (e.g. 2025/26), there is exactly **one** monthly snapshot in the database.
- The `revision_direction` LAG window in the RPC partitions by `(market_name, country_code, market_year)`, so it returns NULL whenever a partition has only one row.
- Net effect: the desk knows the latest WASDE numbers but cannot see month-over-month revisions, which is the most actionable WASDE signal.

## Why this matters

Month-over-month revision direction is a primary fundamental driver. WASDE moves markets when ending stocks, exports, or production estimates **change** vs the prior month — not just on absolute level. Without revision history, the desk's macro-scout writes "ending stocks 25.5 mmt" instead of "ending stocks **revised down 0.5 mmt** vs March → bullish".

## Constraints

- USDA PSD API: latest estimate only. Confirmed by inspecting payloads from `--market-year 2024` (returns one estimate per attribute, dated April 2026 — the latest release).
- `scripts/import-usda-wasde.py --report-month 2025-12` returns 0 rows because the PSD response no longer carries Dec 2025 data once the Apr 2026 report supersedes it.
- The `usda_wasde_mapped` view groups by `(market_name, market_year, calendar_year, month)` so additional historical rows would naturally densify the LAG window.
- Naturally accumulating one row per month going forward will close the gap, but takes ~6 months to provide a useful 6-month trend.

## Solution Options

### Option A — USDA Cornell Archive Scraper (recommended)

USDA publishes monthly WASDE data in machine-readable formats at the **Cornell University Mann Library** archive:

- Index: <https://usda.library.cornell.edu/concern/publications/3t945q76s>
- Each release has PDF, XLS, and ZIP downloads going back to 1985
- Releases are stamped with an exact release date (e.g. `wasde0426.xls` = April 2026 release)

**Implementation sketch**

```python
# scripts/import-usda-wasde-archive.py
# 1. Walk the Cornell archive index, list releases for the last N months
# 2. For each release: fetch wasdeMMYY.xls, parse the canonical worksheets
#    (page 12 = Wheat US, page 14 = Corn US, page 18 = Soybeans US, etc.)
# 3. Extract attributes (production, exports, ending stocks, S/U) for our 5 MARKETS
# 4. Map to PSD attribute_ids and upsert into usda_wasde_raw with the
#    release_date as the calendar_year/month key
```

**Pros**: machine-readable, reliable structure (worksheets haven't moved in years), natural release-date provenance.
**Cons**: ~150-line parser, requires `openpyxl` + careful column mapping per market, USDA can theoretically change layout (low risk historically).

### Option B — USDA NASS QuickStats API

NASS QuickStats has WASDE-equivalent data at <https://quickstats.nass.usda.gov/api>. It exposes monthly observations with a `reference_period_desc` filter and a key-based REST API.

**Pros**: stable JSON API, similar shape to existing `import-usda-export-sales.py`.
**Cons**: NASS coverage of WASDE attributes is partial (good for production/yield, gaps for stocks), would need a per-attribute mapping table.

### Option C — Wait it out

`collect-wasde` runs Friday between the 10th–14th each month. Each run captures one new monthly snapshot for the current MY. By month 6 the LAG window has 5 prior comparators. Existing data sources unchanged.

**Pros**: zero engineering cost.
**Cons**: 3–6 months until revision_direction is meaningful for the desk; no historical context for 2024/25 or 2023/24 MYs.

## Recommendation

Start with **Option A** because:
1. Cornell's archive is the same source USDA references; it's the canonical primary data
2. Excel parsing is much more stable than PDF parsing
3. One-shot historical backfill (e.g. last 24 months of releases) gives the desk immediate revision context across multiple MYs
4. Adding it doesn't break the existing `import-usda-wasde.py` PSD path — the two are complementary (PSD = latest; archive = history)

## Implementation Plan

1. **Investigate** the Cornell archive HTML structure and Excel layout (1 hour)
2. **Build** `scripts/import-usda-wasde-archive.py` (4–6 hours)
   - Reuse `usda_wasde_raw` upsert logic from `import-usda-wasde.py`
   - Parse 5 market sheets per release, map columns to PSD attribute_ids
   - Add a `release_date` column to `usda_wasde_raw` if not already present (verify schema)
   - Idempotent: re-running for a given release produces same rows
3. **Backfill** the last 12 monthly releases (2 hours including verification)
4. **Verify** `get_usda_wasde_context('Wheat', 6)` returns 6 distinct rows for MY 2025/26 with non-null `revision_direction` for at least 5 of them
5. **Document** in CLAUDE.md and add the archive scraper as a manual-trigger tool (no Claude Desktop Routine yet — historical backfill is one-shot)

## Estimated effort

8–10 hours including verification and doc updates. Defer-until-needed status: medium priority — desk works without it, but revision_direction is a known macro-scout gap.
