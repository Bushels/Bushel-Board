# Predictive Market Tab — Design Doc

**Status:** Approved direction · awaiting implementation
**Date:** 2026-04-29
**Owner:** Kyle
**Predecessor:** Track 51 (Editorial Trading Floor on `/overview` Marketplace)
**Estimated effort:** 2–3 sessions

---

## Goal

Promote the Kalshi marketplace surface from a section on `/overview` into its
own top-level tab `/markets`, and have a Friday-weekly AI swarm produce
editorial commentary that cross-references Kalshi prediction-market YES
probabilities against our internal grain-desk stance.

The editorial value is in **divergence** — *"the crowd is paying for a
soybean breakout we don't see"* — not in restating what Kalshi already
shows on its own site.

---

## Decisions (already approved)

| Question | Choice | Rationale |
|---|---|---|
| Cross-reference our thesis or Kalshi-only? | **Cross-reference** | Divergence is the editorial pull. Kalshi-only is just data restatement. |
| Daily or weekly? | **Friday weekly** | Matches existing CAD + US desk rhythm; cheap LLM spend; story rarely changes intra-week. |
| Route name? | **`/markets`** | Future-proof for non-Kalshi prediction venues (Polymarket, etc.) without renaming. |

---

## Architecture

### Route + nav

- New top-level route `/markets` rendering the full Predictive Market dashboard
  + the AI editorial brief at the top.
- `/overview` Marketplace section becomes a **teaser**: header + spotlight
  card only + "View full Predictive Market →" CTA pointing to `/markets`.
- Nav slot: `Overview · Grain · US · Seeding · Markets · My Farm`.
  Update both desktop nav (`components/layout/desktop-nav-links.tsx`) and
  mobile nav (`components/layout/mobile-nav.tsx`).
- Public route — no auth required, matches the rest of `/overview` /
  `/grain/[slug]` / `/us`.

### Swarm — `prediction-market-desk`

Mirrors the CAD `grain-desk` and `us-desk` patterns. Located at
`.claude/agents/prediction-market-*.md`. Triggered by a new Claude Desktop
Routine **`prediction-market-weekly`** scheduled for **Fri 8:00 PM ET**
(after Kalshi's market close + after CAD/US desks have written
`market_analysis` / `us_market_analysis` for the week).

**Scouts (Haiku — fast, cheap, parallelizable):**

1. `kalshi-state-scout` — pulls all 7 markets via `lib/kalshi/client.ts`,
   computes biggest movers (24h delta from `previous_price_dollars`),
   highest volume, biggest spread (uncertainty signal).
2. `divergence-scout` — reads `market_analysis` (CAD: corn, soy, wheat
   stance scores + bull/bear reasoning) and `us_market_analysis`, maps each
   Kalshi market to its closest CGC grain, computes the
   probability-vs-stance gap. *This is the only scout that crosses the
   isolation fence — read-only, never writes back.*
3. `macro-scout` — **reuse existing** (`.claude/agents/macro-scout.md`).
   Pulls breaking tariff/weather/USDA news that might explain a Kalshi move.

**Specialist (Sonnet):**

- `prediction-market-analyst` — synthesizes the three scouts; ranks the 7
  markets by editorial interest (crowd-vs-thesis divergence weighted by
  liquidity); identifies the 1–3 most interesting calls for the week.

**Desk chief (Opus — non-negotiable per memory `feedback_grain_desk_uses_opus.md`):**

- `prediction-market-desk-chief` — writes the weekly editorial:
  - **Headline** (one Fraunces sentence — *"The crowd is paying for a
    soybean breakout we don't see."*)
  - **Lede** (2–3 sentences — what's the story this week)
  - **Per-market take** (one line per market — agree / disagree / watch)
  - **Bottom line** (recommendation: where farmers should pay attention)

### Output table — `predictive_market_briefs`

New migration: `supabase/migrations/{timestamp}_create_predictive_market_briefs.sql`

```sql
CREATE TABLE predictive_market_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_ending DATE NOT NULL UNIQUE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  model_source TEXT NOT NULL,  -- e.g. 'claude-opus-prediction-desk-v1'
  headline TEXT NOT NULL,
  lede TEXT NOT NULL,
  bottom_line TEXT,
  per_market_takes JSONB NOT NULL,
  -- Snapshot of the 7 markets at brief time so the page renders
  -- consistently even if Kalshi has rolled events between Friday and
  -- the user's visit.
  market_snapshot JSONB NOT NULL,
  CONSTRAINT one_brief_per_week UNIQUE (week_ending)
);
CREATE INDEX idx_predictive_market_briefs_week ON predictive_market_briefs (week_ending DESC);
```

**`per_market_takes` JSONB shape:**
```json
[
  {
    "ticker": "KXSOYBEANMON-26APR3017-T1166.99",
    "series": "KXSOYBEANMON",
    "stance": "agree" | "disagree" | "watch",
    "kalshi_yes_pct": 89,
    "internal_score": 18,
    "comment": "Kalshi calls this 89% YES. Our supply/demand says lean bullish too — this one we agree on."
  },
  ...
]
```

### Isolation fence (CRITICAL)

This is a **read-from-many, write-to-one** architecture:

```
[Kalshi API]  ──┐
                ├──► prediction-market-desk swarm ──► predictive_market_briefs ──► /markets page
[market_analysis] ─┘                                          (read-only by /markets)
[us_market_analysis] ┘
```

- The swarm **reads** Kalshi data (via `lib/kalshi/client.ts`) AND grain-desk
  stance (via existing `lib/queries/intelligence.ts` and the US equivalent).
- The swarm **writes** only to `predictive_market_briefs`.
- `predictive_market_briefs` is **never read** by `market_analysis` writers,
  grain detail pages, or any other surface. One-way data flow.
- Add isolation fence headers to every new file (mirroring the pattern in
  `lib/kalshi/client.ts` and `lib/kalshi/types.ts`).

This preserves the user's strict feedback (memory:
`feedback_feature_isolation.md`): build features in isolation, integrate
deliberately. The swarm is a designed cross-reference; never a contamination
path.

---

## Implementation phases

Each phase is independently shippable. Don't bundle them into one PR.

### Phase 1 — Migration + scaffolding (1 session)
- Create `predictive_market_briefs` table migration.
- Create new RPC `get_latest_predictive_market_brief()` returning the most
  recent brief.
- Add `lib/queries/predictive-market.ts` (server-only query helper).
- Create empty `app/(dashboard)/markets/page.tsx` that renders the existing
  `MarketplaceStrip` component (re-exported, unchanged) + a placeholder
  brief region.
- Wire nav link in desktop + mobile nav.
- Update `/overview` Marketplace section to be a teaser (spotlight + CTA
  only, no roll, no tape).
- **Acceptance:** `/markets` route renders the full marketplace; `/overview`
  shows the trimmed teaser; nav has new link; tests pass; build clean.

### Phase 2 — Agent definitions + swarm (1 session)
- Write `.claude/agents/{kalshi-state-scout,divergence-scout,prediction-market-analyst,prediction-market-desk-chief}.md`.
- Write the orchestration prompt: `docs/reference/prediction-market-desk-swarm-prompt.md`.
- Add Claude Desktop Routine config: `prediction-market-weekly` (Fri 8 PM ET).
- Document in `docs/reference/collector-task-configs.md`.
- **Acceptance:** swarm runs end-to-end against real data once; produces a
  brief that lands in `predictive_market_briefs`; manual review confirms
  the editorial output matches tone goal.

### Phase 3 — Editorial brief surface (1 session)
- Build `components/markets/editorial-brief.tsx` rendering the headline +
  lede + bottom line in Fraunces.
- Build `components/markets/per-market-takes.tsx` overlaying the AI take on
  the existing spotlight + roll components.
- Wire it into `app/(dashboard)/markets/page.tsx`.
- Add a "Brief generated {Friday date}" footer next to the existing "As of"
  timestamp.
- **Acceptance:** browser visit to `/markets` shows the brief on top, the
  full 7-market dashboard below, with per-market AI takes inlined; build
  clean; tests pass; documented in STATUS.md as Track 52.

---

## Files to read first (orientation for next session)

**Existing patterns to mirror:**
- [.claude/agents/supply-scout.md](.claude/agents/supply-scout.md) — Haiku scout pattern
- [.claude/agents/export-analyst.md](.claude/agents/export-analyst.md) — Sonnet analyst pattern
- [docs/reference/grain-desk-swarm-prompt.md](docs/reference/grain-desk-swarm-prompt.md) — orchestration prompt structure
- [docs/reference/collector-task-configs.md](docs/reference/collector-task-configs.md) — Claude Desktop Routine config style

**Existing Kalshi surface (do not modify scope without reason):**
- [lib/kalshi/client.ts](lib/kalshi/client.ts) — read for `fetchKalshiMarkets`, `pickSpotlightMarket`, `buildKalshiUrl`
- [lib/kalshi/types.ts](lib/kalshi/types.ts) — read for `KalshiMarket`, `KalshiCadence`, `KalshiCrop`
- [components/overview/marketplace-strip.tsx](components/overview/marketplace-strip.tsx) — current orchestrator (will be re-mounted on `/markets`)
- [components/overview/marketplace/](components/overview/marketplace/) — sub-components (sparkline, spotlight, roll, tape, header)

**Existing nav patterns:**
- [components/layout/desktop-nav-links.tsx](components/layout/desktop-nav-links.tsx)
- [components/layout/mobile-nav.tsx](components/layout/mobile-nav.tsx)
- [components/layout/my-farm-nav-link.tsx](components/layout/my-farm-nav-link.tsx) — example of a sibling nav link

**Internal stance data sources for divergence-scout:**
- `market_analysis` table (CAD grains)
- `us_market_analysis` table (US markets)
- `lib/queries/intelligence.ts` — existing helpers for reading both

---

## Constraints (do not violate)

1. **Isolation fence:** every new file in `lib/kalshi/`, `lib/markets/`,
   `components/markets/`, `app/(dashboard)/markets/` must carry the same
   isolation-fence header pattern. The swarm does not write to
   `market_analysis` / `score_trajectory`. Period.

2. **Best model:** desk chief = Opus. Do not downgrade to Sonnet for cost.
   See memory `feedback_always_use_best_model.md` and
   `feedback_grain_desk_uses_opus.md`.

3. **Design tokens:** reuse the existing wheat/canola palette (no new
   colors). Reuse Fraunces (display) + DM Sans (body). Match the editorial
   tonality of `components/overview/hero-thesis.tsx` for the brief.

4. **No mocking the database:** integration tests must hit a real Postgres.
   See memory pattern in `feedback_*.md`.

5. **Farmer-friendly language** in editorial copy: no trader jargon. The
   audience is prairie farmers, not WSJ traders. Memory:
   `feedback_farmer_language.md`.

6. **Update STATUS.md as Track 52** when Phase 3 ships. Update the
   `claudeMd` index file references too.

---

## Open questions (resolve in next session before Phase 2)

1. **Snapshot fidelity:** when Kalshi has rolled events between Friday's
   brief and the user's Tuesday visit, do we render the snapshot in
   `market_snapshot` (frozen Friday view) or live data with a "brief was
   written when these markets looked like X" disclaimer? *Recommendation:
   live data + footer disclaimer; the live data is the more honest editorial
   surface.*

2. **Multi-grain mapping:** how does `divergence-scout` handle the Kalshi
   "soy" market vs our internal "Soybeans" + "Beans" (we have both as
   distinct CGC grains)? *Recommendation: Kalshi soy = CGC Soybeans only;
   document the mapping.*

3. **Weekly fail-safe:** if the Friday swarm fails, does `/markets` show
   stale brief from previous week, no brief, or fallback to a static
   message? *Recommendation: stale brief with "From {prior Friday}"
   timestamp until next successful run.*

---

## Acceptance criteria (track-level "done")

1. `/markets` route renders publicly without auth.
2. Friday swarm runs at 8 PM ET, produces a brief, writes to
   `predictive_market_briefs`.
3. `/markets` page shows: editorial brief on top + live 7-market dashboard
   below + per-market AI takes inlined.
4. `/overview` Marketplace section is a teaser (spotlight + "View full" CTA
   only).
5. Nav reflects the new tab on desktop + mobile.
6. `npm run build` clean, all tests pass, no regressions in `lib/kalshi/*`
   tests (still 54+).
7. STATUS.md Track 52 entry; CLAUDE.md mentions `predictive_market_briefs`
   in the tables list and the swarm in the Intelligence Pipeline section.
8. Isolation fences in every new file. No swarm output flows back into
   `market_analysis` / `score_trajectory`.

---

## Out of scope (defer to future tracks)

- Polymarket / non-Kalshi prediction venues. (Route is `/markets` to keep
  the door open; not implementing.)
- Per-user "you predicted X" tracking. (No user-account write surface.)
- Sponsored markets, deep order-book visualizations. (Editorial surface
  only.)
- Linking back from grain detail pages to `/markets`. (One-way isolation
  honored — grain detail does not need to know `/markets` exists.)
- Mobile-specific brief layout. (Match overview's responsive pattern.)
