# Agent Debate Rules — Continuous Improvement Reference

**Purpose:** Codified rules derived from moderation of Grok vs Step 3.5 Flash debates. These rules should be injected into agent system prompts or used as a validation checklist post-generation.

**Last updated:** 2026-03-13 (Canola Week 31 moderation)

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
If Step 3.5 Flash says bearish and Grok says bullish (or vice versa), Grok's job is to RESOLVE the contradiction explicitly. The farmer must never receive two opposite recommendations.

**Template:** "The round-1 analyst called this bearish based on [X]. However, [Y evidence] suggests the opposite because [Z reasoning]. The corrected thesis is [direction] with [confidence]."

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

- [ ] **Flow coherence:** If thesis says bearish, are stocks actually BUILDING? If drawing, thesis may be wrong.
- [ ] **Absorption computed:** Is implied weekly absorption stated somewhere in the analysis?
- [ ] **Logistics cross-check:** Does thesis cite port/rail/producer car data when relevant?
- [ ] **Model agreement:** Do Step 3.5 and Grok reach compatible conclusions? If not, is the disagreement resolved explicitly?
- [ ] **Timeline present:** Does every recommendation include a timeframe and trigger event?
- [ ] **Grain-specific rules applied:** Are oats, peas, canola, barley treated with their specific context (milling vs crush, containers vs bulk, regional vs export)?
- [ ] **Week attribution correct:** Are CGC data and farmer sentiment attributed to their correct weeks?
