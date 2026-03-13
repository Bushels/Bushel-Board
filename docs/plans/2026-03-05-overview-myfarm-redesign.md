# Bushel Board — Overview & My Farm Redesign

**Date:** 2026-03-05
**Status:** Approved
**Scope:** Overview page overhaul, My Farm enhancement, supply/disposition data, logo, storage breakdown

---

## 1. Data Foundation

### 1.1 Supply & Disposition Table

New Supabase table `supply_disposition` stores AAFC Canada Outlook balance sheet data per grain per crop year.

**Schema:**

| Column | Type | Example |
|--------|------|---------|
| `id` | uuid (PK) | auto |
| `grain_slug` | text (FK → grains.slug) | `wheat-all` |
| `crop_year` | text | `2025-26` |
| `carry_in_kt` | numeric | 4112 |
| `production_kt` | numeric | 36624 |
| `imports_kt` | numeric | 105 |
| `total_supply_kt` | numeric | 40841 |
| `exports_kt` | numeric | 27700 |
| `food_industrial_kt` | numeric | 3500 |
| `feed_waste_kt` | numeric | 3481 |
| `seed_kt` | numeric | 1060 |
| `total_domestic_kt` | numeric | 8041 |
| `carry_out_kt` | numeric | 5100 |
| `source` | text | `AAFC_2025-11-24` |
| `created_at` | timestamptz | auto |

**RLS:** Public read, service-role-only write.

**Unique constraint:** `(grain_slug, crop_year, source)` — allows both AAFC and StatsCan estimates to coexist.

### 1.2 Production Estimates (StatsCan Nov 2025)

Data from `PrincipleFieldCrops_Nov2025.csv` loaded as `source = 'StatsCan_Nov2025'` into the same table (production_kt only, other fields null where not available).

### 1.3 AAFC Supply & Disposition Data

Full balance sheets for 2023-24, 2024-25, 2025-26 (projected) from:
`https://agriculture.canada.ca/en/sector/crops/reports-statistics/canada-outlook-principal-field-crops-2025-11-24`

**Grains covered (18):** All Wheat, Durum, Barley, Corn, Oats, Rye, Mixed Grains, Canola, Flaxseed, Soybeans, Dry Peas, Lentils, Dry Beans, Chickpeas, Mustard Seed, Canary Seed, Sunflower Seed, Spring Wheat (derived).

---

## 2. Overview Page Redesign

### 2.1 Default View

Top 5 prairie grains shown by default: **Wheat (All), Canola, Barley, Oats, Lentils**. Other grains accessible via "All Grains" link. Farmers who complete My Farm setup see their selected grains prioritized.

### 2.2 Layout (Top → Bottom)

#### A) Crop Year Summary Cards

Row of 5 hero cards, one per default grain. Each shows:
- Grain name + icon
- **Starting stock:** carry-in + production (from `supply_disposition`)
- **% delivered so far:** cumulative CGC producer deliveries / total supply
- **This week:** current week deliveries (Kt) with WoW % change
- Card links to grain detail page
- Locked grains show dimmed + "Add to My Farm"

#### B) Waterfall Chart — "Where Does the Grain Go?"

- Grain selector (tabs or dropdown, defaults to first unlocked grain)
- Waterfall bars: Carry-in → +Production → −Exports → −Food/Industrial → −Feed/Waste → =Carry-out
- Color-coded: green for additions, red/orange for subtractions, blue for ending stocks
- Animated transitions when switching grains
- Tooltip shows Kt values and % of total supply
- Shows AAFC projected values; as crop year progresses, actual CGC data overlays

#### C) Weekly Pace Chart — Cumulative Area

- X-axis: Grain weeks 1–52 (crop year Aug–Jul)
- Three data traces:
  1. **Producer Deliveries** — solid area, canola gold (#c17f24), from CGC `producer-deliveries` metric
  2. **Domestic Disappearance** — dashed line, prairie green (#437a22), from CGC `domestic-disappearance` metric. Tooltip breaks into exports + processing
  3. **My Farm Deliveries** — dotted line, province color, from user's logged deliveries (only visible after My Farm setup)
- Grain selector synced with waterfall chart
- Tooltip: weekly delta + cumulative total for all three traces

#### D) Storage Breakdown Panel

- For the selected grain, horizontal stacked bar showing current stock location:
  - **Commercial Elevator** (wheat-600)
  - **Terminal Elevator** (canola gold)
  - **Crusher/Processor** (prairie green)
- Data from CGC `stocks` worksheet, `in-store` metric, broken by storage type regions
- Compact panel below the waterfall or in right sidebar

---

## 3. My Farm Tab Redesign

### 3.1 Setup Flow

1. Farmer selects grains they grew in 2025-2026
2. Per grain: enters **acres planted** and **grain left to sell** (tonnes, with bushel converter)
3. Adding a grain unlocks:
   - Detailed grain page analytics
   - "My Farm" trace on the weekly pace chart
   - Storage and disposition insights for that grain

### 3.2 Schema Changes to `crop_plans`

Add columns:
- `volume_left_to_sell_kt` numeric — starting inventory to sell
- `deliveries` jsonb DEFAULT '[]' — array of `{ date, amount_kt, destination? }`

### 3.3 My Farm Dashboard

After setup, the My Farm page shows:
- **Summary card:** total acres, total grain left to sell across all crops
- **Per-grain cards:**
  - Starting position (left to sell at season start)
  - Total delivered so far (sum of delivery log entries)
  - Remaining with progress bar
  - "Log a Delivery" button → modal with date, amount, optional destination
- Cards link to grain detail pages

### 3.4 Delivery Logging

- Modal form: date picker, amount (tonnes), optional destination/elevator
- Stored as JSONB array in `crop_plans.deliveries`
- Accumulated into the "My Farm Deliveries" trace on the weekly pace chart
- No external integration (manual entry for MVP)

---

## 4. Logo — Prairie Horizon Mark

**Icon:** Minimal SVG silhouette of flat prairie horizon with a grain elevator and rising sun/wheat stalk.

**Colors:**
- Light mode: canola gold (#c17f24) icon on wheat-50 background
- Dark mode: wheat-200 icon on wheat-900 background

**Usage:**
- Nav header: icon + "Bushel Board" in Fraunces display font
- Favicon: 32×32 and 16×16 icon-only
- og:image: full lockup for social sharing

---

## 5. Data Flow Summary

```
AAFC Outlook (annual)  →  supply_disposition table  →  Waterfall chart
StatsCan Estimates     →  supply_disposition table  →  Summary cards (production)
CGC Weekly CSV         →  cgc_observations table    →  Pace chart + storage breakdown
User input (My Farm)   →  crop_plans table          →  My Farm trace on pace chart
```

---

## 6. CGC Data Mapping

The weekly CGC CSV worksheets map to Overview components:

| CGC Worksheet | Metric | Overview Component |
|---------------|--------|--------------------|
| `producer-deliveries` | `cumulative` | Pace chart (deliveries area) |
| `domestic-disappearance` | `cumulative` | Pace chart (disappearance line) |
| `exports` | `cumulative` | Disappearance breakdown tooltip |
| `in-store-stocks` | `commercial`, `terminal`, `crusher` | Storage breakdown panel |
| `visible-supply` | `total` | Summary cards |

---

## 7. Not In Scope (Future)

- Price data integration
- Automated delivery logging (elevator API integration)
- Push notifications for CGC updates
- Historical crop year comparison
- Provincial breakdown on Overview (stays on grain detail pages)
