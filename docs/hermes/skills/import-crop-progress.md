# Import USDA Crop Progress & Condition

## Purpose
Fetch USDA NASS weekly Crop Progress reports and upsert to `usda_crop_progress` table. Condition ratings (Good/Excellent %) are the market's primary gauge of US crop health during the growing season. A 5-point weekly drop in G/E% can move futures 3-5%.

## Schedule
- **When:** Every Monday after 4:30 PM ET (USDA releases at 4:00 PM ET)
- **Frequency:** Weekly, April through November only (dormant Dec-Mar)
- **Trigger:** On-demand via `/run import-crop-progress`

## Commodity Mapping

| USDA NASS source | Canonical row written to `usda_crop_progress` | Season |
|---|---|---|
| `WHEAT` + `WINTER` | `commodity='WHEAT'`, `cgc_grain='Wheat'` | Sep-Jul |
| `WHEAT` + `SPRING, (EXCL DURUM)` | `commodity='WHEAT'`, `cgc_grain='Wheat'` | Apr-Sep |
| `CORN` | `commodity='CORN'`, `cgc_grain='Corn'` | Apr-Nov |
| `SOYBEANS` | `commodity='SOYBEANS'`, `cgc_grain='Soybeans'` | May-Nov |
| `BARLEY` | `commodity='BARLEY'`, `cgc_grain='Barley'` | Apr-Sep |
| `OATS` | `commodity='OATS'`, `cgc_grain='Oats'` | Apr-Aug |

**Important:** Do not write Canadian proxy mappings into this source table. If Canola needs a soybean crop-condition proxy, resolve that in the query or consumer layer.

## API Details

**Endpoint:** `https://quickstats.nass.usda.gov/api/api_GET/`

**Authentication:** API key required — register at https://quickstats.nass.usda.gov/api/

**Key parameters:**
```
key={NASS_API_KEY}
source_desc=SURVEY
sector_desc=CROPS
group_desc=FIELD CROPS
commodity_desc={commodity}
statisticcat_desc=PROGRESS or CONDITION
agg_level_desc=NATIONAL
year={year}
freq_desc=WEEKLY
format=JSON
```

**For progress (planting, harvest):**
- `statisticcat_desc=PROGRESS`
- `unit_desc=PCT PLANTED` or `PCT HARVESTED` or `PCT HEADED` etc.

**For condition ratings:**
- `statisticcat_desc=CONDITION`
- `unit_desc=PCT EXCELLENT`, `PCT GOOD`, `PCT FAIR`, `PCT POOR`, `PCT VERY POOR`

**Rate limit:** 50,000 records/day, reasonable for our usage

## Algorithm

```
1. Check if current date is within growing season (Apr 1 - Nov 30):
   - If not, log "Off-season — skipping crop progress import" and exit

2. For each canonical market in mapping table:
   a. Fetch current-year QuickStats rows for each required source variant
      - Example: Wheat pulls both WINTER and SPRING, (EXCL DURUM)
   b. Pivot raw QuickStats metric rows into one canonical row per
      - `(commodity, state, week_ending)`
   c. Populate denormalized market-facing columns:
      - progress stages (planted/emerged/headed/blooming/setting pods/turning color/mature/harvested)
      - condition buckets (VP/P/F/G/E)
      - `good_excellent_pct`
      - `condition_index`
      - `ge_pct_yoy_change`
      - `planted_pct_vs_avg`
   d. Upsert on `(commodity, state, week_ending)`

3. Log import results
```

## Key Interpretation Rules

- **G/E% > 65%** = crop in good shape. No supply scare premium justified.
- **G/E% 50-65%** = below average but not critical. Moderate weather premium.
- **G/E% < 50%** = trouble. Supply scare pricing enters. Bullish for grain prices.
- **Weekly G/E drop > 5 points** = significant deterioration. This IS the market-moving event.
- **Planting pace behind 5yr avg by >10 points** = delayed planting. May reduce planted acres or yield potential.
- **Harvest pace behind by >15 points** = quality risk + delayed delivery. Can tighten near-term supply.

**Canadian impact channel:**
- Poor US spring or winter wheat condition → bullish input for the v1 US wheat lane
- Poor US soybean condition → available as a canola proxy in the consumer/query layer
- US corn condition is less direct but affects feed grain substitution (barley, oats)

## Supabase Write Pattern

```python
row = {
    "market_name": "Wheat",
    "commodity": "WHEAT",
    "cgc_grain": "Wheat",
    "state": "US TOTAL",
    "week_ending": "2026-04-12",
    "crop_year": 2026,
    "planted_pct": 12.0,
    "emerged_pct": None,
    "condition_very_poor_pct": 2.0,
    "condition_poor_pct": 5.0,
    "condition_fair_pct": 25.0,
    "condition_good_pct": 48.0,
    "condition_excellent_pct": 20.0,
    "good_excellent_pct": 68.0,
    "condition_index": 3.79,
    "ge_pct_yoy_change": -3.0,
    "planted_pct_vs_avg": -5.0,
    "source": "usda_nass_quickstats"
}

supabase.table("usda_crop_progress").upsert(
    row,
    on_conflict="commodity,state,week_ending"
).execute()
```

## Validation Rules

1. All percentages should be 0-100. Sum of VP+P+F+G+E should equal ~100% (±1% rounding)
2. Planted % should be monotonically increasing within a season
3. G/E% should not swing >15 points in a single week (possible data error — flag for review)
4. Condition data usually starts week 18-19 (early May) for spring crops
5. If API returns zero rows for a commodity in season, it may be too early — check historical start dates

## Error Handling

- Off-season call: Exit gracefully with informational log
- API key expired: Log error, do not retry. Notify for manual key renewal.
- Missing condition data for a week: Log warning, skip that week. Do not fill with zeros.
- NASS API rate limit hit: Delay 60s and retry. Max 2 retries.

## Success Output

```json
{
  "status": "success",
  "season_active": true,
  "commodities_imported": 5,
  "total_rows_upserted": 35,
  "latest_week": "2026-04-12",
  "condition_alerts": [
    {"commodity": "WHEAT, SPRING", "ge_pct": 58.0, "yoy_change": -7.0, "alert": "Below average, deteriorating"}
  ],
  "errors": []
}
```
