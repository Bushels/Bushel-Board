/**
 * Viking L0 — Always-loaded knowledge card.
 *
 * Synthesized from all 8 source books into a single unified worldview (~500 tokens).
 * Injected into EVERY AI prompt (pipeline + advisor chat) as the foundational
 * mental model. No database query needed — this is a static constant.
 *
 * Sources:
 *   1. A Trader's First Book on Commodities (hedging fundamentals)
 *   2. Introduction to Grain Marketing (SK Ministry of Agriculture)
 *   3. Self-Study Guide: Hedging (ICE Futures Canada)
 *   4. Merchants of Grain — Dan Morgan (global trade structure)
 *   5. Out of the Shadows — Jonathan Kingsman (modern grain commerce)
 *   6. The Economics of Futures Trading — Goss & Yamey (futures theory)
 *   7. Agricultural Prices & Commodity Market Analysis — Ferris (price analysis)
 *   8. Agricultural Marketing & Price Analysis — Norwood & Lusk (marketing strategy)
 *
 * Distilled by Gemini via step-distillation-v1 pipeline, then manually
 * synthesized into a cross-book unified card.
 */

export const VIKING_L0 = `## Grain Analyst Knowledge Card

You draw on distilled expertise from 8 authoritative sources covering commodity trading fundamentals, Canadian grain marketing, hedging mechanics, global trade structure, futures economics, and agricultural price analysis.

### Core Principles
1. **Hedging is insurance, not speculation.** Futures and options protect physical crop value. Maintain cash liquidity to survive margin calls during volatile rallies.
2. **Basis is your price signal.** Track local basis religiously — it forecasts your final price. Sell when basis narrows or goes positive; store when wide during harvest.
3. **Let market structure dictate storage.** Hold grain when distant futures pay carrying charges (contango). Sell immediately in inverted markets (backwardation) — the market demands delivery now.
4. **Know your break-even and execute with discipline.** Calculate costs, set target prices, sell incrementally when targets are hit. Remove emotion from marketing decisions.
5. **Information asymmetry favors buyers.** Multinational grain companies profit from logistics, basis, and volume — not flat price risk. Use on-farm storage and public futures to level the field.
6. **Global forces anchor local prices.** Currency shifts, ocean freight, geopolitics, and competing origins cap or lift local bids regardless of local supply.
7. **Unpriced grain in the bin is active speculation.** Every day you hold without a price target, you're betting on the local cash market. Use incremental sales to reduce risk.
8. **Price differences create opportunities.** The Law of One Price means arbitrage erodes gaps — but transport costs, quality specs, and timing create exploitable windows for alert farmers.

### Topic Index (for deeper retrieval)
When the conversation touches these topics, deeper knowledge is available:
- **Basis & Pricing** — basis signals, bull/bear checklists, seasonal patterns, price discovery
- **Storage & Carry** — storage decision algorithm, contango/backwardation, cost of carry
- **Hedging & Contracts** — short hedges, options strategies, fence/collar, contract selection matrix
- **Logistics & Exports** — port congestion, rail, terminal flow, producer cars, export demand indicators
- **Market Structure & Trade** — multinational oligopoly, information asymmetry, global demand anchors
- **Risk & Position Management** — margin management, crop insurance, diversification, counterparty risk`;

/**
 * Token count estimate for L0: ~420 tokens (well within 500-token budget).
 * This replaces the 7K-token COMMODITY_KNOWLEDGE blob from commodity-knowledge.ts,
 * covering all 8 books instead of only 3.
 */
export const VIKING_L0_TOKEN_ESTIMATE = 420;
