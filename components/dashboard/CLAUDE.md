# Dashboard Components — Agent Guide

**Scope:** scoped landing brief for agents editing files under `components/dashboard/` or any dashboard route in `app/(dashboard)/`. Read root `CLAUDE.md` first for project-wide rules; read this file when the change touches a dashboard component, a section rhythm, or farmer-facing copy. Activity history for this surface lives in `docs/journal/YYYY-MM.md`; the unfinished cohesion-audit backlog lives in `docs/plans/2026-04-27-bushel-board-cohesion-audit.md`.

## Page Section Rhythms (Descriptive)

Different surfaces use different rhythms. The rhythm is chosen for the surface's job, **not enforced by a global rule.** When adding content, ask "what rhythm does this page use?" and fit the content to that rhythm; don't force a 3-section pattern just because grain detail uses one.

| Route | Sections | Rhythm intent |
|---|---|---|
| `/overview` | 1 | Compact AI Market Stance scan. The unified chart IS the surface. |
| `/grain/[slug]` | 3 | Market Thesis → Ask Bushy → My Farm. Natural left-to-right reading for one grain. |
| `/my-farm` | 5 | Seasonal workflow: Weekly Summary → Grain in your bin → Your Recommendations → Your Grains → Delivery Pace. |
| `/us` | 2 | US Grain Thesis Overview + US Weekly Thesis Cards. |
| `/us/[market]` | 3 | US Market Thesis → Top Signals → Data Freshness. |
| `/seeding` | 1 | Seismograph map IS the surface. |

## Required Patterns

- **`SectionHeader`** for every top-level section (canola left-accent + Fraunces title + DM Sans subtitle). Don't add raw `<h2>` tags.
- **`SectionBoundary`** wraps every data-dependent section. Failure mode is a `SectionStateCard`, not a white-screen page crash.
- **`safeQuery()`** wraps every data fetch in server components. `safeQuery` swallows errors at the data layer; `SectionBoundary` catches render-time failures. Use both.
- **`GlassCard`** for elevation. Do NOT roll bespoke card styles.
- **Farmer-friendly voice** — no trader jargon, no operator/dev jargon. See Voice Rules below.
- **Client wrappers for vote actions** — Server Components can't pass functions as props. Use thin client wrappers (e.g. `key-metrics-with-voting.tsx`, `signal-strip-with-voting.tsx`) that import server actions and bind them.
- **CGC region names are NOT unique** — never use them as React keys. Use index-suffixed keys: `` key={`${d.region}-${i}`} ``.
- **No transitive server-only imports in client components.** Split into `foo-utils.ts` (client-safe) and `foo.ts` (server-only) per the project pattern.

## Active Components

Component-to-route map. New dashboard work should reuse these before introducing a new component.

| Component | Where used |
|---|---|
| `section-header.tsx` | All sectioned pages |
| `section-boundary.tsx` | Data-dependent sections |
| `section-state-card.tsx` | Empty/error fallback used by `SectionBoundary` |
| `compact-signal-strip.tsx` | `/overview` only — "Prairie Chatter" horizontal scroll signal pills. Don't render on grain detail. |
| `bull-bear-cards.tsx` | `/grain/[slug]` Market Thesis |
| `grain-bushy-chat.tsx` | `/grain/[slug]` Ask Bushy — grain-scoped chat wrapper, 400px height |
| `grain-farm-progress.tsx` | `/grain/[slug]` My Farm section — 3-tile delivery/contract progress + recommendation + pace badge |
| `grain-storage-card.tsx` | `/my-farm` Grain in your bin — two-input storage tracker (total + remaining tonnes per grain) with peer comparison "X% of farmers have more in the bin than you" |
| `delivery-pace-card.tsx` | `/my-farm` Delivery Pace — bar marker visualization |
| `price-sparkline.tsx` | `/grain/[slug]` hero — compact price trend |
| `delivery-gap-chart.tsx` | `/grain/[slug]` (Canola only) — YoY cumulative delivery gap, dual Y-axis |
| `metric-sentiment-vote.tsx` | Inline — bullish/bearish vote buttons for metric cards |
| `unified-market-stance-chart.tsx` | `/overview` — the hero of the single Overview section |

## Retired — Do Not Recreate

The following dashboard component files are retained on disk but no longer rendered. **Do not recreate them, do not reintroduce them by name, and do not paste their old behavior into new components.** Retirement dates and replacement history live in `docs/journal/2026-04.md` and earlier monthly journals.

- `cot-positioning-card.tsx`
- `crush-utilization-gauge.tsx`
- `delivery-breakdown-chart.tsx`
- `disposition-bar.tsx`
- `farmer-cot-card.tsx`
- `flow-donut-chart.tsx`
- `gamified-grain-chart.tsx`
- `insight-cards.tsx`
- `intelligence-kpis.tsx`
- `key-metrics-cards.tsx`
- `logistics-card.tsx`
- `multi-grain-sentiment.tsx`
- `net-balance-chart.tsx`
- `province-map.tsx` *(distinct from the new `/seeding` map — different surface, different file)*
- `sentiment-banner.tsx`
- `sentiment-poll.tsx`
- `signal-tape.tsx`
- `storage-breakdown.tsx`
- `supply-pipeline.tsx`
- `terminal-flow-chart.tsx`
- `waterfall-chart.tsx`
- `wow-comparison.tsx`
- `x-signal-feed.tsx`

## Voice Rules

### Approved patterns

| Pattern | Example |
|---|---|
| Plain-English direction | *"Where each market is heading this week, in plain terms."* |
| Honest data scope | *"USDA NASS week ending April 26, 2026. State data only for the US grain belt."* |
| Direct invitation | *"Ask anything about Canola this week."* |
| Ownership framing | *"Your grain. Your decisions."* |

### Drift to avoid

| Anti-pattern | Why it's wrong | Replace with |
|---|---|---|
| ❌ *"Run the US thesis generator and publish path first."* | Operator/dev jargon leaked into a farmer-facing empty state | *"New analysis releases Friday evenings. Check back soon."* |
| ❌ *"Weekly bullish/bearish scoring across prairie grains and US markets"* | Trader-shaped scoring metaphor | *"Where each market is heading this week"* |
| ❌ *"Managed Money net long position"* | CFTC trader jargon | *"Fund sentiment"* |
| ❌ *"S/U ratio at 7.2%"* without context | USDA balance-sheet shorthand | *"Stocks-to-use is tight (7.2% — about 26 days of supply)"* |
| ❌ *"BPS"* / *"basis"* without explanation in farmer surfaces | Trader unit | *"price gap"* / *"local-price gap"* |

When in doubt, include a *"What This Means For You"* plain-English callout.

## Anti-Patterns

- **Don't render Overview-only components on grain detail.** `compact-signal-strip.tsx` belongs on `/overview`, not `/grain/[slug]`.
- **Don't add a section without identifying its rhythm.** Identify the page's existing rhythm; fit the section to it. If the new content doesn't fit any existing rhythm, that's a design conversation, not a refactor.
- **Don't roll bespoke card styles.** `GlassCard` exists; use it.
- **Don't use CGC region names as React keys.** Not unique. Use `` `${region}-${index}` ``.
- **Don't import server-only modules into `"use client"` components.** Split into `foo-utils.ts` (client-safe) and `foo.ts` (server-only).
- **Don't recreate retired components or paste their old behavior into new ones.** See the Retired list above.
