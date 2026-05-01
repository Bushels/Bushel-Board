# Bushel Board Target-State Implementation Checklist

**Date:** 2026-04-20
**Status:** Working checklist
**Depends on:** `docs/plans/2026-04-20-target-state-board-workflow-spec.md`
**Purpose:** Compare the target-state board workflow to the current repo and turn the gap into an executable checklist.

---

## Legend

- **Present**: exists and is mostly aligned
- **Partial**: exists, but incomplete
- **Missing**: target-state capability does not exist yet
- **Miswired**: exists, but the live path points at the wrong thing

---

## 1. Current-State Punch List

| Area | Target state | Current repo status | Status | Evidence | Next move |
| --- | --- | --- | --- | --- | --- |
| Canada core source: CGC | Scheduled collector writes canonical weekly grain data | `import-cgc-weekly` exists and `/api/pipeline/run` can trigger it | Present | `supabase/functions/import-cgc-weekly`, `app/api/pipeline/run/route.ts` | Keep as core Canada collector |
| Canada core source: Grain Monitor | Scheduled collector writes terminal/logistics data | Table exists, but repo-owned collector path is not clearly on the live path | Partial | `grain_monitor_snapshots` table exists; no obvious repo collector surfaced in current scan | Decide whether Claude Desktop routine or repo function is source of truth |
| Canada core source: Producer cars | Scheduled collector writes railcar allocations | Import function exists | Present | `supabase/functions/import-producer-cars` | Keep, add unified run logging |
| Canada core source: Grain traders / price quotes | Scheduled pricing collector lands futures and/or local pricing context | `grain_prices`, `posted_prices`, and price scripts exist, but scheduling / ownership is split | Partial | `grain_prices`, `posted_prices`, `scripts/import-grain-prices.ts` | Decide which price feeds are collector-owned vs operator-owned |
| US sources lane | Separate US evidence + publish lane | US storage tables exist | Partial | `us_market_analysis`, `us_score_trajectory`, USDA tables | Finish collector/publish wiring and keep separate from Canada |
| Unified collector run logging | Every source run writes one normalized status row | Only source-specific or ad hoc logging exists today | Missing | `cgc_imports` exists, but no unified `source_runs` table | Add `source_runs` |
| Freshness / validation layer | Cross-source freshness is unified and auditable | Freshness exists in pockets: `cgc_imports`, `validation_reports`, `health_checks`, helper queries | Partial | `lib/queries/data-freshness.ts`, `validation_reports`, `health_checks` | Unify around collector-level metadata |
| Normalized evidence layer | Raw tables feed views/RPCs for canonical math | Strong and mostly present for Canada | Present | `v_country_producer_deliveries`, `v_grain_yoy_comparison`, RPC inventory | Protect and keep formulas centralized |
| Draft nowcasts | Midweek updates write to draft-only analysis storage | No clear draft table or publish-state separation | Missing | no `analysis_drafts` / `market_analysis_drafts` found | Add draft tables before expanding intraday analysis |
| Friday Canada desk | Friday desk publishes the official Canada stance | Docs and agents exist, but live orchestrator still enqueues `analyze-grain-market` | Miswired | `docs/plans/2026-04-15-claude-agent-desk-design.md`, `app/api/pipeline/run/route.ts` | Move publish authority to desk flow |
| Friday US desk | Friday desk publishes official US stance | US tables and agent files exist, but full publish chain is not yet the obvious live path | Partial | `.claude/agents/us-*`, `us_market_analysis` | Finish US desk wiring after Canada contract is stable |
| Debate model | Grok challenges, Claude resolves, one final writer publishes | Design intent exists, but repo still shows Grok-led `analyze-grain-market` on the live path | Miswired | `analyze-grain-market`, Claude desk design docs | Make Grok challenger-only, Claude final publisher |
| Published thesis contract | One canonical published row can drive the whole board | `market_analysis` exists, but live analyzer does not fully satisfy the row contract | Partial | `market_analysis` table, missing live `bull_reasoning` writes | Enforce full publish contract on writer |
| Bull/bear structured reasoning | Published rows include `bull_reasoning` / `bear_reasoning` | Columns exist, UI expects them, live analyzer path does not fully populate them | Miswired | `20260415_add_bull_bear_reasoning.sql`, `analyze-grain-market` audit | Fix writer contract |
| Legacy thesis cache | Legacy narrative cache is optional, not canonical | `grain_intelligence` is still queried by grain page | Partial | `lib/queries/intelligence.ts`, grain page | Migrate UI toward published-table-first reads |
| Product read rule: dashboard | Board reads published rows by default | Grain page has mixed reads; bridge fix now falls back to `market_analysis` hero | Partial | `app/(dashboard)/grain/[slug]/page.tsx` | Finish removing mixed-table dependency |
| Product read rule: Bushy | Chat answers from published thesis + evidence | Chat has trust/freshness scaffolding, but publish-vs-draft separation is not yet explicit | Partial | `supabase/functions/_shared/chat-context-builder.ts` | Teach chat to label draft vs published |
| Product read rule: farm summaries | Weekly summaries should anchor to published weekly thesis | Current farm summary pipeline is its own AI lane, not clearly anchored to publish-state | Partial | `supabase/functions/generate-farm-summary` | Make summaries consume published anchor |
| Run metadata | Analysis runs distinguish collector / draft / weekly publish | `pipeline_runs` exists, but only for pipeline orchestration | Partial | `20260418100300_parallel_pipeline.sql` | Extend or pair with run-type metadata |
| Prediction history | Weekly published stances are tracked over time | `score_trajectory` and `us_score_trajectory` exist | Present | score trajectory tables and helpers | Keep, but anchor to published rows only |
| Health checks | Site health validates the actual live publish system | Health system exists but still carries legacy assumptions | Partial | `validate-site-health` audit | Retarget checks to target-state publish flow |

---

## 2. Execution Order

This is the recommended order to close the gap without blowing up scope.

### Phase 1: Canada published-truth lane

- [x] Write target-state workflow spec
- [x] Add repo-grounded implementation checklist
- [x] Bridge the grain hero so it can fall back to `market_analysis`
- [ ] Decide the canonical Canada publisher
- [ ] Make `market_analysis` the published-only Canada truth table
- [ ] Stop relying on `grain_intelligence` for any user-critical render path

### Phase 2: Unified collector observability

- [ ] Add `source_runs` table
- [ ] Standardize `source_name`, `desk`, `status`, `attempted_week`, `effective_week`
- [ ] Log CGC collector runs into `source_runs`
- [ ] Log producer cars collector runs into `source_runs`
- [ ] Log Grain Monitor collector runs into `source_runs`
- [ ] Log price / trader collectors into `source_runs`

### Phase 3: Draft vs published separation

- [ ] Add `analysis_drafts` or desk-specific draft tables
- [ ] Add `publish_state` and `run_type` conventions
- [ ] Ensure midweek nowcasts write only to draft storage
- [ ] Ensure Friday publish writes only to canonical publish tables

### Phase 4: Canada desk publish contract

- [ ] Pick one final Canada publisher
- [ ] Make Grok challenger-only for Canada desk
- [ ] Make Claude desk chief final publisher
- [ ] Enforce full publish contract:
  - `stance_score`
  - `confidence_score`
  - `initial_thesis`
  - `bull_case`
  - `bear_case`
  - `bull_reasoning`
  - `bear_reasoning`
  - `final_assessment`
  - `key_signals`
  - `data_freshness`
- [ ] Block or downgrade publish rows that fail the contract

### Phase 5: Product consumption cleanup

- [ ] Grain page reads published thesis first
- [ ] Overview reads published thesis only
- [ ] Bushy distinguishes published stance vs fresher draft evidence
- [ ] Farm summaries consume the published weekly anchor

### Phase 6: US lane

- [ ] Verify US collectors are repo-controlled and observable
- [ ] Keep `us_market_analysis` as published-only truth
- [ ] Keep `us_score_trajectory` anchored to published runs
- [ ] Mirror Canada rules without mixing markets

### Phase 7: Desk scoring

- [ ] Compare published stance to subsequent price action
- [ ] Track forecast quality in trajectory / scorecard layer
- [ ] Tune desk prompts and debate rules without rewriting history

---

## 3. First Code Moves

These are the highest-value, lowest-regret next moves.

1. **Add `source_runs`**
   This gives every collector one normalized status contract.

2. **Add draft tables**
   This prevents midweek nowcasts from contaminating Friday publish truth.

3. **Enforce the Canada publish contract on the live writer**
   Right now the writer/UI contract is still weaker than the target-state spec.

4. **Move grain detail fully onto published thesis**
   The hero bridge fix is in. The next step is removing hard dependency on legacy `grain_intelligence`.

---

## 4. Agent / Routine Guidance

Use this split unless there is a strong reason not to.

### Use deterministic triggers for:

- stable scheduled source collection
- CSV/XLSX parsing
- raw-table upserts
- freshness logging
- validation

### Use agents for:

- extracting meaning from semi-structured sources
- writing draft nowcasts
- Friday desk synthesis
- Grok/Claude debate
- anomaly explanation

### Rule of thumb

If the task is:

- **"fetch the report and parse rows"** -> trigger / function first
- **"what does this mean for price and stance"** -> agent

That keeps collection deterministic and keeps AI where it actually adds value.

---

## 5. Existing Agent Coverage

The repo already has most of the Friday desk roles:

- Canada scouts: `supply-scout`, `demand-scout`, `basis-scout`, `sentiment-scout`, `logistics-scout`, `macro-scout`
- Canada specialists: `export-analyst`, `domestic-analyst`, `risk-analyst`, `price-analyst`
- Canada review: `desk-meta-reviewer`
- US lane: `us-*` scouts and specialists are already present in `.claude/agents`

### What is still missing in practice

Not more Friday analysts. The bigger gap is **collector discipline**:

- CGC collector ownership is clear
- producer-car collector exists
- Grain Monitor collector ownership is not yet as clear in the repo
- price / trader collector ownership is still split
- unified collector logging is missing

### Recommendation

Do **not** add a pile of new analysis agents right now.

Instead:

1. tighten the existing desk agents
2. add or standardize collector routines
3. make the publish contract real

That is the highest-return path.
