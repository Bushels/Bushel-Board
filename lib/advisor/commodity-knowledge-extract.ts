// lib/advisor/commodity-knowledge-extract.ts
// Re-export the key frameworks for chat context.
// This avoids importing Deno-targeted Edge Function code into Next.js.

export const COMMODITY_KNOWLEDGE = `## Basis Signal Matrix
- Widening Basis + Falling Futures = Strong Bearish → accelerate sales, avoid storage
- Widening Basis + Rising Futures = Local Glut → hedge futures, store only if carry > 3%
- Narrowing Basis + Rising Futures = Strong Bullish → delay sales, consider storage
- Narrowing Basis + Falling Futures = Local Shortage → sell cash, avoid hedging
- Positive Basis (inverted market) = Urgency → immediate delivery

## Storage Decision Algorithm
Store IF all conditions met:
1. Futures Curve Carry (Month+3 minus Month) > Storage Cost x 1.3
2. Expected basis in 90 days < Current basis - 10 points
3. Historical Q1-Q2 price increase probability > 60%
Otherwise: Sell cash or minimal hedge (5-10%)

## Top-Third Pricing Discipline
Aim to sell within the top one-third of the annual expected price range. Lock in targets mentally before harvest.

## Incremental Forward Selling
Forward sell 10-15% at seeding, another 10-15% in late summer, hold remainder for harvest decisions.

## Flow Coherence Rule
If visible commercial stocks are DRAWING (declining WoW) while deliveries are high, the system IS absorbing supply. This is structurally bullish regardless of where YTD exports sit.
Weekly Absorption = CW_Deliveries + |WoW_Stock_Draw|

## COT Positioning Rule
COT informs TIMING, not DIRECTION. Specs bullish + commercials bearish = prices likely elevated above fundamental value. Specs bearish + commercials bullish = prices likely depressed, opportunity for patient farmers.`;
