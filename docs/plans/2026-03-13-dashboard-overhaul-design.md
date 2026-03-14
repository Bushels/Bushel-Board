# Dashboard Overhaul — Farmer Decision Architecture

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the Bushel Board dashboard from a data display tool into a farmer decision engine — every card, chart, and metric helps answer "what do I do with my grain?"

**Architecture:** 6 parallel workstreams: (1) Grain detail page restructure with 2-column layout, (2) My Farm page restructure with HAUL/HOLD/PRICE/WATCH recommendations, (3) Visual design system upgrade (glassmorphism, 3D elevation, underglow), (4) New components (COT positioning, logistics snapshot, "Where Grain Went" donut), (5) AI pipeline re-run with updated prompts, (6) Data audit across all sources.

**Tech Stack:** Next.js 16, Recharts (PieChart, Brush, RadialBar — new), Framer Motion, Tailwind CSS (custom shadow tokens), Supabase RPCs

---

## 1. Design Principles

### Decision Framing
- **Market pages (grain detail):** Bullish / Neutral / Bearish
- **My Farm page:** Haul / Hold / Price / Watch
- Every card must help a farmer make a grain marketing decision
- If a card doesn't serve a decision, it's cut or collapsed

### Visual Identity — Premium Glassmorphism
- Frosted glass cards with `backdrop-blur-lg`, semi-transparent backgrounds
- 3D elevation: cards lift off the page with layered shadows on hover
- Button underglow: interactive elements emit subtle colored light beneath
- Wheat/canola/prairie color palette maintained throughout
- Respect `prefers-reduced-motion` and `prefers-reduced-transparency`

### Layout Rules
- 2-column grid on desktop (`grid-cols-1 lg:grid-cols-2`)
- No single card stretching full width unless it's a chart that genuinely needs it
- X market signals woven between data sections as horizontal strips
- Most important metrics near the top; detail/history at the bottom as expandable sections

---

## 2. Grain Detail Page — New Layout

### Current (what we have)
```
Section 1: Market Intelligence
  NetBalanceKpi → ThesisBanner → BullBearCards → IntelligenceKpis → WoWComparison

Section 2: Supply & Movement
  GamifiedGrainChart → SupplyPipeline (hated) → ProvinceMap → StorageBreakdown

Section 3: Community Pulse
  XSignalFeed → SentimentPoll (moving to My Farm)
```

### New Layout
```
HERO SECTION ─────────────────────────────────────────
┌─────────────────────────────────────────────────────┐
│ ← Back    WHEAT                                     │
│           ┌──────────┐                              │
│           │ BULLISH  │  Thesis title (one line)     │
│           └──────────┘                              │
│  ▸ 3-5 bullet-point takeaways (not paragraph)      │
│  ▸ Terminal receipts up 12% WoW                     │
│  ▸ Managed money net long 42K contracts (+8K WoW)  │
└─────────────────────────────────────────────────────┘

KEY METRICS (4 KPI cards) ────────────────────────────
┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────┐
│ Deliveries │ │ Exports    │ │ Processing │ │Stocks│
│ 245 Kt     │ │ 189 Kt     │ │ 67 Kt      │ │312 Kt│
│ ▲+12% WoW  │ │ ▼-4% WoW   │ │ ▲+8% WoW   │ │→flat │
└────────────┘ └────────────┘ └────────────┘ └──────┘

THIS WEEK'S FLOW (2-col) ─────────────────────────────
┌──────────────────────────┐ ┌────────────────────────┐
│ Where Grain Went (donut) │ │ COT Positioning        │
│ Interactive segments     │ │ Managed$ vs Commercial │
│ Center stat on hover     │ │ Divergence flag        │
│ Click to drill           │ │ 52-week range          │
└──────────────────────────┘ └────────────────────────┘

X SIGNAL STRIP (inline, 2-3 cards) ───────────────────
┌──────────┐ ┌──────────┐ ┌──────────┐
│ signal   │ │ signal   │ │ signal   │  → View all
└──────────┘ └──────────┘ └──────────┘

MOVEMENT & LOGISTICS (2-col) ─────────────────────────
┌──────────────────────────┐ ┌────────────────────────┐
│ Province Map             │ │ Logistics Snapshot     │
│ AB/SK/MB deliveries      │ │ Vessels / Railcar /    │
│ Interactive hover        │ │ OCT / Port throughput  │
└──────────────────────────┘ └────────────────────────┘

DEEPER ANALYSIS (2-col) ──────────────────────────────
┌──────────────────────────┐ ┌────────────────────────┐
│ Pipeline Velocity        │ │ Storage = Loading      │
│ Cumulative chart         │ │ Primary / Terminal /   │
│ Interactive legend       │ │ Process levels         │
│ Brush zoom on time axis  │ │ "Loading phase" framing│
└──────────────────────────┘ └────────────────────────┘

GRAIN BALANCE (full-width redesigned) ────────────────
┌─────────────────────────────────────────────────────┐
│ Sankey: Production → Processing | Exports | In Bins │
│ Labels: "Processing" not "Food Industrial"          │
│         "Carry Forward" not "Carry Out"             │
│         "Shrink/Waste" not "Loss"                   │
│ Hero metric: "Still in Bins: X,XXX Kt"             │
└─────────────────────────────────────────────────────┘

EXPANDABLE DETAIL ────────────────────────────────────
▸ All Market Signals (with voting)
▸ Bull Case / Bear Case (accordion)
▸ WoW Detailed Comparison (accordion)
▸ Historical Context (accordion)
```

### Key Changes
| Current | New |
|---------|-----|
| Single-column full-width cards | 2-column grid on desktop |
| Thesis as long paragraph | 3-5 bullet points |
| Supply Pipeline horizontal bars | Interactive donut chart |
| COT data hidden (AI only) | COT Positioning card visible |
| Logistics data hidden (AI only) | Logistics Snapshot card visible |
| Province map full-width alone | 2-col with Logistics |
| Sentiment poll on grain page | Moved to My Farm |
| X signals all at bottom | Preview strip mid-page + full feed at bottom |
| Bull/Bear as prominent cards | Expandable accordions |
| "Food Industrial" label | "Processing" |
| "Carry Out" label | "Carry Forward" |
| "Loss" label | "Shrink/Waste" |

---

## 3. My Farm Page — New Layout

### Current
```
Hero Header → FarmSummaryCard → DeliveryPaceCard → YourImpact → MyFarmClient (grain cards)
```

### New Layout
```
HERO ─────────────────────────────────────────────────
My Farm — "Your grain. Your decisions."

MARKET SENTIMENT (2-col) ─────────────────────────────
┌──────────────────────────┐ ┌────────────────────────┐
│ How are you feeling?     │ │ Community Pulse        │
│                          │ │                        │
│ Wheat:  🔒📦⚖️🚜🚛     │ │ Wheat:  62% Hold/28% H │
│ Canola: 🔒📦⚖️🚜🚛     │ │ Canola: 45% Hold/40% H │
│ Barley: 🔒📦⚖️🚜🚛     │ │ Barley: 55% Hold/30% H │
│                          │ │                        │
│ (only YOUR unlocked      │ │ "You + 47 farmers      │
│  grains shown)           │ │  voted this week"      │
└──────────────────────────┘ └────────────────────────┘

YOUR RECOMMENDATIONS ─────────────────────────────────
┌────────────┐ ┌────────────┐ ┌────────────┐
│ WHEAT      │ │ CANOLA     │ │ BARLEY     │
│ ┌────────┐ │ │ ┌────────┐ │ │ ┌────────┐ │
│ │  HOLD  │ │ │ │  HAUL  │ │ │ │ WATCH  │ │
│ └────────┘ │ │ └────────┘ │ │ └────────┘ │
│ 72% del'd  │ │ 45% del'd  │ │ 60% del'd  │
│ Top 20%    │ │ Avg pace   │ │ Behind     │
│ ████░ 80%  │ │ ██░░░ 40%  │ │ ░░░░░ 0%   │
│ contracted │ │ contracted │ │ contracted │
└────────────┘ └────────────┘ └────────────┘

YOUR GRAINS (detail cards) ───────────────────────────
(Existing crop plan cards with stacked progress bars)

WEEKLY SUMMARY (bullet points) ───────────────────────
▸ Your wheat deliveries are ahead of 80% of peers
▸ Canola exports surged 15% — consider hauling uncontracted
▸ Contracted position protects 80% of wheat crop
```

### Recommendation Logic
| Recommendation | Conditions |
|----------------|------------|
| **HAUL** | Market bearish + farmer ahead of pace + has uncontracted volume |
| **HOLD** | Market bullish + supply tight + strong futures positioning |
| **PRICE** | High premium/basis opportunity + has uncontracted volume |
| **WATCH** | Neutral/uncertain market + no urgent action needed |

### Key Changes
| Current | New |
|---------|-----|
| Sentiment poll on grain detail pages | Multi-grain sentiment voting here |
| No explicit recommendations | HAUL/HOLD/PRICE/WATCH badges |
| Delivery pace as separate card | Integrated into recommendation cards |
| Farm narrative as long prose | Bullet-point summaries |
| Single column | 2-column where appropriate |

---

## 4. Visual Design System — Glassmorphism + 3D

### Glass Card Token
```css
/* Base glass card */
bg-white/60 dark:bg-wheat-900/50
backdrop-blur-lg backdrop-saturate-150
border border-white/20 dark:border-wheat-700/20
rounded-2xl
shadow-elevation-2
transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
transform-gpu

/* Hover state */
hover:-translate-y-1
hover:shadow-elevation-hover
hover:border-canola/30
```

### Shadow Elevation System
```ts
// tailwind.config.ts additions
boxShadow: {
  'elevation-1': '0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.10)',
  'elevation-2': '0 2px 4px rgba(0,0,0,0.06), 0 4px 8px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
  'elevation-3': '0 4px 8px rgba(0,0,0,0.06), 0 8px 16px rgba(0,0,0,0.08), 0 16px 32px rgba(0,0,0,0.04)',
  'elevation-hover': '0 8px 16px rgba(0,0,0,0.08), 0 16px 32px rgba(0,0,0,0.10), 0 32px 64px rgba(0,0,0,0.06)',
  'canola-glow': '0 4px 14px rgba(193,127,36,0.20)',
  'canola-glow-hover': '0 6px 20px rgba(193,127,36,0.35)',
  'prairie-glow': '0 4px 14px rgba(67,122,34,0.20)',
  'underglow-canola': '0 8px 24px -4px rgba(193,127,36,0.30)',
}
```

### Button Underglow
```css
/* Primary action buttons */
shadow-[0_4px_14px_0_rgba(193,127,36,0.25)]
hover:shadow-[0_6px_20px_0_rgba(193,127,36,0.4)]
transition-shadow duration-300

/* Bullish elements */
shadow-[0_4px_14px_0_rgba(67,122,34,0.3)]

/* Bearish elements */
shadow-[0_4px_14px_0_rgba(217,119,6,0.3)]
```

### Market Stance Badges
```css
/* BULLISH */
bg-prairie/15 text-prairie border border-prairie/30
shadow-[0_0_20px_rgba(67,122,34,0.2)]
text-lg font-bold uppercase tracking-widest

/* BEARISH */
bg-amber-500/15 text-amber-600 border border-amber-500/30
shadow-[0_0_20px_rgba(217,119,6,0.2)]

/* NEUTRAL */
bg-wheat-200/50 text-wheat-700 border border-wheat-300/30
```

### Glass Tooltips (all Recharts charts)
```css
backdrop-blur-md bg-white/70 dark:bg-wheat-900/70
border border-white/20 dark:border-wheat-700/30
rounded-xl shadow-lg shadow-black/5
```

### Accessibility Guardrails
- Glass cards: minimum `bg-white/60` light, `bg-wheat-900/50` dark for 4.5:1 contrast
- Max 8-10 `backdrop-blur` elements visible simultaneously (GPU performance)
- All hover transforms respect `prefers-reduced-motion` via `useReducedMotion()`
- Mobile: reduce blur from `blur-lg` to `blur-sm` (`md:backdrop-blur-lg backdrop-blur-sm`)
- Never nest glass-on-glass (two backdrop-blur elements)

### Framer Motion Patterns
```ts
// Card hover lift
whileHover={{ y: -4, transition: { type: 'spring', stiffness: 300, damping: 25 } }}

// Stagger entrance (40ms per CLAUDE.md)
container: { show: { transition: { staggerChildren: 0.04 } } }
item: { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }

// Border glow on hover
rest: { borderColor: 'rgba(255,255,255,0.1)' }
hover: { borderColor: 'rgba(193,127,36,0.3)', transition: { duration: 0.3 } }
```

---

## 5. New Component Specifications

### 5A. "Where Grain Went" Interactive Donut Chart
- **Type:** Recharts `PieChart` with `activeShape` pattern
- **Segments:** Exports (AB blue #2e6b9e), Processing (#437a22), Storage increase (#c17f24), Other (#8b7355)
- **Center stat:** Default = "Total Flow: X Kt", on hover = segment name + value + %
- **Hover:** Active sector expands (`outerRadius + 8`) with subtle outer glow ring
- **Click:** Scroll to relevant detail section on the page
- **Animation:** `animationDuration={800} animationEasing="ease-out"`
- **Data source:** `cgc_observations` — weekly exports + processing + storage delta
- **New query:** `getWeeklyFlowBreakdown(grain, cropYear, grainWeek)` in `lib/queries/observations.ts`

### 5B. COT Positioning Card
- **Type:** Mirrored butterfly bar chart (TradingView standard)
- **Top half:** Managed Money net position (green when long, amber when short)
- **Bottom half:** Commercial net position (inverted colors)
- **Zero line:** `ReferenceLine y={0}` dashed
- **52-week range:** Horizontal track with dot showing current position vs historical range
- **Divergence badge:** Uses existing `spec_commercial_divergence` flag from `get_cot_positioning` RPC
- **4-week sparkline:** Small inline `LineChart` (120px wide, 32px tall) next to each metric
- **New query:** `getCotPositioning(grain, cropYear, weeksBack)` in `lib/queries/cot.ts`

### 5C. Logistics Snapshot Card
- **Type:** 2x2 KPI grid
- **Metrics:** Vessels at Vancouver (count), Railcar fulfillment (%), Out-of-car time (days), Port throughput (Kt)
- **Color coding:** Green = healthy, Amber = constrained, Red = bottleneck (thresholds configurable)
- **WoW delta:** Arrow + value next to each metric
- **Data source:** `get_logistics_snapshot` RPC (already exists)
- **New query:** `getLogisticsSnapshot(cropYear, grainWeek)` in `lib/queries/logistics.ts`

### 5D. HAUL/HOLD/PRICE/WATCH Recommendation Cards (My Farm)
- **Type:** Glass card with large badge + supporting metrics
- **Badge:** Large, with underglow matching recommendation color
  - HAUL = amber underglow, HOLD = prairie green underglow, PRICE = canola underglow, WATCH = neutral
- **Metrics:** Delivery pace percentile, contracted %, market stance
- **Logic:** Derived from `grain_intelligence.insights` sentiment + `crop_plans` pace + contracted status
- **New utility:** `deriveRecommendation(intelligence, cropPlan, deliveryAnalytics)` in `lib/utils/recommendations.ts`

### 5E. Multi-Grain Sentiment Voting Card (My Farm)
- **Type:** All user's unlocked grains in one card (replaces per-grain poll on grain detail)
- **Interaction:** Row per grain with 5 emoji buttons (same as current `SentimentPoll`)
- **Results:** Community aggregate shown inline per grain after voting
- **Data source:** Existing `grain_sentiment_votes` table + `getSentimentOverview` RPC

---

## 6. Supply Pipeline Redesign

### Problems with Current
- Horizontal bar waterfall is visually lazy and colors are drab
- Labels wrong: "Food Industrial" → "Processing", "Loss" → unclear, "Carry Out" → unclear
- Some AAFC fields may be null (food_industrial_kt, feed_waste_kt, carry_out_kt)
- Data may duplicate what's shown elsewhere in WoW/YoY stats

### New Design
- Keep Sankey flow diagram (`supply-sankey.tsx` already exists) but with fixed labels
- Add hero metric at top: **"Still in Bins: X,XXX Kt"** = Total Supply - CY Exports - CY Processing
- Relabel: "Processing" (not "Food Industrial"), "Carry Forward" (not "Carry Out"), "Shrink/Waste" (not "Feed/Waste/Loss")
- Improve Sankey colors to match premium palette
- Collapsible domestic breakdown stays but gets glass styling

---

## 7. AI Pipeline Re-run

### Steps
1. Trigger `search-x-intelligence` in deep mode for latest X signals
2. Trigger `analyze-market-data` (Step 3.5 Flash Round 1) for all grains
3. Trigger `generate-intelligence` (Grok Round 2) for all grains
4. Trigger `generate-farm-summary` for all users
5. Update `generate-intelligence` prompt template to output:
   - Bullet-point thesis (not paragraph)
   - Explicit BULLISH/BEARISH/NEUTRAL stance label
   - Key recommendation signal for HAUL/HOLD/PRICE/WATCH derivation
6. Audit new outputs in all intelligence tables

### Prompt Template Changes
- `supabase/functions/generate-intelligence/prompt-template.ts`:
  - Add instruction: "Output thesis_body as 3-5 bullet points, not paragraphs"
  - Add instruction: "Include an explicit market_stance field: BULLISH, BEARISH, or NEUTRAL"
  - Add instruction: "Include a recommendation_signal field for farmer action"
- `supabase/functions/generate-farm-summary/index.ts`:
  - Add instruction: "Format summary as concise bullet points"

---

## 8. Data Audit Scope

| Audit Item | Source | Check |
|------------|--------|-------|
| Supply Pipeline numbers | `v_supply_pipeline` view | Cross-check against AAFC original data |
| Null fields in AAFC data | `supply_disposition` table | Which grains have null food/feed/carry_out? |
| Duplicate stats | WoW vs YoY vs 5yr | Ensure no stat shown twice in different frames |
| COT grain mapping | `cftc_cot_positions.commodity` | Verify all CGC grains mapped correctly |
| Logistics freshness | `grain_monitor_snapshots` | Confirm Week 31+ data exists |
| Producer car data | `producer_car_allocations` | Confirm Week 31+ data exists |
| Terminal Receipts truncation | `cgc_observations` | Verify RPC bypasses 1000-row PostgREST limit |
| Canola delivery undercount | Primary vs Primary+Process | Confirm FULL OUTER JOIN in v_grain_yoy_comparison |

---

## 9. Overview Page Changes

Keep existing 3-section structure but upgrade visuals:
- All CropSummaryCards get glass treatment
- Market Intelligence cards get prominent BULLISH/BEARISH badge
- CompactSignalStrip gets glass pill styling
- SentimentBanner stays on overview (cross-grain aggregate view, different from per-grain poll)

---

## 10. Implementation Workstreams

| # | Workstream | Owner | Parallel? |
|---|-----------|-------|-----------|
| 1 | Tailwind config + Glass card primitives | ui-agent | Yes — foundation |
| 2 | New query functions (COT, logistics, flow breakdown) | db-architect | Yes |
| 3 | New components (donut, COT card, logistics card, recommendations) | frontend-dev | After #1, #2 |
| 4 | Grain detail page restructure | frontend-dev | After #3 |
| 5 | My Farm page restructure (sentiment move, recommendations) | frontend-dev | After #3 |
| 6 | Supply Pipeline redesign (labels, Sankey fix) | ui-agent | After #1 |
| 7 | AI prompt template updates | db-architect | Yes |
| 8 | AI pipeline re-run | db-architect | After #7 |
| 9 | Data audit | data-audit | Yes |
| 10 | Overview page glass upgrade | frontend-dev | After #1 |
| 11 | Ralph Wiggum iteration loop | ultra-agent | After #4, #5 |
| 12 | QC crawl + deploy | qc-crawler | After all |

---

## 11. Orphaned Components Disposition

| Component | Decision |
|-----------|----------|
| `train-capacity-widget.tsx` | **Wire into Logistics card** (replace mock data with RPC) |
| `flow-breakdown-widget.tsx` | **Replace with donut chart** (delete) |
| `commercial-storage-widget.tsx` | **Replace with Storage = Loading card** (delete) |
| `stock-map-widget.tsx` | **Evaluate for Storage card** (possibly merge) |
| `pipeline-card.tsx` | **Delete** (superseded by CropSummaryCard) |
| `evidence-drawer.tsx` | **Wire into expanded signal view** (keep) |
| `prairie-pulse-map.tsx` | **Evaluate vs ProvinceMap** (possibly merge) |

---

## 12. Success Criteria

- [ ] Every grain detail page card has a purpose tied to Bullish/Bearish decision
- [ ] Every My Farm card has a purpose tied to Haul/Hold/Price/Watch decision
- [ ] COT, logistics, and grain monitor data visible on UI (not just AI-only)
- [ ] No "Food Industrial", "Carry Out", or "Loss" labels anywhere
- [ ] No single full-width cards that force endless vertical scrolling
- [ ] Glass card treatment on all dashboard cards (both light and dark mode)
- [ ] 3D hover lift on interactive cards
- [ ] Button underglow on vote/action buttons
- [ ] Interactive donut chart with hover expansion and center stat
- [ ] Bullet-point thesis and farm summary formats
- [ ] Sentiment poll on My Farm page (removed from grain detail)
- [ ] AI pipeline re-run with latest data, audited outputs
- [ ] Data audit completed with no duplicate/redundant stats
- [ ] `npm run build` passes with no errors
- [ ] Ralph Wiggum iteration on visual quality until ultra-agent approves
