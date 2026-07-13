# Wheat-First Site Redesign — Data-Rich Visualizations + Mapping (Direction)

**Date:** 2026-06-15
**Status:** Direction approved (Kyle). **Implementation happens in a NEW session** — this doc sets the direction and hands off cleanly. Refine via `superpowers:brainstorming` at the start of that session if the open questions need it.
**Owner (next session):** frontend + data viz.

---

## 1. Why (the decision)
We have committed to **wheat-first: depth before breadth** (validate the bull/bear engine on one data-rich grain, then clone the profile to the other 15 — see `docs/plans/2026-06-12-stance-model-v2-design.md` §16.5). The site should now match that focus: **make wheat the flagship and tell its story through data-rich visualizations and maps.** The weekly desk still publishes all 16 grains — wheat is the *improvement/showcase* focus, not the only grain served.

This session also stood up the data that makes a rich wheat surface possible:
- **GEE crop-stress** (`gee_crop_stress`) — per-belt NDVI + soil-moisture stress for **US HRW (per state)**, **Russia winter**, **Russia spring**; validated vs NASS (r=0.93/0.98). Mappable, and the single most novel viz we have.
- CGC pipeline (`cgc_observations`, regional), 3-class COT (`cftc_cot_positions`), WASDE + world balance (`usda_wasde_mapped`), crop progress (`usda_crop_progress`, `canada_crop_progress`), prices (`grain_prices`).

## 2. Goal
A **dedicated, wheat-centric Data page** that visualizes the full wheat data stack with **mapping at the center**, in plain-English "what this means" framing (per project values — no trader jargon).

## 3. Build on what exists (do NOT start from scratch)
- **Mapping is already in the codebase:** `components/dashboard/province-map.tsx`, `seeding-map.tsx`, `seeding-focus-map.tsx`, `spring-wheat-pulse-map.tsx` (Mapbox; token `NEXT_PUBLIC_MAPBOX_TOKEN` in env). **Read these first** — the GEE crop-stress map should follow their pattern, not introduce a new map stack.
- **Mapbox skills available:** `mapbox-cartography`, `mapbox-data-visualization-patterns`, `mapbox-web-integration-patterns`, `mapbox-style-patterns`, `mapbox-web-performance-patterns` — use them.
- **Charts:** Recharts components throughout `components/dashboard/` (PriceSparkline, DeliveryGapChart, TerminalFlowChart, CotPositioningCard, etc.) — reuse/wheat-focus them. Mind the Recharts gotchas in CLAUDE.md (yAxisId, hex colors in SVG, color-mix for opacity).
- **Existing data surfaces:** `/data-universe` (the "Data Map"), `/seeding`, `/thesis` (flagship), `/grain/[slug]`, `/us`. Decide: evolve `/data-universe` vs add a new `/data` route (open question Q1).

## 4. The Data page — proposed content
1. **🗺️ Global Wheat Crop-Stress Map (the hero / differentiator).** Choropleth from `gee_crop_stress`: US HRW states + Russia winter/spring belts colored by `stress_index` (red = stressed = bullish supply, green = healthy = bearish). Hover = NDVI z, soil-moisture z, reading. Expandable to Canadian prairies / EU / Australia as belts are added. **Nothing else on the market shows this.**
2. **Supply pipeline (CGC):** wheat deliveries / exports / commercial stocks, the "still in bins" hero metric, terminal flow — wheat-filtered versions of existing components.
3. **Positioning (COT):** the 3 wheat classes (SRW/HRW/HRS) managed-money net + spec/commercial divergence.
4. **Balance sheet (WASDE + world):** US + world S/U, exporter-S/U trajectory, the Canola-style world context but for wheat.
5. **Crop condition:** NASS G/E + Canadian seeding **overlaid with the GEE stress_index** (show the validation — satellite vs survey on one chart).
6. **Price tape:** ZW / KE / MGEX + CWRS basis (once a Canadian cash feed exists).

Each panel carries a one-line plain-English takeaway.

## 5. Mapping specifics
- GEE belts → admin-boundary choropleth (US states via the existing province-map pattern; Russia as oblast/bbox polygons; Canada provinces). Color scale centered at 0 (diverging red↔green on `stress_index`).
- Consider a CGC flow layer later (terminal ports, producer-car destinations) — secondary.
- Keep it performant (per `mapbox-web-performance-patterns`); server-fetch the data, hydrate the map client-side.

## 6. Tech approach
Next.js 16 server components fetch from Supabase (new query helpers in `lib/queries/` — e.g. `gee-crop-stress.ts`), pass to client map/chart components. Follow the client/server boundary rule (CLAUDE.md): `-utils.ts` (client-safe types + pure) + `.ts` (server queries). New RPC if a per-belt latest-week aggregate is needed.

## 7. Phasing
- **P1:** `/data` (or evolved `/data-universe`) scaffold + the **GEE crop-stress map** (hero). Query helper + a `get_latest_crop_stress` view/RPC.
- **P2:** integrate the rest of the wheat stack panels (CGC, COT, WASDE, crop-condition+GEE overlay, prices).
- **P3:** IA reorg — confirm wheat-as-flagship nav; decide `/overview` retirement vs repurpose.

## 8. Open questions for the new session
1. **New `/data` route, or evolve `/data-universe`?** (Recommend: evolve `/data-universe` into the wheat data hub to avoid route sprawl, unless it carries baggage.)
2. Public or auth-gated? (Recommend public — it's the showcase.)
3. Map interaction depth: static choropleth first, or time-slider across `week_ending` from day one?
4. How far to push IA reorg vs just adding the page this round?

## 9. Skills / agents / gates for the next session
- **Skills:** `frontend-design` (distinctive UI), the `mapbox-*` family (cartography, data-viz patterns, web integration/performance), `superpowers:brainstorming` if Q1–Q4 need resolving first.
- **Agents:** `frontend-dev` build; `ui-agent`/`ux-agent` for polish; **gates per the DAG** — `data-audit` after any new RPC/view, `qc-crawler` post-deploy, `npm run build` + `npm run test` green (Definition of Done).
- **Do NOT** make the desk swarm agents wheat-only — they stay multi-grain; wheat is the showcase, not the only grain.

## 10. Current state / handoff (start here next session)
**Data that's live and wheat-relevant:**
- `gee_crop_stress` — US_HRW (per-state + belt), RU_WINTER, RU_SPRING, week ending 2026-06-14. Collector `npm run collect:gee-crop-stress` (Fri 11am MT). Query: `SELECT ... FROM gee_crop_stress ORDER BY week_ending DESC` (see CLAUDE.md monitoring).
- Wheat thesis persisted: `market_analysis` (Canada Wheat wk44, +9) + `us_market_analysis` (US Wheat, +11) + score_trajectory anchors.
- All standard wheat sources current (CGC wk44, COT Jun 9, June WASDE, prices).

**Key files to read first:** this doc → `components/dashboard/spring-wheat-pulse-map.tsx` + `province-map.tsx` (map pattern) → `app/(dashboard)/data-universe/page.tsx` (current data surface) → `docs/plans/2026-06-12-stance-model-v2-design.md` (the model the viz serves) → `docs/plans/2026-06-13-gee-crop-stress-lane-scoping.md` (the stress data).

**First task:** scaffold the data page + build the GEE crop-stress map from `gee_crop_stress`, reusing the existing Mapbox map component pattern.

**Not yet done (tracked elsewhere, not blockers for viz):** V2 relations-layer P1, GEE multi-season validation, Canadian cash/basis feed, the on-major-release re-score trigger.
