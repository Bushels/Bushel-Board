# Next-session handoff — Wheat farmer UX Phase 1 + Friday desk swarm

**Date:** 2026-07-15 (evening MT)  
**Repo:** `Bushels/Bushel-Board`  
**Branch to start from:** `master` @ `d9899de` (PR #25 merged)  
**Local path:** `C:\Users\kyle\Agriculture\bushel-board-app`

---

## Paste this as the next session goal

```text
Phase 1 Wheat farmer UX: wire the visual pillars on /thesis.

1) Checkout master (d9899de+). Read:
   - docs/plans/2026-07-15-wheat-farmer-ux-redesign.md
   - docs/plans/2026-07-15-next-session-handoff.md (this file)
   - lib/thesis/wheat-cockpit-models.ts
   - lib/thesis/wheat-cockpit-builders.ts
   - components/dashboard/wheat-visual-pillars.tsx

2) Wire WheatVisualPillars into the farmer-facing top of app/(dashboard)/thesis/page.tsx
   (NOT audit-only). Build props from:
   - Prairie: thesis board prairie_week_status / canada crop progress package fields
   - GEE: getLatestCropStress() (same as /data) — watch-only badge required
   - Prices: existing Spring/HRW/SRW history or packet price rows → buildPriceBasketCardModel

3) Keep score authority unchanged (published desk headline + scorecard fallback).
4) Framer Motion already in pillars; respect reduced-motion.
5) Add focused tests for builders; update thesis page tests/smoke markers for
   wheat-visual-pillars / wheat-pillar-prairie / wheat-pillar-gee / wheat-pillar-prices.
6) Do NOT revive multi-grain board or Grok thesis writers.
7) Verify: npm run build (or focused vitest) + browser check /thesis mobile+desktop.

Also reinforce Friday Hermes desk orchestrator (bull/bear board update) — see § Friday swarm below.
```

---

## What just landed (merged)

| Item | Detail |
|------|--------|
| PR | https://github.com/Bushels/Bushel-Board/pull/25 **merged** |
| Commit | `d9899de` on `master` |
| Dead code | 33 orphan multi-grain modules deleted |
| Nav | Thesis · Wheat Data · Environmental · My Farm |
| Ops | Hermes owns collectors / watchdogs / X pulse / briefs |
| Audit | `docs/audits/2026-07-15-wheat-centric-board-deep-audit.md` (74/100) |
| UX plan | `docs/plans/2026-07-15-wheat-farmer-ux-redesign.md` |

---

## Phase 1 scaffold already in tree (this handoff commit)

If the follow-up commit is on master/branch when you start, these files exist:

| File | Role |
|------|------|
| `lib/thesis/wheat-cockpit-models.ts` | Props/types for pillars + hero |
| `lib/thesis/wheat-cockpit-builders.ts` | Pure builders (Prairie / GEE / price) |
| `components/dashboard/wheat-visual-pillars.tsx` | Animated farmer cards (not wired yet) |

**Still TODO for Phase 1 complete:** import `WheatVisualPillars` near the top of normal `/thesis` (after hero stance), pass live models, tests + browser smoke.

### Wiring hints inside `thesis/page.tsx`

- File is ~6500 lines — prefer extracting a small server helper later; for Phase 1 a targeted import + render is OK.
- Prairie package status already surfaces via `prairieWeekStatusRead` / source health helpers — reuse those fields rather than new RPCs.
- GEE: `import { getLatestCropStress } from "@/lib/queries/gee-crop-stress"` then `buildGeeMoistureCardModel(data)`.
- Prices: reuse `getWheatPriceHistory` / packet price rows already loaded for the price-basket proof strip; map into `PriceBasketLegModel[]`.
- Place pillars **above** dense USDA sweep / spiderweb / operator intake so farmers see visuals first.
- `?audit=1` can keep full operator panels; normal mode should lead with pillars.

---

## Friday major agent swarm (Bull/Bear board of record)

This is the **weekly product heartbeat**. Do not treat it as optional polish.

### Authority order (never invert)

1. Official source rows (CGC, USDA, COT, crop progress, …) via collectors + `thesis_packet_cache`
2. Prices / FX (confirmation)
3. X Pulse (Hermes/Grok) — **watch-only** psychology
4. Daily bounded overlays (if any)
5. **Friday desk swarm** publishes `market_analysis` / `us_market_analysis` → farmer headline on `/thesis`

### Required Friday order (MT)

| Step | Job / command | Notes |
|------|----------------|-------|
| Morning | `collect:gee-crop-stress` (Hermes 11:00) | Watch-only stress |
| Midday | Canada AB package / `collect:canada-crop-progress:all` | Completes Prairie package |
| Afternoon | `collect:cftc-cot`, prices | Positioning + price context |
| 16:50 | `bushel-wheat-x-pulse-friday` | No-write X deep pulse |
| **18:00** | Hermes `bushel-wheat-friday-desk-orchestrator` | Currently **preflight-only** by design |
| Desk write | `npm run desk:us` then `npm run desk:cad` with approval | **US first**, then Canada (cross-read) |
| Close | `npm run desk:postcheck` | Refresh thesis cache 12/12 |

### Desk write gate

```bash
# Preflight first (safe)
npm run desk:us -- preflight
npm run desk:cad -- preflight

# Writes only when DESK_WRITE_APPROVAL is set and you pass --write + phrase
# See scripts/desk/contracts.ts for DESK_WRITE_APPROVAL_PHRASE
npm run desk:us -- write --write --approve "<phrase>" --input <envelope>
npm run desk:cad -- write --write --approve "<phrase>" --input <envelope>
npm run desk:postcheck
```

**Wheat-only scope:** desk active list is `['Wheat']`. Do not re-expand to 16 grains in the swarm.

**Hermes note:** Friday orchestrator job is preflight/report by default. Promoting it to full write requires Kyle explicit approval + env phrase — do not silent-enable.

### After desk publish

- `/thesis` must show **published** CAD/US desk rows as weekly headline (already repaired 2026-07-15).
- Scorecard remains mechanical cross-check / fallback.
- X Pulse must not overwrite the scorecard.

---

## Hermes automation (already registered)

Map: `docs/reference/hermes-bushel-board-schedule.md`

```bash
hermes cron list
hermes cron status
# gateway must stay running
```

Key jobs: `bushel-collect-*`, `bushel-source-freshness-*`, `bushel-desk-freshness-sat`, `bushel-wheat-x-pulse-daily|friday`, `bushel-wheat-daily-operator-brief`, `bushel-wheat-friday-desk-orchestrator`.

Wrappers: `%LOCALAPPDATA%\hermes\scripts\bushel-*.sh` → repo `scripts/hermes/`.

**After one clean Hermes week:** disable leftover Claude Desktop Bushel Routines to avoid double collectors.

---

## Non-negotiable product boundaries

1. Farmer product is **Wheat-only** (`lib/thesis/active-grain-display.ts`).
2. Grok thesis writers + `/api/pipeline/run` stay **410 tombstones**.
3. Grok/Hermes X = **watch-only** evidence.
4. GEE stress = **watch-only** until multi-season validation (still show it prominently).
5. No trading/advice copy (`public-copy-guardrails`).
6. Prefer Hindsight + this handoff over inventing new process.

---

## Data pillars the UX must feature

| Pillar | Source | Cadence |
|--------|--------|---------|
| Prairie progress MB/SK/AB | `canada_crop_progress` + package status | Tue–Fri staggered |
| GEE moisture / stress | `gee_crop_stress` → `/data` | Fri 11:00 MT |
| Price basket | Spring / HRW / SRW | Daily prices job 15:45 MT |
| Flood / excess moisture | `/environmental` | Event / weekly watch |

If GEE token expired (historical silent stop after 2026-06-15), re-auth Earth Engine before expecting fresh stress rows.

---

## Suggested session sequence

1. Wire pillars into `/thesis` (this Phase 1).
2. Browser smoke + focused tests.
3. Commit `feat/wheat-farmer-ux-phase1`.
4. (Same week later) Confirm Friday Hermes preflight → manual or approved desk write → postcheck.
5. Phase 2: richer maps / swipe carousel polish.

---

## Quick health commands

```bash
cd /c/Users/kyle/Agriculture/bushel-board-app
git checkout master && git pull
npm run check:source-freshness
npm run check:desk-freshness
hermes cron list
```

---

*Handoff for Kyle + next agent. Prefer this file + UX redesign plan over stale README history.*
