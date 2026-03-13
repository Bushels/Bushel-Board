/**
 * Distilled commodity trading knowledge for grain market analysis.
 *
 * Extracted by Step 3.5 Flash from:
 * - "A Trader's First Book on Commodities" (commodity trading fundamentals)
 * - "Introduction to Grain Marketing" (SK Ministry of Agriculture)
 * - "Self-Study Guide: Hedging" (ICE Futures Canada)
 *
 * Used as system prompt context for Step 3.5 Flash in analyze-market-data.
 * ~4K tokens — fits comfortably in system prompt alongside data.
 */

export const COMMODITY_KNOWLEDGE = `## Commodity Market Analysis Framework — Canadian Grains

### Seasonal Patterns & Cyclical Tendencies

**Crop Calendar Triggers:**
- Harvest Pressure Zone (Aug 15 - Nov 30): Basis typically widens 20-50% above 5yr avg during first 30 days post-harvest start.
- Pre-Seeding Rally Window (Feb 15 - Apr 30): Nearby futures tend to gain 8-12% if N.American stocks-to-use < 15%.
- Export Peak Season (Sep 1 - Mar 31): Pacific NW and Gulf port basis narrows 15-25% vs interior elevators.
- Weather Risk Windows: If frost > 7 days past historical avg in major growing zones (MB/SK/AB), short-covering rallies in Nov-Mar futures average +6.5%.

**Grain-Specific Seasonal Cycle:**
- Planting & Weather (Spring): Concern over acres planted and early growing conditions.
- Pollination & Development (Summer): "Make or break" for yields; heat/drought fear peaks.
- Harvest (Fall): Pressure from new supply; focus shifts to storage and demand.
- Carryover (Winter): Market driven by consumption pace and Southern Hemisphere crop potential.

### Basis Analysis Rules

Basis = Local Cash Price - Nearby Futures Price.
Adjusted Basis = Basis - Freight Differential to Reference Port.
Reference Ports: Vancouver (W. Canada), Thunder Bay (Central), Montreal (East).
Normalize: Subtract 3-year average basis for same calendar week to identify wide/narrow conditions.

**Basis Signal Matrix:**
- Widening Basis + Falling Futures = Strong Bearish → accelerate sales, avoid storage
- Widening Basis + Rising Futures = Local Glut → hedge futures, store only if carry > 3%
- Narrowing Basis + Rising Futures = Strong Bullish → delay sales, consider storage
- Narrowing Basis + Falling Futures = Local Shortage → sell cash, avoid hedging
- Positive Basis (inverted market) = Urgency → immediate delivery

### Bullish Signal Checklist (require 3/5 for confirmation)

1. Futures Structure: Nearby month >= 3% premium to next-deferred (contango < 3%)
2. Basis Trend: 5-day average basis narrowing >= 5 points
3. Export Sales: Weekly export commitments > 5yr avg + 20%
4. Stocks-to-Use: Canadian ending stocks-to-use ratio declining > 2% monthly
5. Speculative Positioning: Commercial net short > 25th percentile (COT data)

### Bearish Signal Checklist (require 3/5 for confirmation)

1. Futures Structure: Deferred month premium > 5% over nearby (backwardation)
2. Basis Trend: 5-day average basis widening >= 8 points
3. Export Pace: Cumulative exports < 5yr avg - 15% by week 30
4. Global Competitor: Australian/Argentine crop estimates up > 5% month-over-month
5. Technical Breakdown: Nearby futures close below 50-day MA for 3+ consecutive days

### Storage Decision Algorithm

Store IF all conditions met:
1. Futures Curve Carry (Month+3 minus Month) > Storage Cost x 1.3
2. Expected basis in 90 days < Current basis - 10 points
3. Historical Q1-Q2 price increase probability > 60%
4. No margin call pressure on hedged positions
Otherwise: Sell cash or minimal hedge (5-10%)

Carry Charge = (Futures Spread) + (Basis Change Expectation) - (Storage + Interest)
Where: Storage = $0.015/tonne/day, Interest = 6% annual on avg inventory value.

Storage Exit Triggers: Carry deteriorates >50%, basis widens 3+ consecutive days, cash price breaks 100-day MA, or regional storage >85% utilized.

### Export Demand Indicators

**Primary (Weekly):**
- CGC Export Sales: Bullish if weekly > 10yr avg + 1 SD; Bearish if cumulative < 5yr avg - 15%
- Port Loading: Bearish if 7-day avg < 60% capacity for 10+ days; Bullish if >85% for 5+ days
- Freight Rate Spread: (Gulf rate - PNW rate) / PNW rate > 15% favors Western Canada → bullish

**Secondary:**
- Currency: USD/CAD > 1.35 = export competitiveness up 8-12% (apply to all signals)
- Competitor Production: Aussie wheat revised +3%+ in 30 days → subtract 2% from Canadian price targets
- Large Single-Buyer Purchase: >100K tonnes = basis tightening in 14-21 days

### Hedging Mechanics (Canadian Grains)

**Short Hedge (Farmer):** Sell futures to lock in selling price. Net price = Futures Price at Lift + Basis at Sale.
**Long Hedge (Buyer):** Buy futures to lock in purchase price.

Basis Strengthening favors short hedgers (higher net price).
Basis Weakening favors long hedgers (lower net price).

**Option Strategies for Sellers (Farmers):**
- Buy Put: Establishes price floor (strike - premium). Best when bearish but want upside participation.
- Sell Call: Generates income, caps upside. Best when neutral/bearish.
- Sell Cash + Buy Calls: Locks in cash sale now, pays premium for rally participation.

**Hedge Ratio:** Quantity / Contract Size (e.g., 20 tonnes for ICE Canola, 5000 bu for CBOT Wheat).

### Supply/Demand Analysis Rules

- Tight supply + strong demand = upward pressure; abundant harvest + weak demand = price decline.
- Price extremes are temporary: prices far beyond long-term technical ranges are likely unsustainable blow-offs.
- Demand elasticity: grain demand is inelastic short-term but high prices destroy demand long-term.
- COT Report: extreme net-long positioning by speculators often signals overbought market prone to correction.

### Carry Trade & Spread Analysis

- Wide Contango: ample supply or weak immediate demand. Stores filling.
- Narrowing Contango / Inversion (Backwardation): tight immediate supply or urgent demand. Bullish for front month.
- Strategy: Trade spreads to express supply/demand timing views.

### Risk Management Overlay

- Maximum single-crop exposure: 35% of total grain inventory value
- Leverage awareness: grain margins can increase dramatically during volatility
- Always define entry, exit, and maximum loss before entering a position

### Marketing Strategy & Contract Guidance

**Top-Third Pricing Discipline:**
Aim to sell within the top one-third of the annual expected price range. This beats average prices consistently without requiring perfect market timing. Lock in targets mentally before harvest — discipline to execute at targets prevents panic selling and greed-waiting.

**Incremental Forward Selling Framework:**
Avoid all-or-nothing selling. Forward sell 10-15% of expected production at seeding stage (price basis); sell another 10-15% in late summer based on yield outlook; hold remainder for harvest decisions. This spreads basis risk, mitigates yield shortfalls, and captures multiple price windows.

**Contract Type Selection by Market Outlook:**

| Contract Type | When to Use | Advantage | Risk |
|---|---|---|---|
| **Deferred Delivery** | Neutral to bearish outlook, want certainty | Locks full price (futures + discount), no margin calls | Misses rallies, must deliver contracted volume |
| **Basis Contract** | Expect futures rally, accept basis timing risk | Capture favorable basis early, participate in rally | Futures may drop, negating advantage |
| **Futures Options** | Bullish but want price floor | Establishes minimum price, unlimited upside | Premium cost must be overcome by move |
| **Pool Contracts** | Want income smoothing across season | Reduces emotional decisions, stable flow | Forfeits sharp rally captures |
| **Fixed Price (Flat)** | Opportunistic, time-constrained | Simple, low risk, immediate certainty | Fleeting opportunity, may leave money on table |

**Storage Decision With Opportunity Cost:**
Store IF all three conditions met:
1. Futures curve carry (3-month spread) > Storage cost × 1.3
2. Expected basis in 90 days < Current basis - 10 points (basis must strengthen)
3. Q1-Q2 seasonal price increase probability > 60% historically

But ALSO calculate: (Projected 90-day price gain) - (Storage + Interest cost) - (Missed interim sales opportunity at current price). If negative, sell now.

Exit triggers: Carry deteriorates >50%, basis widens 3+ consecutive days, regional storage >85% utilized.

**Price Discovery as Basis Signal:**
Basis (Local Cash Price - Nearby Futures) reveals local supply/demand. Widening basis = local glut, tighten sale plan. Narrowing basis = local shortage, delay sales. Positive basis (inverted market) = immediate delivery urgency. Monitor 5-day basis trend; if moving 8+ points wider, reassess storage/deferral positions.

### Logistics & Transport Awareness

**Port Congestion Signals (vessel loading times):**
- Vessels > 1-year average loading time = port backlog building
- If 2+ vessels queued, expect basis to widen 10-20 points at destination in 7-14 days
- Tightens post-harvest when export demand peaks; widens in spring as queue clears

**Out-of-Car Time as Rail Bottleneck Indicator:**
- Out-of-car ≤ 10% = normal rail flow
- Out-of-car 10-15% = modest bottleneck, expect 2-4 day delivery delays
- Out-of-car > 15% = significant rail congestion; forwarding grain stalls, elevators fill, local basis widens
- In severe congestion, deferred contracts become attractive (shift timing risk to elevator)

**Producer Car Allocations as Demand Signal:**
- Cars allocated to producer elevators = forward shipping commitments placed by elevators
- Allocations rising week-over-week = elevator confidence in export demand; bullish
- Allocations flat or declining = elevator caution, export demand softening; bearish
- Use as confirmation signal (combine with export sales + port loading data)

**Country Elevator & Terminal Storage Utilization:**
- Country elevator capacity ≤ 70% = comfortable storage space, no delivery pressure
- Country elevator capacity 70-85% = filling, manageable pressure, basis stable
- Country elevator capacity > 85% = tight storage, discourages additional deliveries locally, widens basis to inland elevators
- Terminal facility capacity > 90% = bottleneck; basis widens significantly inland, narrows at port

**Regional Transport Cost Context:**
- Southern Alberta/Saskatchewan to Thunder Bay: typically 3-6 $/t cheaper than to Pacific ports
- Northern regions: +2-3 $/t premium vs. southern (longer haul)
- Currency headwinds (USD/CAD > 1.35) make exports more profitable → elevators bid higher basis → favorable for farmers in export-oriented regions
- Freight rate spread (Gulf Gulf - PNW) > 15% of PNW rate favors Western Canada routing; boosts competitive netbacks to Vancouver-based country elevators

**Integration with CGC Data:**
Monitor alongside Weekly Terminal Receipts and Exports metrics — if receipts high but exports lagging, port congestion likely. Combine with vessel queue data (from port authority scrapes) to anticipate basis moves 7-14 days ahead.
`;
