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
`;
