# Dashboard Components — Agent Guide

## Page Section Structure

Both Overview and grain detail pages use a **3-section layout** with `SectionHeader` and `space-y-10` between sections. Every data-dependent section is wrapped in `SectionBoundary` for error isolation.

**Overview page:** Prairie Snapshot → Community Pulse → Market Intelligence
**Grain detail page:** Market Thesis → Ask Bushy → My Farm

## Key Components

| Component | Purpose | Where Used |
|-----------|---------|------------|
| `section-header.tsx` | Canola left-accent section divider with title/subtitle/children slot | Both pages |
| `section-boundary.tsx` | Error boundary wrapper for graceful section failure | Both pages |
| `section-state-card.tsx` | Fallback UI when a section's data is unavailable | Both pages |
| `compact-signal-strip.tsx` | Horizontal scroll signal pills with optional vote buttons | Overview only |
| `farmer-cot-card.tsx` | Farmer-friendly COT positioning (mood gauge + plain-English insight) | Grain detail |
| `key-metrics-cards.tsx` | 4-card grid: Deliveries/Processing/Exports/Stocks with WoW + insight | Grain detail |
| `metric-sentiment-vote.tsx` | Inline bullish/bearish vote buttons for key metric cards | Grain detail |
| `percentile-graph.tsx` | Bell curve SVG showing farmer's delivery pace vs peers | My Farm |
| `sentiment-banner.tsx` | Cross-grain sentiment overview | Overview |
| `sentiment-poll.tsx` | Per-grain Holding/Hauling vote | Grain detail |
| `bull-bear-cards.tsx` | Side-by-side bull/bear cases with confidence bar + assessment | Grain detail |
| `crush-utilization-gauge.tsx` | Semicircle SVG gauge: annualized processing vs capacity | Grain detail |
| `price-sparkline.tsx` | Compact SVG price sparkline with latest settlement + daily change | Grain detail |
| `delivery-gap-chart.tsx` | YoY cumulative delivery gap with dual Y-axes: left for deliveries, right for gap line + fill | Grain detail (Canola only) |
| `grain-bushy-chat.tsx` | Grain-scoped Bushy Chat wrapper (400px fixed height, grain context) | Grain detail |
| `grain-farm-progress.tsx` | 3-tile delivery/contract progress + recommendation + pace badge | Grain detail |

## Deleted Components — Do Not Recreate

These were removed in the UX Layout & Hierarchy Redesign (Track #16, 2026-03-11):

- `signal-tape.tsx` — Replaced by `compact-signal-strip.tsx` on Overview. Grain detail uses `x-signal-feed.tsx` directly.
- `disposition-bar.tsx` — Domestic disappearance folded into `supply-pipeline.tsx` as a collapsible section.
- `insight-cards.tsx` — Content overlapped with ThesisBanner + IntelligenceKPIs. Removed.
- `waterfall-chart.tsx` — "Where Does X Go?" supply waterfall. Redundant with `supply-pipeline.tsx`. Removed (2026-03-12).
- `x-signal-feed.tsx` — Full interactive X signal cards. Removed in Wave 2 (2026-03-14). Grain detail uses overview-only `compact-signal-strip.tsx`.
- `supply-pipeline.tsx` — AAFC waterfall. Replaced by Key Metrics + Net Balance chart in Wave 2 (2026-03-14).
- `flow-donut-chart.tsx` — "Where Grain Went" donut. Replaced by delivery breakdown chart in Wave 2.
- `intelligence-kpis.tsx` — KPI cards. Replaced by key-metrics-cards in Wave 2.
- `cot-positioning-card.tsx` — Trader-focused COT chart. Replaced by farmer-friendly `farmer-cot-card.tsx` in Wave 3 (2026-03-14).
- `key-metrics-cards.tsx` — KPI grid replaced by thesis reasoning + chat. Retained for Bushy Chat queries. (Track #43, 2026-04-15)
- `net-balance-chart.tsx` — Net balance chart. Data accessible via Bushy Chat. Retained. (Track #43, 2026-04-15)
- `delivery-breakdown-chart.tsx` — Delivery channels chart. Data accessible via Bushy Chat. Retained. (Track #43, 2026-04-15)
- `terminal-flow-chart.tsx` — Terminal net flow chart. Data accessible via Bushy Chat. Retained. (Track #43, 2026-04-15)
- `gamified-grain-chart.tsx` — Pipeline velocity chart. Data accessible via Bushy Chat. Retained. (Track #43, 2026-04-15)
- `logistics-card.tsx` — Port/rail KPI tiles. Data accessible via Bushy Chat. Retained. (Track #43, 2026-04-15)
- `province-map.tsx` — Provincial delivery map. Data accessible via Bushy Chat. Retained. (Track #43, 2026-04-15)
- `storage-breakdown.tsx` — Grain storage breakdown. Data accessible via Bushy Chat. Retained. (Track #43, 2026-04-15)
- `farmer-cot-card.tsx` — COT positioning card. Data accessible via Bushy Chat. Retained. (Track #43, 2026-04-15)
- `crush-utilization-gauge.tsx` — Crush gauge. Data accessible via Bushy Chat. Retained. (Track #43, 2026-04-15)
- `wow-comparison.tsx` — WoW detail card. Data accessible via Bushy Chat. Retained. (Track #43, 2026-04-15)

## Patterns

- **SectionHeader is required** for any new top-level section on either page. Don't add raw `<h2>` tags.
- **Don't add a 4th section** to either page without explicit design approval. Place new content within an existing section.
- **CGC region names are NOT unique** — never use them as React keys. Use index-suffixed keys: `` key={`${d.region}-${i}`} ``.
- **Overview uses compact previews**, grain detail uses full interactive versions. Don't render both on the same page.
- **`safeQuery()` pattern** — wrap all data fetches so individual section failures don't crash the page.
- **Farmer-friendly language** — no trader jargon. "Managed Money" → "Fund Sentiment". Always include a "What This Means For You" plain-English callout where possible.
- **Prairie Chatter on overview only** — `compact-signal-strip.tsx` belongs on the overview page, NOT on grain detail pages.
- **Client wrappers for vote actions** — Server Components can't pass functions as props. Use thin client wrappers (e.g., `key-metrics-with-voting.tsx`, `signal-strip-with-voting.tsx`) that import server actions and bind them.
