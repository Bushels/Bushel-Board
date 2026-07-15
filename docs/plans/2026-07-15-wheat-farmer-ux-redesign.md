# Wheat Farmer UX Redesign — Visual Decision Board

**Date:** 2026-07-15  
**Status:** Phase 1 **complete** (pillars wired on `/thesis`); Phase 2–3 still open  
**Product goal:** A prairie farmer should open `/thesis` and *see* the Wheat story in under 10 seconds — not scroll a dense operator report.

## Problem (farmer voice)

Today the board is information-rich but **hard to scan**:
- Too much text before the “so what”
- Operator/audit concepts leak into farmer attention
- Weak motion/visual storytelling for moisture, progress, and price
- GEE crop-stress and Prairie (MB/SK/AB) progress exist but are not the emotional center of the first screen

## Design principles

1. **One glance, one Wheat read** — big stance, plain English, confidence as a meter not jargon.
2. **Show, then tell** — maps/charts first; paragraphs second.
3. **Three visual pillars always visible or one tap away:**
   - **Moisture / stress** (GEE + flood watch)
   - **Prairie progress** (MB → SK → AB weekly package)
   - **Price proof** (Spring / HRW / SRW basket)
4. **Motion with meaning** — animate score fills, map fades, progress bars; respect `prefers-reduced-motion`.
5. **No advice language** — “lean bull / lean bear / hold patience” framing only.
6. **Authority hierarchy stays** — visuals explain official + desk truth; X Pulse remains watch-only chip.

## Target first-screen layout (mobile-first)

```
┌─────────────────────────────────────┐
│  WHEAT THIS WEEK                    │
│  [animated stance meter]            │
│  Mild bull · conf 44                │
│  “Patience on old-crop CWRS…”       │
│  CA chip  US chip                   │
├─────────────────────────────────────┤
│  3 VISUAL CARDS (horizontal swipe)  │
│  [Prairie progress] [GEE moisture]  │
│  [Price basket sparklines]          │
├─────────────────────────────────────┤
│  Why (bull cards | bear cards)      │
│  short bullets + icons              │
├─────────────────────────────────────┤
│  Your area (postal)                  │
└─────────────────────────────────────┘
  Advanced / sources → collapsed
  Audit → ?audit=1 only
```

## Visual pillars (must ship)

### A. Prairie Progress Card (MB / SK / AB)
- Source: `canada_crop_progress` + package status (`complete_mb_sk_ab` / partial)
- UI: three province pills with progress/condition bars, week-ending date, “package complete?” badge
- Animation: staggered bar fill when package updates
- Empty/partial states honest (“SK ahead of AB this week”)

### B. GEE Moisture / Crop-Stress Card
- Source: `gee_crop_stress` (US HRW + Russia belts already; expand Canada when ready)
- UI: mini choropleth or belt chips with stress index color (red=stressed, green=healthy)
- Deep link to full `/data` map
- Watch-only badge (does not move score alone)
- Animation: soft color pulse on latest week refresh

### C. Price Basket Card
- Spring / HRW / SRW sparklines already exist — promote to top strip
- Agreement/disagreement animation (bars converge/diverge)

## Motion system (reuse Framer Motion already in repo)

| Element | Motion |
|---------|--------|
| Stance meter | ease-out fill 600ms |
| Province bars | stagger 80ms |
| Map underlay | opacity 300ms |
| Card enter | fade+y 12px, reduced-motion = instant |
| Score change | count-up number |

Components to prefer/extend:
- `components/motion/*` (page-transition already used)
- `framer-motion` dependency present
- Do **not** reintroduce deleted `grain-particles` gimmick as the hero — moisture/progress maps are the hero

## Information architecture

| Surface | Farmer role |
|---------|-------------|
| `/thesis` | Decision cockpit (visuals-first) |
| `/data` | Full GEE moisture experience + future CGC/COT panels |
| `/environmental` | Flood / excess moisture watch |
| `/seeding` / spring-wheat | Drill-down progress maps |
| `/my-farm` | Personal bins + haul/hold personalization |

Operator panels stay behind `?audit=1` or direct URLs.

## Implementation phases

### Phase 1 — Cockpit skeleton (1 session) ✅
- Extract farmer hero + visual pillars into components (starts thesis monofile split)
- Wire Prairie package status + GEE latest week into top cards
- Add motion with reduced-motion fallback
- Browser smoke markers for new section titles
- **Shipped 2026-07-15:** `WheatVisualPillars` under published-desk stance on `/thesis`; builders normalize real package flags; tests + `track54:browser-smoke` green.

### Phase 2 — Map polish (1 session)
- Prairie progress mini-map or three-province visual
- GEE mini-map thumbnail linking to `/data`
- Price basket agreement animation

### Phase 3 — Story polish (1 session)
- Icon language for bull/bear drivers
- Collapse remaining dense sections under “How we got here”
- Mobile swipe carousel for the three pillars

## Data hooks already available

- `getLatestCropStress` / `gee_crop_stress` → `/data`
- Canada crop progress package / `prairie_week_status` on thesis board data
- `getWheatPriceHistory` / price basket proof strip
- Flood watch under `/environmental`

## Non-goals for this redesign
- Multi-grain board revival
- Letting X Pulse move the score
- Heavy Three.js on the farmer first screen
- Advice / trading copy

## Handoff for next session

```text
Goal: Redesign /thesis farmer UX as a visual Wheat decision cockpit with animated
Prairie progress (MB/SK/AB), GEE moisture/stress, and price-basket pillars.
Split monofile as needed. Keep score authority unchanged. Prefer Framer Motion
with reduced-motion support. Verify mobile + desktop browser smoke.
```

Start files:
- `app/(dashboard)/thesis/page.tsx` (split)
- `components/dashboard/crop-stress-map.tsx` (pattern)
- `lib/queries/gee-crop-stress.ts`
- Canada crop progress package fields on thesis board data
- This plan
