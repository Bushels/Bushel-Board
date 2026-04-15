# Import USDA WASDE Estimates

## Purpose
Fetch USDA WASDE (World Agricultural Supply and Demand Estimates) monthly data and upsert to `usda_wasde_estimates` table. WASDE provides the single most important fundamental number in grain markets: **stocks-to-use ratio**. This ratio drives long-term price expectations globally.

## Schedule
- **When:** Monthly, on WASDE release day (~12th of each month, 12:00 PM ET)
- **Frequency:** Monthly
- **Trigger:** On-demand via `/run import-usda-wasde`
- **WASDE override rule:** If ending stocks revision exceeds ±3% vs prior month, trigger re-analysis for affected grains

## Commodity Mapping

| USDA PSD Commodity | CGC Grain | Notes |
|---|---|---|
| Wheat | Wheat | US + World rows |
| Corn | Corn | US + World rows |
| Soybeans | Canola (proxy) | US soybean S/U drives canola floor |
| Barley | Barley | US + World rows |
| Oats | Oats | Often only US data available |
| Sorghum | — | Reference only |

## API Details

**Primary endpoint:** `https://apps.fas.usda.gov/psdonline/api/data`

**Parameters:**
- `commodityCode` — PSD commodity code
- `countryCode` — `US` for United States, `WO` for World
- `marketYear` — e.g., `2025/2026`
- `attributeId` — specific S&D line items

**Alternative (structured reports):** `https://usda.library.cornell.edu/concern/publications/3t945q76s`
- WASDE PDFs also available but less machine-friendly
- PSD Online API preferred for structured data

**Authentication:** API key required for NASS QuickStats; PSD Online may require registration

**Key attributes to fetch:**
- Beginning Stocks (attributeId varies by commodity)
- Production
- Imports
- Domestic Consumption (Total Use - Exports)
- Exports
- Ending Stocks
- Total Use (Domestic + Exports)

## Algorithm

```
1. Determine latest WASDE report date:
   a. Check USDA release calendar or fetch latest from PSD Online
   b. Compare to max(report_date) in usda_wasde_estimates
   c. If no new report, exit early

2. For each commodity in mapping table:
   a. Fetch US data: production, stocks, use, exports for current + next MY
   b. Fetch World data: same attributes
   c. Compute stocks_to_use_pct = ending_stocks / total_use * 100
   d. Compare to prior month's estimate:
      - prior_ending_stocks_mmt = last month's ending_stocks for same MY
      - stocks_change_mmt = current - prior
      - revision_direction = 'tighter' if stocks decreased, 'looser' if increased
   e. Upsert to usda_wasde_estimates

3. WASDE override check:
   a. For each commodity where |stocks_change_mmt / prior_ending_stocks_mmt| > 0.03:
      - Flag for re-analysis
      - Emit event: "WASDE revision >3% for {grain} — re-run thesis"

4. Log import results
```

## Key Interpretation Rules (inject into analyst prompt)

- **S/U < 10%** for any grain = tight market. Bullish price pressure.
- **S/U > 20%** = comfortable supply. Bearish unless demand shock.
- **Revision direction matters more than absolute level.** Tighter revision = bullish signal even if S/U is still >15%.
- **World vs US divergence:** If US is tight but World is comfortable, prices may not rally as much (global competition). If both tight, strong bullish case.
- **Production revision:** Changes of >2 MMT for major grains move markets. Flag any production revision.

## Supabase Write Pattern

```python
row = {
    "commodity": "Wheat",
    "cgc_grain": "Wheat",
    "country": "United States",
    "market_year": "2025/2026",
    "report_date": "2026-04-10",
    "beginning_stocks_mmt": 17.2,
    "production_mmt": 49.3,
    "imports_mmt": 3.4,
    "total_supply_mmt": 69.9,
    "domestic_use_mmt": 32.1,
    "exports_mmt": 22.4,
    "total_use_mmt": 54.5,
    "ending_stocks_mmt": 15.4,
    "stocks_to_use_pct": 28.3,
    "prior_ending_stocks_mmt": 15.9,
    "stocks_change_mmt": -0.5,
    "revision_direction": "tighter",
    "source": "USDA-WASDE"
}

supabase.table("usda_wasde_estimates").upsert(
    row,
    on_conflict="commodity,country,market_year,report_date"
).execute()
```

## Validation Rules

1. Stocks-to-use should be between 0% and 100% — anything outside is a data error
2. Total supply should equal beginning_stocks + production + imports (within rounding)
3. Ending stocks should equal total_supply - total_use (within rounding)
4. Production should not change >10% month-over-month for the same MY (flag if it does)
5. Report date should be within the current month — stale data means API issue

## Error Handling

- API returns no new report: Exit cleanly. Log "No new WASDE report available."
- Missing attributes for a commodity: Log warning, insert row with NULL fields
- PSD Online down: Try alternate URL or Cornell WASDE feed. If both fail, log and skip.

## Success Output

```json
{
  "status": "success",
  "report_date": "2026-04-10",
  "commodities_imported": 5,
  "countries": ["United States", "World"],
  "total_rows_upserted": 10,
  "wasde_overrides": ["Wheat"],
  "errors": []
}
```
