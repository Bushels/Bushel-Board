# Bushel Board + Bushels

**Prairie wheat market intelligence for Canadian farmers.**

Two apps, one backend:

- **Bushel Board** — the Wheat-centric web dashboard. One weekly bull/bear read, official source proof, satellite crop-stress, and farm tracking.
- **Bushels** — chat-first iOS + web (`/chat`) with Bushy, a conversational grain analyst.

Both share the same Supabase backend (PostgreSQL, Auth, Edge Functions).

## What We're Building

Help prairie farmers (AB, SK, MB) answer:

> **Should I haul or hold my Wheat this week?**

Strategic direction (**2026-06-15 → 2026-07**): **Wheat-first, depth before breadth.**  
The multi-grain data harness still runs under the hood, but the farmer-facing product and Friday desk are **Wheat-only** until the Wheat loop is proven.

| Layer | What it does | Status |
|-------|--------------|--------|
| **Wheat Thesis board** (`/thesis`) | One Wheat bull/bear read from published CAD/US desk rows + mechanical scorecard cross-check | Live flagship |
| **Wheat Data** (`/data`) | Global wheat crop-stress map (GEE NDVI + soil moisture) | Live (watch-only for scoring) |
| **Data pipeline** | CGC, USDA, COT, prices, Prairie crop progress, producer cars, GEE | Live via **Hermes** mechanical crons |
| **Friday Wheat desk** | Headless `desk:us` then `desk:cad` + postcheck | Live CLI; Hermes-owned schedule |
| **X Pulse (Track 54)** | Grok/Hermes X scout — **watch-only**, never owns the score | Hermes no-write pulse |
| **My Farm** | Bins, deliveries, peer storage comparison | Live |
| **Bushy Chat** | Conversational analyst at `/chat` | Alpha |

## Hard product boundaries

1. **Official sources and the published desk own the weekly Wheat headline.**  
2. The deterministic scorecard is the mechanical evidence cross-check / fallback.  
3. Daily overlays are bounded and labeled.  
4. **X / Grok / Hermes pulse is watch-only** until accepted evidence is tied back to official data.  
5. The old Grok *thesis-writing* pipeline is **permanently tombstoned** (`/api/pipeline/run` → HTTP 410).  
   Grok is welcome as **X scout + operator agent**, not as a silent score publisher.

## Automation owner: Hermes (not Claude Desktop)

As of **2026-07-15**, scheduled collectors, freshness watchdogs, and Wheat X Pulse run under **Hermes Agent cron** with default model **Grok 4.5** (xAI OAuth).

| Kind | How it runs |
|------|-------------|
| Mechanical collectors | Hermes `--no-agent` scripts → `npm run collect:*` |
| Source / desk watchdogs | Hermes silent-on-success scripts |
| Wheat X Pulse | Hermes script → `track54:hermes-x-scout:terminal` (no Supabase thesis writes) |
| Friday desk orchestration | Hermes agent job (preflight/report; writes still approval-gated) |

Canonical schedule map: `docs/reference/hermes-bushel-board-schedule.md`  
Wrappers: `scripts/hermes/*.sh` and `~/.hermes/scripts/bushel-*.sh`

Claude Desktop Routines are **legacy** for this project. Prefer Hermes list/status:

```bash
hermes cron list
hermes cron status
```

## Key farmer routes

| Route | Purpose |
|-------|---------|
| `/thesis` | Wheat decision board |
| `/data` | Wheat crop-stress map |
| `/environmental` | Flood / excess-moisture watch |
| `/my-farm` | Personal bins + deliveries |
| `/chat` | Bushy |
| `/thesis?audit=1` | Operator / audit surface (not primary nav) |

Operator-only routes still exist (`/source-spine`, `/data-universe`, `/kalshi`) but are **out of primary nav**.

## Tech stack

- **Frontend:** Next.js 16 App Router + TypeScript (Vercel)
- **Backend:** Supabase (PostgreSQL, Auth, Edge Functions)
- **UI:** shadcn/ui + Tailwind (wheat/canola/prairie palette)
- **Charts:** Recharts · **Maps:** Mapbox / react-map-gl
- **Agent control plane:** Hermes Agent + Grok 4.5 (xAI OAuth)
- **Desk data plane:** `npm run desk:cad|desk:us|desk:postcheck`

## Getting started

### Prerequisites

- Node.js 20+
- Supabase project credentials in `.env.local`
- Hermes Agent installed and gateway running for scheduled jobs

### Install & run

```bash
npm install
npm run dev          # localhost:3001 by default in some setups; check next config
npm run build
npm run test
npm run verify       # typecheck + lint + test + build
```

### Common operator commands

```bash
npm run collect:cgc
npm run collect:prices
npm run collect:export-sales
npm run desk:us
npm run desk:cad
npm run desk:postcheck
npm run check:source-freshness
npm run check:desk-freshness
npm run track54:hermes-x-scout:terminal
npm run track54:readiness
```

## Data sources (Wheat-relevant)

- CGC weekly grain statistics
- USDA Crop Progress, Export Sales, WASDE, quarterly stocks
- CFTC COT (timing / crowding context)
- Grain futures + FX
- Prairie crop progress (MB / SK / AB)
- GEE crop-stress belts (watch-only)
- Hermes/Grok X Pulse (watch-only)

## Project structure

```
app/(dashboard)/thesis/   # Wheat flagship board
app/(dashboard)/data/     # Wheat Data map
components/dashboard/     # Charts, maps, Wheat cards
lib/thesis/               # Scorecard, pressure map, active-grain allowlist
lib/queries/              # Server Supabase queries
scripts/                  # Collectors, desk CLI, Track 54, Hermes wrappers
scripts/hermes/           # Hermes-owned schedule wrappers
supabase/                 # Migrations + Edge Functions
docs/plans/STATUS.md      # Feature ledger
PROJECT_STATE.md          # Current operating truth
docs/audits/              # Audits (incl. 2026-07-15 Wheat deep audit)
```

## Truth files

| File | Role |
|------|------|
| `AGENTS.md` / `CLAUDE.md` | Rules only |
| `PROJECT_STATE.md` | Current state / blockers / next action |
| `docs/plans/STATUS.md` | Feature track ledger |
| `docs/reference/hermes-bushel-board-schedule.md` | Live Hermes schedule |

## License

Private — not yet licensed for distribution.

---
*Last updated: 2026-07-15 — Wheat-centric product + Hermes automation ownership.*
