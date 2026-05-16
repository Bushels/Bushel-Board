# Multi-Grain Weekly Thesis Harness Handoff

**Created:** 2026-05-10 MT
**Status:** background reference; product focus narrowed 2026-05-16 to the Bullish/Bearish major-grains board (`docs/plans/2026-05-16-bullish-bearish-major-grains-next-session.md`)
**Prior foundation:** Canola forecast/replay harness, CGC point-in-time snapshot capture, Codex weekly automations

## Direct Answer

Build one shared weekly thesis engine, not sixteen separate systems.

The shared engine should collect admissible point-in-time evidence, freeze clocks and hashes, prevent future leakage, package thesis inputs, and score next-week reviews. Each grain should then add a profile that defines which indicators matter, which signals are weak, and which market caveats must be enforced.

## Architecture

```text
Shared base harness
  point-in-time source pulls
  evidence admission rules
  source cutoff and hash proof
  no-future-leakage checks
  deterministic package output
        |
        v
Grain profile
  grain name and slug
  relevant source lanes
  futures or no-futures context
  price/basis/logistics/export rules
  thin-market caveats
        |
        v
Per-grain LLM thesis run
  bull case
  bear case
  confidence
  what would change the call
        |
        v
Gemini challenge pass
  missing evidence
  weak assumptions
  alternate interpretation
        |
        v
Codex final judge
  accept, revise, or reject
  freeze official thesis
        |
        v
Next-week reveal and review
  score thesis
  identify missed signals
  mark training candidate or review-only
```

## Canonical Grain Scope

Start with the 16 dashboard grains, not every CGC label:

- Wheat
- Amber Durum
- Canola
- Barley
- Oats
- Peas
- Lentils
- Flaxseed
- Soybeans
- Corn
- Rye
- Mustard Seed
- Canaryseed
- Chick Peas
- Sunflower
- Beans

CGC origin variants such as `U.S. Wheat`, `U.S. Canola`, or `Canadian and Imported Origin Corn` may be evidence inputs, but they are not first-class thesis lanes for v1.

## Weekly Cadence

```text
Sunday or Monday
  Create early-week working thesis from last available public data.

Tuesday to Thursday
  Add timestamped update notes as new evidence arrives.
  Do not overwrite the original working read.

Thursday
  Capture point-in-time CGC snapshot.
  Run CGC importer after the snapshot.

Friday after CFTC COT release
  Build official frozen weekly thesis.
  Ask Gemini to challenge the thesis.
  Codex finalizes the frozen call.

Following week
  Reveal next-week evidence.
  Score thesis quality.
  Mark clean examples as training candidates only after review.
```

## Codex And Gemini Roles

- Codex owns source truth, code, guardrails, final judgment, and the frozen artifact.
- Gemini is an adversarial reviewer, not the source of truth.
- Gemini should look for missing context, bad assumptions, future leakage, and alternative interpretations.
- Codex decides whether to accept or reject Gemini objections.
- A missing or timed-out Gemini response is not release proof.

## Phase 3A Minimal Task

Inspect the existing Canola-only harness and design the smallest safe refactor into a grain-agnostic engine plus grain profiles.

Do not start by cloning Canola files sixteen times. That would create maintenance debt immediately.

Expected Phase 3A output:

- shared grain profile type,
- canonical 16-grain profile seed,
- Canola moved onto the shared profile path,
- no-write local workflow preserved,
- no production/dashboard/Supabase writes,
- tests proving Canola still rebuilds,
- one additional grain fixture proving the generic path is real.

## Lessons Carried Forward

- A forecast is not training data.
- A historical replay package is not forward market-skill proof.
- Annual CGC history is revision-tainted unless a point-in-time snapshot proves what existed then.
- Every frozen thesis needs a source cutoff, created timestamp, model cutoff, and package hash.
- Midweek updates must be additive notes, not overwrites.
- Price scoring is useful but optional; thesis review against public next-week evidence is the primary learning loop.
- Minor grains need thinner-market caveats and may be review-only more often than major grains.
- Grain-specific logic belongs in configuration, not in sixteen forked harnesses.

## Non-Goals

- No model training in Phase 3A.
- No sidecar writer.
- No production dashboard integration.
- No private farmer/operator/chat data.
- No Hermes automation.
- No claim that the model is predictive until reviewed examples accumulate.

