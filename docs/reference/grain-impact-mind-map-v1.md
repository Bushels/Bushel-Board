# Grain Impact Mind Map V1

Purpose: define the grain-specific impact map that sits between admitted source data, Viking knowledge, and the Bull/Bear rating scorecard.

Runtime contract: `lib/thesis/grain-impact-map.ts`.

Use with:

- `docs/reference/source-registry.md` for source admission and cadence.
- `docs/reference/thesis-rating-model-v1.md` for domain weights and scorecard behavior.
- `docs/reference/cgc-market-mechanics-v1.md` for Canadian movement accounting.
- `docs/reference/viking-knowledge-architecture.md` for distilled knowledge loading rules.

This file is not a new source-admission pass. It does not let unadmitted global, local-basis, weather, X, or farmer-private data move a public thesis score.

## Core Rule

Every market factor must be classified before it can affect the board:

| Class | Meaning | Can move public Bull/Bear score? |
| --- | --- | --- |
| Official thesis input | Source is admitted, has cadence/units/freshness proof, and maps to a scorecard domain. | Yes |
| Price context | Futures, FX, or price confirmation. Useful for market response and divergence checks. | Bounded, not standalone |
| Watch-only evidence | Useful lead or rumor surface, but not source truth. | No, until corroborated |
| Parked | Valuable later, but source contract or privacy gate is missing. | No |

## Universal Mind Map

```text
grain
  -> supply baseline
       -> production, seeded area, yield, carry-in, stocks, crop condition
  -> demand and disappearance
       -> exports, domestic use, crush, feed, milling, WASDE revisions
  -> movement and pipeline
       -> producer deliveries, stocks, terminal receipts, exports, shipments
  -> logistics
       -> rail, vessel lineup, port stocks, producer cars, corridor friction
  -> price response
       -> futures, FX, CAD-normalized prices, basis when admitted, spreads
  -> positioning and liquidity
       -> CFTC managed money, commercials, crowding, thin-contract warning
  -> global competitors and substitutes
       -> competing origins, related crops, policy, tariffs, substitution
  -> quality and grade
       -> protein, oil content, malt specs, test weight, disease, dockage
  -> seasonal timing
       -> seeding, flowering, harvest, winter logistics, old-crop carry
  -> Viking knowledge layer
       -> basis, storage, carry, hedging, logistics, market structure, risk
```

## Current Admitted Data Spine

| Data lane | Source/table | Board role | Gap boundary |
| --- | --- | --- | --- |
| Canada weekly flow | `cgc_observations`, `cgc_imports` | Official thesis input for movement, demand, stocks, and pipeline pressure. | Cannot explain farmer motive, basis, or global demand by itself. |
| Canada crop progress | `canada_crop_progress` | Official supply/weather proxy for directly mapped Canada lanes; seeded rows score now, Saskatchewan development timing and AB/SK cropland/surface-soil moisture can score as capped proxy weather evidence, and condition rows score when imported. | Collector now imports seeded progress plus Alberta emergence, Alberta surface-soil/pasture context, Saskatchewan topsoil moisture context, and Saskatchewan crop-development timing context; live crop-condition scoring is dormant until official `condition_good_excellent_pct` rows are parsed; development timing is admitted only as group-level proxy evidence for mapped public grains; cropland/surface-soil moisture is admitted only for Canola, Wheat, Durum, Barley, and Oats; no Corn/Soybeans, no generic Spring/Winter Wheat proxy, and no crop-specific condition/quality/yield claim from broad moisture rows. |
| Canada logistics | `grain_monitor_snapshots`, `producer_car_allocations` | Official logistics context and producer-car rail pressure. | Natural lag must be visible; US logistics remains parked for V1. |
| Canada supply baseline | `supply_disposition` | Official supply, production, carry-in/carry-out context. | Slower than CGC; not a replacement for current weekly flow. |
| US crop progress | `usda_crop_progress` | Official US supply/weather input during active season. | Seasonal weight should drop outside active windows. |
| US export sales | `usda_export_sales` | Official demand/flow input where projection pace is admitted. | Barley/Oats projection pace stays null unless importer admission passes. |
| WASDE | `usda_wasde_raw`, `usda_wasde_mapped` | Monthly supply/demand baseline and revision reset. | Monthly cadence; not a weekly flow source. Raw WASDE/PSD can frame broad world balance context, but the mapped score view is currently a US-board input; country-specific policy, tender, freight, customs, palm-oil, malt, and quality detail remain watch-only until separately admitted. |
| US quarterly stocks | `usda_quarterly_stocks` | Measured inventory surprise and confirmation/challenge to WASDE supply context. | Quarterly cadence; merge with WASDE supply instead of creating a duplicate supply domain. |
| CFTC COT | `cftc_cot_positions` | Positioning and crowding pressure. | Tuesday data released Friday; only primary rows move deterministic scores; proxy mappings must be visible context. |
| Prices and FX | `grain_prices`, `fx_rates`, `grain_price_intraday` | Price confirmation and divergence checks. | No local basis claim from empty `posted_prices`; stale price proof blocks scoring. |
| X Pulse | `x_scout_runs`, `x_market_signals` | Watch-only evidence lead. | Grok/X cannot write, rank, or author thesis facts. |
| Viking knowledge | L0/L1/L2 local distilled knowledge | Interpretation framework for basis, storage, carry, hedging, logistics, and risk. | Timeless framework only; live data wins on current facts. |

## Grain Profiles

### Canola

Market structure: Canada-first oilseed with strong crush, export, vegetable-oil, soy-complex, and China/policy sensitivity.

Primary impact factors:

| Domain | High-impact factors | Current data class |
| --- | --- | --- |
| Supply | Canadian production, seeded area, yield, crop condition, harvest quality, carry-out. | Official thesis input |
| Demand | Crush/process deliveries, terminal exports, direct export-destination flows, China/vegetable-oil demand. | Official for CGC/WASDE; global veg-oil detail is watch/parked |
| Movement | Producer deliveries, process producer deliveries, commercial stocks, terminal receipts/exports. | Official thesis input |
| Logistics | Vancouver/Prince Rupert/Thunder Bay execution, rail, producer cars. | Official thesis input |
| Price | ICE Canola, CAD/USD, soybean oil, soybean meal, soybean futures. | Price context |
| Positioning | Canola COT where direct; soy oil/meal as labelled context. | Official/proxy context |
| Seasonal timing | Saskatchewan oilseed crop-development normal/ahead/behind rows. | Official proxy timing input; confidence-capped and not crop-specific Canola condition evidence |
| Prairie moisture | AB All Crops and SK Cropland adequate/surplus moisture rows. | Official proxy weather input; confidence-capped and not crop-specific Canola condition/quality/yield evidence |
| Global competitors | China policy, palm oil, global vegetable-oil trade, and broader oilseed balance. | Watch-only unless directly admitted; WASDE broad balance is context only |
| Quality | Oil content, green seed, heated canola, dockage. | Mostly Viking/context; source data parked |

Bull response: tight supply or crop stress plus active crush/export demand, slow farmer delivery, stocks draw, and price confirmation.

Bear response: large supply, deliveries pressing into weak disappearance, export policy drag, weak oilseed complex, or new-crop acreage/condition pressure.

Key gaps: local basis/posting data, explicit crush margins, palm oil/global veg-oil collector, quality-grade scoring.

### Wheat

Market structure: global grain with major competing origins. Canada/US data matters, but Black Sea, EU, Australia, quality class, and feed substitution can dominate.

Primary impact factors:

| Domain | High-impact factors | Current data class |
| --- | --- | --- |
| Supply | Canadian/US crop condition, planted/harvested area, WASDE production, global crop risk. | Official for CA/US; global detail mostly WASDE/watch |
| Demand | Export sales, CGC exports, milling/feed demand, tenders. | Official for CGC/USDA; tender detail parked |
| Movement | Producer deliveries, terminal flow, commercial stocks. | Official thesis input |
| Logistics | Port/rail execution and export corridor pressure. | Official thesis input |
| Price | CBOT/HRW/HRS context, CAD/USD, wheat/corn feed spread. | Price context |
| Positioning | Wheat-class COT with class/proxy labels. | Official/proxy context |
| Seasonal timing | Saskatchewan spring-cereal crop-development normal/ahead/behind rows. | Official proxy timing input for public Wheat; does not unlock Spring/Winter Wheat proxy scoring |
| Prairie moisture | AB All Crops and SK Cropland adequate/surplus moisture rows. | Official proxy weather input for public Wheat; does not unlock class-specific Wheat condition/quality/yield scoring |
| Global competitors | Black Sea, EU, Australia, freight, policy, and tender competition. | Watch-only beyond broad WASDE balance |
| Quality | Protein, falling number, DON/fusarium, grade spread. | Mostly Viking/context; source data parked |

Bull response: crop or quality damage, strong export pull, commercial stock draw, or global competitor supply disruption.

Bear response: large global supply, weak exports, cheap corn/feed substitution, price failure against supportive fundamentals.

Key gaps: class-safe Spring/Winter Wheat board mapping, Black Sea/EU/Australia collector, live grade/protein quality feed, local basis.

### Durum / Amber Durum

Market structure: Canada-first specialty wheat. Smaller global market where quality and Mediterranean/North Africa demand can swing value.

Primary impact factors:

| Domain | High-impact factors | Current data class |
| --- | --- | --- |
| Supply | Prairie durum acres, yield, harvest weather, quality, carryout. | Official for Canada crop progress/CGC/supply |
| Demand | CGC exports, Mediterranean/North Africa import demand, pasta/semolina demand. | Official for CGC; global tender demand parked |
| Movement | Producer deliveries, terminal exports, commercial stocks. | Official thesis input |
| Logistics | Terminal export execution and producer-car/direct rail. | Official thesis input |
| Price | Durum cash premiums where available; wheat futures only as weak context. | Mostly parked/price context |
| Positioning | No clean direct futures equivalent. | Parked/proxy only |
| Seasonal timing | Saskatchewan spring-cereal crop-development normal/ahead/behind rows. | Official proxy timing input; confidence-capped and not crop-specific Durum condition/quality evidence |
| Prairie moisture | AB All Crops and SK Cropland adequate/surplus moisture rows. | Official proxy weather input; confidence-capped and not crop-specific Durum condition/quality/yield evidence |
| Global competitors | Mediterranean/North Africa import demand and alternate durum origins. | Watch-only beyond broad WASDE wheat balance |
| Quality | Vitreous kernel count, fusarium/DON, protein, grade spread. | Mostly Viking/context; source data parked |

Bull response: quality risk, lower supply, strong export movement, or tenders pulling from Canada when alternatives are weak.

Bear response: good global quality, weak tenders, slow exports, or farmer delivery pressure against thin demand.

Key gaps: durum tender/import collector, direct cash/basis/premium source, grade-quality feed, futures proxy policy.

### Barley

Market structure: feed and malt split. Western Canadian feedlot demand, malt quality, corn substitution, and export programs can pull in different directions.

Primary impact factors:

| Domain | High-impact factors | Current data class |
| --- | --- | --- |
| Supply | Canadian/US barley acres, condition, harvest, stocks. | Official thesis input |
| Demand | Feedlot/feed use, malt demand, exports. | CGC/USDA official; feedlot/malt detail parked |
| Movement | Producer deliveries, stocks, exports, domestic/process rows. | Official thesis input |
| Logistics | Grain Monitor and producer cars where barley is active. | Official thesis input |
| Price | Feed barley basis, corn equivalent, CAD/USD. | Futures/FX context; local feed basis parked |
| Positioning | No strong direct COT anchor in V1. | Parked/proxy |
| Seasonal timing | Saskatchewan spring-cereal crop-development normal/ahead/behind rows. | Official proxy timing input; confidence-capped and not crop-specific Barley condition/malt-quality evidence |
| Prairie moisture | AB All Crops and SK Cropland adequate/surplus moisture rows. | Official proxy weather input; confidence-capped and not crop-specific Barley condition/malt-quality/yield evidence |
| Global competitors | Feed-grain substitution, malt-origin competition, Black Sea/Australia feed pressure. | Watch-only beyond broad WASDE feed-grain balance |
| Quality | Malt specs, plumpness, protein, weathering. | Mostly Viking/context; source data parked |

Bull response: tight feed supply, poor malt quality reducing selectable supply, strong feedlot demand, or export pull.

Bear response: large feed supply, cheap corn/substitutes, weak malt/export demand, or harvest pressure.

Key gaps: local feed barley bids, malt premium/acceptance data, feedlot demand proxy, clean COT mapping.

### Oats

Market structure: thinner market with milling quality and food demand sensitivity. Small supply changes can matter more than in corn/wheat.

Primary impact factors:

| Domain | High-impact factors | Current data class |
| --- | --- | --- |
| Supply | Canadian/US acreage, crop condition, yield, stocks. | Official thesis input |
| Demand | Milling demand, export sales, domestic use. | USDA/CGC official; miller demand detail parked |
| Movement | Producer deliveries, terminal flow, commercial stocks. | Official thesis input |
| Logistics | Rail/terminal flow where oats are material. | Official thesis input |
| Price | Oat futures with thin-liquidity warning, CAD/USD. | Price context |
| Positioning | Oats COT, but liquidity should cap confidence. | Official/proxy context |
| Seasonal timing | Saskatchewan spring-cereal crop-development normal/ahead/behind rows. | Official proxy timing input; confidence-capped and not crop-specific Oats condition/milling-quality evidence |
| Prairie moisture | AB All Crops and SK Cropland adequate/surplus moisture rows. | Official proxy weather input; confidence-capped and not crop-specific Oats condition/milling-quality/yield evidence |
| Cross-border competitors | North American milling demand, imports, and quality availability. | Watch-only; miller/import detail is not admitted |
| Quality | Test weight, groat percentage, milling specs. | Mostly Viking/context; source data parked |

Bull response: crop/quality stress, tight stocks, milling pull, and price confirmation in a thin market.

Bear response: adequate supply, weak mill/export pull, or futures move unsupported by physical data.

Key gaps: milling bid/quality source, liquidity confidence cap in UI, local basis.

### Corn

Market structure: US-led feed, ethanol, export, and global benchmark crop. Canadian corn is local context; US supply/demand sets most global direction.

Primary impact factors:

| Domain | High-impact factors | Current data class |
| --- | --- | --- |
| Supply | US planting, emergence, condition, harvest, WASDE production, quarterly stocks. | Official thesis input |
| Demand | Export sales, WASDE feed/residual, ethanol use. | Official for exports/WASDE; ethanol margin detail parked |
| Movement | Canada CGC flow where local; US movement direct lane limited in V1. | Canada official; US movement structurally limited |
| Logistics | Export corridor and freight context. | Mostly watch/limited |
| Price | CBOT corn, CAD/USD, wheat/corn spread. | Price context |
| Positioning | Corn COT. | Official thesis input |
| Global competitors | Brazil/Argentina crop size, export pressure, freight, and safrinha timing. | Watch-only beyond broad WASDE balance |
| Quality | Test weight, harvest moisture, mycotoxin risk. | Mostly parked |

Bull response: US crop stress, stocks cuts, strong exports/ethanol, fund short-covering, or broad feed demand.

Bear response: big US crop, weak exports, ethanol/feed softness, South American competition, or price failure.

Key gaps: ethanol margins, South America export/crop collector, US river/logistics, quality feed.

### Soybeans

Market structure: US-led oilseed with direct China demand, crush, soybean oil/meal, Brazil/Argentina, and canola cross-market impact.

Primary impact factors:

| Domain | High-impact factors | Current data class |
| --- | --- | --- |
| Supply | US planting/condition/harvest, WASDE production/stocks, South America crop. | Official US; South America mostly WASDE/watch |
| Demand | Export sales to China/others, crush, soybean oil/meal use. | Official USDA; detailed crush margin parked |
| Movement | Canada CGC flow where local; US movement direct lane limited in V1. | Canada official; US movement structurally limited |
| Logistics | Export corridor and freight context. | Mostly watch/limited |
| Price | CBOT soybeans, soybean oil, soybean meal, CAD/USD. | Price context |
| Positioning | Soybean/soy oil/meal COT. | Official thesis input |
| Global competitors | Brazil/Argentina supply, China demand/policy, port/export lineup, and palm-oil pull. | Watch-only beyond broad WASDE balance |
| Quality | Harvest quality and oil/protein specs. | Mostly parked |

Bull response: China demand, strong crush/oil, US crop stress, South America supply issue, or soy oil strength confirming canola support.

Bear response: Brazil/Argentina supply pressure, weak China bookings, crush/oil weakness, or large US stocks.

Key gaps: Brazil/Argentina collector, official crush margins, China customs/tender flow, palm oil context.

## Seasonal Weight Gates

| Season window | Weight should rise | Weight should fall |
| --- | --- | --- |
| Aug-Sep harvest | Supply, quality, farmer delivery pressure, storage risk. | Long-range acreage speculation. |
| Oct-Nov fall movement | Exports, terminal receipts, logistics, harvest quality resolution. | Seeding progress. |
| Dec-Jan winter logistics | Basis, storage/carry, port/rail friction, holiday movement slowdown. | Crop-condition signals unless Southern Hemisphere matters. |
| Feb-Mar pre-spring push | Old-crop stocks, export/crush pull, farmer delivery pace, South America, acreage intentions. | Harvest progress. |
| Apr-May seeding | Planting progress, soil moisture/crop-progress proxy, new-crop acreage, price risk. | Old crop-only quality unless stocks are tight. |
| Jun-Jul grain fill / old-crop carry | Crop condition, drought/excess moisture, old-crop basis, stocks draw, new-crop risk premium. | Early seeding pace once crop is established; Canada condition needs imported official condition rows before it can move direct condition scores; AB/SK broad moisture stays capped proxy evidence. |
| Monthly WASDE window | Balance-sheet revisions, export/use reset, stocks-to-use. | Daily X chatter unless it identifies a source to inspect. |

## Ranking Formula For Implementation

Future code should score an impact factor only after this ordering:

```text
impact_value
  = source_authority
  x grain_relevance
  x seasonal_relevance
  x market_structure_weight
  x freshness_confidence
  x price_confirmation_modifier
```

Plain-language meaning:

- `source_authority`: official source beats X, social, or proxy.
- `grain_relevance`: soy oil matters for canola more than for barley.
- `seasonal_relevance`: crop condition matters more in June than January.
- `market_structure_weight`: global wheat gets global competition weight; local barley gets feed/basis weight.
- `freshness_confidence`: stale or partial data lowers confidence before it changes direction.
- `price_confirmation_modifier`: price can confirm or challenge the thesis, but does not replace source facts.

## Viking Knowledge Overlay

Viking knowledge should supply interpretation frameworks, not current facts.

| Viking topic | Best use in the impact map |
| --- | --- |
| Basis and pricing | Explain market response, basis divergence, price confirmation, and why futures can move before cash. |
| Storage and carry | Explain old-crop holding, carry/inversion, and the cost of waiting. |
| Logistics and exports | Explain terminal flow, rail friction, vessel queues, and producer-car interpretation. |
| Market structure | Explain COT, grain-company behavior, global origin competition, policy, and tariffs. |
| Grain specifics | Explain quality, grading, crush/feed/milling, and crop-specific relationships. |
| Risk management | Explain thin liquidity, over-hedging risk, margin/counterparty risk, and why public copy must avoid advice. |

If Viking and live data disagree, live data wins on current facts. Viking can still explain why the signal may be weak, seasonal, or risky.

## Market Response Rules

Runtime profiles now include `marketResponses[]` for each V1 grain. These rules explain how the market should interpret combinations of source-backed facts, price confirmation, watch-only global context, and parked gaps.

Each response rule must state:

- `when`: the source pattern or conflict that triggers the interpretation.
- `marketResponse`: the likely bull/bear or confidence read.
- `confidenceImpact`: why conviction should rise, fall, or stay capped.
- `sourceClasses`: whether the rule uses official inputs, price context, watch-only evidence, or parked gaps.
- `vikingTopics`: which distilled-knowledge topics explain the response.

Response rules are interpretation scaffolding, not a new scoring path. A watch-only response can explain why a market might not reward a bullish setup, but it cannot reverse a source-backed score without admitted data.

`buildScorecardLlmPayload()` now publishes the same rules as `market_response_context` in roundtable scorecard guardrail JSON. That payload also carries market shape, market structure, seasonal windows, and Viking topic hooks so LLM roles can explain why a source-backed score may be confirmed, capped, or lower-confidence without changing the deterministic rating.

## Data Coverage Matrix

`lib/thesis/grain-data-coverage.ts` derives a coverage matrix from each grain profile so the audit view can separate five questions:

- `pulled`: does a source/collector lane exist?
- `packeted`: can it enter the thesis packet?
- `scored`: can it move the deterministic Bull/Bear rating?
- `explanation_only`: can it explain response, seasonality, or confidence without scoring?
- `missing`: does the idea still need source admission?

Current mapping:

- `official_thesis_input` and bounded `price_context` factors are score-capable lanes.
- `watch_only` factors are explanation-only until packet admission and mapper tests exist.
- `parked` gaps are missing-source admissions and must not be described as live facts.

The `/thesis?audit=1` Data coverage matrix is an operator tool. It is not a farmer-facing claim that every source is fresh today; freshness still comes from source runs, packet watermarks, and scorecard quality adjustments.

### Source Admission Priorities

The coverage profile also emits a bounded `admissionPriorities[]` list for audit mode. Ranking is intentionally conservative:

1. Promote existing `watch_only` lanes first, because a source family or context row already exists but still needs packet admission, mapper logic, freshness handling, and tests.
2. Admit `parked` / missing-source gaps second, because they still need source identity, collector command, target table or RPC, units, cadence, freshness proof, and mapper design.

Every priority carries a score boundary. A priority can tell operators what to build next, but it cannot become a score input until source admission is complete.

## Next Implementation Slice

Build this map into the app in this sequence:

1. Done: add a typed `grain-impact-map` contract with one profile for each V1 grain.
2. Done: link each profile to scorecard domains and admitted source IDs.
3. Done: add tests that every public V1 grain has a profile and every factor is classified as official, price context, watch-only, or parked.
4. Done: use the profile to refine scorecard domain weights with grain-specific emphasis through `lib/thesis/grain-impact-domain-weights.ts`.
5. Done: render an audit-only "Impact Map" panel on `/thesis?audit=1`.
6. Done: add audit-only market-response rules that connect source facts, price response, watch-only global context, and Viking knowledge overlays, then expose the same response context in the LLM guardrail payload.
7. Done: add an audit-only Data coverage matrix so operators can see which impact lanes are pulled, packeted, scored, explanation-only, or still missing.
8. Done: add audit-only source-admission priorities so operators can see the next watch lanes or missing sources worth admitting before broadening the scoring model.
9. Only after audit proof, decide whether a farmer-facing simplified version belongs on normal `/thesis`.

Do not widen source admission while doing this. Source expansion comes after the map proves where gaps matter.
