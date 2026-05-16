# Roundtable Thesis + Model Benchmark + Premium Memory Implementation Plan

> **For Hermes/Codex:** Execute in order. Preserve no-write safety where specified. Do not connect unfinished lanes directly to production read paths.

**Goal:** Ship a canonical multi-grain weekly thesis pipeline for Canada + US major grains, add deterministic multi-model benchmarking, and harden premium chat memory so farmer conversations improve over time safely.

**Architecture:** One shared thesis artifact contract. Roundtable agents produce structured evidence-bound outputs, moderator merges, judge freezes. Model benchmark runs against the same frozen input package. Premium chat writes stable user memory with confidence/provenance/supersession rules.

**Tech Stack:** Next.js 16, TypeScript, Supabase (Postgres + RPC + Edge Functions), existing Viking L0/L1/L2 context system, Vitest.

---

## Phase 0 — Contracts and Safety Gates

### Task 0.1: Define canonical thesis artifact schema
**Objective:** Ensure every lane writes/reads the same shape.

**Files:**
- Create: `docs/reference/contracts/thesis-artifact-v1.md`
- Modify: `lib/queries/thesis-board.ts` (type alignment only)
- Test: `lib/__tests__/thesis-artifact-contract.test.ts`

**Steps:**
1. Define required fields: `region`, `market_key`, `crop_year`, `grain_week`, `source_cutoff_at`, `artifact_hash`, `bull_points[]`, `bear_points[]`, `confidence`, `stance_score`, `dissent_notes[]`, `model_metadata`.
2. Add TS contract type in query layer.
3. Add failing test with a fixture missing one required field.
4. Implement validator utility and pass test.

### Task 0.2: Add non-negotiable no-write guard test
**Objective:** Prevent accidental production writes from harness/benchmark lanes.

**Files:**
- Create: `lib/__tests__/pipeline-no-write-guard.test.ts`
- Modify: `scripts/run-canola-forecast-local-workflow.ts` (or shared workflow guard module)

**Steps:**
1. Write failing test asserting local workflow rejects production table writes when `--no-write` is active.
2. Implement explicit allowlist of writable artifact paths/tables.
3. Re-run tests and confirm pass.

---

## Phase 1 — Roundtable Thesis Orchestration

### Task 1.1: Define roundtable role output contract
**Objective:** Make each agent output deterministic JSON.

**Files:**
- Create: `lib/thesis/roundtable/types.ts`
- Create: `docs/reference/contracts/roundtable-role-output-v1.md`
- Test: `lib/__tests__/roundtable-role-output-schema.test.ts`

**Steps:**
1. Define role output fields: `role`, `signals[]`, `bull_claims[]`, `bear_claims[]`, `confidence`, `evidence_refs[]`, `risk_flags[]`.
2. Add schema validator (zod).
3. Add failing schema tests for malformed output.
4. Implement and pass tests.

### Task 1.2: Build role prompt pack generator
**Objective:** Generate role-specific prompts from one canonical evidence package.

**Files:**
- Create: `lib/thesis/roundtable/build-role-prompt-pack.ts`
- Create: `scripts/build-roundtable-prompt-pack.ts`
- Test: `lib/__tests__/roundtable-prompt-pack.test.ts`

**Steps:**
1. Build generator that takes one frozen package and emits 4 role packs.
2. Include Viking context injection path (L0 always, L1 grain/topic inferred).
3. Add test verifying all roles reference identical `artifact_hash` and `source_cutoff_at`.
4. Add test for deterministic hash stability.

### Task 1.3: Implement moderator merge
**Objective:** Merge role outputs into a single thesis draft with dissent preservation.

**Files:**
- Create: `lib/thesis/roundtable/moderator-merge.ts`
- Test: `lib/__tests__/roundtable-moderator-merge.test.ts`

**Steps:**
1. Write failing tests: conflicting claims, duplicate evidence, dissent retention.
2. Implement merge rules:
   - dedupe repeated claims,
   - require evidence refs,
   - preserve minority view in `dissent_notes`.
3. Confirm deterministic output order.

### Task 1.4: Implement judge gate and freeze artifact
**Objective:** Accept/revise/reject + produce immutable frozen output.

**Files:**
- Create: `lib/thesis/roundtable/judge-gate.ts`
- Create: `scripts/freeze-roundtable-thesis.ts`
- Test: `lib/__tests__/roundtable-judge-gate.test.ts`

**Steps:**
1. Add failing tests for reject conditions (missing evidence refs, overclaim language, cutoff violations).
2. Implement gate logic and verdict enum.
3. On accept/revise, generate final `artifact_hash` and immutable timestamp.
4. Verify failed verdicts never enter publish path.

---

## Phase 2 — Multi-Model Benchmark Lane

### Task 2.1: Define benchmark run schema
**Objective:** Standardize apples-to-apples model comparison records.

**Files:**
- Create: `docs/reference/contracts/model-benchmark-run-v1.md`
- Create: `lib/thesis/benchmark/types.ts`
- Test: `lib/__tests__/benchmark-run-schema.test.ts`

**Steps:**
1. Include: `run_id`, `model_id`, `input_artifact_hash`, `output_hash`, `scores`, `review_window`, `status`.
2. Add validator + tests.

### Task 2.2: Implement benchmark executor (no production coupling)
**Objective:** Run N models on same prompt package and persist sidecar outputs only.

**Files:**
- Create: `lib/thesis/benchmark/run-benchmark.ts`
- Create: `scripts/run-thesis-model-benchmark.ts`
- Test: `lib/__tests__/run-thesis-model-benchmark.test.ts`

**Steps:**
1. Use one frozen thesis input package for all models.
2. Save each raw output + parsed contract output.
3. Enforce no-write boundary to production thesis tables.
4. Add deterministic replay mode for CI.

### Task 2.3: Implement scoring rubric
**Objective:** Score direction, evidence, calibration, and overclaim risk.

**Files:**
- Create: `lib/thesis/benchmark/score-benchmark.ts`
- Test: `lib/__tests__/score-benchmark.test.ts`

**Steps:**
1. Add sub-scores: `directional_accuracy`, `evidence_coverage`, `calibration_error`, `overclaim_penalty`.
2. Add weighted final score.
3. Add tests with known expected score cases.

### Task 2.4: Build benchmark report output
**Objective:** Generate weekly comparison summary for human review.

**Files:**
- Create: `scripts/build-thesis-benchmark-report.ts`
- Create: `docs/reference/benchmark-report-template.md`
- Test: `lib/__tests__/benchmark-report.test.ts`

**Steps:**
1. Produce markdown + JSON summary per week/grain.
2. Include top model, failure cases, and recommendation.
3. Ensure output stays review-only until approved.

---

## Phase 3 — Premium Chat Memory Hardening

### Task 3.1: Create memory write policy contract
**Objective:** Only durable, high-confidence facts get stored.

**Files:**
- Create: `docs/reference/contracts/premium-memory-write-policy-v1.md`
- Create: `lib/chat/memory/memory-policy.ts`
- Test: `lib/__tests__/memory-policy.test.ts`

**Steps:**
1. Define classes: `stable_fact`, `preference`, `volatile_signal`.
2. Add threshold rules (confidence + recency + contradiction checks).
3. Test that low-confidence / stale / contradictory facts are rejected.

### Task 3.2: Implement supersession engine for farmer_memory
**Objective:** Replace outdated memory cleanly instead of accumulating conflicts.

**Files:**
- Create: `lib/chat/memory/supersede-memory.ts`
- Modify: memory tool call path in `supabase/functions/chat-completion/index.ts` (or active chat handler)
- Test: `lib/__tests__/supersede-memory.test.ts`

**Steps:**
1. Add key-level supersession rules (`preferred_elevator`, `delivery_preference`, grain-scoped recs).
2. Store provenance metadata (`source_thread_id`, extracted_at).
3. Add tests proving one active canonical value per key/grain.

### Task 3.3: Add weekly memory compression
**Objective:** Distill many turn-level notes into concise durable profile memory.

**Files:**
- Create: `scripts/compress-premium-chat-memory.ts`
- Modify: existing compression pipeline integration points
- Test: `lib/__tests__/compress-premium-chat-memory.test.ts`

**Steps:**
1. Pull recent chat/memory candidates.
2. Keep only durable items; archive volatile chatter.
3. Emit compression summary artifact.
4. Verify no data loss for high-confidence stable facts.

### Task 3.4: Inject memory safely into chat context
**Objective:** Improve continuity without leaking stale/bad facts.

**Files:**
- Modify: `lib/advisor/context-builder.ts`
- Modify: `lib/advisor/system-prompt.ts`
- Test: `lib/advisor/__tests__/context-builder.test.ts`

**Steps:**
1. Add filtered memory section (`stable profile`, `open questions`, `last confirmed preferences`).
2. Exclude unverified volatile entries from primary prompt.
3. Add tests for stale-memory exclusion.

---

## Phase 4 — Viking Knowledge Integration Checks

### Task 4.1: Verify roundtable and benchmark both use Viking consistently
**Objective:** Prevent one lane using stale/legacy knowledge path.

**Files:**
- Modify: `lib/thesis/roundtable/build-role-prompt-pack.ts`
- Modify: `lib/thesis/benchmark/run-benchmark.ts`
- Test: `lib/__tests__/viking-context-injection-consistency.test.ts`

**Steps:**
1. Ensure both lanes call `buildVikingPipelineContext` for thesis generation.
2. Add test asserting L0 always present.
3. Add test asserting inferred L1 topics match grain/intent rules.

### Task 4.2: Knowledge source audit report
**Objective:** Show which Viking topics/sources were used per thesis run.

**Files:**
- Create: `scripts/audit-viking-usage.ts`
- Create: `docs/reference/viking-usage-audit-format.md`

**Steps:**
1. Emit topic list + L2 source paths + token estimate.
2. Attach to thesis artifact metadata for QA traceability.

---

## Phase 5 — Publish and Operations

### Task 5.1: Add feature flags for safe rollout
**Objective:** Controlled launch without breaking current dashboard.

**Files:**
- Modify: env/config loader
- Modify: thesis query read path
- Test: `lib/__tests__/feature-flag-thesis-lane.test.ts`

**Flags:**
- `THESIS_ROUNDTABLE_ENABLED`
- `THESIS_BENCHMARK_ENABLED`
- `PREMIUM_MEMORY_HARDENING_ENABLED`

### Task 5.2: Add operator runbooks
**Objective:** Make weekly operation repeatable by non-coder operators.

**Files:**
- Create: `docs/reference/runbooks/weekly-roundtable-thesis.md`
- Create: `docs/reference/runbooks/model-benchmark-review.md`
- Create: `docs/reference/runbooks/premium-chat-memory-review.md`

**Steps:**
1. Include exact commands, expected outputs, and failure triage.
2. Include “stop-the-line” conditions.

### Task 5.3: Validation checklist before live promotion
**Objective:** Enforce production gate quality.

**Files:**
- Modify: `docs/plans/STATUS.md` (track state update when complete)
- Modify: `docs/lessons-learned/issues.md` for non-obvious defects discovered

**Required checks:**
1. `npm run build`
2. Targeted tests for modified modules
3. No console errors on affected pages
4. Data-audit/security review for DB/RPC changes
5. Proof that no-write lanes remain isolated unless explicitly promoted

---

## Suggested first execution slice (smallest shippable V1)

1. Phase 0 (contracts + no-write gate)
2. Phase 1 Tasks 1.1–1.4 (roundtable end-to-end on one grain, e.g., Canola)
3. Phase 2 Tasks 2.1–2.3 (benchmark scoring core, report later)
4. Phase 3 Tasks 3.1–3.2 (memory policy + supersession)

This yields a working, auditable thesis engine + model eval + safer memory loop without over-scoping.
