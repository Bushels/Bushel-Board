# Seeding Progress Map — Design Doc

**Author:** Claude (Opus 4.7) • **Date:** 2026-04-27 • **Status:** awaiting user approval

## TL;DR

A new `/seeding` route renders an interactive **Mapbox map of weekly crop planting progress** across US states (and later Canadian provinces). The novel mechanic is the **Crop Pulse Seismograph** — small ridgeline glyphs anchored at each state/province centroid that show planted/emerged/harvested progress, condition, and pace vs. 5-year average as a single weekly "heartbeat." A temporal scrubber lets the user replay the season.

Phase 1 ships **US-only with a Canada-coming placeholder** (provincial seeding data is not in the DB yet — releases mid-May). Phase 2 layers an **animated Northbound Crop Wave** over the same scrubber. Phase 3 (deferred) adds Supply Stress Halos.

The seismograph respects the source resolution: **state-level data should look like state-level intelligence**, not be smoothed into a fake field-level surface.

## Context & Why Now

USDA NASS publishes weekly state-level crop progress for Corn, Soybeans, Wheat, Barley, and Oats from April through November. Bushel Board already imports this data via [scripts/import-usda-crop-progress.py](scripts/import-usda-crop-progress.py) — but **only the `state='US TOTAL'` canonical rows.** The state-level rows are in the source CSV and silently dropped on ingest.

That same dataset already powers a static infographic mockup created today: [docs/plans/mockups/2026-04-27-us-seeding-progress-infographic.html](docs/plans/mockups/2026-04-27-us-seeding-progress-infographic.html). The map is **complementary**, not a replacement — the infographic is a printable weekly snapshot; the map is an interactive surface where farmers can drill into a specific state and replay the season.

Mapbox infrastructure is already wired: `mapbox-gl@3.19.1`, `react-map-gl@8.1.0`, `NEXT_PUBLIC_MAPBOX_TOKEN` env var. There's also a retired [components/dashboard/province-map.tsx](components/dashboard/province-map.tsx) (from Track #43) that we **do not** revive — it answered "where did grain go?", a different question, and was retired because Bushy Chat covers that better. The seismograph answers "where is the next crop right now?" — forward-looking, time-animated, cross-border.

## Goals

1. **Visualize US weekly seeding progress** in a way that earns a screenshot — not a generic choropleth.
2. **Be honest about data resolution** — state-level data → state-level glyphs, no fake field-level fakery.
3. **Forward-compatible with v2** — the same scrubber and glyph layer support the Northbound Crop Wave.
4. **Cohere with the existing dashboard** — adopt SectionHeader, GlassCard, glassmorphism, wheat/canola/prairie palette, farmer-friendly voice.
5. **Mobile-first interaction** — readable on a 375px screen with tap-to-expand, not a desktop-only flourish.

## Non-Goals

- **No field-level granularity** in v1. We do not have field shapefiles and will not synthesize them.
- **No weather overlay** in v1 (deferred to v3 alongside Supply Stress Halos).
- **No Canadian seeding data ingestion** in v1. Placeholder only. Provincial scraping is a separate workstream.
- **No replacement of the static infographic.** The map is additive.
- **No 3D extrusion.** Considered and rejected — looks gimmicky to a 60-year-old farmer.

## Architecture

```
app/(dashboard)/seeding/
├─ page.tsx                          ← Server Component: data fetch, layout
└─ client.tsx                        ← Client wrapper for animation transitions

components/dashboard/
├─ seeding-map.tsx                   ← Client: react-map-gl + custom SVG layer
├─ seeding-seismograph-glyph.tsx     ← Client: pure SVG glyph rendering one state
├─ seeding-scrubber.tsx              ← Client: week slider + play button
├─ seeding-legend.tsx                ← Client: glyph legend overlay
├─ seeding-table-fallback.tsx        ← Server: a11y / reduced-motion equivalent
└─ seeding-canada-placeholder.tsx    ← Server: amber banner explaining v1 scope

lib/queries/
└─ seeding-progress.ts               ← getSeedingSeismographData(commodity, year)

supabase/migrations/
├─ <ts>_seeding_state_centroids.sql           ← seed reference table
└─ <ts>_get_seeding_seismograph.sql           ← RPC function

scripts/
└─ import-usda-crop-progress.py      ← MODIFY: stop filtering to US TOTAL only
```

### Data flow

```
[USDA QuickStats CSV]
        │
        ▼
[import-usda-crop-progress.py]   ← MODIFY: write per-state rows
        │
        ▼
[usda_crop_progress table]       ← already exists, filtering changed
        │
        ▼
[get_seeding_seismograph RPC]    ← new
        │
        ▼
[lib/queries/seeding-progress.ts]
        │
        ▼
[/seeding/page.tsx (Server Component)]
        │
        ▼
[seeding-map.tsx (Client)]
   ├─ Mapbox basemap (light-v11)
   ├─ State centroid SVG layer (custom layer or HTML markers)
   │   └─ seeding-seismograph-glyph.tsx (one per state)
   └─ scrubber state controls scan-line position
```

## The Seismograph Glyph (visual spec)

Each state center renders a 64×48px SVG anchored via Mapbox `Marker` (HTML overlay) — simpler than `addLayer({type: 'custom'})` and keeps glyph rendering in React.

```
       ┌─────────────── 64px ───────────────┐
       │ KS  Wheat                    ▲  ↑  │  ← state code · crop · cond. arrow
       │                                      │
       │ ░░▒▒▓▓▓▓▓▓███████████░░░             │  ← stacked: planted/emerged/harvested
       │     ▲ scrub-line (current week)      │
       │                                      │
       │ ●━━━━━━━━━━━━━━━━━━━━━━━━━           │  ← condition stroke (thickness=index)
       └──────────────────────────────────────┘
```

### Encoding

| Visual property | Data field | Range / Mapping |
|---|---|---|
| Stack 1 fill (canola gold) | `planted_pct` | 0–100 → 0–24px height |
| Stack 2 fill (canola-soft) | `emerged_pct` | 0–100 → 0–24px height |
| Stack 3 fill (prairie green) | `harvested_pct` | 0–100 → 0–24px height |
| Vertical baseline offset | `planted_pct_vs_avg` | ±20pt clipped → ±6px |
| Condition stroke thickness | `condition_index` | 1–5 → 1–4px |
| Condition stroke color | `ge_pct_yoy_change` | +→prairie, 0→wheat-700, −→amber/crimson |
| Glyph border pulse | WoW condition delta > 5pts | binary (animate / static) |
| State code + crop label | static | DM Sans 11px |
| Condition arrow ▲▼ | sign of `ge_pct_yoy_change` | tri-state |

### Defaults from prior turn

- **Stacked-area waveform** (chosen).
- **Single-crop dropdown** above map (one of Corn/Soybeans/Wheat/Barley/Oats), no small-multiples grid in v1.
- **Grain belt only** in v1 (~15 states): IA, IL, IN, OH, NE, KS, MO, SD, ND, MN, WI, MI, KY, AR, TX. All 50 deferred to v2.
- **HTML SVG markers** via react-map-gl `<Marker>` (lower complexity than deck.gl `IconLayer` for v1; perf is fine at 15 states).
- **Data ingestion expansion ships first** as a separate PR. Map PR builds on top.

## Temporal Scrubber

A horizontal slider beneath the map showing weeks 14–46 (Apr–Nov):

```
W14   W18   W22   W26   W30   W34   W38   W42   W46
 |─────|─────|─────|─────●─────|─────|─────|─────|
                          ▲ this week (canola dot)
                         [▶ replay season]
```

- **Default position:** latest available week.
- **Drag:** updates the scan-line on every glyph in real time (debounced ~50ms).
- **Replay button:** auto-advances at 1 week per 600ms; pause on hover.
- **Reduced-motion:** hides the replay button, shows a static "Week N of N" label.
- **Forward-compatibility:** in v2, the same scrubber drives the wave layer's `currentTime` prop.

## Data Model

### Migration 1 — `us_state_centroids` reference table

```sql
CREATE TABLE us_state_centroids (
  state_code text PRIMARY KEY,        -- 'KS', 'IA', etc.
  state_name text NOT NULL,           -- 'Kansas', 'Iowa', etc.
  centroid_lng numeric NOT NULL,
  centroid_lat numeric NOT NULL,
  is_grain_belt boolean DEFAULT false
);
```

Seeded with 50 rows from a static GeoJSON. Read-only after seed.

### Migration 2 — `get_seeding_seismograph` RPC

```sql
CREATE OR REPLACE FUNCTION get_seeding_seismograph(
  p_commodity text,
  p_market_year smallint
)
RETURNS TABLE (
  state_code text,
  state_name text,
  centroid_lng numeric,
  centroid_lat numeric,
  week_ending date,
  planted_pct numeric,
  emerged_pct numeric,
  harvested_pct numeric,
  planted_pct_vs_avg numeric,
  good_excellent_pct numeric,
  condition_index numeric,
  ge_pct_yoy_change numeric
)
LANGUAGE sql STABLE AS $$
  SELECT
    c.state_code, c.state_name, c.centroid_lng, c.centroid_lat,
    p.week_ending,
    p.planted_pct, p.emerged_pct, p.harvested_pct,
    p.planted_pct_vs_avg,
    p.good_excellent_pct, p.condition_index, p.ge_pct_yoy_change
  FROM usda_crop_progress p
  JOIN us_state_centroids c
    ON c.state_name = p.state
  WHERE p.commodity = p_commodity
    AND EXTRACT(YEAR FROM p.week_ending) = p_market_year
    AND c.is_grain_belt = true
  ORDER BY c.state_code, p.week_ending;
$$;
```

Estimated row count: **~480 rows** (15 states × 32 weeks). Well under PostgREST's 1000-row truncation cap. One round trip per page load.

### Ingestion change

[scripts/import-usda-crop-progress.py](scripts/import-usda-crop-progress.py) currently filters source rows to `state='US TOTAL'` (verified with grep). Change: keep US TOTAL canonical rows AND ingest per-state rows for the 15 grain-belt states. The schema already supports this — only the filter changes.

## Cohesion Section (the design-hat lens)

**Patterns reused from existing dashboard:**
- `SectionHeader` ([components/dashboard/section-header.tsx](components/dashboard/section-header.tsx)) — canola left-accent + Fraunces title. The `/seeding` page uses this for "Weekly Seeding Progress" header.
- `GlassCard` ([components/ui/glass-card.tsx](components/ui/glass-card.tsx)) — wraps the map and the scrubber as a single elevation-2 surface.
- `SectionStateCard` for the empty/loading/error state.
- `SectionBoundary` for graceful section failure.
- Wheat-50 / canola / prairie / amber palette (no new colors introduced).
- DM Sans body + Fraunces display fonts.
- `safeQuery()` wrapper around the seismograph data fetch.

**Patterns intentionally extended:**
- **Scrubber pattern is new** for Bushel Board. Justified because the temporal axis is the entire point. The scrubber visually echoes the existing `WoW comparison` cards' time framing, so the mental model is consistent.
- **SVG-on-Mapbox glyph** is a new component category. We will not over-generalize — the seismograph is the only consumer until proven otherwise.
- **`deck.gl` is NOT introduced in v1.** It was tempting, but HTML markers carry us through v1 and v2 (wave). Deferred to v3 if we add particle-field weather effects.

**Patterns intentionally avoided:**
- **No revival of `province-map.tsx`** — different question, different audience, different page. Keeping the file retired per Track #43.
- **No 4th section** added to `/overview` or `/grain/[slug]`. The map gets its own route.
- **No "Bushy Chat replaces this"** framing — Track #43 retired components because chat could already answer those questions in text. Seasonality and geography are the two things chat genuinely cannot do well; the map exists because chat can't.

**Cohesion-check questions answered up front:**
- Q: Does this compete with the static infographic mockup? **A:** No — infographic is a printable weekly digest; map is interactive replay.
- Q: Does this compete with `/us`? **A:** No — `/us` is the market thesis swarm output. `/seeding` is the agronomic input that feeds the thesis.
- Q: Should `/my-farm` link to it? **A:** Yes — a small "See national seeding progress →" link in the My Farm header during planting season (Apr–Jun).

## Phased Rollout

| Phase | Scope | Trigger |
|---|---|---|
| **v1** (this design doc) | US grain belt (15 states), 5 commodities, dropdown crop selector, scrubber, table fallback. Canada placeholder banner. | Now |
| **v2** | Add Canadian provinces (AB/SK/MB) once ingestion exists. Add Northbound Crop Wave layer driven by same scrubber. | When AAFC + provincial scrapers land |
| **v3** | All 50 states. Weather anomaly overlay (deck.gl `HeatmapLayer`). Supply Stress Halos. Year-over-year ghost overlay (replay last year's wave faintly behind this year). | After v2 stabilizes |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| State-level USDA rows missing for some weeks (NASS doesn't always report all states every week) | High | Forward-fill last-known values per state; show "no data this week" for first-time misses |
| 15 SVG markers × scrubber animation causes mobile jank | Medium | Debounce scrubber drag; CSS `will-change: transform` on glyphs; profile on iPhone 12 baseline |
| Glyph readability below 375px width | Medium | Below 640px, switch to "list view" — top 5 states by planted_pct as a vertical list, not a map |
| Canadian data never lands | Low | v1 stands alone; Canada banner is honest about the gap |
| Track #43 reversal optics ("you brought the map back!") | Low | Different route (`/seeding` not `/overview`), different question, different file. Document this in the PR description. |

## Definition of Done

1. `npm run build` clean.
2. `npm run test` passes (new tests for `lib/queries/seeding-progress.ts` and the SQL RPC).
3. `/seeding` route renders on desktop (1280px) and mobile (375px breakpoints both).
4. Light + dark mode both readable.
5. Scrubber respects `prefers-reduced-motion`.
6. Keyboard nav: tab through state glyphs in alphabetical order; arrow keys advance scrubber.
7. Table fallback (`seeding-table-fallback.tsx`) is the screen-reader equivalent.
8. Data freshness banner: "USDA NASS week ending {{date}} • State data only for the US grain belt."
9. Canada placeholder visible above map (amber banner, calm copy).
10. Lessons learned doc updated if non-obvious bug encountered.
11. STATUS.md updated as a new feature track.
12. Linked from `/us` page header ("National seeding progress →") during planting season (Apr 1 – Jun 30 conditional render).

## Open Questions for User

None blocking — defaults from the prior turn are locked in. Optional future decisions:

- **Where does `/seeding` link from?** Default: navbar item between `/us` and `/my-farm` during planting season; hidden in nav otherwise (always reachable by URL). Let me know if you want it always visible.
- **Should the scrubber's "this week" position survive page reloads?** Default: yes, via URL query param `?week=YYYY-MM-DD`.

## Cohesion Audit Cross-Reference

The parallel cohesion audit ([docs/plans/2026-04-27-bushel-board-ia-inventory.md](docs/plans/2026-04-27-bushel-board-ia-inventory.md), Section 7) found that **`/seeding` should adopt patterns closer to `/my-farm` than `/overview`**.

**Why:** `/my-farm` uses **5 farm-work sections** (Weekly Summary, Market Sentiment, Your Recommendations, Your Grains, Delivery Pace) — not the documented 3-section pattern. That multi-section workflow rhythm is the right precedent for a *seasonal workflow* surface like seeding, where the user returns weekly across the planting → emergence → harvest arc.

**v1 (this doc):** stays as a single-section market scan since the map IS the entire surface. No change.

**v2/v3 evolution path (added per audit):** when `/seeding` grows beyond the map, follow the My Farm multi-section pattern rather than forcing the 3-section overview pattern. Plausible future sections:

1. *This Week's Progress* — the seismograph map (today's v1)
2. *How Does Your Area Compare?* — local FSA-level zoom-in
3. *What's Planted Around You?* — community pulse on neighbor planting choices
4. *What's Coming Next?* — forward indicators (weather, soil temp, market signals)

**Pattern reuse confirmed by audit:** v1 should use `SectionHeader`, `SectionBoundary`, and `GlassCard`. This matches the design doc above.

**Pre-existing drift in other surfaces** (7 hot spots — orphaned `sentiment-poll` and `percentile-graph`, missing `SectionBoundary` on `/overview` and `/my-farm` and `/us`, doc-vs-reality mismatch on `/overview` (1 section vs documented 3), dev jargon in `/us` empty state) is **not blocking** for `/seeding`. Tracked in the cohesion audit synthesis doc (Track B Phase B4) as separate fix backlog.

## Out of Scope

- Field-level NDVI imagery — separate roadmap item, requires Sentinel-2 ingestion.
- Push notifications when condition crosses a threshold — separate roadmap item.
- Embedding the seismograph in `/grain/[slug]` pages — considered, deferred. Different mental model on grain detail (current MY focus, not next-crop focus).
- Cohesion-audit-driven fixes to other surfaces (Overview drift, orphan components, jargon copy) — addressed in the cohesion audit doc, not here.

---

**Next step:** if approved, hand off to the `superpowers:writing-plans` skill to produce a numbered implementation plan keyed to this design.
