# Import USDA Crop Progress & Condition

## Purpose
Fetch USDA NASS weekly Crop Progress reports and upsert to `usda_crop_progress` table. Condition ratings (Good/Excellent %) are the market's primary gauge of US crop health during the growing season. A 5-point weekly drop in G/E% can move futures 3-5%.

## Schedule
- **When:** Every Monday after 4:30 PM ET (USDA releases at 4:00 PM ET)
- **Frequency:** Weekly, April through November only (dormant Dec-Mar)
- **Trigger:** On-demand via `/run import-crop-progress`

## Commodity Mapping

| USDA NASS Commodity | CGC Grain | Season |
|---|---|---|
| WHEAT, SPRING, (EXCL DURUM) | Wheat | Apr-Sep |
| WHEAT, WINTER | Wheat | Sep-Jul (condition from Apr) |
| WHEAT, DURUM | Amber Durum | Apr-Sep |
| CORN, GRAIN | Corn | Apr-Nov |
| SOYBEANS | Canola (proxy) | May-Nov |
| BARLEY | Barley | Apr-Sep |
| OATS | Oats | Apr-Aug |

**Note:** Spring wheat is the direct competitor to Canadian CWRS. Winter wheat conditions matter for global supply but less directly for Canadian farmers.

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

2. For each commodity in mapping table:
   a. Fetch CONDITION data for current year, national level
   b. Fetch PROGRESS data for current year, national level
   c. For each week_ending in response:
      - Parse condition percentages (VP, P, F, G, E)
      - Compute good_excellent_pct = good + excellent
      - Compute condition_index = (VP*1 + P*2 + F*3 + G*4 + E*5) / 100
      - Parse progress percentages (planted, emerged, headed, harvested)
   d. Fetch same-week-last-year G/E% for YoY comparison:
      - ge_pct_yoy_change = current_ge - prior_year_ge
   e. Fetch 5-year average planting pace for vs-average comparison
   f. Upsert to usda_crop_progress

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
- Poor US spring wheat condition → bullish for CWRS (competing origin constrained)
- Poor US soybean condition → bullish for canola (oilseed complex lifts all boats)
- US corn condition is less direct but affects feed grain substitution (barley, oats)

## Supabase Write Pattern

```python
row = {
    "commodity": "WHEAT, SPRING, (EXCL DURUM)",
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
    "source": "USDA-NASS"
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
