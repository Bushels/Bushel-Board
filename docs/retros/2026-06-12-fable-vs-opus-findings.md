# Fable-vs-Opus Retro — Findings & Actions (2026-06-12)

Source material: [thread digest](2026-06-12-fable-vs-opus-thread-digest.md). Two independent assessments — a 19-agent adversarial Workflow (5 lenses → consolidate → per-finding verification → synthesis) and a Codex xhigh pass that re-read the changed files — converged.

## Verdict (both, inferential — no A/B counterfactual)
No provable Fable-specific edge over Opus 4.8. Of 12 candidate excellences, **3 survived adversarial verification as genuinely differentiated**; the rest were strong execution that this project's own scaffolding (skills, charters, debate rules, tool-use guidance) pointed straight at. The signature was a *disposition* — fix causes not symptoms, review own output adversarially, refuse to fabricate. Leverage move: **encode the disposition so it no longer depends on the model in the seat.**

## The 3 differentiated excellences (+ mechanism)
1. **Root-caused bugs at the layer where the invariant lives** — `Invalid supabaseUrl` points at the URL value; the fix was the shared env loader (every sibling script benefits). Mechanism: *fix the model of the data, not the assertion.*
2. **Refused to fabricate an opaque figure** — split "track reserves" into importable-and-scorable (StatsCan/NASS → bounded ±5) vs opaque-and-fabricatable (China → never scored), and declined to invent a China number.
3. **Adversarial self-review of its own spec that changed substance** — turned unfalsifiable thresholds into testable predicates; caught a UNIQUE constraint contradicting the append-and-read-latest pattern → non-unique index.

## Converged weaknesses
1. Recovery fixes left uncommitted while spec docs were committed (a clean checkout would lose them).
2. Wandering stance numbers (CA +10→+25→+18→+15; US +12→+20→+30→+20); the +10→+25 jump was anchoring to a reframing request *before* evidence.
3. Uneven source skepticism — CGC re-verified rigorously, soft web/Grok figures carried into prose with thin hedging.

## Actions taken this session
| Priority | Item | Status | Where |
|---|---|---|---|
| P0 | Commit recovery fixes (separate `fix(...)`), exempt from commit-when-asked | ✅ done | `ef12698`, `a44bc91` |
| P0 | Handle regenerated CSV (don't mix with code) | ✅ discarded (derived re-download; gitignore blocked by a no-guard artifact test) | — |
| P0 | Week-continuity import gate (exit 1 + `MISSING_WEEK_INCIDENT`) | ✅ done | `470dd40` |
| P0 | Stance-Change Ledger + reconciliation table | ✅ Rules 20-21 | `470dd40` |

## Deferred (recommended next)
- **P1** Debugging Standards in CLAUDE.md (no hand-rolled `.env` parsing; fix-at-the-invariant-layer; model absent fields as typed `\| null`).
- **P1** Source-admission ladder + inline provenance tags (`[DB]`/`[OFF]`/`[WEB]`/`[SENT]`) with a CI fixture asserting an opaque source contributes zero score.
- **P1** Spec self-review gate in `writing-plans` (adjective-threshold grep; index-vs-read-pattern justification; tag asserted magnitudes `UNVALIDATED` unless a fixture ships).
- **P1** V2 golden-packet test (`pipeline_drain +8`, `divergence_timing −5`, `quality_premium_watch +3`) — currently asserted in the spec but not executable.
- **P2** Extract a small Canola weeks-1-3 CSV fixture so the live `gsw-shg-en.csv` can finally be gitignored; derived-scan ordering guard; grain-monitor pre-commit gate; infographic render-back QC.
