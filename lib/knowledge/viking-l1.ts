/**
 * Viking L1 — Topic-level knowledge summaries.
 *
 * 7 cross-book topic compilations (~800 tokens each), loaded by intent detection.
 * Each topic synthesizes relevant knowledge from ALL 8 source books into a
 * single coherent summary. No database queries needed — static constants.
 *
 * Intent detection uses regex patterns to match user queries / grain context
 * to the appropriate topic(s). Multiple topics can be loaded simultaneously.
 *
 * Token budget: ~800 tokens per topic. Typical query loads 1-2 topics = ~1,200-1,600 tokens.
 * Combined with L0 (~420 tokens), total context is ~1,600-2,000 tokens vs the old
 * 7K static blob from only 3 books.
 */

export type VikingTopic =
  | "basis_pricing"
  | "storage_carry"
  | "hedging_contracts"
  | "logistics_exports"
  | "market_structure"
  | "risk_management"
  | "grain_specifics";

export const VIKING_TOPICS: VikingTopic[] = [
  "basis_pricing",
  "storage_carry",
  "hedging_contracts",
  "logistics_exports",
  "market_structure",
  "risk_management",
  "grain_specifics",
];

export const VIKING_TOPIC_LABELS: Record<VikingTopic, string> = {
  basis_pricing: "Basis & Pricing",
  storage_carry: "Storage & Carry",
  hedging_contracts: "Hedging & Contracts",
  logistics_exports: "Logistics & Exports",
  market_structure: "Market Structure & Trade",
  risk_management: "Risk & Position Management",
  grain_specifics: "Grain-Specific Quality & Market",
};

/**
 * Regex-based intent detection patterns.
 * Each pattern maps to one or more topics. A query can trigger multiple topics.
 */
export const VIKING_INTENT_PATTERNS: Array<{
  topic: VikingTopic;
  pattern: RegExp;
}> = [
  // Basis & Pricing
  { topic: "basis_pricing", pattern: /\bbasis\b/i },
  { topic: "basis_pricing", pattern: /\bbull(ish)?\b|\bbear(ish)?\b/i },
  { topic: "basis_pricing", pattern: /\bpric(e|ing|ed)\b/i },
  { topic: "basis_pricing", pattern: /\bseason(al|ality)?\b|\bharvest\b/i },
  { topic: "basis_pricing", pattern: /\bspread(s)?\b|\bpremium(s)?\b/i },

  // Storage & Carry
  { topic: "storage_carry", pattern: /\bstor(age|e|ing)\b|\bbin(s)?\b/i },
  { topic: "storage_carry", pattern: /\bcarry(ing)?\b|\bcontango\b|\bbackwardation\b/i },
  { topic: "storage_carry", pattern: /\binvert(ed)?\b/i },
  { topic: "storage_carry", pattern: /\bhold(ing)?\b.*\bgrain\b|\bgrain\b.*\bhold(ing)?\b/i },
  { topic: "storage_carry", pattern: /\bhaul\b.*\b(or|vs)\b.*\b(hold|wait|store)\b/i },
  { topic: "storage_carry", pattern: /\b(hold|wait|store)\b.*\b(or|vs)\b.*\bhaul\b/i },

  // Hedging & Contracts
  { topic: "hedging_contracts", pattern: /\bhedg(e|ing|ed)\b/i },
  { topic: "hedging_contracts", pattern: /\bfutures?\b/i },
  { topic: "hedging_contracts", pattern: /\boption(s)?\b|\bput(s)?\b|\bcall(s)?\b/i },
  { topic: "hedging_contracts", pattern: /\bcontract(s|ed)?\b|\bdeferred delivery\b/i },
  { topic: "hedging_contracts", pattern: /\bfence\b|\bcollar\b/i },

  // Logistics & Exports
  { topic: "logistics_exports", pattern: /\blogistics\b|\bport(s)?\b|\brail\b/i },
  { topic: "logistics_exports", pattern: /\bterminal(s)?\b|\bcongestion\b/i },
  { topic: "logistics_exports", pattern: /\bexport(s|ed|ing)?\b/i },
  { topic: "logistics_exports", pattern: /\bdeliver(y|ies|ing)\b/i },
  { topic: "logistics_exports", pattern: /\bproducer car(s)?\b/i },
  { topic: "logistics_exports", pattern: /\bvessel(s)?\b|\bfreight\b/i },

  // Market Structure & Trade
  { topic: "market_structure", pattern: /\bcot\b|\bmanaged money\b|\bcommercials?\b/i },
  { topic: "market_structure", pattern: /\bspec(ulative|ulators|s)?\b/i },
  { topic: "market_structure", pattern: /\boligopoly\b|\bmultinational\b|\bgrain compan(y|ies)\b/i },
  { topic: "market_structure", pattern: /\bglobal\b.*\b(trade|demand|supply)\b/i },
  { topic: "market_structure", pattern: /\bcurrenc(y|ies)\b|\bexchange rate\b/i },
  { topic: "market_structure", pattern: /\btariff(s)?\b|\bpolicy\b|\bembargo\b/i },

  // Risk & Position Management
  { topic: "risk_management", pattern: /\brisk\b|\bdownside\b|\bprotect(ion)?\b/i },
  { topic: "risk_management", pattern: /\bmargin\b.*\bcall\b|\bmargin management\b/i },
  { topic: "risk_management", pattern: /\binsurance\b|\bcrop insurance\b/i },
  { topic: "risk_management", pattern: /\bcounterparty\b|\bbrokerage?\b/i },
  { topic: "risk_management", pattern: /\bdiversif(y|ication)\b/i },

  // Grain-Specific Quality & Market
  { topic: "grain_specifics", pattern: /\bgrade\b|\bgrading\b|\bprotein\b/i },
  { topic: "grain_specifics", pattern: /\bquality\b|\bdockage\b|\btest weight\b/i },
  { topic: "grain_specifics", pattern: /\bcrush\b|\bprocessor\b|\bmilling\b/i },
  { topic: "grain_specifics", pattern: /\bfeed\b.*\b(barley|wheat|oats)\b|\b(barley|wheat|oats)\b.*\bfeed\b/i },
  { topic: "grain_specifics", pattern: /\bcanola\b|\bdurum\b|\bflax\b|\blentil\b/i },
  { topic: "grain_specifics", pattern: /\bacreage\b|\brotation\b/i },
  { topic: "grain_specifics", pattern: /\bcash advance\b|\bCCGA\b/i },
  { topic: "grain_specifics", pattern: /\bmalt\b|\bvitreous\b|\boil content\b|\bfalling number\b/i },
];

/**
 * L1 topic summaries — cross-book compilations.
 * Each is ~800 tokens of synthesized knowledge covering the topic
 * from the perspective of all 8 source books.
 */
export const VIKING_L1: Record<VikingTopic, string> = {
  // ─────────────────────────────────────────────────────────────────────
  basis_pricing: `## Basis & Pricing Knowledge

### What Basis Tells You
Your net sale price = Futures Price ± Basis. Basis reflects local supply/demand, transport costs, and elevator competition. It is the single most important variable in your marketing decision.

### Basis Signal Matrix
- **Narrowing basis (getting less negative):** Local demand strengthening. Deliver or price now — this window closes.
- **Widening basis (getting more negative):** Local oversupply or logistics bottleneck. Store if carry covers costs; otherwise, consider forward pricing on futures.
- **Positive basis:** Rare. Capitalize immediately — processor or exporter needs grain urgently.
- **Harvest-wide basis:** Normal seasonal pattern. Avoid selling at harvest unless basis is historically narrow.

### Bull/Bear Signal Checklists
**Bullish (3 of 5 confirms a lean):**
1. Deliveries running below 5-year average pace
2. Exports running above average with active new-crop demand
3. Visible stocks declining faster than seasonal norm
4. Basis narrowing at multiple delivery points
5. Managed money (CFTC) net long and increasing

**Bearish (3 of 5 confirms a lean):**
1. Deliveries running above 5-year average (farmer selling pressure)
2. Exports lagging with weak international demand
3. Visible stocks building above seasonal norm
4. Basis widening across the prairies
5. Managed money net short and increasing

### Basis Prediction Method
Use a 3-year moving average or 5-year "Olympic" average (drop highest and lowest years) of historical basis to predict future local cash prices. Formula: Expected Cash Price = Futures Price - Expected Normal Basis.

### Seasonal Pricing Patterns
- **Post-harvest (Oct-Dec):** Wide basis, seasonal low. Store if carry pays.
- **Winter rally (Jan-Mar):** South American weather uncertainty lifts futures. Price a slice.
- **Spring seeding (Apr-May):** New crop acreage intentions shift focus. Basis often narrows for old crop.
- **Summer (Jun-Aug):** Growing season volatility. Price in thirds: 1/3 before seeding, 1/3 mid-summer, 1/3 at harvest.
- **Trend persistence windows:** Weather-driven futures trends historically persist May 24–Aug 23 (corn/soybeans) and Mar 24–Jun 23 (wheat). Trade with the trend during these windows.

### Price Discovery & Forecasting
Markets rapidly absorb new information — often pricing in 80% of a major report on day one. Don't chase moves after the fact. Set targets in advance and execute when hit.
- **Deferred futures are your best predictor.** A deferred futures contract is the single best available forecast of spot prices at expiration. Use it for farm budgeting, not last year's prices.
- **Real prices trend down.** Adjusted for inflation, grain prices have declined for decades due to technology gains. Farmers must continuously lower per-unit production costs to maintain margins.
- **Substitute competition anchors bids.** When feed wheat-corn spread narrows, wheat captures feed demand; when it widens, corn and DDGs erode your bid. Monitor cross-commodity spreads.`,

  // ─────────────────────────────────────────────────────────────────────
  storage_carry: `## Storage & Carry Knowledge

### Storage Decision Algorithm
Store grain ONLY when: Expected Price Gain > (Physical Storage Cost + Interest on Capital + Shrink/Quality Loss + Opportunity Cost)

Rule of thumb: If the market carry (distant minus nearby futures) exceeds your total storage cost × 1.3, the market is paying you to store. Below 1.0×, deliver now.

### Contango vs Backwardation
- **Contango (normal carry market):** Distant months trade above nearby. The market pays you to store. This is the only rational condition for commercial storage.
- **Backwardation (inverted market):** Nearby months trade above distant. The market is screaming "deliver now." Holding grain in an inverted market is pure speculation against clear price signals.

### What the Spread Tells You
The spread between contract months reflects market consensus on supply tightness:
- Widening carry → comfortable supply, no urgency to deliver
- Narrowing carry → supply tightening, consider delivering before inversion
- Inversion → acute shortage signal. Move grain.

### Quality and Shrink Risk
- Grain degrades in storage: moisture migration, insect damage, heating. Factor 0.5-2% annual shrink depending on crop and bin conditions.
- Grade deterioration (falling number, sprouting, heating) can erase any price gain from waiting.
- Test weight loss is irreversible. Monitor bins monthly.

### Holding Without a Price Target is Speculation
Every day you hold unpriced grain in the bin, you are actively speculating on local cash markets. The "wait and see" approach has a measurable cost. Set price targets before harvest and execute incrementally when hit.

### True Carrying Cost Formula
Total Storage Cost = Commercial Storage Rates + (Short-Term Interest Rate x Current Grain Price). Don't forget the foregone interest on capital tied up in the bin — historically 1-4 cents/bu/month depending on rates.

### The Pre-Harvest Trap
Convenience yields (the value buyers place on having physical grain) reliably evaporate in the 2-3 months before new harvest arrives. Carrying old-crop into late summer exposes you to historically predictable price drops. Sell aggressively before the new-crop pressure begins.
- Monthly carry check: Store into month X+1 ONLY if (Expected Price Month X+1) - (Expected Price Month X) > Monthly Storage Cost. When this margin shrinks, liquidate.
- Historical evidence: Storing corn from April into May was profitable in 64% of years, but May into June only 33%. The window closes fast.

### On-Farm Storage as Strategic Asset
Storage gives you marketing flexibility — you choose WHEN to sell rather than being forced into harvest delivery. Use it strategically to capture basis improvements, not to gamble on flat price rallies.`,

  // ─────────────────────────────────────────────────────────────────────
  hedging_contracts: `## Hedging & Contracts Knowledge

### Hedging Mechanics — Canadian Grains
A short hedge (sell futures) locks in a price floor for physical grain. Your final price = Futures Sale Price + Basis at Delivery ± Brokerage Costs.

Key principle: Hedging transfers PRICE risk but introduces BASIS risk. You exchange the risk of a price collapse for the smaller risk of basis moving against you.

### Options Strategies for Farmers
- **Buy a put:** Price floor with unlimited upside. Pay a premium upfront. No margin calls. Best when: you want protection but believe prices may still rally.
- **Sell a call:** Collect premium income but cap your upside. Margin required. Best when: you've already priced your grain and want to monetize the remaining upside.
- **Fence (buy put + sell call):** Low-cost price floor by financing the put with call premium. Caps upside. Best when: you need protection but can't afford full put premium.
- **Options lose time value as expiration nears.** Close winning positions early to capture remaining time value rather than holding to expiry.

### Contract Type Selection Matrix
| Market Outlook | Best Contract Type | Why |
|---|---|---|
| Bullish, rising market | Deferred Delivery or Minimum Price | Lock in current levels, keep upside |
| Bearish, falling market | Forward Contract or Basis Contract | Secure price now, manage basis later |
| Volatile, uncertain | Put Option or Fence | Protection with flexibility |
| Strong local basis | Cash Sale or Spot Delivery | Capture the basis opportunity now |
| Pool availability | Pool Contract | Diversify pricing across the crop year |

### Basis vs HTA Contract Selection
Elevators let you separate futures and basis pricing — lock in whichever variable currently favors you:
- **Basis Contract:** Use when current local basis is unusually strong (narrow) but futures are expected to rise. Locks in basis, prices futures later.
- **Hedge-to-Arrive (HTA):** Use when futures are at profitable highs but current basis is unusually weak. Locks in futures, sets basis later.
- **Weak basis rule:** If Forward Contract Bid < (Futures Price + Expected Historical Basis - Brokerage), bypass the elevator and hedge directly with futures.

### Strategic Pricing Decision Matrix
Match your marketing tool to current market conditions (futures direction × basis direction):
- **Futures UP / Basis STRENGTHENING:** Store or use delayed pricing (risk-tolerant). Buy puts or minimum-price HTA (risk-averse).
- **Futures UP / Basis WEAKENING:** Use basis contracts (lock basis, ride futures).
- **Futures DOWN / Basis STRENGTHENING:** Hedge (sell futures) or HTA contracts.
- **Futures DOWN / Basis WEAKENING:** Execute immediate cash sales or forward contracts. Worst quadrant — act fast.

### When to Use Options vs Forwards
Stable, flat markets discriminate against options — you pay time value with little chance of payout. Reserve put purchases for genuinely volatile conditions. In sharply falling markets, puts outperform basis contracts. In sharply rising markets, forward + call outperforms standard hedging.

### Synthetic Minimum Price Contract
Sell a forward contract to the elevator (eliminating basis risk) and simultaneously buy a call option. This secures a hard floor while preserving upside. Minimum Selling Price = Forward Contract Price - Call Premium - Brokerage.

### Rolling Hedges
Rolling a futures position to a later month realizes the current gain/loss — it is NOT simply extending a date. The roll cost = spread between months + commissions. Factor this into your break-even.

### Forward Contract Risks
Cash forward contracts (elevator) carry counterparty risk — if the buyer defaults, your "hedge" vanishes. Exchange-cleared futures eliminate this risk. For large positions, prefer exchange-cleared instruments.`,

  // ─────────────────────────────────────────────────────────────────────
  logistics_exports: `## Logistics & Exports Knowledge

### Export Demand Indicators
**Primary indicators (watch weekly):**
- CGC cumulative exports vs 5-year average pace
- Terminal receipts acceleration or deceleration
- Vessel line-ups at Vancouver, Thunder Bay, Prince Rupert, Churchill
- Ocean freight rates (rising = active global demand)

**Secondary indicators (watch monthly):**
- USDA export sales reports (US competitor activity)
- Global tender activity (Algeria, Japan, China wheat; EU canola; India pulses)
- Currency: weak CAD makes Canadian grain cheaper to foreign buyers

### Terminal Flow Dynamics
- **Receipts > Exports:** Terminals filling up. Expect basis to widen as congestion builds.
- **Exports > Receipts:** Terminals drawing down. Basis should narrow as demand for grain increases.
- **Net flow direction change:** Watch for inflection points — when terminals switch from filling to draining (or vice versa), basis moves often follow within 2-3 weeks.

### Rail and Transport
- Canadian grain moves by rail (CN/CP) to export terminals. Rail allocation is finite.
- Producer cars allow farmers to ship directly, bypassing elevators — often at better basis but with logistics complexity.
- During peak movement (Oct-Jan), rail congestion widens basis at prairie elevators. Monitor car allocations and out-of-car time (OCT) at terminals.

### Port Congestion Signals
- Out-of-car time (OCT) > 72 hours = congestion building. Widening prairie basis likely.
- Vessel queues at Vancouver > 20 = export demand strong, but terminal throughput constrained.
- When ports are congested, elevators stop bidding aggressively — they can't move grain.

### Logistics Leverage
Whoever controls rolling stock and terminals captures the margin. Exporters supply their own railcars during shortages, widening local basis even when futures rally. Farmers must factor logistics reality into delivery timing.`,

  // ─────────────────────────────────────────────────────────────────────
  market_structure: `## Market Structure & Trade Knowledge

### The Grain Trade Oligopoly
The global grain export market is controlled by a handful of multinational corporations (ABCD+: ADM, Bunge, Cargill, Louis Dreyfus, plus COFCO, Glencore, Viterra). These companies:
- Profit from logistics, basis, and volume — NOT from flat price speculation
- Have informational advantages: global field offices, vessel tracking, government contacts
- Execute export deals before official data reflects demand
- Source from the cheapest global origin, capping how high local basis can go

### CFTC COT Positioning Analysis
Commitments of Traders (COT) data reveals market positioning:
- **Managed money (specs):** Trend followers. When net long and increasing, momentum is bullish. When net short, bearish momentum. BUT specs can reverse quickly.
- **Commercials (hedgers):** Reflect physical trade reality. When commercials are heavily short, they're locking in strong prices — bearish for future price action.
- **Spec/Commercial divergence:** The strongest timing signal. When specs are heavily long BUT commercials are aggressively shorting, the market may be overextended. Watch for reversal.
- COT data confirms TIMING of moves, not direction. Use alongside fundamentals, not as a standalone signal.

### Global Price Anchors
- North American grain prices are capped by the cheapest competing global origin (Black Sea wheat, South American soybeans, Australian barley)
- A local crop failure does NOT guarantee high prices if global harvests are ample
- Dietary shifts toward meat create structural demand for feed grains (reliable long-term anchor)
- Government subsidies distort markets — they're often capitalized by landowners, not farmers

### Information as an Asset
Grain companies treat secrecy as a core asset. They have visibility on global demand weeks before official reports. Farmers' best defense: use public futures prices, monitor vessel chartering, and track basis across multiple delivery points to triangulate real demand.

### Subsidy Capitalization (The Indifference Principle)
Government subsidies and support payments are captured by landowners through higher cash rents, NOT by tenant farmers. A $5,000/yr subsidy leads to a ~$5,000 rent increase, leaving the tenant no better off. Don't factor temporary government payments into long-term profitability calculations — they inflate land costs.

### Fighting Local Oligopsonies
When only 1-2 elevators bid on your grain, they extract wider basis. Counter-strategies:
- Support local cooperatives — they set competitive baseline bids that private buyers must match
- Compare freight-adjusted bids at 3+ delivery points before committing
- Use producer cars for direct terminal delivery when basis spread justifies the logistics effort`,

  // ─────────────────────────────────────────────────────────────────────
  risk_management: `## Risk & Position Management Knowledge

### Margin Management
- Exchange margin requirements increase during high volatility. A rally can trigger margin calls on short hedges even when the physical grain gains value.
- Maintain liquid cash reserves (not grain equity) to survive multi-day margin calls without forced liquidation.
- Forced liquidation during a rally removes your protection right when you need it most. Size positions to survive worst-case margin scenarios.

### Position Sizing Rules
- Maximum 35% of expected production in any single marketing instrument (futures, options, forwards)
- Incremental forward selling: price in 10-20% slices as targets are hit (e.g., 10-15% at seeding, 10-15% mid-summer, 10-15% at harvest, remainder post-harvest)
- Never commit more than you're confident of producing. Short-crop risk + short futures = disaster.

### Counterparty Risk
- Brokerage insolvency can freeze your hedging capital. Diversify margin accounts across independent brokers.
- Cash forward contracts carry buyer default risk. For large tonnage, prefer exchange-cleared futures.
- Never tie farm credit or inputs to grain sales — this surrenders marketing freedom and allows buyers to extract hidden premiums.

### Crop Insurance Integration
- Western Canadian programs: SCIC (Saskatchewan), AFSC (Alberta), MASC (Manitoba)
- Crop insurance sets a revenue floor. Hedge the portion ABOVE your insured level.
- Don't double-insure: crop insurance + futures hedge on the same bushels creates over-coverage.

### The Psychology of Marketing
- **Loss aversion:** Farmers hold depreciating grain to avoid the pain of "locking in a loss." This bias has a measurable cost — unpriced grain loses value while storage costs accumulate. Execute the plan.
- **Probability weighting:** Holding out for a rare 1% market spike while ignoring the 60% chance of further decline. Set realistic price targets based on fundamentals, not hope.
- Revenge trading (trying to recover a bad sale) leads to compounding losses. Accept the outcome and move forward.
- A marketing plan written before harvest, executed mechanically, outperforms emotional decision-making in every study.
- The best time to make marketing decisions is when you're NOT under financial pressure.

### The Cobweb Trap (Supply Response)
When current spot prices are exceptionally high during winter planning, the entire industry overplants that crop. This predictable supply response creates a bearish harvest price. Decision rule: if winter prices for a crop are >20% above 5-year average, defensively hedge new-crop production before seeding — expect the industry to overshoot acreage.

### Yield Skewness — Don't Over-Commit
Production risk is negatively skewed: severe crop failures are far more likely than equivalent bumper crops (in a 39-year U.S. corn study, yields fell >10% below trend 6 times but exceeded trend by >10% only once). Never forward-sell more bushels than you can deliver in a short-crop year.

### Demand Destruction — High Prices Cure High Prices
When grain prices spike, end-users permanently alter feed formulations and substitute ingredients. Corn feed demand elasticity shifts from -0.16 in Year 1 to -0.65 by Year 5. Market aggressively during multi-year highs — the demand that caused the spike erodes over time.`,

  // ─────────────────────────────────────────────────────────────────────
  grain_specifics: `## Grain-Specific Quality, Hedging & Market Context

### Crop Quality & Grading (Canadian Grains)
- **CWRS Wheat:** Protein is the dominant quality factor. Each 0.5% above 13.5% adds $5-15/t. Falling number below 300s triggers steep discounts ($20-40/t). Mildew or sprouting = downgrade risk.
- **Amber Durum:** Vitreous kernel count (VKC) is critical for pasta exports. Below 80% VKC triggers Class 3/4 downgrade. Fusarium/DON contamination >2 ppm eliminates export markets entirely.
- **Canola:** Oil content is the primary pricing factor — premiums/discounts swing around 42-43% baseline ($5-15/t per percentage point). Green seed count >6% triggers downgrading. Dockage >8% reduces effective price. Heated canola trades at feed value (~50% discount). Highly susceptible to bin heating — monitor closely in storage.
- **Barley:** Malt barley requires plump kernels, low protein (10-12.5%), no weathering. Failing malt specs moves it to feed grade ($40-80/t discount). Alberta feedlot activity drives regional feed barley demand.
- **Oats:** Milling oats require test weight >52 lb/bu and low groat content. Below specs trades as feed. Very thin futures open interest (~10-20K contracts) — COT data less reliable, flag low liquidity.
- **Peas/Lentils:** No direct futures hedge — use basis contracts or deferred delivery. India import policy shifts create sudden demand shocks. Plant-protein trends are an emerging demand driver independent of traditional markets.
- **Flaxseed:** Niche market with limited buyers. On-farm storage viable (stable quality) but basis can widen sharply when export demand softens.
- **Soybeans:** Most liquid ag futures market. Spec positioning highly reliable. Watch soybean/corn spread for acreage competition signals.
- **Corn:** Second most liquid futures. Monitor alongside ethanol mandate policy signals. Feed wheat competes with corn — when wheat-corn spread narrows, wheat captures feed demand.

### Hedging Contract Specifications
- **ICE Canola:** 20 tonnes/contract. Direct hedge for Canadian canola. Soybean oil + meal positioning provides secondary crush demand signal.
- **CBOT Wheat:** 5,000 bushels/contract. Combine SRW + HRW + HRSpring (MIAX) for aggregate positioning view. HRSpring most relevant to CWRS pricing.
- **Hedge ratio:** Quantity to hedge ÷ contract size. Round to nearest whole contract. Under-hedging is safer than over-hedging for farmers.

### Acreage Competition & Cross-Grain Dynamics
- **Canola vs Wheat:** Canola's higher gross margins attract acres, but agronomic rotation (1-in-3 or 1-in-4 year canola) constrains expansion. A strong canola rally signals potential wheat acre reduction next spring.
- **Wheat vs Durum:** Direct substitutes in rotation. Durum premium >$30/t typically pulls acres from wheat.
- **Peas/Lentils vs Cereals:** Pulses fix nitrogen, reducing input costs for the following cereal crop. Pulse acreage decisions affect next year's cereal yields.
- **Canola oil competition:** Competes with soybean oil, palm oil, sunflower oil globally. Watch the vegetable oil complex for cross-commodity demand signals.

### Captive Demand & Local Market Dynamics
- **Crush plant proximity (Canola):** Elevators near crush plants show narrower basis when processors need supply. When local processor bids exceed export elevator bids, it signals strong domestic demand.
- **Feedlot proximity (Barley):** Alberta feedlots create captive feed barley demand independent of export markets.
- **Flour mill proximity (Wheat):** Nearby milling demand narrows basis for high-protein CWRS.
- **Elevator competition:** Multiple buyers within 50-80 km creates competitive bidding. Newly opened/expanded facilities bid aggressively to attract volume — a temporary basis opportunity.

### Cash Advance Programs (CCGA)
- Advance Payments Program: interest-free loans ($100K per farmer, $400K additional at prime) against stored grain.
- Allows farmers to hold grain without cash flow pressure — important context for interpreting slow delivery pace.
- When many farmers take cash advances, it delays visible deliveries (bearish near-term volume, bullish for later delivery surge).

### Quality-Based Marketing Rules
- High grade → holding is more viable (premium persists through the crop year).
- Marginal quality → sell early. As more grain enters the system, buyers get pickier and discounts widen.
- Blending on-farm (mixing high/low quality) can capture average premiums, but declare blends honestly to avoid elevator penalties.

### Identity-Preserved (IP) & Non-GM Premiums
- Non-GM soybeans/corn can command $1.00-1.40/bu consumer willingness-to-pay premiums. Real auction premiums: $0.25-0.40+ per unit.
- Decision rule: Only commit to IP/specialty contracts if Offered Premium > (Segregation Costs + Tracking Costs + Yield Drag). The tracking overhead is real — budget $0.15-0.25/bu for traceability compliance.
- Demand for traceable, sustainable grain is growing but so are the specs. Read the fine print.

### Profit-Maximizing Input Application
- Optimize, don't maximize yields. Stop applying inputs when Marginal Cost of Input = Expected Output Price × Marginal Product.
- Example: With wheat at $3.25/bu and nitrogen at $0.15/lb, application should halt when marginal product drops to ~0.046 bu/lb of N. Pushing yield higher destroys margin.
- This applies to all variable inputs: seed rate, fungicide passes, micronutrients. Each marginal unit must pay for itself.`,
};

/**
 * Detect which L1 topics are relevant to a given text input.
 * Returns deduplicated list of matching topics.
 */
export function detectVikingIntents(text: string): VikingTopic[] {
  const matched = new Set<VikingTopic>();
  for (const { topic, pattern } of VIKING_INTENT_PATTERNS) {
    if (pattern.test(text)) {
      matched.add(topic);
    }
  }
  return [...matched];
}

/**
 * Get L1 summaries for the detected topics.
 * Returns concatenated topic summaries ready for prompt injection.
 */
export function getVikingL1Context(topics: VikingTopic[]): string | null {
  if (topics.length === 0) return null;
  return topics.map((topic) => VIKING_L1[topic]).join("\n\n");
}

/**
 * Token count estimates per topic (approximate).
 */
export const VIKING_L1_TOKEN_ESTIMATES: Record<VikingTopic, number> = {
  basis_pricing: 780,
  storage_carry: 720,
  hedging_contracts: 800,
  logistics_exports: 750,
  market_structure: 780,
  risk_management: 740,
  grain_specifics: 850,
};
