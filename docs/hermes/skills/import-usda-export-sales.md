# Import USDA Weekly Export Sales

## Purpose
Fetch USDA FAS weekly export sales data and upsert to `usda_export_sales` table in Supabase. This provides the global demand signal that Canadian data alone cannot — net sales, shipments, outstanding commitments by commodity.

## Schedule
- **When:** Every Thursday after 9:00 AM ET (USDA releases at 8:30 AM ET)
- **Frequency:** Weekly during crop year
- **Trigger:** Can also run on-demand via `/run import-usda-export-sales`

## Commodity Mapping

| USDA Commodity | Code | CGC Grain | Mapping |
|---|---|---|---|
| Wheat | 107 | Wheat | primary |
| Corn | 104 | Corn | primary |
| Soybeans | 201 | Canola | proxy |
| Soybean Oil | 207 | Canola | proxy |
| Soybean Meal | 206 | Canola | proxy |
| Barley | 101 | Barley | primary |
| Oats | 105 | Oats | primary |
| Sorghum | 108 | — | reference |

Unmapped: Peas, Lentils, Flaxseed, Rye, Mustard, Canaryseed — no USDA weekly export sales equivalent.

## API Details

**Endpoint:** `https://apps.fas.usda.gov/OpenData/api/esr/exports/commodityCode/{code}/allCountries/marketYear/{year}`

**Authentication:** None required (public API)

**Response format:** JSON array of weekly records

**Rate limiting:** Be polite — 1 request per commodity, 2-second delay between requests

**Key fields in response:**
- `weekEndingDate` — ISO date string
- `netSales` — Net new sales (MT)
- `exports` — Actual shipments (MT)
- `outstandingSales` — Unshipped commitments (MT)
- `cumulativeExports` — Marketing-year-to-date exports (MT)
- `countryDescription` — Buyer country name
- `marketYear` — e.g., "2025/2026"

## Algorithm

```
1. For each commodity in mapping table:
   a. GET /api/esr/exports/commodityCode/{code}/allCountries/marketYear/{current_MY}
   b. Parse JSON response
   c. Aggregate by week_ending:
      - Sum net_sales across all countries for weekly total
      - Sum exports across all countries for weekly total
      - Extract top 5 buyers by net_sales as top_buyers JSONB
      - Get outstanding_sales from any row (same across all country rows)
      - Get cumulative_exports from sum of exports
   d. Calculate export_pace_pct if usda_projection available
   e. Upsert to usda_export_sales with ON CONFLICT (commodity_code, market_year, week_ending)

2. Also fetch next marketing year data for new-crop sales:
   a. GET same endpoint with next MY
   b. Extract net_sales_next_yr_mt for the latest week

3. Log import: count of rows upserted per commodity, any errors
```

## Supabase Write Pattern

```python
from supabase import create_client

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

row = {
    "commodity": "Wheat",
    "commodity_code": 107,
    "cgc_grain": "Wheat",
    "mapping_type": "primary",
    "market_year": "2025/2026",
    "week_ending": "2026-04-09",
    "net_sales_mt": 425000,
    "exports_mt": 380000,
    "outstanding_mt": 4200000,
    "cumulative_exports_mt": 18500000,
    "top_buyers": [
        {"country": "Mexico", "mt": 120000},
        {"country": "Japan", "mt": 85000},
        {"country": "Philippines", "mt": 62000}
    ],
    "source": "USDA-FAS"
}

supabase.table("usda_export_sales").upsert(
    row,
    on_conflict="commodity_code,market_year,week_ending"
).execute()
```

## Validation Rules

1. Net sales should not be negative for >3 consecutive weeks (indicates cancellations — flag as anomaly)
2. Outstanding sales should not drop >20% in a single week without a matching export spike
3. Cumulative exports should be monotonically increasing within a marketing year
4. Total commitments (outstanding + cumulative) should be within 20% of USDA annual projection
5. If API returns empty for a commodity, do NOT delete existing data — log warning and skip

## Data Freshness

USDA export sales data is for the week ending the prior Thursday. By the time we import it, the data is 7-8 days old. Always note this lag in the data freshness card when injecting into the analyst prompt.

## Error Handling

- API timeout (>30s): Retry once after 5s delay. If still fails, log error and continue with next commodity.
- Empty response: Log warning, skip commodity. Do not assume zero sales.
- Malformed JSON: Log full response body to stderr, skip commodity.
- Supabase write failure: Log error with row data. Do not retry — manual investigation needed.

## Success Output

```json
{
  "status": "success",
  "commodities_imported": 6,
  "total_rows_upserted": 180,
  "latest_week": "2026-04-09",
  "market_year": "2025/2026",
  "errors": []
}
```
