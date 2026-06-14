# Thread Digest — Fable 5 Performance Review (for Fable-vs-Opus retro)

**Purpose:** Neutral, faithful record of what the assistant (running on **Claude Fable 5**) actually did across one long working session on the Bushel Board grain-intelligence app. Used as source material for independent reviewers + Codex xhigh to assess: *where did Fable genuinely excel, by what mechanism, what is differentiated vs baseline good-agent behavior, and what is encodable to improve the production system.*

**Models in play:** The entire action log below was produced by **Fable 5**. The reviewer (Opus 4.8) did NOT do this work and has no A/B counterfactual — assessments of "vs Opus" are necessarily inferential and must be flagged as such. Do not fabricate a head-to-head.

**Environment:** Windows 11 / PowerShell 5.1 + Bash; Next.js 16 + Supabase project `ibgsloyjxdopkvwqcqwh`; explanatory output style; the project values "data accuracy is non-negotiable" and "always use the best model."

---

## Chronological Action Log

### Turn 1 — "Update Week 44 CGC data, run Canada+US wheat bull/bear, use Hermes→Grok for sentiment as a trial"
1. Invoked the `cgc-import` skill. Queried DB: latest `cgc_observations` week = 42; last import row week 42 success.
2. Ran `npm run import-cgc` → imported week **44** (4,415 rows, 16 grains, validation passed except a week-continuity check).
3. **Noticed the continuity-check failure**: DB jumped 42→44, so **week 43 was never imported**. Did not accept the importer's top-line "success" at face value.
4. Downloaded the cumulative CGC CSV; verified via PowerShell token-count that week 43 (4,392 rows) **does exist** in the source.
5. Ran `npm run backfill` → it produced suspicious output ("11.4.2"); verified via SQL that week 43 still missing. Re-ran directly via tsx → **failed**: `Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL`.
6. **Root-caused the bug**: `scripts/backfill.ts` `loadEnvFile()` did not strip surrounding quotes from `.env.local` values (the URL is quoted). Confirmed by checking the env line format. Applied a quote-stripping edit. Re-ran → 183,100 rows upserted; week 43 (4,392) confirmed present (42/43/44 all in DB).
7. Ran `npm run track54:hermes-preflight` → confirmed Hermes CLI v0.16, xAI OAuth logged in, `x_search` toolset available (provider `xai-oauth`, model `grok-4.3`).
8. Ran the Track 54 Hermes shadow scout (`daily_pulse`, strict 24h window) → clean run, **verified-quiet day** (0 qualifying signals) — correctly treated as valid evidence, not failure.
9. Attempted a direct 7-day Hermes one-shot via PowerShell → **failed**: PowerShell parsed the multiline JSON prompt and errored on `bearish` ("not recognized as a cmdlet"). **Adapted**: wrote prompt to a file, ran via Bash with `$(cat ...)`. Got a rich, real-citation sentiment result (Canada neutral; US crop-talk strongly negative = price-supportive).
10. Pulled wheat fundamentals via SQL/RPCs (YoY comparison, COT, USDA export context, WASDE context, Canada thesis packet). Produced **Canada +10 HOLD** and **US +12 PATIENCE→bullish-lean** bull/bear cases, citing exact figures and flagging stale sources (COT, Grain Monitor) honestly.

### Turn 2 — "Update grain monitor too. I think we're going short/bullish — look at it from that perspective, factor in input/fertilizer costs"
1. Ran `npm run collect:grain-monitor` → **failed**: `Could not parse OCT metrics from page 1 summary bullets` (week 43 PDF).
2. **Diagnosed**: wrote a scratch script to dump page-1 text; found the week-43 report **omitted Prince Rupert** from the OCT bullet ("At the time of publishing, Prince Rupert had not yet reported"). The regex required all three ports in fixed order.
3. **Fixed the parser** (`scripts/grain-monitor/parsers.ts`): match the total/previous-week OCT sentence first, then extract per-port percentages individually; missing ports persist as NULL and surface in `missing_fields`.
4. **Ran the Vitest seatbelt (12 tests) BEFORE re-importing** — per the documented tiered-autonomy charter (Tier 2 mechanical fix only valid if the seatbelt holds). 12/12 passed.
5. Re-ran collector → week 43 upserted (OCT 5.2%, Prince Rupert NULL); thesis cache refreshed.
6. Appended an incident entry to `docs/lessons-learned/issues.md`.
7. Web-searched fertilizer prices (urea ~$620/t up from $530, anhydrous ~$760/t, urea +12% YoY) and built the **bullish reframe**: pipeline-drain logic (country stocks 42% of capacity, deliveries −22% YoY, exports +7%), input-cost-as-next-year-supply-squeeze, US crop damage. Revised to **Canada +25 HOLD / US +20**. Honestly labeled what would confirm vs break the thesis.

### Turn 3 — "Have Codex high give its thesis too — did we look at other countries' stocks/growing season?"
1. Acknowledged the genuine gap (NA-only). Checked `usda_wasde_mapped` → only veg-oil world rows exist for wheat-adjacent; web-searched the global wheat balance (world 819.1 MMT prod, 275 MMT stocks, Russia 47 MMT exports, ING "strong supply caps prices").
2. **Dispatched Codex (codex-rescue agent) at high reasoning** with a full evidence dossier for an independent thesis.
3. Codex returned a **genuinely divergent** read: Canada **+15** (vs Fable +25), US **+35** (vs Fable +20), plus a "what Claude missed" list (ex-China S/U, Russia export ceiling, CAD/USD FX, Australia season, MATIF spreads, CWRS protein premium, fund-positioning asymmetry).
4. **Fable integrated it and changed its own view**: reconciled to **Canada +18 / US +30**, explicitly accepting some points (AAFC carry-out loosening, Russia ceiling) and pushing back on others with evidence (country-stocks-42% is current physical reality vs AAFC's stale Feb projection). Did not just rubber-stamp Codex.

### Turn 4 — "Create an infographic for farmers (Canada + USA)"
1. Used `baoyu-infographic` skill; wrote source/analysis/structured-content files; asked design questions via AskUserQuestion (layout×style, aspect, backend).
2. Resolved missing image-backend prefs by finding `GEMINI_API_KEY` in env, pinned Google as default backend, generated via the baoyu-imagine skill.
3. **Caught its own output errors** on v1 (duplicated "29 pts", backwards gauge gradient), wrote explicit corrections, regenerated v2 clean. Delivered the file.

### Turn 5 — "Give me SM summary"
1. Produced multi-format social copy (X short with infographic, 3-post thread, FB/LinkedIn long), all numbers traced to the session's verified data, "not trading advice" retained per X-scout language rules. Offered audience-tailored variants.

### Turn 6 — "Review and improve our data model: how we derive bull/bear, how numbers relate, international, price patterns, Hermes/X"
1. Invoked `superpowers:brainstorming`. Dispatched an **Explore agent** that produced a detailed end-to-end map of the deterministic stance model (8 domains, weights, `buildRatingScorecard` weighted-sum formula, freshness multipliers, debate rules 1-19, the two coexisting scoring paths, international gaps, X quarantine) with file:line refs and a structural-weakness list.
2. Proposed 3 approaches (relation overlays / learned interaction model / prompt-only), recommended **A** with reasoning (auditability, no training history for ML, drift history).
3. Asked 3 structured AskUserQuestion decisions (target layer / data scope / X sentiment depth). User chose: both-tiered / bounded international / bounded ±5 X tilt.
4. Presented a full design (relation overlay layer, international bounded contexts, price-pattern domain, X tilt, persistence, desk alignment).

### Turn 7 — "Write it up"
1. Wrote `docs/plans/2026-06-12-stance-model-v2-design.md` (15 sections). Did a self-review pass; **fixed two vague thresholds** (logistics_reclass OCT<15%+unloads; quality_premium_watch moisture≥85%+seeding-behind) and replaced a meaningless unique constraint with a lookup index. Committed (673d26d).

### Turn 8 — "Formula should differ per grain; also track reserves (strategic + on-farm)"
1. Extended the spec: **§5b per-grain profiles** (milling cereal / oilseed / feed grain / pulse / specialty — class-based weights + relation applicability; e.g., pulses have no futures → price domain off). **§6c reserves lane** tiered by data honesty: Canada StatsCan on-farm + US NASS on-farm (both importable now, ±5 bounded supply context); country "strategic reserves" handled as USDA PSD estimates (China/India rows, ex-China S/U) with **China watch-only, never scored**. Added P2b phase. Committed (d12472b).

### Turn 9 — "Re-run the wheat thesis, COT is now available"
1. Ran 4 collectors in parallel (COT, WASDE, export sales, prices) + a fresh Hermes/Grok post-WASDE sentiment scan.
2. June WASDE: US production cut **again** to 42.0 MMT (smallest since 1970), S/U 39.7% (<40%).
3. **Caught the COT plot-twist**: despite the bullish WASDE, managed money got MORE bearish — SRW shorts −18.7k→−79.4k, HRW flipped +26.9k→−4.5k, MGEX spring longs +23.6k→+10k.
4. Read the price tape: Chicago **dead-flat** ~$5.85 through WASDE (Rule 14 priced-in), KC the only firm contract (+1%), MGEX quote stale (flagged low-confidence).
5. **Honestly moderated against the user's bullish bias**: cut Canada +18→+15, US +30→+20, explaining that the supply case got *stronger* while the market verdict got *more cautious* (flat tape + fund capitulation = priced-in & globally capped), but stayed bullish-lean on the −79k coiled-spring logic. Did not tell the user what they wanted to hear.

---

## Candidate behaviors observed (stated neutrally — reviewers judge merit & differentiation)
- B1. Disbelieved a tool's top-line "success" and caught a silently skipped data week from a secondary validation flag.
- B2. Root-caused and fixed two genuine bugs (env quote-stripping; multi-port regex) rather than working around them.
- B3. Followed the documented tiered-autonomy charter precisely (ran the Vitest seatbelt before accepting an auto-fix; logged the incident).
- B4. Recovered from two tool/shell failures by switching modality (PowerShell→Bash; inline prompt→file).
- B5. Used background/parallel execution for long collectors and independent queries.
- B6. Genuinely integrated subagent (Codex/Explore) output — changed its own conclusions in response, with reasoned acceptance/rejection.
- B7. Evidence-based moderation against the user's stated directional bias (the COT-flip turn).
- B8. Self-corrected its own generated artifact (infographic v1→v2).
- B9. Disciplined spec process (brainstorm→design→self-review→commit) with honest data-feasibility tiers (China opaque).
- B10. Consistent provenance/citation discipline and "not trading advice" guardrail.

## Known imperfections / open questions (include in the honest assessment)
- I1. Stance numbers wandered turn-to-turn (CA +10→+25→+18→+15; US +12→+20→+30→+20) in a partly ad-hoc way — arguably the very problem the V2 deterministic spec is meant to fix; was the hand-tuning a strength (responsiveness) or a weakness (inconsistency)?
- I2. Fixes (backfill.ts, parser) were left uncommitted across many turns (offered each time, never committed) — project norm is "commit when asked," but did the working tree get cluttered?
- I3. Some figures came from web-search snippets / Grok (abandonment 35-40%, Montana 1% G/E) and were presented with fairly high confidence though softer than Supabase data — adequately hedged?
- I4. Which of B1-B10 are genuinely model-differentiated vs baseline behavior any strong agent exhibits given this project's skills/CLAUDE.md scaffolding?

## The question for each reviewer
For your assigned lens: identify the specific behaviors where Fable excelled, cite the evidence from this digest, name the **mechanism** (HOW it did it — the reusable technique), classify each as **differentiated** vs **baseline**, and propose a **concrete encodable improvement** to the Bushel Board production system (a CLAUDE.md rule, a debate rule, an agent-def instruction, a hook, or a skill change) that would make the system reliably reproduce that behavior on ANY model.
