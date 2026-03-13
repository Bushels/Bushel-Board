# Dashboard Components — Agent Guide

## Page Section Structure

Both Overview and grain detail pages use a **3-section layout** with `SectionHeader` and `space-y-10` between sections. Every data-dependent section is wrapped in `SectionBoundary` for error isolation.

**Overview page:** Prairie Snapshot → Community Pulse → Market Intelligence
**Grain detail page:** Market Intelligence → Supply & Movement → Community Pulse

## Key Components

| Component | Purpose | Where Used |
|-----------|---------|------------|
| `section-header.tsx` | Canola left-accent section divider with title/subtitle/children slot | Both pages |
| `section-boundary.tsx` | Error boundary wrapper for graceful section failure | Both pages |
| `section-state-card.tsx` | Fallback UI when a section's data is unavailable | Both pages |
| `compact-signal-strip.tsx` | Horizontal scroll signal pills (~80px height) | Overview only |
| `x-signal-feed.tsx` | Full interactive X signal cards with voting | Grain detail only |
| `supply-pipeline.tsx` | AAFC balance sheet waterfall with collapsible domestic breakdown | Grain detail |
| `sentiment-banner.tsx` | Cross-grain sentiment overview | Overview |
| `sentiment-poll.tsx` | Per-grain Holding/Hauling vote | Grain detail |

## Deleted Components — Do Not Recreate

These were removed in the UX Layout & Hierarchy Redesign (Track #16, 2026-03-11):

- `signal-tape.tsx` — Replaced by `compact-signal-strip.tsx` on Overview. Grain detail uses `x-signal-feed.tsx` directly.
- `disposition-bar.tsx` — Domestic disappearance folded into `supply-pipeline.tsx` as a collapsible section.
- `insight-cards.tsx` — Content overlapped with ThesisBanner + IntelligenceKPIs. Removed.
- `waterfall-chart.tsx` — "Where Does X Go?" supply waterfall. Redundant with `supply-pipeline.tsx`. Removed (2026-03-12).

## Patterns

- **SectionHeader is required** for any new top-level section on either page. Don't add raw `<h2>` tags.
- **Don't add a 4th section** to either page without explicit design approval. Place new content within an existing section.
- **CGC region names are NOT unique** — never use them as React keys. Use index-suffixed keys: `` key={`${d.region}-${i}`} ``.
- **Overview uses compact previews**, grain detail uses full interactive versions. Don't render both on the same page.
- **`safeQuery()` pattern** — wrap all data fetches so individual section failures don't crash the page.
