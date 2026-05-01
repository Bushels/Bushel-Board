# Bushel Board Cohesion Audit — Findings & Fix Backlog

**Author:** Claude (Opus 4.7) • **Date:** 2026-04-27 • **Status:** awaiting user review

## TL;DR

A read of every dashboard surface ([app/(dashboard)/](app/(dashboard)/)) plus the dashboard component guide ([components/dashboard/CLAUDE.md](components/dashboard/CLAUDE.md)) found **doc-vs-reality drift, orphaned components, and farmer-facing copy regressions** that are individually small but collectively erode the system. None are blockers for shipping `/seeding`; all should be addressed before the next major surface lands.

**Three distinct categories of drift:**
1. **Documentation lying** — `components/dashboard/CLAUDE.md` describes patterns that no longer match the code.
2. **Orphan components** — components the guide says are placed on specific pages but aren't actually rendered anywhere.
3. **Farmer-facing copy regressions** — operator/dev jargon leaking into empty states.

Inputs synthesized:
- [docs/plans/2026-04-27-bushel-board-ia-inventory.md](docs/plans/2026-04-27-bushel-board-ia-inventory.md) — Codex xhigh raw inventory (sections 1–7)
- [docs/plans/2026-04-27-seeding-progress-map-design.md](docs/plans/2026-04-27-seeding-progress-map-design.md) — the new surface this audit informs
- [docs/plans/mockups/2026-04-27-cohesion-audit/](docs/plans/mockups/2026-04-27-cohesion-audit/) — visual variants (in-progress, partial)

## Severity Rubric

- **P1** — User-visible, breaks farmer trust, or actively misleading. Fix before next major surface.
- **P2** — Internal correctness debt; quietly corrodes the system. Fix in a sweep.
- **P3** — Worth doing, low urgency.

## Findings — Prioritized

### P1.1 — `/us` empty state shows operator/dev jargon to farmers

**File:** [app/(dashboard)/us/page.tsx:30-34](app/(dashboard)/us/page.tsx)

**Drift:** Empty-state message: *"Run the US thesis generator and publish path first."*

**Why P1:** This is a farmer-facing route. A farmer hitting this state sees a message that assumes they are an operator with shell access. This is a brand integrity issue, not a copy nit.

**Fix:** Replace with farmer-friendly language. Suggested copy:
> *"US market thesis is being prepared for this week. New analysis releases Friday evenings."*

**Effort:** 1 line. One-PR cleanup.

---

### P1.2 — `/overview` documentation contradicts production

**Files:** [components/dashboard/CLAUDE.md:5-8](components/dashboard/CLAUDE.md), [app/(dashboard)/overview/page.tsx:28-31](app/(dashboard)/overview/page.tsx)

**Drift:** The dashboard component guide states:
> *"Overview page: Prairie Snapshot → Community Pulse → Market Intelligence"*

Reality: `/overview` renders **one section** ("AI Market Stance") with a single `UnifiedMarketStanceChart`.

**Why P1:** Future agents (and humans onboarding) reading the guide will plan based on a 3-section model that does not exist. The guide is the contract; the contract is wrong.

**Fix path — pick one and document the choice:**
- **Option A (recommended):** Update the guide to match production (single AI Market Stance section). Add a note explaining why the 3-section pattern was collapsed (likely Wave 4 redesign or a quiet refactor).
- **Option B:** Restore the 3-section pattern in production. This is more work and may not match current product intent.

**Effort:** Option A is a 5-minute doc edit. Option B is a feature rebuild.

**My take:** Option A. The single-section overview *works* — it's compact and scannable. The doc just hasn't kept up.

---

### P1.3 — `sentiment-poll.tsx` is orphaned

**Files:** [components/dashboard/CLAUDE.md:23](components/dashboard/CLAUDE.md), [components/dashboard/sentiment-poll.tsx](components/dashboard/sentiment-poll.tsx), [app/(dashboard)/grain/[slug]/page.tsx:1-23](app/(dashboard)/grain/[slug]/page.tsx)

**Drift:** Guide says `sentiment-poll.tsx` is rendered on grain detail. Grain detail does not import or render it. The component still exists, has database wiring (`grain_sentiment_votes` table), and a server action.

**Why P1:** This is a *retired feature ghost*. A farmer who voted previously may wonder where the vote went. A future engineer reading the guide will either resurrect a feature that was intentionally removed or waste time tracing the wiring.

**Fix path — investigate intent first:**
- Was it intentionally removed (Track #43-style retirement)? → update guide to mark it retired, decide whether to delete the component.
- Was it accidentally removed during a refactor? → restore it with a `<SectionBoundary>` wrap.

**Effort:** 30 min investigation; fix depends on answer.

**Open question for user:** is `sentiment-poll` intended to be on grain detail?

---

### P1.4 — `percentile-graph.tsx` is orphaned

**Files:** [components/dashboard/CLAUDE.md:21](components/dashboard/CLAUDE.md), [components/dashboard/percentile-graph.tsx](components/dashboard/percentile-graph.tsx), [app/(dashboard)/my-farm/page.tsx:14-20](app/(dashboard)/my-farm/page.tsx), [components/dashboard/delivery-pace-card.tsx:75-90](components/dashboard/delivery-pace-card.tsx)

**Drift:** Guide says `percentile-graph` (a bell-curve SVG) is rendered on My Farm. My Farm uses `DeliveryPaceCard` instead, which uses a *bar marker* visualization, not a bell curve.

**Why P1:** Same orphan-component problem as P1.3. Two components solving the same job; only one is used.

**Fix:** Decide which is canonical. If `DeliveryPaceCard` is the production answer, mark `percentile-graph` deleted in the guide and consider removing the file. If the bell curve is the design intent, swap My Farm to use it.

**Effort:** 15 min decision; fix is small.

---

### P1.5 — `components/dashboard/CLAUDE.md` self-contradiction on `x-signal-feed.tsx`

**File:** [components/dashboard/CLAUDE.md:35-40](components/dashboard/CLAUDE.md)

**Drift:** The guide says `x-signal-feed.tsx` is used on grain detail (line 35) AND that it was removed in Wave 2 with the note "Grain detail uses overview-only `compact-signal-strip.tsx`" (around line 40).

**Why P1:** A self-contradicting guide is worse than no guide. Reading agents will pick whichever statement they hit first.

**Fix:** Delete the stale "is used" line, keep the "was removed" line, add a deletion date to make the timeline clear.

**Effort:** 30 seconds.

---

### P2.1 — `SectionBoundary` is missing on data-dependent sections

**Files:** [components/dashboard/CLAUDE.md:5,62](components/dashboard/CLAUDE.md), [app/(dashboard)/overview/page.tsx:33-50](app/(dashboard)/overview/page.tsx), [app/(dashboard)/my-farm/page.tsx:46-55](app/(dashboard)/my-farm/page.tsx), [app/(dashboard)/us/page.tsx:17-20](app/(dashboard)/us/page.tsx)

**Drift:** Guide requires `SectionBoundary` wrap on every data-dependent section. `/overview`, `/my-farm`, `/us` skip it. `/grain/[slug]` and grain `Ask Bushy` do use it correctly.

**Why P2:** When a section's data fetch fails, the entire page can crash instead of degrading gracefully to a `SectionStateCard`. This is real user impact (white-screen-of-death) but rare in normal operation. Currently masked because `safeQuery()` is wrapping the data fetches — but `safeQuery` swallows errors, it doesn't prevent React render-time errors.

**Fix:** Wrap each top-level `<section>` on the three drift pages in `<SectionBoundary>`. Mechanical change.

**Effort:** ~20 min total across three files.

---

### P2.2 — `/advisor` is a silent redirect to `/`

**File:** [app/(dashboard)/advisor/page.tsx:1-4](app/(dashboard)/advisor/page.tsx)

**Drift:** The route still exists but only redirects. Any external link, deep-link from a marketing email, or stored bookmark expecting `/advisor` content silently lands on `/`.

**Why P2:** Won't break anyone, but is a quiet brand erosion when you click a link expecting one thing and get another.

**Fix path — pick one:**
- Redirect to a more specific destination (`/chat`?) with a brief flash message.
- Remove the route entirely; let the 404 page suggest where to go.
- Remove the file and let Next 16's not-found behavior handle it.

**Effort:** 5–15 min depending on path.

---

### P2.3 — `/my-farm` hero uses raw `<div>` instead of `GlassCard`

**File:** [app/(dashboard)/my-farm/page.tsx:188-197](app/(dashboard)/my-farm/page.tsx)

**Drift:** The hero element on My Farm uses a raw `rounded-3xl` div with hand-rolled styles. The rest of My Farm (sentiment module, etc.) correctly uses `GlassCard`.

**Why P2:** Drift accumulates. If the hero is allowed to escape the system, the next component's author will follow that precedent.

**Fix:** Refactor the hero to use `GlassCard` with the same elevation and content. Visual change should be subtle if the existing styles roughly match `GlassCard`'s defaults.

**Effort:** ~20 min.

---

### P2.4 — `/us/[market]` recreates BullBearCards-style content manually

**File:** [app/(dashboard)/us/[market]/page.tsx:83-107](app/(dashboard)/us/[market]/page.tsx)

**Drift:** The US market detail page renders `Initial thesis`, `Tracked call`, `Bull case`, `Bear case` cards inline rather than using the existing [components/dashboard/bull-bear-cards.tsx](components/dashboard/bull-bear-cards.tsx) component. The two thesis surfaces (CAD `/grain/[slug]` and US `/us/[market]`) now have visually divergent renderings of the same conceptual content.

**Why P2:** When `BullBearCards` gets an improvement, US market pages don't benefit. When CAD reasoning changes shape, US has to be patched separately.

**Fix:** Refactor `/us/[market]` to use `BullBearCards`. May require small extensions to the component's props to handle US-specific fields.

**Effort:** ~1–2 hours including any prop extension and testing.

---

### P2.5 — `/digest` error state uses raw `<h1>` instead of `SectionHeader`

**File:** [app/(dashboard)/digest/page.tsx:36-42](app/(dashboard)/digest/page.tsx)

**Drift:** The owner-only digest page renders an error state with a raw `<h1>` instead of the shared `SectionHeader` component.

**Why P2:** Even owner-only surfaces should follow the system. Drift here suggests a "this is internal so it doesn't matter" attitude that grows.

**Fix:** Replace with `<SectionHeader title="…">`.

**Effort:** 5 minutes.

---

### P3.1 — Voice drift: trader-jargon in user-facing subtitles

**Files:** [app/(dashboard)/overview/page.tsx:28-31](app/(dashboard)/overview/page.tsx), [app/(dashboard)/us/page.tsx:25-28](app/(dashboard)/us/page.tsx)

**Drift samples:**
- Overview: *"Weekly bullish/bearish scoring across prairie grains and US markets, with bull and bear points"*
- US: *"US weekly market view for crop year ${overview.cropYear} (market year ${overview.marketYear})"*

**Why P3:** Both are *moderate* drift — readable but trader-shaped. CLAUDE.md voice rule is "farmer-friendly, no trader jargon."

**Fix path:** Run an explicit copy pass on dashboard subtitles in a single PR. Suggested rewrites:
- Overview: *"Where each market is heading this week, in plain terms."*
- US: *"US grain markets this week — what's selling, what's stuck."*

**Effort:** ~30 min copy pass + review.

---

## Component Lifecycle Audit

| Component | Status | Recommendation |
|---|---|---|
| `province-map.tsx` | Retired Track #43, file kept | **Keep file.** Useful reference. Don't revive. |
| `sentiment-poll.tsx` | Orphan (P1.3) | **Decide intent.** Either restore or delete. |
| `percentile-graph.tsx` | Orphan (P1.4) | **Decide intent.** Either restore or delete. |
| `x-signal-feed.tsx` | Removed (per CLAUDE.md:39) | **Confirm deletion.** Update guide. |
| `delivery-pace-card.tsx` | Active, replacing `percentile-graph` | **Keep, document as canonical.** |
| `BullBearCards` | Active on CAD only | **Extend to US** (P2.4). |
| `SectionBoundary` | Underused (P2.1) | **Apply uniformly.** |
| `GlassCard` | Mostly used; one escape (P2.3) | **Eliminate the escape.** |

## /seeding Integration — Audit Confirms Design

The inventory's Section 7 confirms the seismograph design's pattern choices:
- ✅ `SectionHeader` reuse — correct.
- ✅ `SectionBoundary` reuse — correct (and notably, this is one place we should NOT replicate the existing pages' drift).
- ✅ `GlassCard` reuse — correct.
- ⚠️ The audit recommends future v2/v3 of `/seeding` follow `/my-farm`'s **multi-section workflow** pattern (5 sections), not `/overview`'s single-section pattern. **The seismograph design doc has been updated to capture this.**

`/seeding` v1 ships unchanged.

## Recommended Fix Backlog — Sequenced

### Sweep 1 — One PR, ~2 hours total
- P1.1 (`/us` empty state copy)
- P1.2 (Option A — update guide to match production)
- P1.5 (`x-signal-feed` self-contradiction in guide)
- P3.1 (voice drift on subtitles)

This PR is **doc + copy only**, zero feature risk. Can ship today.

### Sweep 2 — Investigation + decision PR, ~3 hours total
- P1.3 (`sentiment-poll` intent decision)
- P1.4 (`percentile-graph` vs `DeliveryPaceCard` decision)

Requires user input on whether sentiment-poll was intentionally retired.

### Sweep 3 — Mechanical hygiene PR, ~2 hours total
- P2.1 (apply `SectionBoundary` uniformly)
- P2.2 (`/advisor` redirect cleanup)
- P2.3 (`/my-farm` hero → `GlassCard`)
- P2.5 (`/digest` raw h1 → `SectionHeader`)

Single PR, mechanical changes, low review burden.

### Sweep 4 — Refactor PR, ~2 hours
- P2.4 (`/us/[market]` adopts `BullBearCards`)

Worth its own PR because of prop-extension risk.

## Recommended Update to `components/dashboard/CLAUDE.md`

After Sweep 1, the guide needs concrete refresh:

1. **Section Pattern** — change from prescriptive ("Overview uses 3 sections") to descriptive ("Overview uses 1 section because…"). Document why each surface uses the rhythm it does.
2. **Component lifecycle table** — explicit status for every component: Active / Retired (Track) / Orphan (under investigation) / Deprecated.
3. **Voice rules** — add one or two examples of approved vs jargon copy alongside the existing rule.

## Risks of Not Acting

| Risk | Likelihood |
|---|---|
| Future agents misunderstand surface architecture and rebuild based on wrong contract | High — already happening in this conversation; I almost designed `/seeding` against the documented pattern, not the real pattern |
| Farmer hits `/us` empty state, perceives unprofessional | Medium |
| Section-level error fails the whole page on a partial outage | Low frequency, high severity when it happens |
| Voice drift compounds — next surface launches with even more trader-shaped copy | High |

## Out of Scope for This Audit

- Mobile responsiveness review (separate audit)
- Dark mode parity check (separate audit)
- Accessibility (a11y) audit (separate audit)
- Performance / bundle-size analysis (separate audit)
- The seismograph design itself (covered in [the design doc](docs/plans/2026-04-27-seeding-progress-map-design.md))

## User Decisions (resolved 2026-04-27)

| Question | Answer | Action taken |
|---|---|---|
| `sentiment-poll` intent | Accidental removal, but **leave it gone for now** while focus is on Bushel Board cohesion | Marked retired in [components/dashboard/CLAUDE.md](components/dashboard/CLAUDE.md) with explicit decision note. File and DB wiring retained. |
| `percentile-graph` vs `DeliveryPaceCard` | **Deferred** — user is rethinking what value My Farm currently brings | Both files retained. Marked "Status pending review" in the guide. Will resolve when My Farm purpose is rethought. |
| Sweep 1 priority | **Ship Today** | This Sweep 1 PR landed 2026-04-27 along with the guide refresh. |
| Component guide rewrite | **Full refresh, not just patches** | [components/dashboard/CLAUDE.md](components/dashboard/CLAUDE.md) fully rewritten — descriptive section rhythms, complete component lifecycle table, voice rule examples, audit backlog cross-referenced. |

## Strategic Open Items (separate from audit)

- **My Farm value review** — user noted: *"I have to rethink the value My Farm brings to this currently."* This is a strategic question, not a drift fix. It blocks the `percentile-graph` decision and may reshape `/my-farm` itself. Worth a dedicated brainstorm session.

## Sweep 1 — Shipped 2026-04-27

What landed in this PR:

- **`/us` empty state copy** ([app/(dashboard)/us/page.tsx:30-34](app/(dashboard)/us/page.tsx)): *"Run the US thesis generator and publish path first"* → *"New analysis releases Friday evenings. Check back soon."*
- **`/overview` subtitle voice** ([app/(dashboard)/overview/page.tsx:30](app/(dashboard)/overview/page.tsx)): trader-shaped → *"Where each market is heading this week, in plain terms."*
- **`/us` subtitle voice** ([app/(dashboard)/us/page.tsx:27](app/(dashboard)/us/page.tsx)): desk-shaped → *"US grain markets this week — what's selling and what's stuck."*
- **[components/dashboard/CLAUDE.md](components/dashboard/CLAUDE.md) full rewrite** — descriptive section rhythms, complete component lifecycle table, voice rule examples, P2 backlog cross-referenced, `sentiment-poll` retirement decision documented, `x-signal-feed` self-contradiction resolved.

## Sweep 4 — Shipped 2026-05-01

`/us/[market]` adopts `BullBearCards`. The two thesis surfaces — CAD `/grain/[slug]` and US `/us/[market]` — now render bull/bear/stance through the same component. What landed:

- **`BullBearCards` extended** with two optional US-specific props: `initialThesis?: string` and `trackedCall?: string`. Renders a Context prelude above the bull/bear grid when supplied. CAD grain detail does not pass these (no behavior change for CAD).
- **`/us/[market]` refactored** to drop the inline 4-card grid (Initial thesis / Tracked call / Bull case / Bear case) and replace it with `<BullBearCards>` carrying the same data plus `stanceScore`, `confidence`, `confidenceScore`. Now both surfaces benefit when `BullBearCards` improves.
- **`SectionBoundary` applied** to all 3 sections on `/us/[market]` (Market Thesis, Top Signals, Data Freshness) — picks up Sweep 3's pattern on this surface as well.
- **`final_assessment` retained in the page hero** — not duplicated into `BullBearCards` to avoid showing it twice.

Type fix: `detail.trajectory.trigger` is `string | null` in the US trajectory shape; coerced via `?? undefined` at the call site since `BullBearCards` props use `string | undefined`.

`npm run build` clean.

## Sweep 3 — Shipped 2026-05-01

Mechanical hygiene PR — low review burden, no behavior change for the happy path. What landed:

- **P2.1 `SectionBoundary` applied uniformly** on `/overview` (4 sections), `/my-farm` (5 sections), `/us` (2 sections). Each data-dependent section now degrades gracefully to a `SectionStateCard` if the data fetch or render fails, instead of crashing the page.
- **P2.2 `/advisor` redirect destination** — was silent redirect to `/`, now redirects to `/chat` (the modern Bushy chat surface, which is the legitimate intent of any `/advisor` link).
- **P2.3 `/my-farm` hero refactor** — replaced the raw `<div className="rounded-2xl border border-canola/15 bg-gradient-to-br ...">` with `<GlassCard elevation={1} hover={false}>`, preserving the wheat-gradient overlay via `className`. The hero now follows the same elevation system as every other surface.
- **P2.5 `/digest` error state** — replaced the raw `<h1>` and red-text error with `<SectionHeader>` + `<SectionStateCard>`, matching the convention across all data-dependent surfaces.

`npm run build` clean. The 24 modified-but-uncommitted working-tree files from prior sessions are unchanged by this sweep.

## Outstanding Sweeps (not yet shipped)

| Sweep | Scope | Effort | Status |
|---|---|---|---|
| **Sweep 1** | Doc + copy PR | ~2 hr | ✅ Shipped 2026-04-27 |
| **Sweep 2** | `sentiment-poll` decision | ~3 hr | ✅ Resolved (decision: leave retired) |
| **Sweep 2b** | `percentile-graph` decision | ~3 hr | ⏸ Deferred pending My Farm value review |
| **Sweep 3** | Mechanical hygiene (P2.1, P2.2, P2.3, P2.5) | ~2 hr | ✅ Shipped 2026-05-01 |
| **Sweep 4** | `/us/[market]` adopts `BullBearCards` (P2.4) | ~2 hr | ✅ Shipped 2026-05-01 |

---

**Visual evidence:** all 8 mockup variants in [docs/plans/mockups/2026-04-27-cohesion-audit/](docs/plans/mockups/2026-04-27-cohesion-audit/) — 4 seeding variants (base + small-multiples + hero-led + table-led) and 4 overview variants (current single-section + 3-section restored + polished single-section + my-farm-style multi-section). Open in browser to compare. Manifest at `manifest.json`.
