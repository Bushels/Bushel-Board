# Distilled Grain Knowledge - Western Canadian Grain Marketing: Hedging, Options, and Basis Management

Source Title: pm255 self study guide hedging en 2018
Source Path: knowledge/raw/pm255_self-study-guide_hedging_en_2018.pdf
Source Hash: 49a3fc85ce2923126665b1d7e86e5af98e814d24e4077163bfbbf5e6d520fef1
Model Used: openrouter/healer-alpha
Prompt Version: step-distillation-v1
Generated At: 2026-03-16T16:35:50.099Z
Packet Count: 15
Extraction Warnings: none

## L0 Summary (Retrieval Ranking)
Track your local basis to forecast final price, as all hedging strategies ultimately depend on this critical variable.

## L1 Summary (Context Loading)
• Your net price is always: Futures Price +/- Basis +/- Option Gain/Loss. Track your local basis history religiously.
• Futures hedges lock in price but leave you exposed to basis risk. Options (puts) set a flexible price floor for a premium, avoiding margin calls.
• A 'fence' (buy put + sell call) lowers premium cost but caps your upside price potential.
• Options lose time value as expiration nears; consider closing winning positions early to capture remaining value.
• Always factor in all transaction costs (commissions, interest) when comparing strategies, as they directly reduce your net return.

## Executive Summary
This guide merges core hedging concepts for prairie grain sellers. Futures hedges lock in a price level but transform price risk into basis risk—the local difference between cash and futures prices. Options (puts and calls) provide flexible price floors or ceilings for a premium, avoiding margin calls but with a sunk cost. No strategy is perfect; the choice depends on your market outlook, risk tolerance, and need for flexibility. Your final net price is always determined by the futures price, your local basis, and any option premium. Key practical steps include maintaining detailed historical basis records, actively managing option positions before expiration, and comparing all marketing alternatives under different price scenarios.

## Farmer Takeaways
- Your net selling price formula is: Futures Price +/- Basis +/- Option Gain/Loss. Basis is the critical local variable you must track and forecast.
- Hedging with futures protects against large adverse price moves but eliminates the chance to benefit from favorable moves. It transforms price risk into basis risk.
- Buying a put option sets a minimum selling price (floor) for your grain, while allowing you to benefit from rising prices. You pay a premium for this flexibility and avoid margin calls.
- A 'fence' or 'collar' strategy (buy a put + sell a call) creates a defined price range, reducing net premium cost but also capping your upside.
- Selling a call option adds premium income to your price but caps your upside. If the market rallies strongly, call losses can offset all higher cash gains.
- Consider selling your cash crop at harvest and buying a call option. This provides flexibility to benefit from a post-harvest rally without incurring physical storage costs.
- Options are 'decaying assets.' Their time value erodes, especially in the last 30-60 days. Consider offsetting a winning option position before expiration to recover remaining time value.
- Factor in all transaction costs (commissions, margin interest) when evaluating any strategy, as they erode net returns.

## Market Heuristics
### Basis is the Local Price Determinant
For a seller: Net Price = Futures Price + Basis. A strengthening basis (more positive) increases your net price. Your final net price from a futures hedge is determined by the basis at the time of your cash transaction.

### Calculate Your Floor Price with a Put
Minimum (floor) selling price = Put Strike Price – Premium Paid +/- Expected Basis. This gives you the worst-case scenario when buying downside protection.

### Calculate Your Ceiling with a Sold Call
Expected maximum (ceiling) selling price = Call Strike Price + Premium Received +/- Expected Basis. This is the best-case scenario when selling a call to enhance income.

### The 'Fence' or 'Collar' Price Range
Floor Price = Put Strike - Net Premium (put premium paid - call premium received) +/- Expected Basis. Ceiling Price = Call Strike - Net Premium +/- Expected Basis. This defines a minimum and maximum selling price.

### Hedging vs. Forward Contract
A forward contract locks in a fixed price by fixing both the futures and basis components. A futures hedge locks in only the futures price component, leaving the basis variable. Choose based on your basis outlook.

### Match Hedge to Your Position
To protect grain you plan to sell (short position), use a short hedge (sell futures or buy a put). To protect a future purchase need (long position), use a long hedge (buy futures or buy a call).

## Risk Watchouts
- Hedging does not eliminate risk; it converts price risk into basis risk. An unexpected move in your local basis can erode your expected price.
- Futures margin calls are a real cash flow obligation. You must fund daily losses on open positions, which can occur even if your overall hedge is ultimately successful.
- Buying options requires paying a premium that directly reduces your net sale price. The premium is a sunk cost.
- Selling (writing) options carries the risk of significant loss if the market moves strongly against you. It requires margin and careful monitoring.
- Options expire. Holding an out-of-the-money option to expiration results in a 100% loss of the premium paid. Always instruct your broker on expiring in-the-money options to avoid unwanted futures positions.
- Basis can be volatile. Historical patterns are a guide, not a guarantee. Sudden local changes in freight, demand, or quality can shift basis dramatically.
- Energy, interest rate, and foreign exchange risks can squeeze grain operation margins independently of crop prices.

## Grain Focus
- wheat
- canola
- barley
- oats
- flax
- peas
- lentils
- soybeans
- corn

## Retrieval Tags
- Topic Tags: hedging, futures, options, puts, calls, basis, margin, risk management, price discovery, time decay, forward contracting, collar, fence, transaction costs
- Region Tags: western Canada, prairies, Alberta, Saskatchewan, Manitoba

## Evidence Highlights
- [page 13] Basis is the difference between the local cash price and the futures price (Cash - Futures). It is the critical factor for a hedger, as the final net price depends on the basis at the time of the cash transaction.
- [page 10] Margin (performance bond) in futures is not a down payment but a deposit to ensure contract performance. Losses on an open position trigger margin calls to replenish the account.
- [page 27] Buying an option (like a put) gives you a price floor without margin calls and without giving up upside potential, for the cost of a premium.
- [pages 53-54] Buying a put option establishes a floor price (strike - premium +/- basis) but allows the seller to benefit from higher prices, minus the premium cost.
- [pages 56-57] A 'fence' strategy (buy a put, sell a call) creates a selling price range. It reduces the net premium cost but also establishes both a floor and a ceiling for your price.
- [pages 61-62] Strategy: Sell the cash crop at harvest and buy a call option. This provides flexibility to benefit from a post-harvest rally without incurring physical storage costs and risks.
- [page 69] Hedging with futures allows you to lock in a price level, but you are still subject to a change in basis. Basis risk is the fluctuation that prevents a perfect hedge.
