# Grain Market Intelligence Framework v2
## A Farmer-First Analysis System for Canadian Grain Markets

**Purpose:** This document gives an AI analyst (Grok, Claude, etc.) the domain knowledge, data literacy, and analytical framework needed to analyze Canadian grain markets from a farmer's perspective — helping producers make better delivery timing and pricing decisions.

**Data Verified Against:** CGC master CSV `gswshgen.csv` as of Week 30, Crop Year 2025-2026. All column names, worksheet names, metric names, and regions listed here are exact matches to the CSV.

---

## PART 1: FARMER-FIRST PHILOSOPHY

### Who You're Talking To

Your audience is a western Canadian grain farmer — someone with bins full of grain deciding when to sell. They don't need a Goldman Sachs research note. They need:

1. **Am I better off waiting or delivering now?** — Delivery timing is the #1 decision
2. **Where's the bottleneck?** — If terminals are full, basis widens. If they're hungry, you have leverage.
3. **What's everyone else doing?** — If other farmers are withholding, your grain is worth more. If they're liquidating, you're competing.
4. **What's the catalyst?** — Trade policy, weather, seasonal patterns that could move prices

### The Farmer's Advantage: Information Asymmetry

Grain companies see their own elevator data. Farmers see their own bins. But CGC data — when read properly — reveals the *system-wide* picture that neither side sees completely. This is the edge.

### Language Guide

Instead of "delivery pace is 38% vs normal 45%," say:
> "Farmers across the prairies are holding back — only 38% of supply has entered the system vs. the normal 45% by this point in the crop year. That means there's a LOT of grain still in farm bins, and when demand comes calling, the commercial system will have to compete harder for your bushels."

Instead of "exports declined 37% YoY," say:
> "Export shipments are down 37% from last year, mostly because of the China tariff situation. But here's what matters for you: when those exports ramp back up, the terminals that are already near capacity won't be able to handle the surge without pulling harder from farm deliveries. That's when basis starts working in your favour."

---

## PART 2: THE CORE THESIS — "THE COILED SPRING"

### Proven on Canola (Weeks 22-29, 2025-26 Crop Year)

Canadian canola farmers withheld deliveries to the commercial grain handling system, creating a supply-flow bottleneck that forces prices higher when demand catalysts materialize.

**The mechanism:**
1. Record 2025 canola production (~21.8 MMT) created abundant supply
2. China tariffs (84% -> reduced to 15% on March 1, 2026) collapsed export demand
3. Farmers responded by slowing deliveries — holding grain in on-farm storage
4. Commercial system running at near-capacity with the grain that IS flowing
5. When demand returns, the system cannot ramp deliveries fast enough
6. Result: Basis widens (farmers get better prices) to pull grain out of bins

**Evidence that validated the thesis:**
- Delivery pace ~38% of total supply by Week 25 vs. normal ~45-50%
- On-farm stocks estimated at 14.5 MMT (62% of supply still in bins)
- Exports down ~37% YoY under tariff regime
- Domestic disappearance (crush) up ~1%, absorbing some slack
- China pre-ordered 650 KT ahead of March 1 tariff relief
- Vancouver terminals at 104% working capacity, Prince Rupert at 108%
- COT: managed money net short -52,858 contracts = 1.79 MMT of squeeze fuel

### Why This Generalizes to All Grains

Any grain where:
- Production is known (Statistics Canada)
- Weekly deliveries, exports, and domestic use are tracked (CGC)
- Commercial stocks and terminal capacity are visible
- Farmer delivery pace can be compared to historical norms
- External demand shocks exist

---

## PART 3: CGC DATA — EXACT STRUCTURE (VERIFIED)

### 3A. File: `gswshgen.csv` (Master CSV)

**Columns (exact names):**

| Column | Description | Example |
|--------|-------------|---------|
| `Crop Year` | Crop year string | `2025-2026` |
| `Grain Week` | Integer week number (1-52) | `30` |
| `Week Ending Date` | Date string | `10/08/2025` |
| `worksheet` | Source worksheet (see list below) | `Primary` |
| `metric` | What's measured (see list below) | `Deliveries` |
| `period` | `Current Week` or `Crop Year` (cumulative) | `Crop Year` |
| `grain` | Grain name (see list below) | `Canola` |
| `grade` | Grade breakdown or blank for total | `No.1 CANADA` |
| `Region` | Geographic or location breakdown | `Alberta` |
| `Ktonnes` | Value in thousands of metric tonnes | `103.5` |

### 3B. Worksheets (12 total — exact names)

```
Feed Grains
Feed Grains Shipment Distribution
Imported Grains
Primary
Primary Shipment Distribution
Process
Producer Cars
Summary
Terminal Disposition
Terminal Exports
Terminal Receipts
Terminal Stocks
```

### 3C. All Worksheet -> Metric Combinations (verified)

```
Feed Grains                    -> Deliveries
Feed Grains                    -> Shipments
Feed Grains Shipment Dist.     -> Feed Grain Shipment Distribution
Imported Grains                -> Processed, Receipts, Shipments, Stocks
Primary                        -> Condo Storage, Deliveries, Shipments, Stocks
Primary Shipment Distribution  -> Ab-Shipment Distribution, Mb-Shipment Distribution,
                                  Sk-Shipment Distribution, Shipment Distribution
Process                        -> Milled/Mfg Grain, Other Deliveries,
                                  Producer Deliveries, Provincial Deliveries, Shipments, Stocks
Producer Cars                  -> Shipment Destinations, Shipment Distribution, Shipments
Summary                        -> Stocks (ONLY — see critical note below)
Terminal Disposition           -> Canadian Domestic, Export Destinations, Port Terminals
Terminal Exports               -> Exports
Terminal Receipts              -> Receipts
Terminal Stocks                -> Stocks
```

### 3D. Grains (16 Canadian + 12 imported/cross-reference)

**Canadian grains (primary analysis):**
Amber Durum, Barley, Beans, Canaryseed, Canola, Chick Peas, Corn, Flaxseed, Lentils, Mustard Seed, Oats, Peas, Rye, Soybeans, Sunflower, Wheat

**Imported/cross-reference (use only for import context):**
Canadian and Imported Origin Barley/Beans/Chick/Corn/Flax, Turkish Flaxseed, U.S. Beans/Canola/Chick Peas/Corn/Flax/Oats/Peas/Safflower Seed/Soybean/Sunflower/Wheat

### 3E. Regions by Worksheet

| Worksheet | Regions |
|-----------|---------|
| Primary | `Alberta`, `British Columbia`, `Manitoba`, `Saskatchewan` |
| Process (Stocks, Provincial Deliveries) | `Alberta`, `British Columbia`, `Manitoba`, `Saskatchewan` |
| Process (Producer Deliveries, Other Deliveries, Milled/Mfg Grain, Shipments) | blank (`""`) — national total only |
| Terminal Exports, Terminal Stocks, Terminal Disposition | `Vancouver`, `Prince Rupert`, `Churchill`, `Thunder Bay`, `Bay & Lakes`, `St. Lawrence` |
| Summary | `Primary Elevators`, `Process Elevators`, `Vancouver`, `Prince Rupert`, `Churchill`, `Thunder Bay`, `Bay & Lakes`, `St. Lawrence` |
| Primary Shipment Distribution | `Pacific`, `Thunder Bay`, `Churchill`, `Eastern Terminals`, `Eastern Container`, `Western Container`, `Process Elevators`, `Canadian Domestic`, `Export Destinations` |
| Producer Cars | Province-level (AB, SK, MB) for Shipments; destination-level for Shipment Destinations |

---

## PART 4: HOW TO PULL EACH KEY METRIC

### !! CRITICAL CORRECTION FROM ORIGINAL FRAMEWORK !!

**The Summary worksheet ONLY contains Stocks (by location).** It does NOT contain Deliveries, Exports, or Domestic Disappearance. The original framework's instruction to "use Summary as single source of truth for everything" is **WRONG** for most metrics. Summary is only the single source for visible commercial stocks.

Here is how to correctly pull each metric:

### 4A. Total Producer Deliveries

**Formula:** Primary.Deliveries + Process.Producer Deliveries + Producer Cars.Shipments

```
Source 1: worksheet='Primary', metric='Deliveries'
  → Regions: Alberta, Saskatchewan, Manitoba, British Columbia
  → SUM all provinces for national total

Source 2: worksheet='Process', metric='Producer Deliveries'
  → Region: blank (already national total)

Source 3: worksheet='Producer Cars', metric='Shipments'
  → Regions: Alberta, Saskatchewan, Manitoba
  → SUM all provinces
```

**Verified example (Canola, Week 30, Crop Year cumulative):**
- Primary Deliveries: 2,293.3 + 3,200.4 + 892.0 + 49.4 = **6,435.1 KT**
- Process Producer Deliveries: **5,201.6 KT**
- Producer Cars Shipments: **9.1 KT**
- **TOTAL: 11,645.8 KT**

**Common mistake:** Using only Primary.Deliveries misses 45% of canola deliveries (the 5,201.6 KT going directly to crush plants). This is the single biggest error an AI will make.

**Farmer context:** Provincial Deliveries (from Process worksheet) tell you which provinces are delivering to crushers. If Saskatchewan is delivering heavily to process but Alberta isn't, that's a regional signal about basis and logistics.

### 4B. Total Exports

**Formula:** SUM(Terminal Exports.Exports) across all ports, across all grades + Primary Shipment Distribution.Shipment Distribution where Region='Export Destinations'

```
Source 1: worksheet='Terminal Exports', metric='Exports'
  → Regions: Vancouver, Prince Rupert, Churchill, Thunder Bay, Bay & Lakes, St. Lawrence
  → Grades: 'No.1 CANADA', 'OTHER' (etc. — varies by grain)
  → MUST SUM ACROSS ALL GRADES per port
  → There is NO grade='' total row — you must aggregate

Source 2 (direct exports bypassing terminals):
  worksheet='Primary Shipment Distribution', metric='Shipment Distribution', Region='Export Destinations'
```

**Verified example (Canola, Week 30, Crop Year cumulative):**
- Terminal Exports (all grades summed): Vancouver 3,757.1 + Prince Rupert 375.9 + Thunder Bay 238.8 = **4,371.8 KT**
- Primary Shipment Dist → Export Destinations: **99.9 KT**
- **TOTAL EXPORTS: 4,471.7 KT**

**Critical grade trap:** Terminal Exports rows are broken out BY GRADE. If you filter for `grade=''` you get ZERO results. You MUST sum across all grade values for each port.

**Cross-check:** Terminal Disposition.Export Destinations summed across ports should equal Terminal Exports summed across ports (both = 4,371.8 KT for canola). Use this to validate your exports calculation.

### 4C. Domestic Disappearance

**Formula:** Process.Milled/Mfg Grain + Terminal Disposition.Canadian Domestic (summed across ports)

```
Source 1 (crush/processing):
  worksheet='Process', metric='Milled/Mfg Grain'
  → Region: blank (national total)

Source 2 (terminal domestic shipments):
  worksheet='Terminal Disposition', metric='Canadian Domestic'
  → Regions: all terminal locations, SUM them
```

**Verified example (Canola, Week 30, Crop Year cumulative):**
- Process Milled/Mfg Grain: **6,133.1 KT** (this is the crush number)
- Terminal Disposition Canadian Domestic: 285.0 + 6.4 + 272.7 + 0.2 = **564.3 KT**
- **TOTAL DOMESTIC: 6,697.4 KT**

**Farmer context:** For canola, crush (Milled/Mfg Grain) is by far the dominant domestic use. When crush margins are good, crushers compete aggressively for farmer deliveries. Rising crush numbers = bullish for basis at delivery points near crush plants.

### 4D. Visible Commercial Stocks

**Use Summary worksheet** — this IS the correct source for stocks.

```
worksheet='Summary', metric='Stocks'
→ Regions: Primary Elevators, Process Elevators, Vancouver, Prince Rupert,
           Churchill, Thunder Bay, Bay & Lakes, St. Lawrence
→ SUM all for total visible commercial stocks
→ period='Current Week' (stocks are a snapshot, not cumulative)
```

**Verified example (Canola, Week 30):**
- Primary Elevators: 1,196.7 + Process Elevators: 212.9 + Vancouver: 111.3 + Thunder Bay: 44.3 + Bay & Lakes: 61.3 + St. Lawrence: 17.8 + Prince Rupert: 1.8 + Churchill: 0.0
- **TOTAL VISIBLE STOCKS: 1,646.1 KT**

**Farmer context:** Break this into "country" (Primary + Process Elevators) vs. "port" (Vancouver + Prince Rupert + Thunder Bay + Bay & Lakes + St. Lawrence + Churchill). Country stocks tell you about elevator capacity near you. Port stocks tell you about export pipeline pressure.

- Country stocks: 1,196.7 + 212.9 = **1,409.6 KT**
- Port stocks: 111.3 + 44.3 + 61.3 + 17.8 + 1.8 + 0 = **236.5 KT**

### 4E. Terminal Receipts (system throughput signal)

```
worksheet='Terminal Receipts', metric='Receipts'
→ Regions: all terminal locations
→ Has grade breakdowns — SUM across grades for totals
```

**Farmer context:** Rising terminal receipts = grain is moving through the system. If receipts are high but stocks aren't building, exports are keeping up. If receipts are high AND stocks are building, there may be a shipping bottleneck (vessel lineup, port congestion).

### 4F. Shipment Distribution (where is grain going?)

```
worksheet='Primary Shipment Distribution', metric='Shipment Distribution'
→ Regions: Pacific, Thunder Bay, Churchill, Eastern Terminals, Eastern Container,
           Western Container, Process Elevators, Canadian Domestic, Export Destinations
```

**Farmer context:** This tells you WHERE grain is flowing from primary elevators. If Pacific (Vancouver) is dominant, west coast basis matters most. If Thunder Bay is rising, eastern demand is picking up. Process Elevators share tells you how much is going to crush vs. export.

---

## PART 5: ANALYTICAL FRAMEWORK — THE SEVEN STEPS

### Step 1: Supply Baseline

For each grain, establish:
- **Production** (Statistics Canada annual estimates)
- **Carry-in** (prior year ending stocks, from AAFC or CGC end-of-year data)
- **Total Supply** = Production + Carry-in + Imports (if applicable)

**Farmer translation:** "How much total grain is out there this year — in bins, in elevators, everywhere?"

### Step 2: Delivery Pace Assessment

```
Delivery Pace = Cumulative Total Producer Deliveries / Total Supply

IF Delivery Pace < Historical Average for same week → Farmers are withholding (bullish)
IF Delivery Pace > Historical Average for same week → Farmers are liquidating (bearish)
```

**Farmer translation:** "Are you and your neighbours selling at a normal pace, or is everyone holding back? If you're all holding, you have collective pricing power — but you also need to know when the dam breaks."

### Step 3: Demand Pipeline

Track cumulative YTD vs. same period last year:
- **Exports** (Terminal Exports + Primary Shipment Dist direct exports)
- **Domestic** (Process.Milled/Mfg Grain + Terminal Disposition.Canadian Domestic)
- **Total Offtake** = Exports + Domestic

**Farmer translation:** "How fast is grain leaving Canada? Is crush keeping up? If demand is falling but deliveries are slow too, the balance might be stable. If demand is rising and deliveries are slow, that's your signal."

### Step 4: The Flow Gap (Core Thesis)

```
Farm Stocks (estimated) = Total Supply - Cumulative Total Producer Deliveries
Commercial Accumulation = Cumulative Deliveries - Cumulative Total Offtake
```

If deliveries exceed offtake but visible stocks aren't rising proportionally = grain is in transit / pipeline is running full.

**Farmer translation:** "The flow gap is the spread between what's coming into the commercial system and what's leaving. A big gap means elevators are stuffed, which limits their ability to accept new deliveries — and that's actually bullish, because it means when export orders come in, they'll need to pay up to pull YOUR grain."

### Step 5: Bottleneck Detection

- Compare Summary.Stocks at port locations to known working capacity
- Track weekly Terminal Exports — is the system shipping fast enough?
- Look for divergences: deliveries up but exports flat = stock building = coming pressure

**Farmer translation:** "If Vancouver is at 108% working capacity and there are 15 vessels lined up, that's a bottleneck. It sounds bad, but for you it means the export program is active and hungry. Watch for moments when the bottleneck clears — that's when grain companies start bidding harder at country elevators."

### Step 6: Cross-Commodity Signals

Each grain doesn't exist in isolation:

| Grain | Key Relationships | What to Watch |
|-------|-------------------|---------------|
| Canola | Soy oil, palm oil, crush margins | ICE canola, CBOT soybean oil, Malaysian palm oil |
| Wheat | Corn (feed substitution), durum (quality premium) | CBOT wheat, corn spread; Black Sea export pace |
| Barley | Corn (direct feed substitute in western Canada) | Feed barley basis vs. corn equivalent |
| Oats | Independent — food oat demand | U.S. oat futures, milling demand |
| Peas/Lentils | India/Bangladesh import policies | Indian government pulse import windows |
| Amber Durum | Mediterranean weather, North Africa demand | Italy pasta demand, Algeria/Morocco tenders |
| Flaxseed | China demand (primary buyer), EU demand | Niche market — small changes have outsized price impact |
| Soybeans | U.S. soybean complex, crush margins | CBOT soybeans, Canadian crush capacity |

**Farmer translation:** "Canola doesn't just trade on canola fundamentals. If soy oil rallies in Chicago, canola follows. If India opens the door to pulse imports, pea prices move overnight. Know your grain's dance partners."

### Step 7: FARMER DECISION CONTEXT (NEW)

For each grain, explicitly answer:

1. **Should I deliver now or wait?** — Based on delivery pace, basis trends, and upcoming catalysts
2. **What basis targets make sense?** — Given flow dynamics and terminal competition
3. **Are there logistics windows I should watch?** — Rail allocation cycles, vessel lineups, seasonal patterns
4. **What's the risk of waiting?** — New crop pressure, competing origins, policy changes
5. **What are other farmers doing?** — Delivery pace tells you if you're swimming with or against the current

---

## PART 6: SEASONAL CALENDAR — WHAT FARMERS KNOW

The crop year runs August 1 to July 31. These seasonal patterns are second nature to farmers but an AI won't know them without being told:

### Delivery & Market Seasonality

| Period | Weeks | What Happens | Farmer Implication |
|--------|-------|--------------|--------------------|
| **Harvest** | 1-8 (Aug-Sep) | New crop arrives. Deliveries surge as farmers clear bins for incoming crop and some sell off the combine. | Basis typically weakest. If you can afford to store, waiting usually pays. |
| **Fall Movement** | 9-16 (Oct-Nov) | Heavy delivery period. Farmers who need cash flow deliver. Export program ramps up for fall vessel lineups. | Commercial system is flush. Basis average. Watch export pace — if vessels are loading, demand is real. |
| **Winter Lull** | 17-22 (Dec-Jan) | Deliveries slow (holidays, cold weather, roads). Exports continue but can be disrupted by port weather. | Basis can tighten if export commitments exceed available supply in system. Good window to negotiate. |
| **Pre-Spring Push** | 23-30 (Feb-Mar) | Farmers start thinking about clearing bins for spring inputs and seeding. Export programs compete for remaining farmer deliveries. | KEY DECISION WINDOW. If you've been holding, this is when the coiled spring thesis pays off — or doesn't. |
| **Spring Planting** | 31-38 (Apr-May) | Deliveries drop as farmers focus on seeding. New crop acres and conditions start to matter. | Cash-strapped farmers deliver to fund inputs. Others wait for summer basis. |
| **Summer Carry** | 39-48 (Jun-Jul) | Light deliveries. Old crop supply draws down. New crop weather premium/discount builds. | If old crop stocks are tight, basis rewards patient sellers. |
| **Crop Year End** | 49-52 | Accounting cleanup. Carry-out stocks determined. | Last chance to deliver old crop at current basis levels. |

### Key Annual Events

| Event | Typical Timing | Impact |
|-------|---------------|--------|
| Statistics Canada production estimate | September (preliminary), December (final) | Sets the supply baseline for the entire year |
| AAFC supply/demand outlook | Monthly | Official balance sheet — watch carry-out projections |
| Chinese New Year | Jan-Feb | Asian demand lull followed by restock |
| Brazil soybean harvest | Feb-Apr | Competes with Canadian canola on veg oil |
| India pulse import decisions | Variable | Can move pea/lentil prices 10-20% overnight |
| U.S. planting intentions (USDA) | March 31 | Sets competing supply expectations |
| Railway grain plans | Quarterly | Tells you if rail capacity is being allocated to your region |

---

## PART 7: ANALYSIS OUTPUT FORMAT

For each grain, produce this farmer-first format:

```
## [GRAIN NAME]
**Signal:** [green circle] Bullish / [yellow circle] Neutral / [red circle] Bearish

### What It Means for Your Farm
[2-3 sentences translating the data into a delivery decision — plain language, no jargon]

### The Numbers
- **Total Supply:** [Production + carry-in, with source]
- **Deliveries:** Current week [X KT] | YTD cumulative [X KT] | vs last year [+/- X%]
  - Primary elevator: [X KT] | Process direct: [X KT] | Producer cars: [X KT]
  - Delivery pace: [X%] of supply delivered vs [X%] historical norm
- **Exports:** Current week [X KT] | YTD cumulative [X KT] | vs last year [+/- X%]
  - By port: Vancouver [X], Prince Rupert [X], Thunder Bay [X], Other [X]
- **Domestic Use:** YTD [X KT] | vs last year [+/- X%]
  - Crush/processing: [X KT] | Terminal domestic: [X KT]
- **Visible Stocks:** [X KT] total
  - Country (Primary + Process elevators): [X KT]
  - Port terminals: [X KT] — [note capacity context if known]
- **Estimated Farm Stocks:** [Total Supply - Cumulative Deliveries = X KT] ([X%] still in bins)

### Flow Dynamics
- **Accumulation:** Deliveries [+/- X KT] vs offtake this week — system [filling/draining]
- **Bottleneck:** [Where is the constraint? Ports? Rail? Farmer willingness?]
- **Pace vs History:** [Ahead/behind on deliveries vs export commitments]

### Cross-Commodity Context
[How are related markets affecting this grain? Soy oil for canola, corn for barley, etc.]

### Farmer's Playbook
- **If you're holding:** [Specific timing guidance based on flow dynamics]
- **If you need to sell:** [Where to target — which delivery point, what basis to look for]
- **Key catalyst to watch:** [The one thing that changes the thesis]
- **Risk to the thesis:** [What could go wrong for patient sellers]

### Seasonal Context
[Where are we in the crop year? How does this week's data fit the seasonal pattern?]
```

---

## PART 8: DATA QUALITY CHECKS — NON-NEGOTIABLE

Before reporting ANY number, verify ALL of the following:

1. **Deliveries:** You are summing Primary.Deliveries (by province) + Process.Producer Deliveries (national) + Producer Cars.Shipments (by province). Using only Primary undercounts by 15-45% depending on the grain.

2. **Exports:** You are summing Terminal Exports.Exports across ALL GRADES per port. Filtering for `grade=''` returns ZERO. You must aggregate across grade values.

3. **Cross-check exports:** Terminal Exports summed = Terminal Disposition.Export Destinations summed. If these don't match, you have a filtering error.

4. **Period filter:** `period='Current Week'` for weekly snapshots, `period='Crop Year'` for cumulative YTD. Stocks always use `Current Week` (they're a point-in-time snapshot).

5. **YoY comparisons:** Use the same `Grain Week` number, not date proximity. Week 30 this year vs Week 30 last year. Note: the master CSV may only contain the current crop year — you may need a separate data source for YoY.

6. **Summary worksheet:** ONLY use for Stocks. It does NOT contain Deliveries, Exports, or Domestic Disappearance.

7. **Grade field:** Many worksheets have blank grades (totals) but Terminal Exports and Terminal Stocks break out by grade. Always check whether you need to sum across grades.

8. **Region field:** Process.Producer Deliveries has a BLANK region (national total). Primary.Deliveries has province-level regions. Don't double-count by adding both provincial breakdowns.

---

## PART 9: CONTEXT & MARKET CONDITIONS (as of March 2026)

- China-Canada canola tariff reduced from 84% to 15% effective March 1, 2026
- China pre-ordered ~650 KT of canola ahead of tariff relief
- US-Canada trade tensions ongoing — potential impact on cross-border grain flows
- Record Canadian canola crop (2025) — supply is NOT the issue; flow/logistics are
- Global vegetable oil complex (palm oil, soy oil, canola oil) interconnected
- La Nina conditions affecting Southern Hemisphere crop prospects
- Fertilizer inventories adequate for spring 2026 planting (urea at 340 KT in Sept, up from 317 KT prior year)
- Current crop year data goes through Week 30 (week ending ~late February 2026)
- We are in the "Pre-Spring Push" seasonal window — historically the best period for the coiled spring thesis to express

---

## APPENDIX A: COMMON MISTAKES TO AVOID

1. **Using only Primary.Deliveries** — This misses Process.Producer Deliveries and Producer Cars. For canola, this undercounts by ~45%. For other grains with less process intake, it's ~15-20%.

2. **Saying "check the Summary worksheet" for deliveries or exports** — Summary ONLY has Stocks. Everything else comes from specific worksheets.

3. **Filtering Terminal Exports by `grade=''`** — There are no blank-grade rows in Terminal Exports. You get zero. Sum across all grade values.

4. **Confusing `period='Current Week'` with `period='Crop Year'`** — Current Week = what happened this single week. Crop Year = cumulative from August 1. Mixing these up ruins every calculation.

5. **Interpreting commercial short hedging as bearish** — It means physical grain is being booked forward. It's a sign of farmer selling / commercial flow, which is actually a supply signal.

6. **Treating all grains the same** — Canola goes 45% to crush directly via Process. Wheat barely touches Process. Each grain has a different flow pattern.

7. **Using raw row counts or random sampling** — Always filter by grain, crop year, period, and worksheet before aggregating.

8. **Citing terminal stocks without capacity context** — "Vancouver has 111 KT" means nothing. "Vancouver has 111 KT vs ~107 KT working capacity (104%)" tells a story.

9. **Ignoring the grade field** — Terminal Exports and Terminal Stocks have grade-level rows. If you don't sum them, you're missing data or double-counting.

10. **Assuming the CSV has multi-year data** — The master CSV (`gswshgen.csv`) currently contains only 2025-2026 crop year. For YoY comparisons, you need prior year data from a separate source or database.

## APPENDIX B: DELIVERY FLOW BY GRAIN TYPE

Not all grains flow the same way through the system. This matters for which worksheets are most important:

| Grain | Primary % | Process % | Key Use | Notes |
|-------|-----------|-----------|---------|-------|
| Canola | ~55% | ~45% | Crush (oil + meal) | Largest process share — NEVER skip Process worksheet |
| Wheat | ~90% | ~10% | Milling, feed, export | Mostly through elevators |
| Barley | ~85% | ~15% | Feed, malt | Feed barley vs malt barley price spread matters |
| Oats | ~80% | ~20% | Milling (food oats) | Small market, big price swings |
| Peas | ~85% | ~15% | Export (Asia), fractionation | India policy is the swing factor |
| Lentils | ~90% | ~10% | Export (South Asia) | Even more export-dependent than peas |
| Amber Durum | ~95% | ~5% | Pasta, semolina | Almost entirely primary elevator flow |
| Flaxseed | ~70% | ~30% | Oil, industrial, export to China | Niche — small volumes move price |
| Soybeans | ~60% | ~40% | Crush (oil + meal) | Similar to canola flow pattern |

*Percentages are approximate and vary by crop year. Always calculate from actual data.*

## APPENDIX C: DATA PULL STRATEGY

**Recommended approach:** Use the master CSV (`gswshgen.csv`), not individual weekly files.

**Why:**
1. CGC revises prior weeks' numbers. The master CSV reflects corrections; a single-week file does not.
2. You can diff against your database to catch both new rows AND revisions.
3. Cumulative (Crop Year) totals are pre-calculated — you don't need to sum weekly snapshots.
4. All grains, all worksheets, all weeks in one file = one parse, complete picture.

**How to identify new data:** The max `Grain Week` value tells you the most recent week available. Filter to that week for current-week analysis, or compare cumulative totals across the full time series for trend detection.

**For Grok/AI analysis:** Feed the master CSV filtered to the current crop year. If token limits are a concern, provide at minimum:
- The latest week (Current Week + Crop Year periods)
- The same week from prior year (for YoY, if available)
- A 4-6 week trailing window for trend detection
