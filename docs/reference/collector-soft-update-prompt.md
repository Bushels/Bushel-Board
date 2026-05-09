# Collector Soft-Update Prompt — Opus Weekday Thesis Review

> **Purpose:** Reusable prompt the weekday collector routines give to their Opus agent, *after* the mechanical data importer has refreshed Supabase. Opus reads the fresh data, compares it to the current thesis, and appends a bounded soft-review tick to the trajectory tape so the bull/bear thesis accumulates weekday signal ahead of Friday's hard swarm.
>
> **Not a swarm.** This is a single-pass solo Opus review per collector. No scouts, no specialists. The Friday swarm remains the authoritative thesis writer.

---

## Two-Phase Collector Contract

Every weekday collector runs in two phases:

| Phase | What | Writer | scan_type |
|-------|------|--------|-----------|
| 1. Mechanical | Data pull + canonical upsert + heartbeat tick | Python importer | `collector_*` |
| 2. Reasoning | Thesis soft update | Opus routine agent | `opus_review_*` |

Phase 1 proves the data landed. Phase 2 reflects how that data nudged the thesis. If phase 2 fails or Opus decides no change is warranted, phase 1's heartbeat tick still preserves the trail.

**Friday hard review (`weekly_debate` scan_type) is the reset.** Soft updates accumulate drift from the Friday anchor; Friday's swarm rewrites `us_market_analysis` / `market_analysis` with authority and resets the accumulation.

---

## Bounds — Non-Negotiable

Per soft review, per market:

| Dimension | Allowed delta | Rationale |
|-----------|---------------|-----------|
| `stance_score` | `-5 … +5` | Any move larger than this is a regime change; demote to Friday swarm |
| `confidence_score` (→ `conviction_pct`) | `-10 … +10` | Confidence can swing more than stance on a single data print |

`scripts/write-collector-soft-update.py` enforces these. If Opus wants a larger move, it must instead emit `stance_delta = 0` with reasoning `"Signal warrants Friday regime-change review, deferring"` and note the concern in `--new-bullet-suggested` for Friday to weigh.

---

## Inputs Opus Reads (Phase 2)

Before deciding any delta, Opus reads:

1. **Mechanical importer JSON output** (from phase 1 stdout). Contains `trajectory.sample_rows` with severity + signal note per market.
2. **Current `us_market_analysis` row** per affected market — `bull_case`, `bear_case`, `stance_score`, `confidence_score`, `final_assessment`, `key_signals`.
3. **Prior 7 days of `us_score_trajectory`** per market — what has already moved this week. Query:
   ```sql
   SELECT recorded_at, scan_type, stance_score, evidence
   FROM us_score_trajectory
   WHERE market_name = :market
     AND recorded_at > now() - interval '7 days'
   ORDER BY recorded_at DESC
   LIMIT 10;
   ```
4. *(Optional)* **Anthropic native `web_search`** for breaking news that might flip interpretation. Keep ≤ 2 searches per run to stay cheap.

---

## Decision Framework

For each market with fresh data, Opus answers four questions:

1. **Does the new data confirm, contradict, or strengthen the current thesis?**
   - Confirm → small positive confidence nudge, stance unchanged
   - Contradict → confidence down, stance nudged toward contrary view
   - Strengthen → stance nudged further in current direction

2. **Is any bull or bear bullet directly affected?**
   - `bull_case_impact` and `bear_case_impact` in `{strengthened, weakened, unchanged}`
   - If a bullet is contradicted, note it so Friday can consider rewording

3. **Is there a new bullet the thesis should add?**
   - If yes, pass via `--new-bullet-suggested`. Friday swarm treats these as candidate key signals.

4. **What's the appropriate delta magnitude?**
   - `severity=critical` → up to `±5` stance, up to `±10` confidence
   - `severity=elevated` → up to `±3` stance, up to `±5` confidence
   - `severity=normal` → `0` to `±1` stance, `0` to `±3` confidence
   - `severity=unknown` → `0, 0`

Opus should err toward smaller deltas. The trajectory should breathe, not swing.

---

## Invocation Pattern (one call per affected market)

```bash
python scripts/write-collector-soft-update.py \
  --side us \
  --market "Wheat" \
  --scan-type opus_review_crop_progress \
  --trigger "USDA Crop Progress - Opus soft review" \
  --stance-delta -2 \
  --confidence-delta -5 \
  --severity critical \
  --signal-note "G/E 30% -- supply-scare territory" \
  --reasoning "Winter wheat G/E crashed 15 pts YoY and 4 pts WoW to 30%. This strengthens the supply-tightening bull case and weakens the 'US wheat crop on pace' bear bullet. Confidence drops because the regime may be shifting faster than the Friday thesis priced in." \
  --bull-case-impact strengthened \
  --bear-case-impact weakened \
  --new-bullet-suggested "Winter wheat G/E 30% is the lowest April reading in 5 years; revise supply-scare probability" \
  --source-week-ending 2026-04-19
```

Valid `--scan-type` values for US side:

- `opus_review_crop_progress`
- `opus_review_grain_monitor`
- `opus_review_export_sales`
- `opus_review_cgc`
- `opus_review_cftc_cot`
- `opus_review_wasde`

Valid `--scan-type` values for CAD side (`--side cad`):

- `opus_review_grain_monitor`
- `opus_review_cgc`
- `opus_review_cftc_cot`

CAD side was enabled 2026-04-21 by the `extend_score_trajectory_scan_type_opus_review` migration.

---

## Routine Prompt Template (drop into each weekday routine)

```
You are the Opus soft-reviewer for the <COLLECTOR_NAME> routine. Data import
has just finished. Your job is to emit a bounded soft update to the US bull/
bear thesis so it accumulates through the week ahead of the Friday hard swarm.

Follow docs/reference/collector-soft-update-prompt.md exactly. Specifically:

1. Parse the JSON output of scripts/import-<source>.py (phase 1 just printed it).
2. For each market in trajectory.sample_rows:
   a. Read the current us_market_analysis row (market_name, stance_score,
      confidence_score, bull_case, bear_case, recommendation).
   b. Read the last 10 us_score_trajectory rows for this market over the past
      7 days.
   c. Apply the decision framework to pick stance_delta, confidence_delta,
      bull_case_impact, bear_case_impact. Stay within severity-based bounds.
   d. Call scripts/write-collector-soft-update.py with the chosen deltas,
      reasoning, and impacts.
3. Do NOT mutate us_market_analysis directly. Trajectory writes only.
4. If a signal warrants a regime change larger than the bounds allow, pass
   stance_delta=0 with reasoning "Signal warrants Friday regime-change review"
   and stash the concern in --new-bullet-suggested.
5. End with a one-line summary of how many markets were updated and which
   severities fired.
```

---

## Audit Queries

**Last 7 days of soft vs mechanical ticks per market:**

```sql
SELECT market_name,
       recorded_at::date AS d,
       scan_type,
       stance_score,
       conviction_pct,
       evidence->>'severity' AS severity,
       evidence->>'signal_note' AS signal,
       evidence->>'reasoning' AS reasoning
FROM us_score_trajectory
WHERE recorded_at > now() - interval '7 days'
ORDER BY market_name, recorded_at DESC;
```

**Cumulative drift from Friday anchor (pre-swarm sanity check):**

```sql
WITH anchor AS (
  SELECT DISTINCT ON (market_name) market_name, stance_score AS anchor_stance, recorded_at
  FROM us_score_trajectory
  WHERE scan_type = 'weekly_debate'
  ORDER BY market_name, recorded_at DESC
),
latest AS (
  SELECT DISTINCT ON (market_name) market_name, stance_score AS latest_stance, recorded_at
  FROM us_score_trajectory
  ORDER BY market_name, recorded_at DESC
)
SELECT l.market_name,
       a.anchor_stance,
       l.latest_stance,
       (l.latest_stance - a.anchor_stance) AS drift_since_friday
FROM latest l
LEFT JOIN anchor a USING (market_name)
ORDER BY abs(l.latest_stance - a.anchor_stance) DESC;
```

If cumulative drift exceeds `±10` for any market, the Friday swarm should treat that market as its highest-priority re-examination.

---

## Per-Collector Routine Specs

Each weekday Claude Desktop Routine runs its collector's Phase 1 importer, parses its JSON output, then applies the decision framework to emit Phase 2 soft updates. The table below summarizes the universe of markets each soft review loops over and the scan_type it writes.

| Collector | Side | Markets to review | Phase 2 scan_type |
|---|---|---|---|
| `collect-crop-progress` | US | Corn, Soybeans, Wheat, Oats *(Apr–Nov only)* | `opus_review_crop_progress` |
| `collect-grain-monitor` | CAD | 16 canonical CAD grains | `opus_review_grain_monitor` |
| `collect-export-sales` | US | Corn, Soybeans, Wheat, Barley, Oats | `opus_review_export_sales` |
| `collect-cgc` | CAD | 16 canonical CAD grains | `opus_review_cgc` |
| `collect-cftc-cot` | US | Corn, Soybeans, Wheat *(Oats has no disaggregated series)* | `opus_review_cftc_cot` |
| `collect-cftc-cot` | CAD | Canola, Corn, Soybeans, Wheat | `opus_review_cftc_cot` |
| `collect-wasde` | US | Corn, Soybeans, Wheat, Barley, Oats *(monthly, 10th–14th)* | `opus_review_wasde` |

**Decision-framework nuances per collector:**

- **crop-progress**: severity tied to G/E% trajectory and YoY change. A >10-pt G/E drop qualifies as critical.
- **grain-monitor**: one heartbeat per CAD grain — the system-wide logistics signal (OCT%, vessel queue) applies to every grain's haul/hold decision. Phase 2 Opus may still differentiate by grain-specific exposure (e.g., vessel delays hit canola harder than flax).
- **export-sales**: severity tied to weekly net-sales sign + pace vs USDA target. Negative net sales (cancellations) flag critical.
- **cgc**: one heartbeat per CAD grain (15/16 typically — Sunflower is absent from CGC Primary). Phase 2 Opus should read the grain's current-week vs historical delivery pace.
- **cftc-cot**: managed-money net >±150k = critical; ±75k–150k = elevated. Spec/commercial divergence is the key Phase 2 signal.
- **wasde**: severity driven by ending-stocks revision vs prior month. A >5% MoM revision in either direction flags elevated; >10% flags critical.

Phase 2 always reads the current trajectory row (drift-aware) before deciding deltas, so Monday's Opus soft update is what Thursday's heartbeat picks up — not the stale Friday anchor.
