# Predictive Market Kalshi Widgets Handover - 2026-04-30

## TL;DR

The Predictive Market tab was redesigned so every Kalshi commodity contract appears as an equal-weight widget. The old hierarchy - one oversized "big bet" plus a secondary roll table - was removed because it made one market look more important than the others.

Current state:
- Branch: `claude/elastic-agnesi-a394a4`
- App commit: `305b0ef feat(markets): equalize Kalshi predictive widgets`
- Vercel preview: `https://bushel-board-pi5b1ti6k-kyles-projects-d3ab6818.vercel.app`
- Local dev URL used during verification: `http://localhost:3017/markets`

## What Changed

### `/markets` page

File: `app/(dashboard)/markets/page.tsx`

Changes:
- Removed the entire "This week's brief" placeholder section.
- Removed the `getLatestPredictiveMarketBrief()` query from the page.
- Kept the top page headline:
  - `Predictive Market`
  - `Where the crowd is paying for your bushel.`
- The page now goes directly into `MarketplaceStrip`.

Reason:
- The brief block added editorial weight above the market widgets.
- For the current v1, the user wants the Predictive Market tab to be a clean widget board.

### Marketplace strip

File: `components/overview/marketplace-strip.tsx`

Changes:
- Replaced the old composition:
  - `LiveTape`
  - `SpotlightCard`
  - `MarketRoll`
- New composition:
  - `PredictiveMarketHeader`
  - `MarketWidgetGrid`
  - optional CBOT futures strip on the full `/markets` variant
  - footer showing Kalshi refresh timing

Important behavior:
- The full `/markets` view renders all Kalshi markets as equal widgets.
- The `/overview` teaser renders the first 3 equal widgets and links to `/markets`.
- Fallback snapshot data still exists for when Kalshi is unreachable.

### New widget grid

File: `components/overview/marketplace/market-widget-grid.tsx`

Purpose:
- Renders each Kalshi contract as an equal-footprint card.

Each widget shows:
- crop tag and cadence
- Kalshi label
- concise contract title
- YES price
- 24h movement
- small sparkline
- volume
- open interest
- close date
- `Open contract` link

The bottom market-signal strip shows:
- highest volume
- biggest 24h move
- closest expiry
- `Open on Kalshi ->`

## API Refresh Decision

Current code keeps the Kalshi market list cache at 5 minutes:

```ts
const CACHE_TTL_MS = 5 * 60 * 1000;
```

File: `lib/kalshi/client.ts`

Current request behavior:
- Cold render: fetches the 7 featured Kalshi series.
- Requests are staggered by `KALSHI_STAGGER_MS = 250`.
- Warm render inside 5 minutes: uses the in-memory server cache.

Decision:
- Keep 5 minutes for v1.

Reason:
- These are commodity prediction-market widgets, not a trading terminal.
- Faster polling adds API load and page-render risk without changing the farmer-facing decision value much.
- If we later need true live movement, use Kalshi WebSockets rather than hammering REST. Kalshi WebSockets require authentication.

Regression guardrail:
- Do not reintroduce per-card candlestick fetches during server render unless we add a caching layer or background collector.
- Do not put the live tape back on `/markets` unless there is a clear product reason; it reintroduces a single-market spotlight feel.

## Kalshi Limits And Performance Notes

Kalshi limits are account/tier based. Their docs expose an authenticated `/account/limits` endpoint with a token-bucket model:
- read bucket
- write bucket
- refill rate
- bucket capacity
- HTTP `429` when exhausted

Practical rule for Bushel Board:
- 5-minute REST refresh is safe for this UI.
- 60-120 second refresh could be acceptable later if done client-side or via a cached API route.
- Sub-30-second REST refresh is not worth it for v1.
- True live updates should use WebSockets, not repeated REST calls.

Page-speed risk:
- More API calls during server render slow the page.
- The previous design fetched extra spotlight candlesticks and recent trades for one selected market.
- The new widget sparklines avoid extra Kalshi requests by using current YES probability vs Kalshi previous-price fields already included in the market response.

## Verification Completed

Commands run:

```powershell
npx eslint 'app/(dashboard)/markets/page.tsx' 'components/overview/marketplace-strip.tsx' 'components/overview/marketplace/market-widget-grid.tsx'
npm run build
npx vitest run lib/__tests__/kalshi-client.test.ts
```

Results:
- Focused ESLint: passed
- Production build: passed
- Kalshi client tests: passed, 54 tests
- Browser verification: desktop and mobile screenshots checked locally

Screenshots generated locally:
- `output/playwright/markets-equal-widgets-4col.png`
- `output/playwright/markets-equal-widgets-mobile.png`
- `output/playwright/markets-no-brief.png`

## Deployment And Git

Vercel:
- First deploy accidentally created an isolated Vercel project because the Claude worktree had no `.vercel/project.json`.
- Corrected by linking the worktree to the root `bushel-board-app` Vercel project.
- Correct preview deployment:
  - `https://bushel-board-pi5b1ti6k-kyles-projects-d3ab6818.vercel.app`

Git:
- Pushed app changes to `origin/claude/elastic-agnesi-a394a4`.
- Commit: `305b0ef feat(markets): equalize Kalshi predictive widgets`

Note:
- GitHub CLI was not authenticated, but normal `git push` worked.

## Next Pickup Checklist

1. Open the Vercel preview and confirm `/markets` still shows the equal-card layout.
2. If merging to main, ensure only the market UI files plus this handover are included.
3. Do not merge accidental `.vercel/project.json` changes from the worktree.
4. If changing Kalshi refresh timing, update both:
   - `lib/kalshi/client.ts`
   - this handover or the relevant product doc
5. If adding real live charts, choose one:
   - cached server/background collector
   - authenticated Kalshi WebSocket stream
   - do not add direct per-card REST polling in render

