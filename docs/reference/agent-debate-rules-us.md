# US Grain Market Rules & Market-Specific Cards

**Purpose:** Country-specific rulebook for the US grain desk swarm. Loaded by `docs/reference/us-desk-swarm-prompt.md` alongside the global ruleset `agent-debate-rules.md`.

**Last updated:** 2026-04-18

**Rule citation format:** `R-US-<MARKET>-NN` (e.g., `R-US-COR-02` = US, Corn, rule 2).

**Scope (v1):** 4 markets — Corn (COR), Soybeans (SOY), Wheat (WHT), Oats (OAT). Wheat treated as one market; class expansion (HRW/SRW/HRS/SWW) deferred to v2.

---

## US Market Context

### Regulators and Data Sources
- **USDA NASS** — weekly crop progress (Apr-Nov), monthly crop production.
- **USDA FAS** — weekly export sales (Thursday AM).
- **USDA ERS + WAOB** — monthly WASDE (12th business day).
- **CFTC** — weekly Commitments of Traders (Friday PM, Tuesday positioning).
- **CBOT / KCBT / MGEX** — futures settlement prices.

### Primary Physical Infrastructure
- **Export ports:** Gulf (NOLA — most corn/soy/wheat), PNW (Portland, Tacoma — most to Asia), Great Lakes (minor), Atlantic (minor).
- **River system:** Mississippi/Illinois river barges feed Gulf. River stages matter for barge freight.
- **Rail:** BNSF + UP + CSX + NS. Shuttle train economics drive Gulf vs PNW routing.

### Data Cadence
- USDA Crop Progress: Monday 4pm ET (Apr-Nov).
- USDA Export Sales: Thursday 8:30am ET.
- WASDE: 12th business day, 12:00pm ET.
- CFTC COT: Friday 3:30pm ET (Tuesday positioning).

### US-Specific Thesis Traps
1. **US market = CBOT baseline.** Unlike Canada, the US has liquid futures on all 4 markets. Directional signal comes from futures + COT, not basis.
2. **China tariffs / PRC tenders are the single largest swing factor** for Corn and Soybeans.
3. **River/barge freight is the hidden basis driver.** Low river = Gulf basis widens vs PNW.
4. **USDA reports create discrete volatility steps** (not gradual compression). WASDE days and Prospective Plantings (March) are event risks, not spring formations.
5. **Condition ratings (good/excellent %) are lagging AND noisy.** Use as context, not as thesis driver.

---

## 🌽 US Corn (COR)

**Compression Index Class:** n/a (CBOT-liquid; use COT + WASDE instead)
**Coiled Spring Fit:** N/A (market too liquid to compress)
**Typical Stance Range:** -50 to +70

### Market Structure Fingerprint
| Dimension            | Value                                            |
|----------------------|--------------------------------------------------|
| US world share       | ~30% of global corn production, ~35% of exports  |
| Futures              | CBOT Corn (highly liquid)                        |
| Key buyers           | China (tender-driven), Mexico (steady), Japan, EU|
| Domestic use         | ~40% ethanol, ~35% feed, ~25% export/other       |
| Primary export ports | Gulf (~70%), PNW (~25%)                          |
| Rail constraint      | Shuttle-train economics; Gulf vs PNW routing     |

### Market-Specific Rules
- **R-US-COR-01 · Ethanol pace is 40% of demand.** EPA RVO, ethanol crush margin, and blending economics drive steady demand. Weekly ethanol production (EIA) is a required data point.
- **R-US-COR-02 · China PRC tender is discrete bullish.** COFCO/SINOGRAIN tender announcements gap corn up. Not continuous — check for tender activity each week.
- **R-US-COR-03 · Mexico is steady 15% of exports.** Grind corn + feed corn; USMCA-stable.
- **R-US-COR-04 · Gulf vs PNW basis spread = freight signal.** When Gulf basis widens vs PNW, river freight is tight. Affects export pace.
- **R-US-COR-05 · USDA WASDE drives discrete steps.** Monthly ending-stocks revisions are event risk. Trade stance should flag "WASDE-in-2-days" and reduce position size.
- **R-US-COR-06 · COT reliable.** Managed money OI ~400k+ contracts. Apply Rules 9-11 with full confidence.
- **R-US-COR-07 · Condition ratings lagging.** G/E% matters for stance, not for this week's trade.

### Thesis-Killers
1. China tender cancellation or shift to Brazil/Ukraine.
2. EPA RVO reduction (ethanol demand compression).
3. South American (Brazil safrinha) bumper crop (Jul-Sep).
4. US ending stocks revision upward >200Mbu.

### Debate Tiebreakers (US-only; no Canadian overlap here)
1. Weekly ethanol production (EIA) vs 4wk avg
2. USDA export sales (Thursday) — net sales + shipments
3. COT managed money positioning
4. Gulf-PNW basis spread
5. WASDE event proximity

---

## 🌱 US Soybeans (SOY)

**Compression Index Class:** n/a (CBOT-liquid)
**Coiled Spring Fit:** N/A
**Typical Stance Range:** -40 to +70

### Market Structure Fingerprint
| Dimension            | Value                                            |
|----------------------|--------------------------------------------------|
| US world share       | ~30% of global soybean production                |
| Futures              | CBOT Soybeans (highly liquid)                    |
| Key buyers           | China (~55% of exports), EU, Mexico, Japan       |
| Domestic crush       | ~55% of supply (ADM, Bunge, Cargill, Ag Processing)|
| Primary export ports | Gulf (~55%), PNW (~35%)                          |
| Brazil competition   | Feb-Jun Brazil window (peak export competition)  |

### Market-Specific Rules
- **R-US-SOY-01 · China is 55% of exports.** Single-buyer concentration. PRC trade policy dominates.
- **R-US-SOY-02 · Brazil Feb-Jun window is bearish US exports.** Brazil harvest + export overlap caps US price in Q2.
- **R-US-SOY-03 · Crush margin drives domestic demand.** Meal + oil combined. Watch soy oil crush margin — biodiesel RIN pricing affects this.
- **R-US-SOY-04 · Soy oil biodiesel demand.** Biodiesel RVO + RIN pricing adds demand layer. 45Z tax credit phase-out risk.
- **R-US-SOY-05 · Argentine crush competition.** Argentine peso policy shifts export pace (they export meal, we export beans).
- **R-US-SOY-06 · COT reliable.** Managed money OI ~300k+ contracts.
- **R-US-SOY-07 · Soy/Corn ratio.** When ratio >2.6, acreage shifts to soy next year (Feb-Mar Prospective Plantings).

### Thesis-Killers
1. China trade deal collapse or shift to 100% Brazil sourcing.
2. Brazil bumper harvest (Feb-Jun).
3. 45Z tax credit phase-out.
4. RIN price collapse (biodiesel demand crash).

### Debate Tiebreakers
1. USDA export sales (weekly Thursday)
2. Crush margin trajectory (soy oil + meal)
3. COT managed money
4. Soy/Corn ratio
5. China PRC tender status

---

## 🌾 US Wheat (WHT)

**Compression Index Class:** n/a (CBOT-liquid, class-split complication)
**Coiled Spring Fit:** N/A
**Typical Stance Range:** -40 to +45

### Market Structure Fingerprint
| Dimension            | Value                                            |
|----------------------|--------------------------------------------------|
| US world share       | ~8% of global wheat trade                        |
| Futures              | CBOT SRW, KCBT HRW, MGEX HRS (3 separate contracts)|
| Key buyers           | Mexico, Philippines, Japan, Indonesia, Egypt     |
| Classes              | HRW (Kansas), HRS (ND/SD), SRW (IL/IN/OH), SWW (PNW)|
| Primary export ports | Gulf, PNW, Great Lakes (seasonal)                |
| Global competition   | Russia, Ukraine, Australia, Canada, EU           |

### Market-Specific Rules
- **R-US-WHT-01 · Russia sets the floor price.** Russian export price is the effective global ceiling for US wheat.
- **R-US-WHT-02 · Class spreads matter.** HRW-SRW spread + protein premium (HRS vs HRW) tell different demand stories. v1 collapses to single score; v2 will split.
- **R-US-WHT-03 · USDA crop progress is the primary driver Apr-Nov.** G/E% revisions + drought classification (US Drought Monitor D0-D4) drive weekly sentiment.
- **R-US-WHT-04 · Egypt GASC tender is step-change.** GASC (Egyptian State Trading Corp) tender announcements drive SRW specifically.
- **R-US-WHT-05 · Winter wheat drought watch (Oct-Apr).** Kansas/Oklahoma drought conditions drive KCBT HRW.
- **R-US-WHT-06 · COT reliable per-class.** Managed money separated by contract (CBOT/KCBT/MGEX). Check all three.
- **R-US-WHT-07 · Class expansion v2.** v1 aggregates into single "US Wheat." v2 will split into 4 cards.

### Thesis-Killers
1. Russian wheat price collapse.
2. Australian bumper harvest (Dec-Jan).
3. GASC tender cancellation.
4. Black Sea corridor expansion.

### Debate Tiebreakers
1. USDA export sales (weekly)
2. HRW drought classification (US Drought Monitor)
3. Russian export price (SovEcon)
4. COT managed money (aggregate across 3 contracts)
5. US Dollar Index trajectory

---

## 🌾 US Oats (OAT)

**Compression Index Class:** n/a (CBOT oats OI too thin for COT; Canadian-import-dependent)
**Coiled Spring Fit:** N/A
**Typical Stance Range:** -50 to +35

### Market Structure Fingerprint
| Dimension            | Value                                            |
|----------------------|--------------------------------------------------|
| US world share       | ~5% of global oat production; net importer       |
| Futures              | CBOT Oats (low OI ~5-10k contracts)              |
| Key producers        | North Dakota, Minnesota, Wisconsin, South Dakota |
| Primary use          | Milling (Quaker, General Mills), horse feed      |
| Canadian import share| 75-85% of US oat supply is imported from Canada  |

### Market-Specific Rules
- **R-US-OAT-01 · US is net importer from Canada.** 75-85% of US oat supply comes from Canadian producer car shipments. US market moves with Canadian supply.
- **R-US-OAT-02 · CBOT oats COT unreliable.** Low OI — do not apply Rules 9-11 to oats.
- **R-US-OAT-03 · Quaker + General Mills are the market.** Annual contract cycles (Sep-Oct) create discrete demand steps.
- **R-US-OAT-04 · Cross-border rail + FDA import channel.** Canadian producer car shipments to US millers cross at Emerson, MB / Noyes, MN and other ports.
- **R-US-OAT-05 · US oat price = Canadian producer car price + cross-border friction.** Canadian supply constraint passes through directly.
- **R-US-OAT-06 · Weak futures signal.** Directional only; no meaningful timing from COT or term structure.

### Thesis-Killers
1. Quaker contract cycle contraction.
2. European oat import surge (rare — logistics).
3. Canadian rail allocation squeeze reducing US supply.

### Debate Tiebreakers
1. Canadian producer car oat allocation (primary feed-in signal)
2. Quaker contract cycle phase
3. CBOT Oats front-month (directional only)
4. US miller inventory signals

---
