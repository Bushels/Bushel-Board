# Agent Debate Rules — Continuous Improvement Reference

**Purpose:** Codified rules derived from moderation of AI-vs-AI debates. Used as a validation checklist for intelligence generation and manual Claude-Grok debates.

**Last updated:** 2026-04-18 (Rules 16-19 — Coiled Spring disambiguators — added)

---

## Flow Coherence Rules

### Rule 1: Stock Direction Trumps YTD Position
If visible commercial stocks are DRAWING (declining WoW) while deliveries are high, the system IS absorbing supply. This is structurally bullish regardless of where YTD exports or crush sit relative to prior year.

**Test:** `WoW_Stock_Change < 0 AND CW_Deliveries > 0` → absorption signal → NOT bearish.

**Anti-pattern:** "YTD exports -28% YoY → bearish." Wrong when stocks are drawing. The export gap may reflect logistics constraints, not demand weakness.

### Rule 2: Compute Implied Weekly Absorption
```
Weekly Absorption = CW_Deliveries + |WoW_Stock_Draw|
```
If absorption exceeds deliveries, the system is in net-draw mode. Always include this number in the analysis — it's the single most important flow metric for a farmer deciding whether to deliver this week.

### Rule 3: Export Lag + Stock Draw = Look for Logistics Constraint
When exports are lagging YoY BUT stocks are declining, the default explanation is NOT "weak demand." It's "the pipe is full." Before concluding demand is weak, check:
- Port capacity % (>90% = bottleneck)
- Vessel queue vs 1yr average (above = congestion)
- Out-of-car time (>15% = rail constraint)
- Producer car allocations (declining = softer forward commitments)

Only conclude "weak demand" if ALL logistics indicators are normal AND stocks are building.

### Rule 4: Confirmation Window Is 2 of 3 Weeks
Don't default to "watch — need 2-3 more weeks to confirm." If 2 out of 3 recent weeks show a consistent pattern (stock draws, delivery surges, export pickups), that IS the confirmation. State the trend and act on it.

---

## Thesis Quality Rules

### Rule 5: Never Publish Contradictory Models Without Resolution
If Claude says bearish and Grok says bullish (or vice versa), the moderator's job is to RESOLVE the contradiction explicitly using the evidence chain. The farmer must never receive two opposite recommendations.

**Template:** "Claude scored this [X] based on [evidence]. Grok challenged to [Y] because [counter-evidence]. The resolved thesis is [direction] with [confidence] because [decisive factor]."

**Protocol (manual debate):** Claude forms independent thesis first → sends to Grok via xAI API → Grok responds AGREE or CHALLENGE → Claude moderates any disagreements using Rules 1-4 + Basis Signal Matrix → final score published.

### Rule 6: Always Provide a Timeline
"Hold patient" is not actionable. "Hold for 2-3 weeks while Vancouver vessel queue (currently 26, avg 20) clears" IS actionable. Every hold/sell/wait recommendation must include:
- A specific timeframe (this week, 2-3 weeks, end of month)
- A trigger event (CGC data Thursday, vessel queue clearing, China buying showing in data)
- A risk if the timeline doesn't play out

### Rule 7: Lead with Logistics for Near-Term Decisions
For farmer decisions with a 1-4 week horizon, logistics data (port capacity, vessel queues, out-of-car time, producer cars) is MORE predictive than YTD position data. Weight accordingly:
- **This week's delivery decision:** 70% logistics, 30% fundamentals
- **This month's pricing decision:** 50% logistics, 50% fundamentals
- **Seasonal outlook:** 20% logistics, 80% fundamentals

### Rule 8: Cite Producer Cars When They Diverge From Thesis
If the thesis says "weak demand" but producer car allocations for that grain are rising or significant relative to total allocation, flag the divergence. Producer cars are forward commitments by elevators — they reflect real operational demand, not market sentiment.

---

## COT Positioning Rules

### Rule 9: COT Positioning Informs Timing, Not Direction
COT tells you WHEN to act, not WHAT to do. Fundamentals (CGC flow, AAFC balance sheet, logistics) determine direction; COT determines whether the market is overcrowded in that direction.

**Anti-pattern:** "Managed money net-long → bullish." Wrong — net-long means the bullish trade is already crowded. The question is: can latecomers still push prices higher, or is it a crowded exit?

**Test:** If thesis says "sell" and managed money is heavily short → wait for the squeeze first, then sell into the rally.

### Rule 10: Flag Spec/Commercial Divergence as Watch Signal
When Managed Money and Commercial (Producer/Merchant) are on opposite sides, ALWAYS flag as a watch item. This is the highest-confidence timing signal in commodity markets.

**Template:** "Specs {net-long/short} {X contracts} ({Y}% OI) while commercials {opposite} {Z contracts} — positioning divergence suggests {implication for farmer timing}."

### Rule 11: COT Lag Awareness
COT data reflects Tuesday positions, released Friday. By Friday, the market may have already moved. Rule:
- COT sets context for NEXT WEEK's thesis, not this week's action
- Always pair COT with more recent X signals for current-week timing
- If COT shows extreme positioning + X signals show momentum reversal → high-confidence inflection signal

---

## Price Action Rules

### Rule 12: Cash Price Is the Farmer's Truth
Futures prices set direction. Cash prices confirm whether it reaches the farmer. If futures rally but local cash is flat or declining, the thesis MUST acknowledge the disconnect. Never publish a bullish thesis when cash bids are falling.

**Test:** Compare Friday close → Wednesday open for Bunge Moose Jaw (or equivalent elevator) cash prices. If cash moved opposite to futures, flag basis widening.

**Anti-pattern:** "Canola ICE at $726 → bullish." Wrong when Moose Jaw cash is $662 and falling. The $64 basis gap means elevators have enough supply. The farmer's price is $662, not $726.

### Rule 13: Basis Gap Overrides Futures Momentum
When basis (cash - futures) widens by more than $30/t for oilseeds or $15/bu for grains within one week, it signals local oversupply regardless of futures direction. Apply the Basis Signal Matrix:

| Basis Direction | Futures Direction | Signal | Farmer Action |
|----------------|-------------------|--------|--------------|
| Widening | Rising | Local Glut | Hedge futures, sell cash on basis narrowing |
| Widening | Falling | Strong Bearish | Sell now, avoid storage |
| Narrowing | Rising | Strong Bullish | Hold, delay sales |
| Narrowing | Falling | Local Shortage | Sell cash immediately |
| Positive (inverted) | Any | Urgency | Deliver now |

### Rule 14: Dead-Flat Price = No Demand Pull
When a grain's cash price shows zero change for 5+ consecutive trading days, the market is telling you demand is fully supplied. Do NOT rate that grain bullish regardless of export pace or YoY metrics. Flat price + good fundamentals = already priced in.

**Test (Week 31 example):** Barley $232.01 unchanged all week despite +78% YoY exports → limited to +15 (not +35).

### Rule 15: Price Verification Is Mandatory Before Publishing
Every intelligence cycle must verify current prices from at least 2 sources before forming a thesis:
1. **Futures:** CBOT/ICE/MGEX settlement prices (from grain_prices table or Yahoo Finance)
2. **Cash:** Saskatchewan elevator bids (Bunge Moose Jaw via CKRM/GX94 radio reports, or Rayglen)
3. **Compute basis** for every grain with a futures contract

If prices are unavailable or stale (>2 trading days old), flag as low-confidence.

---

## Coiled Spring Disambiguators (Rules 16-19)

The Coiled Spring framework describes a physical-tightness regime where basis widens, carry tightens, stocks drain, and vessel queues grow until a catalyst releases the pressure. It applies cleanly to 7 Canadian grains (Canola, Lentils, Peas, Amber Durum, Mustard Seed, Canaryseed, Flaxseed) and misfires when applied uniformly. Rules 16-19 are the disambiguators that prevent false positives.

### Rule 16: Pipeline Congestion Requires Receipt Confirmation
Pipeline tension (vessel queue length, out-of-car time, terminal fill %) scores bullish **only if terminal receipts are simultaneously accelerating**. Congestion without accelerating receipts is supply-side (rail failure, port labor, weather) and is structurally bearish for basis.

**Test:** `vessel_queue > 1yr_avg AND terminal_receipts_4wk_chg > 0` → pipeline tension = bullish. If receipts are flat or declining, pipeline congestion is a logistics bottleneck, not demand pull.

**Anti-pattern:** "Vancouver vessel queue = 33 (1yr avg 20) → strongly bullish canola." Wrong without confirming terminal receipts accelerated in the same 2-3 week window. Otherwise the queue reflects CN/CP delivery failure, which widens basis and hurts the farmer.

### Rule 17: Elevator-vs-Crush Bid Spread Disambiguates "Withholding"
If Process (crusher) deliveries are rising while Primary (elevator) deliveries fall, farmers are **migrating to better-bidding crushers**, not withholding grain. The Coiled Spring is real but its release vector is **basis, not futures**. Recommendations should focus on cash/basis capture at the crusher, not futures speculation.

**Test:** `Process.Deliveries WoW > 0 AND Primary.Deliveries WoW < 0` → migration, not withholding. Check R-CA-CNL-04 (canola bid spread) before asserting futures-side thesis.

### Rule 18: Basis Veto Rule
If the basis component of any composite score reads -2 or worse on the Basis Signal Matrix (Rule 13), **cap the composite score at +2** regardless of other bullish inputs. Basis is the farmer's truth (Rule 12). Fundamentals cannot override a widening basis at the farmer's elevator.

**Example:** Canola flow strong (+4), COT supportive (+2), vessel queue tight (+3), but Moose Jaw basis has widened from -$50 to -$68 over 2 weeks. Basis component = -3 → composite CAPPED at +2.

### Rule 19: COT Short-Cover Requires 3-Week or Shipment Confirmation
One week of commercial short-cover is ambiguous between **sales completion** (bearish — crushers done buying) and **directional capitulation** (bullish — commercials forced to reprice). Do not score bullish on a 1-week COT move alone.

**Confirmation paths (either suffices):**
1. 3 consecutive weeks of same-direction commercial short-cover, or
2. USDA export shipments for the same week show accelerated pace vs prior 4-week average.

If neither is present, the COT move is flagged "ambiguous" and excluded from the composite.

---

## Claude-Grok Manual Debate Protocol

### When to Run
- After each CGC weekly data import (Thursday)
- After significant policy events (tariff changes, trade agreements)
- After Grain Monitor updates (logistics data refresh)

### Procedure
1. **Claude loads context:** Knowledge chunks, commodity framework, X signals, COT data, current prices (2 sources)
2. **Claude forms independent thesis:** Score all 10 grains with full evidence chain including price action
3. **Send to Grok:** Via xAI API (prefer Responses API with x_search/web_search; fallback to Chat Completions)
4. **Grok responds:** AGREE or CHALLENGE each grain with its own score + evidence
5. **Claude moderates disagreements:** Apply Rules 1-15, Basis Signal Matrix, and book knowledge frameworks
6. **Resolution:** Final score = evidence-weighted blend. Document which rules decided the outcome.
7. **Price accountability:** Record cash + futures prices at time of debate for next-week accuracy check.

### Debate Output Format
For each grain:
```
GRAIN: [Final Score] (Δ [change from prior])
Claude: [score] | Grok: [score] | Agreed/Resolved
Price: [cash] / [futures] / Basis: [gap]
Action: [one sentence]
```

---

## Grain-Specific Rules

### Canola
- Crush absorbs ~55% of Canadian canola. Never ignore crush when evaluating demand — exports alone tell only half the story.
- China tariff changes take 2-4 weeks to appear in CGC export data. Don't wait for CGC confirmation before factoring policy changes into the thesis.
- Vancouver is the primary canola export port. Port congestion = canola export bottleneck. Always check vessel queue.

### Oats
- 90%+ of producer car oat shipments go to the US. "Collapsing exports" and high US-bound producer cars are contradictory — one of them is wrong.
- Oats are a MILLING grain (food use), not a crush grain. Never reference "crush" for oats — use "processing" or "milling."
- Rail allocation is the binding constraint for oats, not demand. When oats claim >40% of weekly producer car allocation despite being a minor grain, demand is strong.

### Peas
- Peas move via containers, not bulk producer cars. Low producer car numbers for peas are normal, not a demand signal.
- India import policy is the single largest swing factor. Always check current India pulse tariff status.
- Container availability at port is the relevant logistics constraint, not rail capacity.

### Barley
- Feed barley vs malt barley have different demand drivers. Regional Alberta feedlot activity drives feed demand; global markets drive malt demand.
- Low producer car allocation is normal for barley (regional, feed-driven). Not a bearish signal.

---

## Validation Checklist (Post-Generation)

Before publishing any grain intelligence, verify:

- [ ] **Flow coherence:** If thesis says bearish, are stocks actually BUILDING? If drawing, thesis may be wrong. (Rule 1)
- [ ] **Absorption computed:** Is implied weekly absorption stated somewhere in the analysis? (Rule 2)
- [ ] **Logistics cross-check:** Does thesis cite port/rail/producer car data when relevant? (Rule 3)
- [ ] **Model agreement:** Do Claude and Grok reach compatible conclusions? If not, is the disagreement resolved explicitly? (Rule 5)
- [ ] **Timeline present:** Does every recommendation include a timeframe and trigger event? (Rule 6)
- [ ] **Grain-specific rules applied:** Are oats, peas, canola, barley treated with their specific context? (Grain-Specific section)
- [ ] **Week attribution correct:** Are CGC data and farmer sentiment attributed to their correct weeks? (Rule 11)
- [ ] **COT context included:** For grains with CFTC data, is managed money positioning referenced? (Rule 9)
- [ ] **COT lag noted:** Is COT data attributed to its Tuesday snapshot date, not treated as real-time? (Rule 11)
- [ ] **Cash price verified:** Are current cash prices from ≥2 sources included in the analysis? (Rule 15)
- [ ] **Basis computed:** Is the cash-futures basis gap stated for every grain with a futures contract? (Rule 13)
- [ ] **Price-thesis alignment:** If cash is flat/falling, is the thesis NOT bullish without explicit justification? (Rules 12-14)
- [ ] **Coiled Spring — pipeline confirmation:** If thesis cites vessel queue or port congestion, are terminal receipts simultaneously accelerating? (Rule 16)
- [ ] **Coiled Spring — bid spread check:** If thesis cites "withholding," is Process vs Primary delivery divergence ruled out? (Rule 17)
- [ ] **Basis veto applied:** If basis component ≤ -2, is composite score capped at +2? (Rule 18)
- [ ] **COT cover confirmation:** Is any short-cover signal backed by 3 weeks of same-direction moves OR matching USDA shipment acceleration? (Rule 19)

## Price Accountability Log

Track prices at time of each debate for accuracy checks the following week.

| Date | Grain | Debate Score | Cash Price | Futures | Basis | Next-Week Cash | Accurate? |
|------|-------|-------------|-----------|---------|-------|---------------|-----------|
| 2026-03-18 | Wheat | +35 | $276.25 | $5.90 | — | TBD | TBD |
| 2026-03-18 | Canola | 0 | $662.33 | $726.66 | -$64 | TBD | TBD |
| 2026-03-18 | Barley | +15 | $232.01 | — | — | TBD | TBD |
| 2026-03-18 | Oats | -55 | $142.00 | $3.56 | — | TBD | TBD |
| 2026-03-18 | Peas | +35 | $298.06 | — | — | TBD | TBD |
| 2026-03-18 | Corn | -40 | $4.54 | $4.54 | — | TBD | TBD |
| 2026-03-18 | Flaxseed | +50 | $670.54 | — | — | TBD | TBD |
| 2026-03-18 | Soybeans | -30 | $11.57 | $11.57 | inverted | TBD | TBD |
| 2026-03-18 | Amber Durum | -40 | $278.59 | — | — | TBD | TBD |
| 2026-03-18 | Lentils | -50 | $547.50 | — | — | TBD | TBD |
