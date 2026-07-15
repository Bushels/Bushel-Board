# Bushel Board Deep Audit — Wheat-Centric Goal Alignment

**Date:** 2026-07-15  
**Auditor:** Hermes Agent (Grok 4.5)  
**Repo:** `Bushels/Bushel-Board` @ `master` (HEAD observed: post-`27dc0f4` published-thesis headline merge lineage)  
**Local path:** `C:\Users\kyle\Agriculture\bushel-board-app`  
**Scope:** Goal alignment to a **Wheat-centric board**, architecture health, dead/non-contributing code, product completeness, risk, and an overall score out of 100.

---

## Executive summary

Bushel Board has **successfully pivoted the farmer-facing product to a Wheat-centric board**. The flagship route is `/thesis`, hard-gated to Wheat via `lib/thesis/active-grain-display.ts`, with a published CAD/US desk thesis-of-record, mechanical scorecard cross-check, price/export proof, crop-progress, reconciliation visuals, and a dedicated **Wheat Data** crop-stress map at `/data`.

The project is **on track for the Wheat-first goal**, not for a polished multi-grain “haul/hold for every crop” product. That is intentional: June–July decisions explicitly chose **depth on Wheat before breadth**.

The biggest drag is **product and code bulk that no longer serves the Wheat board**:

- ~**7,375 lines** across **45 orphaned** dashboard/lib modules with **zero live app imports**
- A **6,522-line** `app/(dashboard)/thesis/page.tsx` god-file
- Large **Canola forecast harness** and **Track 54 operator machinery** that are useful as research/ops, but inflate complexity relative to the farmer Wheat cockpit
- Stale top-level **README** (last updated 2026-04-14) that still describes the old multi-grain story

### Overall rating: **74 / 100**

| Band | Meaning |
|------|---------|
| 90–100 | Ship-ready Wheat product; thin dead surface; clear farmer path |
| 80–89 | Strong Wheat board; residual multi-grain debt under control |
| **70–79** | **Current: Wheat identity real, data spine strong, complexity/debt still tax velocity** |
| 60–69 | Goal drift or fragile pipeline |
| <60 | Not a Wheat board in practice |

**Plain-language verdict:**  
You built a real Wheat decision board on a serious data engine. It is not “half-done idea” territory. It *is* still carrying a lot of last season’s multi-grain dashboard and experimental harness weight. Cleaning that weight is now higher ROI than inventing another Wheat panel.

---

## 1. What “original goal” means here

There are **three nested goals** in the repo. Auditing against the wrong one produces a false fail.

### 1A. Founding product goal (still true)

Help prairie farmers (AB / SK / MB) answer:

> **“Should I haul or hold my grain this week?”**

Evidence: `README.md`, `AGENTS.md`, early feature log.

### 1B. Strategic pivot (current operating goal)

**Wheat-first, depth before breadth** (2026-06-15+), later hardened to **Wheat-only farmer display + Wheat-only desk** (2026-07-11/12).

Evidence:

- `docs/plans/2026-06-15-wheat-first-data-viz-redesign.md`
- `docs/plans/2026-06-24-wheat-thesis-goal-handoff.md`
- `lib/thesis/active-grain-display.ts` → `ACTIVE_FARMER_THESIS_GRAIN_LANES = ["Wheat"]`
- `docs/plans/STATUS.md` wheat-only desk + published headline repair (2026-07-15)
- Recent commits: wheat desk repair, published stance, floodmap, dead overview deletion

### 1C. Supporting system goal

Keep a **multi-grain data harness** and official collectors alive so Wheat can be perfected, then cloned later.

This audit scores primarily against **1B (Wheat-centric board)**, with 1A as the farmer outcome test and 1C as intentional infrastructure (not dead by default).

---

## 2. Goal-alignment scorecard

| Goal slice | Status | Evidence | Score |
|------------|--------|----------|-------|
| Farmer surface is Wheat-first | **Met** | `/thesis` filters to Wheat; nav labels “Thesis”, “Wheat Data” | 92 |
| One Wheat read (not CA-vs-US board) | **Met** | CA/US as evidence geography; published combined headline | 90 |
| Official data → score → farmer explanation | **Mostly met** | Scorecard + desk authority + judge/spiderweb/price/export panels | 84 |
| Desk pipeline publishes current Wheat thesis | **Met (repaired Jul 12–15)** | CAD +22 / US +32 style published rows; postcheck cache 12/12 noted in state | 86 |
| Wheat data visualization / maps | **Partial** | `/data` GEE crop-stress hero shipped; full stack panels (CGC/COT/WASDE on `/data`) still thin | 72 |
| Local cash / basis for haul-hold | **Weak** | `posted_prices` empty; SK cash is provincial average only | 45 |
| Social/X as watch-only, not score owner | **Met** | Track 54 write gates; X Pulse watch boundary | 88 |
| Multi-grain re-enable preserved | **Met** | Harness + audit mode + V1 profiles retained | 90 |
| Kill non-Wheat farmer noise | **Partial** | Overview dead code deleted; many old charts still in tree; Kalshi/source-spine still present | 62 |

**Goal-alignment subtotal: 80 / 100**

### On track?

**Yes — for Wheat-centric board.**  
Not fully — for end-to-end “haul/hold this week with my bins + my local bid.”

The product can already show a Wheat bull/bear stance with official proof. It still cannot fully personalize a prairie farmer’s local cash decision without operator bids and cleaner local basis.

---

## 3. Current product map (what a farmer actually gets)

### Primary (Wheat cockpit)

| Route | Role | Wheat contribution |
|-------|------|--------------------|
| `/thesis` | Flagship Bull/Bear decision board | **Core** — Wheat-only farmer view |
| `/data` | Wheat crop-stress map | **Core showcase** (watch-only stress) |
| `/environmental/flood-watch` | Excess moisture watch | Supporting supply-risk context |
| `/seeding` + `/seeding/spring-wheat` | Progress / pulse maps | Supporting new-crop context |
| `/grain/[slug]` | Per-grain detail + Bushy | Useful for Wheat; still multi-slug architecture |
| `/my-farm` | Bins, deliveries, peer storage | Haul/hold personalization layer |

### Secondary / operator / parked

| Route | Role | Note |
|-------|------|------|
| `/thesis?audit=1` | Operator graph + Track 54 gate | Correctly hidden from normal farmers |
| `/data-universe` | All-grain impact constellation | Educational; multi-grain, not Wheat cockpit |
| `/source-spine` | Source registry UI | Still Canola-flavored copy in places |
| `/us`, `/us/[market]` | US market pages | Secondary to Wheat board |
| `/kalshi` | Prediction-market proof | Parked / low product value while markets empty |
| `/overview` | Redirect → `/thesis` | Correct retirement |
| `/chat`, `/advisor` | Bushy / advisor | Adjacent product, not board core |
| `/digest` | Digest surface | Peripheral |

### Nav reality (desktop)

Thesis · **Wheat Data** · Environmental · Data Flow · Source Spine  

This is **mostly on-brand**, but Source Spine + Data Flow still feel like operator IA on a farmer nav. That is mild goal noise, not fatal.

---

## 4. Architecture health

### What is excellent

1. **Authority hierarchy is real, not marketing**
   - Official packets / desk publish weekly thesis
   - Deterministic scorecard is mechanical evidence + fallback
   - Daily overlays are bounded and labeled
   - X/Grok/Hermes are quarantined (no thesis writes)
   - Retired Grok writers return **410 tombstones**

2. **Facts spine vs narrative desk split**
   - Collectors + `thesis_packet_cache` can keep facts current even when narrative desk fails
   - Documented outage recovery path (June/July desk silence → headless CLI + wheat republish)

3. **Source discipline**
   - CGC export formula repaired (no Terminal Disposition double-count)
   - Wheat class-safe crop progress
   - Bounded public RPCs: `get_wheat_price_history`, `get_wheat_export_history`
   - Importer-admitted projection pace only

4. **Verification culture**
   - Large Vitest suite, browser smoke, readiness reports, source-freshness watchdog
   - Definition of Done in `AGENTS.md` is unusually strong for a solo/ag-ops product

### What is unhealthy

1. **`thesis/page.tsx` is a 6,522-line monofile**
   - Contains board assembly, Track 54 intake UI, readiness display, reconciliation, USDA sweep, spiderweb, etc.
   - High bug surface; hard for non-coders *and* agents to change safely
   - Single biggest maintainability risk on the farmer path

2. **Complexity concentration in Track 54 ops**
   - Readiness, artifact health, Hermes fallback, promotion briefs, heartbeat summaries are mature
   - But they are a second product living beside the Wheat board
   - Farmer value of X remains intentionally low (watch-only); ops cost is high

3. **Doc/code drift**
   - `README.md` last updated **2026-04-14** (pre Wheat-first, pre desk CLI, pre published-authority repair)
   - `PROJECT_STATE.md` / `STATUS.md` are the real truth files and are dense but current
   - March 2026 audit is historical only

4. **Experimental layers still large**
   - Canola forecast-experiments: 18 modules + many scripts/tests, **not wired into farmer UI**
   - Useful as future learning loop; currently non-contributing to Wheat board outcomes

### Size snapshot (approx.)

| Area | Files | Lines |
|------|------:|------:|
| `app/` | 56 | 14,709 |
| `components/` | 160 | 26,024 |
| `lib/` | 321 | 64,875 |
| `scripts/` | 114 | 41,643 |
| `supabase/` | 237 | 30,089 |
| `docs/` | 211 | 79,176 |
| **Dead orphan modules (sample set)** | 45 | **7,375** |

---

## 5. Dead code and non-contributing inventory

### 5A. High-confidence dead UI/modules (no live app imports)

These were verified by import graph search excluding docs/tests self-paths. Many are leftovers from the retired `/overview` multi-grain dashboard or early engagement features.

**Orphan dashboard / UI (~7.3k lines):**

- `commercial-storage-widget.tsx`
- `cot-positioning-card.tsx`
- `crop-summary-card.tsx`
- `farmer-cot-card.tsx`
- `flow-breakdown-widget.tsx`
- `gamified-grain-chart.tsx`
- `grain-elevator.tsx`
- `grain-unlock-button.tsx`
- `logistics-card.tsx` / `logistics-banner.tsx`
- `market-snapshot-grid.tsx`
- `metric-vote-button.tsx`
- `multi-grain-sentiment.tsx` *(explicitly retired from normal `/thesis`)*
- `net-balance-kpi.tsx`
- `percentile-graph.tsx`
- `prairie-pulse-map.tsx`
- `province-map.tsx` *(still referenced conceptually by redesign docs; **not imported by live routes** — `/data` uses `crop-stress-map` instead)*
- `sentiment-banner.tsx` / `sentiment-poll.tsx`
- `stock-map-widget.tsx`
- `supply-sankey.tsx`
- `train-capacity-widget.tsx`
- `wow-comparison.tsx`
- `unified-market-stance-chart.tsx` *(overview-era)*
- `terminal-flow-chart.tsx`
- `delivery-gap-chart.tsx` / `delivery-breakdown-chart.tsx`
- `pace-chart.tsx`
- `pipeline-card.tsx`
- `storage-breakdown.tsx`
- `grain-chart.tsx` / `grain-table.tsx` / `grain-quality-donut.tsx`
- `crush-utilization-gauge.tsx`
- `provincial-cards.tsx`
- `thesis-banner.tsx`
- `components/advisor/advisor-chat.tsx`
- `components/layout/grain-dropdown.tsx`
- `components/motion/stagger-group.tsx`
- `components/ui/grain-particles.tsx`
- `lib/queries/flow-breakdown.ts`
- `lib/queries/sentiment-daily.ts` / `sentiment-history.ts`
- `lib/us-market-context.ts`
- `lib/utils/grain-colors.ts`

**Recommendation:** delete in one cleanup PR with a recover-from-git note (same pattern as overview deletion on 2026-07-11), **except** any chart you plan to re-home onto `/data` Wheat panels in the next 1–2 sessions (candidate keep list: terminal-flow, delivery-gap, cot-positioning, province-map patterns).

### 5B. Intentional tombstones (keep)

These are **not dead waste**; they are safety locks:

- `app/api/pipeline/run` → HTTP 410 `grok_workflow_deprecated`
- Edge Functions: `analyze-grain-market`, `analyze-market-data`, `generate-intelligence`, `generate-farm-summary`, `search-x-intelligence`
- Shared `v1-gate.ts` blocks `ALLOW_V1_GROK` revival

**Keep.** Removing them risks silent re-enable via stale schedulers.

### 5C. Parked / low-contribution (not delete-blindly)

| Asset | Why it still exists | Farmer Wheat value |
|-------|---------------------|--------------------|
| Canola forecast-experiments | Learning harness, no-write | Low now |
| Kalshi board | API proof; markets often empty | Near-zero |
| `/source-spine` | Operator source registry; Canola-era framing | Low for farmers |
| `/data-universe` | Multi-grain graph education | Medium educational, low decision |
| Track 54 full operator stack | X watch evidence ops | Low direct; high process cost |
| Multi-grain V1 profiles in cache (12 packets) | Desk/harness re-enable | Infrastructure yes, UI no |

### 5D. Already deleted correctly

- `components/overview/*` deleted 2026-07-11 after production-branch pin incident
- Unfinished Wheat X-sentiment scorer draft removed after bullish-on-bearish bug
- Landing page / trial signup retired earlier

---

## 6. Wheat-centric completeness vs the June 24 goal handoff

From `docs/plans/2026-06-24-wheat-thesis-goal-handoff.md` and later STATUS repairs:

| Target | State |
|--------|--------|
| One Wheat farmer read | Done |
| CA/US as evidence geography | Done |
| USDA crop progress live card | Done (hardcoded Jun-22 replaced) |
| Reconciliation judge | Done |
| Relationship spiderweb | Done (v1 distance = score impact) |
| Spring/HRW/SRW price basket + history | Done |
| Historical export context + CGC formula repair | Done |
| Published desk owns weekly headline | Done (2026-07-15 supersedes scorecard-as-headline) |
| GEE crop-stress map on Wheat Data | Done (P1 of redesign) |
| Full Wheat Data page panels (CGC/COT/WASDE/prices) | **Not done** (P2 open) |
| CFTC as timing/crowding only | Partially encoded; still needs ongoing desk discipline |
| Local cash/basis | **Weak** |
| Spiderweb v2 (authority/freshness in distance) | Open |
| Live-packet scoring replay loop | Open / ongoing |

**Net:** the Wheat *board* is real. The Wheat *data hub* and *local haul/hold personalization* are still incomplete.

---

## 7. Data pipeline & ops health (Wheat-relevant)

### Strengths

- Collectors exist for CGC, crop progress (US + Prairie), export sales, WASDE, COT, prices, producer cars, grain monitor, GEE crop stress
- Cache refresh after collectors
- Desk CLI (`desk:cad` / `desk:us` / `desk:postcheck`) replaced fragile Desktop-MCP path
- Class-safe wheat progress + continuous contract price rollover repairs landed mid-July
- Source freshness watchdog + heartbeats

### Residual risks

1. **Automation fragility history is real** — multi-week desk silence, frozen futures contracts, SLA false aborts. Mitigations exist; monitoring remains mandatory.
2. **Local bids empty** — haul/hold without cash tape is half a product for many farmers.
3. **GEE is watch-only** — correct scientifically; means satellite hero does not yet move the score.
4. **Posted/public copy drift** — README and some source-spine Canola wording can confuse agents and operators.
5. **Security debt noted historically** — JWT in old migration history, RLS test gap (from prior memory/audits). Not re-proved end-to-end in this pass; treat as open risk, not cleared.

---

## 8. Quality rating breakdown (out of 100)

| Dimension | Weight | Score | Weighted |
|-----------|-------:|------:|---------:|
| Wheat goal alignment | 25% | 80 | 20.0 |
| Farmer decision value (haul/hold) | 15% | 68 | 10.2 |
| Data spine & authority design | 20% | 88 | 17.6 |
| Code health / dead-code burden | 15% | 55 | 8.3 |
| UX / IA coherence | 10% | 72 | 7.2 |
| Docs accuracy & agent operability | 5% | 62 | 3.1 |
| Tests / ops / safety gates | 10% | 84 | 8.4 |
| **Total** | **100%** |  | **74.8 → 74** |

### Rating narrative

- **A-range blocked by:** orphan charts, thesis monofile, README drift, incomplete local cash, unfinished Wheat Data P2.
- **B-range earned by:** genuine Wheat identity, serious official-data engine, correct AI quarantine, recent desk/headline repairs, wheat maps and proof strips that actually exist in code.

Compared with the March 10, 2026 audit (**B+ MVP foundation**), the project is **more ambitious and more Wheat-true**, but **less clean** as a UI codebase because of multi-month feature accretion.

---

## 9. Prioritized recommendations

### P0 — Do now (protect the Wheat goal)

1. **Delete or quarantine confirmed orphan dashboard modules** (~7k lines) after a 30-minute “re-home to `/data`?” triage.
2. **Split `thesis/page.tsx`** into modules:
   - farmer hero / stance
   - evidence & judge
   - price/export proof
   - audit-only operator panels
3. **Rewrite README top half** to Wheat-centric truth (link `PROJECT_STATE.md` for ops detail).
4. **Keep tombstones**; do not revive Grok writers.

### P1 — Finish Wheat product depth

1. Wheat Data P2: CGC flow + COT 3-class + WASDE + price tape under `/data` (reuse orphaned charts where still good).
2. Local cash path: operator `posted_prices` or honest “no local bid yet” farmer education + SK provincial context labeled correctly.
3. One weekly “Wheat packet replay” checklist script (already partially hand-run) as a single npm command.
4. Move Source Spine / Data Flow out of primary farmer nav (or behind `?audit=1` / operator role).

### P2 — Reduce non-contributing weight

1. Park Canola forecast harness docs/scripts under an `experiments/` mental model; stop expanding until Wheat board is thin and stable.
2. Kalshi: leave route, remove from any implied product story until open markets return.
3. Track 54: freeze feature growth; run only the minimum no-write path that feeds a small X Pulse card.

### P3 — Original haul/hold completion

1. My Farm Wheat defaults + recommendation tied to **published Wheat stance + bin inventory**, with stale-desk guards already present.
2. Bushy chat wheat-specialist prompts aligned to board authority rules.
3. iOS only after web Wheat cockpit is lean.

---

## 10. Dead-code action table (operator-ready)

| Action | Items | Risk |
|--------|-------|------|
| **Safe delete now** | multi-grain-sentiment, sentiment-banner/poll, grain-elevator, grain-unlock, gamified-grain-chart, wow-comparison, metric-vote-button, advisor-chat (if `/advisor` uses other path — verify once), grain-particles, train-capacity-widget, commercial-storage-widget | Low |
| **Delete after re-home decision** | cot-positioning-card, terminal-flow-chart, delivery-gap-chart, province-map, supply-sankey, crush-utilization-gauge, pipeline-card | Medium (may want on `/data`) |
| **Keep** | tombstone edge functions, pipeline 410 route, wheat-* modules, crop-stress-map, thesis active-grain-display, desk CLI | — |
| **Park, don’t delete** | forecast-experiments, kalshi, track54 readiness stack | Medium if deleted blindly |

---

## 11. What “done” should mean for the Wheat-centric board

A honest definition of done for *this* goal:

1. Farmer opens `/thesis` and sees **one Wheat stance** with published desk authority + mechanical proof.
2. Farmer can open `/data` and see **stress + supply/demand/price panels** for Wheat only.
3. Local bin + (if available) cash context answers haul/hold without multi-grain noise.
4. Repo no longer ships thousands of lines of unreferenced multi-grain overview charts.
5. README and nav match the Wheat story.
6. Collectors + desk complete a Friday cycle without silent death.

**Today:** (1) yes, (2) partial, (3) partial, (4) no, (5) partial, (6) repaired but still ops-sensitive.

---

## 12. Final judgment

### Is the project on track for a Wheat-centric board?

**Yes.** The living product identity is Wheat. The last month of commits, desk scope, active-grain allowlist, Wheat Data page, and published-headline repair all point the same direction.

### Is the project “done”?

**No.** It is a **strong mid/late build** of a Wheat decision system, still carrying multi-grain UI sediment and incomplete local-cash/haul-hold closure.

### Score

# **74 / 100**

**Best single next move:**  
Cleanup PR (dead charts) + thesis page split + README truth-up — then Wheat Data P2. That sequence raises the score faster than another operator panel.

---

## Appendix A — Key files reviewed

- `README.md`, `AGENTS.md`, `PROJECT_STATE.md`, `docs/plans/STATUS.md`
- `docs/plans/2026-06-15-wheat-first-data-viz-redesign.md`
- `docs/plans/2026-06-24-wheat-thesis-goal-handoff.md`
- `lib/thesis/active-grain-display.ts`
- `app/(dashboard)/thesis/page.tsx` (structure/markers; 6522 lines)
- `app/(dashboard)/data/page.tsx`, `components/dashboard/crop-stress-map.tsx`
- `app/(dashboard)/overview/page.tsx` (redirect)
- `app/api/pipeline/run/route.ts` (tombstone)
- `components/layout/desktop-nav-links.tsx`
- Import-graph dead-code scan over `components/` + `lib/`
- `package.json` scripts surface
- `graphify-out/GRAPH_REPORT.md` (freshness context)
- Recent git history on `master`

## Appendix B — Method notes / limits

- This audit is **static + repo-truth** based. It did not re-run full `npm run verify`, live Supabase packet SQL, or production browser smoke in this session.
- Live market numbers cited from `PROJECT_STATE.md` / `STATUS.md` (July 14–15 checkpoints) are treated as operator-reported state, not re-measured here.
- Dead-code classification means **no live TS/TSX import path found**. A file may still be valuable as a pattern library for upcoming `/data` panels.
- Path tooling on Windows required shell-based searches; conclusions were cross-checked with multiple passes.

---

*Audit written 2026-07-15 for Kyle / Bushel Board wheat-centric goal review.*
