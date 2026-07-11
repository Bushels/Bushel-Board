# Wheat Desk Audit — Data Import + Swarm Design (2026-07-11)

**Scope:** (1) Verify the weekly CGC data was fully imported; (2) reassess the CAD grain-desk weekly swarm against the Wheat-first product pivot; (3) apply and document improvements.
**Branch:** `claude/wheat-desk-audit-swarm-c5drpe`

---

## 1. Where the "Wheat desk" change actually lives

The Wheat-first conversion is on branch **`codex/wheat-first-thesis`** (4 commits, 2026-06-16 → 2026-06-17) and is **NOT merged to master** as of this audit:

- `488b558` feat(thesis): make farmer board wheat-first
- `769b528` feat(thesis): elevate wheat country split hero
- `e745a3d` feat(thesis): simplify wheat split hero
- `ba44759` feat(thesis): redesign wheat decision cockpit

Mechanism: `lib/thesis/active-grain-display.ts` introduces `ACTIVE_FARMER_THESIS_GRAIN_LANES = ["Wheat"]`; `/thesis` filters the farmer-facing board to Wheat only. The multi-grain data/model harness stays intact behind `/thesis?audit=1`. **Action item: merge `codex/wheat-first-thesis` to master (or confirm it was deployed from its own branch) — master still renders the all-grain board.**

## 2. Weekly data audit

### 2.1 What could be verified from this session (reference data, weeks 1–36)

`data/CGC Weekly/gsw-shg-en.csv` (2025-2026 crop year) audited programmatically:

| Check | Result |
|---|---|
| Weeks present | 1–36, **no gaps** |
| Total rows / Wheat rows | 148,284 / 21,030 |
| Wheat worksheet coverage | 11/12 worksheets, weeks 1–36 complete (Imported Grains legitimately has no Cdn Wheat rows) |
| Duplicate keys (wk, ws, metric, period, grade, region) | 0 |
| Cumulative series monotonicity (Primary Deliveries, Terminal Receipts/Exports, Process, Producer Cars) | All monotonic; wk35→36 deltas sane (Wheat: +521.7 Kt deliveries, +444.4 Kt terminal exports) |
| Week-36 Wheat CY totals | Deliveries 17,754.1 Kt · Terminal Receipts 17,467.9 Kt · Terminal Exports 14,876.5 Kt |

### 2.2 What could NOT be verified from this session — and why that matters

Today is **2026-07-11 → current CGC grain week ≈ 48–49**. The repo reference CSV ends at **week 36** (2026-04-12). Whether Supabase has weeks 37–48 could not be checked from this cloud session:

- The session's Supabase MCP account does not include project `ibgsloyjxdopkvwqcqwh`.
- The environment network policy 403-blocks `*.supabase.co` and `grainscanada.gc.ca`.

**Red flag from repo history:** STATUS.md (2026-06-09) records that the Friday desks silently stopped writing after 2026-04-25 — `market_analysis` last wrote **week 36**. Re-enabling the `grain-desk-weekly` / `us-desk-weekly` Claude Desktop Routines was a pending manual action. The reference CSV also stops at week 36. If the collector Routines (`collect-cgc` etc.) suffered the same fate as the desk Routines, weeks 37–48 may genuinely be missing in Supabase, not just in the repo snapshot.

### 2.3 How to complete the live audit (run where Supabase is reachable)

Fastest: `npm run check:desk-freshness` and `npx tsx scripts/audit-grain-desk-weekly.ts --since=2026-04-25` (needs `.env.local`).

Direct SQL (Supabase MCP or SQL editor):

```sql
-- 1. Is CGC current? (expect grain_week ≈ 48, imported within 8 days)
SELECT * FROM v_latest_import;
SELECT crop_year, grain_week, imported_at, status FROM cgc_imports ORDER BY imported_at DESC LIMIT 6;

-- 2. Week coverage — find missing weeks 1..48 for 2025-2026
SELECT gs.wk AS missing_week
FROM generate_series(1, (SELECT MAX(grain_week) FROM cgc_observations WHERE crop_year='2025-2026')) AS gs(wk)
LEFT JOIN (SELECT DISTINCT grain_week FROM cgc_observations WHERE crop_year='2025-2026') o ON o.grain_week = gs.wk
WHERE o.grain_week IS NULL;

-- 3. Wheat rows per week for the tail (watch for thin weeks)
SELECT grain_week, COUNT(*) FROM cgc_observations
WHERE crop_year='2025-2026' AND grain='Wheat' AND grain_week > 36
GROUP BY grain_week ORDER BY grain_week;

-- 4. Did the desk resume? (expect weekly rows after 2026-06-12 if Routines were re-enabled)
SELECT grain, grain_week, model_used, generated_at FROM market_analysis ORDER BY generated_at DESC LIMIT 8;
SELECT market_name, market_year, generated_at FROM us_market_analysis ORDER BY generated_at DESC LIMIT 5;

-- 5. Collector spine freshness
SELECT source_name, status, source_date, completed_at FROM source_runs ORDER BY completed_at DESC LIMIT 20;
SELECT lane, item_slug, refreshed_at FROM thesis_packet_cache ORDER BY refreshed_at DESC LIMIT 12;
SELECT commodity, report_date, imported_at FROM cftc_cot_positions ORDER BY imported_at DESC LIMIT 4;
SELECT MAX(price_date) FROM grain_prices;
SELECT MAX(week_ending) FROM usda_export_sales;

-- 6. Desk failure forensics (fail-loud rows — see §3.1 for why these may be absent even on failure)
SELECT crop_year, grain_week, status, triggered_by, failure_details, started_at
FROM pipeline_runs ORDER BY started_at DESC LIMIT 10;
```

If weeks 37–48 are missing: run the Codex weekly importer (`scripts/import-cgc-weekly-codex.mjs`) / `npm run collect:*` wrappers to backfill, then `npm run refresh-thesis-cache`, then re-run the checks above.

## 3. Swarm audit findings

### 3.1 Schema-correctness bugs (verified against migrations; FIXED in this branch)

1. **`pipeline_runs.grains_requested` NOT NULL trap (critical).** `grains_requested text[]` is NOT NULL with no default (`20260418100300_parallel_pipeline.sql`), and **every** `pipeline_runs` INSERT in both desk prompts omitted it → every insert dies, including the fail-loud failure rows added in the 2026-06-09 outage repair. The repair could not actually log failures — the zero-trace silent-death mode it was built to prevent was still live. All 8 INSERTs (4 CAD + 4 US) now supply the grain/market array.
2. **US prompt NULL traps (critical).** All four US inserts passed `NULL` for NOT NULL `crop_year`/`grain_week`; the Step 0.3 failure insert also passed 6 values for a 5-column list (orphan `'claude-agent-us-desk'` literal). Fixed: values resolved from `cgc_observations`, orphan value removed.
3. **CAD Step 5.4 success row used nonexistent columns (critical).** `INSERT INTO pipeline_runs (..., source, metadata)` — neither column exists. The success-path completion log has silently failed since the prompt was written. Fixed to real columns; run identity now travels in `failure_details->>'routine'`.
4. **Meta-reviewers queried nonexistent columns (important).** `desk-meta-reviewer.md` + `us-desk-meta-reviewer.md` selected `market_analysis.metadata` (real column: `llm_metadata`) and filtered `pipeline_runs.source` (no such column). Fixed.

### 3.2 Design findings (Ultracode review swarm — 5 lenses, adversarially verified)

_See §4 for the changes applied from these findings._

The Ultracode review swarm (5 lenses — wheat-alignment, data-coverage, reliability, reasoning-quality, efficiency — each finding adversarially verified against the repo) surfaced, beyond §3.1:

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| F1 | No wheat-first awareness: Wheat budgeted identically to Barley/Corn (1 of 5 MAJOR grains) while it is the only farmer-visible read | important | FIXED — FLAGSHIP tier |
| F2 | Friday desk order backwards: CAD desk (6:47 PM) authored the wheat read 43 min BEFORE the US desk (7:30 PM) produced the directional anchor R-CA-WHT-01 requires; no CAD agent consumed `us_market_analysis` at all | critical | FIXED — order swapped in docs; cross-read wired; **Routine re-registration = operator action** |
| F3 | `sk_cash_prices` (admitted 2026-06-10) unwired: CWRS had no cash tape for Rule 12; stale "Spring Wheat not available" claims (MGEX Spring Wheat exists via Barchart fallback) | important | FIXED — basis-scout §6 + corrected claims |
| F4 | `statcan_wds_raw` farm stocks + seeded area unwired: CGC visible stocks are commercial-only; on-farm wheat stocks invisible | important | FIXED — supply-scout §7 (R-CA-WHT-06) |
| F5 | `canada_crop_progress` (SK Spring Cereals → Wheat development timing) read by no scout at peak growing season | important | FIXED — supply-scout §8 new-crop lens |
| F6 | sentiment-scout fed from dead lanes: farmer voting paused 2026-04-28 but still listed live; `v_signal_relevance_scores` is a retired V1 view CLAUDE.md says V2 must not read; unaware of the Step 0.3.5 x_signal_bundle | important | FIXED — lanes marked dead/paused; bundle precedence documented |
| F7 | price-analyst's direct SQL used 5 nonexistent columns (`settlement_date`, `contract_month`, `settle_price_cad`, `pct_change_1w/4w`) — the price second-opinion silently degraded weekly | important | FIXED — real columns from migration `20260318120000` |
| F8 | Wheat-class blindness: per-grade CGC rows exist but every scout summed classes away — the same gap that keeps Spring/Winter Wheat thesis rows parked | important | FIXED — class lens (chief FLAGSHIP extra + logistics-scout §6 + R-CA-WHT-05) |
| F9 | Saturday meta-reviewer couldn't detect a MISSED Friday run and its `MAX(grain_week)` anchor breaks after Aug 1 crop-year rollover | critical | FIXED — recency anchor + missed-run detection |
| F10 | Chief death mid-run left zero trace (no 'running' row, no per-grain ledger, no wheat-first write order) | important | FIXED — Phase 0.5 run ledger + FLAGSHIP-first writes |
| F11 | Stale-source abort killed the whole desk (the April outage's proximate cause); SLAs treated prices/COT as core | important | FIXED — abort only on stale CGC; COT/prices degrade with confidence caps + `status='partial'` trace |
| F12 | Error-handling table let flagship Wheat fail silently ("skip, retain previous score"); no X-bundle failure row | important | FIXED — FLAGSHIP never skips silently; retry + partial ledger row |
| F13 | Cron timezone mislabeled (headers said ET; Routine crons fire scheduler-local MT per collector-task-configs) | minor | FIXED — MT labels with derived ET |
| F14 | `check:desk-freshness` wired to nothing scheduled — desk can still die silently | critical | DOCUMENTED — proposed Saturday `desk-output-watchdog` (operator must register; must page, not just log) |
| F15 | Desk output never reaches the /thesis wheat cockpit in structured form | important | FIXED — `llm_metadata.wheat_cockpit` handoff contract |
| F16 | `get_supply_disposition_context` RPC exists in no repo migration (may be live-only) | important | MITIGATED — fallback to `v_supply_pipeline` + `aafc_rpc_missing` flag; verify live |

Verification note: adversarial verifiers ran against the working tree after fixes were applied; verdicts returned "already handled by the 2026-07-11 changes," independently confirming each fix addresses its finding. Efficiency-lens conclusion retained: full 16-grain coverage stays (market_analysis rows feed grain detail, My Farm, and advisor context) — the correct rebalance was tier depth, not scope cuts.

## 4. Improvements applied

All on branch `claude/wheat-desk-audit-swarm-c5drpe`:

**Schema-correctness (both desks):**
- `docs/reference/grain-desk-swarm-prompt.md` — all pipeline_runs SQL rewritten schema-legal; Phase 0.5 `status='running'` run ledger (RETURNING id) with UPDATE-on-close; crop-year-filtered `MAX(grain_week)`; Step 5.4 real columns.
- `docs/reference/us-desk-swarm-prompt.md` — 4 INSERTs fixed (NULL crop_year/grain_week, missing grains_requested, orphan 6th value); timezone labels; schedule swap.
- `.claude/agents/desk-meta-reviewer.md` + `us-desk-meta-reviewer.md` — `metadata`→`llm_metadata`, `pipeline_runs.source`→`failure_details->>'routine'`, recency-anchored audit query, missed-run detection, Wheat Pass-0 + `wheat_accuracy` scorecard line.

**Wheat-first refit:**
- FLAGSHIP effort tier (Wheat only): mandatory weekly Phase 4.5 deep pass, 4–6 reasoning items, L2 budget 6 chunks/4 queries, min confidence floor 45, never demotable, writes FIRST in Step 5.2.
- US desk cross-read (`us_desk_cross_read`) operationalizing R-CA-WHT-01 + cross-desk >30-pt divergence trigger in Phase 4.5; Friday desk ORDER SWAPPED (US 6:47 PM MT → CAD 7:45 PM MT).
- Wheat-class lens: SQL grade-family aggregation (CWRS/CWAD/CPS/Winter) in chief FLAGSHIP extras + logistics-scout; new R-CA-WHT-05.
- `llm_metadata.wheat_cockpit` handoff block ({what_changed, watch_next, class_mix_note}) for the /thesis Wheat-first surface.
- Wheat grain card upgraded: FLAGSHIP header, R-CA-WHT-05/06/07, corrected futures-tape fingerprint, new thesis-killer (prairie new-crop condition swing), SK-cash tiebreaker.
- All 4 specialists: "Wheat = FLAGSHIP" section (cross-read required, deeper evidence, class + cash-tape awareness).

**Data coverage:**
- basis-scout: `sk_cash_prices` source (CWRS cash tape; `basis_proxy` labeling); corrected MGEX/Barchart availability; `price_date` freshness columns.
- supply-scout: `statcan_wds_raw` farm stocks + seeded area (status_code≠0 = missing, never zero); `canada_crop_progress` new-crop lens (May–Oct, low-confidence context); AAFC RPC caveat + `v_supply_pipeline` fallback.
- sentiment-scout: farmer-voting lanes marked PAUSED; `v_signal_relevance_scores` marked retired; x_signal_bundle precedence.
- price-analyst: SQL rewritten to real `grain_prices`/`v_latest_grain_prices` columns.

**Reliability:**
- Freshness guardrail: abort only on stale CGC; COT/price breaches degrade (confidence caps 60/55, ±15 stance limiter, `degraded_sources` trace, `status='partial'` close).
- Error-handling table: FLAGSHIP never skips silently (retry, then `grains_failed=['Wheat']` partial row); X-bundle failure row.
- Proposed Saturday `desk-output-watchdog` (`npm run check:desk-freshness`) documented in `collector-task-configs.md` — **operator must register it and wire paging**.

**Docs:** CLAUDE.md (V2 section: 4 specialists, FLAGSHIP, swapped schedule, pipeline_runs traps, statcan/sk-cash tables + monitoring queries), STATUS.md track entry, issues.md lessons-learned entry, this audit report.

## 5. Follow-ups for the operator (Kyle)

1. **Run the live data audit** (§2.3) from a Supabase-connected session; backfill weeks 37–48 if missing.
2. **Confirm the Friday Routines are firing** — if `market_analysis` is still parked at week 36, re-create `grain-desk-weekly` + `us-desk-weekly` from the updated prompt docs.
3. **Merge `codex/wheat-first-thesis`** (or rebase it) so master matches the shipped Wheat-first surface.
4. For this cloud environment: keep the loosened network policy (or add `supabase.co` + `grainscanada.gc.ca` to the allowlist) so future sessions can audit data directly.
