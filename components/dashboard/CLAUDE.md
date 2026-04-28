# Dashboard Components — Agent Guide

**Last refreshed:** 2026-04-28 (My Farm storage tracker + sentiment pause + landing retirement)
**Audit reference:** [docs/plans/2026-04-27-bushel-board-cohesion-audit.md](docs/plans/2026-04-27-bushel-board-cohesion-audit.md)

## Page Section Rhythms (Descriptive)

Different surfaces use different rhythms. The rhythm is chosen for the surface's job, **not enforced by a global rule.** When adding content, ask "what rhythm does this page use?" and fit the content to that rhythm; don't force a 3-section pattern just because grain detail uses one.

| Route | Sections | Rhythm intent |
|---|---|---|
| `/overview` | 1 | Compact AI Market Stance scan. The unified chart IS the surface. |
| `/grain/[slug]` | 3 | Market Thesis → Ask Bushy → My Farm. Natural left-to-right reading for one grain. |
| `/my-farm` | 5 | Seasonal workflow: Weekly Summary → **Grain in your bin** → Your Recommendations → Your Grains → Delivery Pace. (*Market Sentiment* slot was paused on 2026-04-28; the new headline is the simple storage tracker with peer comparison.) |
| `/us` | 2 | US Grain Thesis Overview + US Weekly Thesis Cards. |
| `/us/[market]` | 3 | US Market Thesis → Top Signals → Data Freshness. |
| `/seeding` (planned) | 1 | Seismograph map IS the surface. v2/v3 may grow into a /my-farm-style multi-section workflow per [the design doc](docs/plans/2026-04-27-seeding-progress-map-design.md). |

## Required Patterns

- **`SectionHeader`** for every top-level section (canola left-accent + Fraunces title + DM Sans subtitle). Don't add raw `<h2>` tags.
- **`SectionBoundary`** wrap for every data-dependent section. Failure mode is a `SectionStateCard`, not a white-screen page crash.
  - *Audit P2.1: not currently uniform on `/overview`, `/my-farm`, `/us`. Sweep 3 backlog.*
- **`safeQuery()`** wrapping every data fetch in server components. `safeQuery` swallows errors at the data layer; `SectionBoundary` catches render-time failures. Use both.
- **`GlassCard`** for elevation. Do NOT roll bespoke card styles.
  - *Audit P2.3: `/my-farm` hero uses raw div. Sweep 3 backlog.*
- **Farmer-friendly voice** — no trader jargon, no operator/dev jargon. See Voice Rules below.
- **Client wrappers for vote actions** — Server Components can't pass functions as props. Use thin client wrappers (e.g., `key-metrics-with-voting.tsx`, `signal-strip-with-voting.tsx`) that import server actions and bind them.
- **CGC region names are NOT unique** — never use them as React keys. Use index-suffixed keys: `` key={`${d.region}-${i}`} ``.
- **No transitive server-only imports in client components.** Split into `foo-utils.ts` (client-safe) and `foo.ts` (server-only) per the project pattern.

## Component Lifecycle

### Active

| Component | Where | Notes |
|---|---|---|
| `section-header.tsx` | All sectioned pages | Canola left-accent + Fraunces title |
| `section-boundary.tsx` | Data-dependent sections | Apply uniformly (Sweep 3 will close gaps) |
| `section-state-card.tsx` | Empty/error state fallback | Used by SectionBoundary |
| `compact-signal-strip.tsx` | `/overview` only | "Prairie Chatter" — horizontal scroll signal pills. Don't render on grain detail. |
| `bull-bear-cards.tsx` | `/grain/[slug]` Market Thesis | Should also be used on `/us/[market]` (audit P2.4 — Sweep 4 backlog) |
| `grain-bushy-chat.tsx` | `/grain/[slug]` Ask Bushy | Grain-scoped chat wrapper, 400px height |
| `grain-farm-progress.tsx` | `/grain/[slug]` My Farm section | 3-tile delivery/contract progress + recommendation + pace badge |
| `grain-storage-card.tsx` | `/my-farm` Grain in your bin | Two-input storage tracker (total + remaining tonnes per grain) with peer comparison "X% of farmers have more in the bin than you". Headline focus on My Farm as of 2026-04-28. |
| `delivery-pace-card.tsx` | `/my-farm` Delivery Pace | Bar marker visualization |
| `price-sparkline.tsx` | `/grain/[slug]` hero | Compact price trend |
| `delivery-gap-chart.tsx` | `/grain/[slug]` (Canola) | YoY cumulative delivery gap, dual Y-axis |
| `metric-sentiment-vote.tsx` | Inline | Bullish/bearish vote buttons for metric cards |
| `unified-market-stance-chart.tsx` | `/overview` | The hero of the single Overview section |

### Retired (file kept; do NOT recreate)

| Component | Retired in | Why | Status |
|---|---|---|---|
| `signal-tape.tsx` | Track #16 (2026-03-11) | Replaced by `compact-signal-strip.tsx` | File retained |
| `disposition-bar.tsx` | Track #16 (2026-03-11) | Folded into `supply-pipeline.tsx` then itself retired | File retained |
| `insight-cards.tsx` | Track #16 (2026-03-11) | Overlapped with ThesisBanner + KPIs | File retained |
| `waterfall-chart.tsx` | 2026-03-12 | Redundant with `supply-pipeline.tsx` | File retained |
| `x-signal-feed.tsx` | Wave 2 (2026-03-14) | Replaced by `compact-signal-strip.tsx` (overview-only) | File retained — fully retired, no current use |
| `supply-pipeline.tsx` | Wave 2 (2026-03-14) | Replaced by Key Metrics + Net Balance chart | File retained |
| `flow-donut-chart.tsx` | Wave 2 (2026-03-14) | Replaced by delivery breakdown chart | File retained |
| `intelligence-kpis.tsx` | Wave 2 (2026-03-14) | Replaced by `key-metrics-cards.tsx` | File retained |
| `cot-positioning-card.tsx` | Wave 3 (2026-03-14) | Replaced by farmer-friendly `farmer-cot-card.tsx` | File retained (now also retired below) |
| `key-metrics-cards.tsx` | Track #43 (2026-04-15) | Data via Bushy Chat | File retained |
| `net-balance-chart.tsx` | Track #43 (2026-04-15) | Data via Bushy Chat | File retained |
| `delivery-breakdown-chart.tsx` | Track #43 (2026-04-15) | Data via Bushy Chat | File retained |
| `terminal-flow-chart.tsx` | Track #43 (2026-04-15) | Data via Bushy Chat | File retained |
| `gamified-grain-chart.tsx` | Track #43 (2026-04-15) | Data via Bushy Chat | File retained |
| `logistics-card.tsx` | Track #43 (2026-04-15) | Data via Bushy Chat | File retained |
| `province-map.tsx` | Track #43 (2026-04-15) | Provincial delivery volumes; data via Bushy Chat | File retained — **Note:** different surface from the new `/seeding` map (different question, different file) |
| `storage-breakdown.tsx` | Track #43 (2026-04-15) | Data via Bushy Chat | File retained |
| `farmer-cot-card.tsx` | Track #43 (2026-04-15) | Data via Bushy Chat | File retained |
| `crush-utilization-gauge.tsx` | Track #43 (2026-04-15) | Data via Bushy Chat | File retained |
| `wow-comparison.tsx` | Track #43 (2026-04-15) | Data via Bushy Chat | File retained |
| `sentiment-poll.tsx` | 2026-04-27 (this audit) | Per-grain Holding/Hauling vote. Was on grain detail; accidentally removed during a prior refactor. **Decision 2026-04-27:** leave it out for now while focus is on Bushel Board cohesion. File retained, database wiring retained. May restore in a future feature pass. |
| `multi-grain-sentiment.tsx` | 2026-04-28 (My Farm pivot) | Cross-grain Holding/Hauling voting card on /my-farm. Removed from page render in favor of the new `grain-storage-card.tsx`. **Paused, not deleted** — file, server action `voteSentiment()`, and `grain_sentiment_votes` / `sentiment_history` / `sentiment_daily_rollup` tables all retained. To restore: re-import in `app/(dashboard)/my-farm/page.tsx`, re-add the `getSentimentOverview` + `getUserSentimentVote` parallel fetches, and put the section back between Weekly Summary and Grain in your bin. |
| `sentiment-banner.tsx` | 2026-04-28 (My Farm pivot) | Cross-grain sentiment overview rail. Paired with `multi-grain-sentiment` retirement above. Same restoration path. |

### Status pending review

| Component | Issue | Decision needed |
|---|---|---|
| `percentile-graph.tsx` | Guide previously claimed it was on `/my-farm`, but `delivery-pace-card.tsx` is what's actually rendered | **Deferred until My Farm value review.** Both files retained. Will be resolved when My Farm's overall purpose is rethought. |

## Voice Rules

### Approved

| Pattern | Example |
|---|---|
| Plain-English direction | *"Where each market is heading this week, in plain terms."* |
| Honest data scope | *"USDA NASS week ending April 26, 2026. State data only for the US grain belt."* |
| Direct invitation | *"Ask anything about Canola this week."* |
| Ownership framing | *"Your grain. Your decisions."* |

### Drift to avoid

| Anti-pattern | Why | Replace with |
|---|---|---|
| ❌ *"Run the US thesis generator and publish path first."* | Operator/dev jargon leaked into a farmer-facing empty state | *"New analysis releases Friday evenings. Check back soon."* |
| ❌ *"Weekly bullish/bearish scoring across prairie grains and US markets"* | Trader-shaped scoring metaphor | *"Where each market is heading this week"* |
| ❌ *"Managed Money net long position"* | CFTC trader jargon | *"Fund sentiment"* |
| ❌ *"S/U ratio at 7.2%"* without context | USDA balance-sheet shorthand | *"Stocks-to-use is tight (7.2% — about 26 days of supply)"* |
| ❌ *"BPS"*, *"basis"* without explanation in farmer surfaces | Trader unit | *"price gap"* / *"local-price gap"* |

When in doubt, include a *"What This Means For You"* plain-English callout.

## Anti-Patterns

- **Don't render Overview-only components on grain detail.** `compact-signal-strip.tsx` belongs on `/overview`, not `/grain/[slug]`.
- **Don't add a section without identifying its rhythm.** Identify the page's existing rhythm; fit the section to it. If the new content doesn't fit any existing rhythm, that's a design conversation, not a refactor.
- **Don't roll bespoke card styles.** `GlassCard` exists; use it.
- **Don't use CGC region names as React keys.** Not unique. Use `${region}-${index}`.
- **Don't import server-only modules into `"use client"` components.** Split into `foo-utils.ts` (client-safe) and `foo.ts` (server-only).

## Outstanding Audit Backlog (not yet swept)

Tracked in [docs/plans/2026-04-27-bushel-board-cohesion-audit.md](docs/plans/2026-04-27-bushel-board-cohesion-audit.md):

- **P2.1** Apply `SectionBoundary` uniformly on `/overview`, `/my-farm`, `/us` — Sweep 3
- **P2.2** Resolve `/advisor` silent redirect — Sweep 3
- **P2.3** Refactor `/my-farm` hero to use `GlassCard` — Sweep 3
- **P2.4** Refactor `/us/[market]` to use `BullBearCards` — Sweep 4
- **P2.5** Refactor `/digest` empty state to use `SectionHeader` — Sweep 3
- **My Farm value review** (strategic, separate from audit) — drives the `percentile-graph` vs `delivery-pace-card` decision. Partially addressed by the 2026-04-28 storage-tracker pivot below; full review of `delivery-pace-card.tsx` still pending.

## Closed by 2026-04-27 audit (this sweep)

- `/us` empty state — replaced developer jargon with farmer-friendly copy
- `/overview` subtitle — voice pass
- `/us` subtitle — voice pass
- `sentiment-poll.tsx` — explicit retired status, decision documented above
- `x-signal-feed.tsx` — guide self-contradiction resolved (component is fully retired, no longer claimed as active anywhere)
- Section pattern documentation — switched from prescriptive to descriptive

## Closed by 2026-04-28 (My Farm pivot + auth pivot)

- **Auth model flipped to public-by-default.** Middleware now denylists only `/my-farm`; everything else (Overview, Grain detail, US, Seeding) is publicly accessible. Root route redirects to `/overview`.
- **Landing page retired.** `app/page.tsx` reduced to a one-line redirect; `components/landing/` and `app/api/trial-notify/route.ts` deleted. Bio-trial design/handover docs marked deprecated.
- **My Farm headline changed.** New `grain-storage-card.tsx` (two-input total + remaining tonnes) is the prominent slot. Sentiment voting block removed; components paused not deleted (see Retired table).
- **Nav reorder shipped.** `My Farm` tab moved out of the central pill and anchored to the right cluster of the header (`components/layout/my-farm-nav-link.tsx`). Mobile sheet reordered so My Farm sits at the bottom of the primary nav block.
- **New RPC.** `get_grain_storage_comparison(p_grain)` ships peer comparison with ≥5-farmer privacy gate.
