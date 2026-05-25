# Kalshi Prediction Board Next Session Handoff

**Created:** 2026-05-10 MT
**Status:** Parked 2026-05-11 - resume only when Kalshi public grain commodity markets return
**Current branch:** `codex/data-layer-foundation-v1`

## Parking Note - 2026-05-11

Kalshi public API wiring is proven, but the grain commodity markets are not currently open. The verified snapshot showed `0` open Corn/Soybeans/Wheat markets and latest finalized markets only.

Do not make this the next active product session unless a fresh run shows an open grain commodity market:

```powershell
npx tsx scripts/capture-kalshi-commodity-snapshot.ts
```

Resume only if `open_market_count > 0` for Corn, Soybeans, or Wheat. Closed/finalized markets may prove API wiring but must not be used for live probability comparison.

## Direct Answer

Build the Kalshi Prediction Board around one clean comparison:

```text
Kalshi traded YES probability
        vs
Bushel Board Implied Line
```

Do not call Bushel Board a live prediction market. V1 is a read-only calibration board that compares Kalshi's market-implied probability against Bushel Board's source-backed thesis signal.

## Product Goal

Show a farmer, in one scan, where Kalshi traders and Bushel Board source logic agree or disagree on major grain direction.

The board should answer:

- What is Kalshi pricing right now?
- What would Bushel Board price as the implied YES probability?
- How wide is the gap?
- Which side has the stronger evidence?
- Is the Kalshi market liquid enough to trust?
- Is the signal Canada-specific, US-specific, or shared?

## Naming

Use:

- `Kalshi Prediction Board` for the section.
- `Bushel Board Implied Line` for our probability.
- `Kalshi YES` or `Kalshi market YES` for the traded market probability.
- `model-implied probability` only when a shorter label is needed.

Do not use:

- `our live prediction market`
- `Bushel Board market`
- `trading signal`
- `bet recommendation`
- `model fine-tuning`
- `training loop`

## V1 Scope

Start with the major Kalshi-compatible grains only:

- Corn
- Soybeans
- Wheat

Keep the broader `/thesis` major-grain table active, but the Kalshi comparison should only render rows where a credible Kalshi commodity market exists or is being watched.

Explicit V1 exclusions:

- No rice.
- No cotton.
- No small-grain expansion.
- No private farmer data.
- No Supabase writes.
- No training candidates.
- No thesis-prompt feedback loop.
- No production trading or advice path.

## Existing Local Foundation

Already built locally in this session:

- Phase 3A: grain-agnostic forecast harness and grain profiles.
- Phase 3B: `/thesis` major-grain matrix for Canada and US major grains.
- Phase 3C: read-only Kalshi commodity calibration layer.

Current Kalshi files:

- `lib/kalshi/commodity-markets.ts`
- `lib/queries/kalshi-commodities.ts`
- `scripts/capture-kalshi-commodity-snapshot.ts`
- `lib/__tests__/kalshi-commodity-markets.test.ts`
- `app/(dashboard)/thesis/page.tsx`

The current Kalshi layer watches public Kalshi commodity series for Corn, Soybeans, and Wheat weekly/monthly markets, normalizes YES probability, spread, liquidity, title/rules, and alignment against the thesis direction.

## Next Build

Add a deterministic Bushel Board Implied Line helper.

The helper should turn existing Bushel Board thesis facts into a comparable YES probability for Kalshi-style contracts without calling an LLM and without using future evidence.

Expected output per grain/market:

```text
grain
market title
Kalshi YES probability
Bushel Board Implied Line
delta
alignment label
confidence
top bull reasons
top bear reasons
Canada/US flag context
liquidity/spread warning
source timestamp
```

## Probability Contract

The first version should be simple and testable. Prefer a conservative deterministic formula over an overfit model.

Recommended shape:

```text
base probability = 50
direction adjustment = stance direction strength
confidence adjustment = confidence moderates the distance from 50
evidence adjustment = strongest matching bull/bear drivers add or subtract small capped points
liquidity note = displayed separately, never blended into Bushel Board probability
final probability = clamped 5 to 95
```

Rules:

- Do not compare raw `stanceScore` directly to Kalshi YES.
- Do not let missing thesis evidence create false precision.
- If the Kalshi contract threshold cannot be parsed, show the row as watched but do not produce a Bushel Board Implied Line.
- If Kalshi returns no active markets, show watched/no-active state. Do not use mock prices.
- Display spread and liquidity as trust warnings, not as proof that Bushel Board is right.

## UI Shape

Keep equal visual weight across commodity cards. No hero card.

Each row/card should show:

- grain label,
- country context flag where useful,
- Kalshi YES,
- Bushel Board Implied Line,
- delta,
- agreement/disagreement badge,
- confidence,
- top bull point,
- top bear point,
- liquidity/spread warning.

The best future upgrade is a compact table or small multiples view, not a marketing-style landing page.

## Gemini Review Target

Use Gemini as adversarial reviewer after implementation.

Ask it to challenge:

- whether the probability formula creates false precision,
- whether the UI wording implies financial advice,
- whether Canada/US grain evidence is being mixed incorrectly,
- whether Kalshi no-active-market states are handled honestly,
- whether any future leakage or training-loop claim slipped in.

Codex keeps final authority.

## Definition Of Done

- `npm run test -- lib/__tests__/kalshi-commodity-markets.test.ts lib/__tests__/thesis-board.test.ts` passes.
- `npm run build` passes.
- UI labels do not call Bushel Board a live market.
- No Supabase write path is added.
- No rice/cotton/small-grain Kalshi expansion is added.
- Gemini blocker review is run or an explicit timeout/non-response is documented.
- Browser proof is captured for `/thesis` if UI structure changes.
