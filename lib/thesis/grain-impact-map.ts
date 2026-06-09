import type { VikingTopic } from "@/lib/knowledge/viking-l1";
import type { RatingDomainId, SupportedRatingGrain } from "@/lib/thesis/rating-model";

export const IMPACT_SOURCE_CLASSES = [
  "official_thesis_input",
  "price_context",
  "watch_only",
  "parked",
] as const;

export type ImpactSourceClass = (typeof IMPACT_SOURCE_CLASSES)[number];

export type ImpactScope = "canada" | "us" | "cross_border" | "world" | "local";

export type GrainMarketShape =
  | "canada_first"
  | "us_led"
  | "global_benchmark"
  | "specialty"
  | "thin_market";

export interface GrainImpactFactor {
  id: string;
  label: string;
  domain: RatingDomainId;
  scope: ImpactScope;
  sourceClass: ImpactSourceClass;
  sourceIds: readonly string[];
  bullSignal: string;
  bearSignal: string;
  boundary: string;
}

export interface GrainImpactRelationship {
  target: string;
  kind: "substitute" | "competitor_origin" | "demand_anchor" | "quality_anchor" | "policy_anchor";
  sourceClass: ImpactSourceClass;
  note: string;
}

export interface GrainMarketResponseRule {
  id: string;
  label: string;
  when: string;
  marketResponse: string;
  confidenceImpact: string;
  vikingTopics: readonly VikingTopic[];
  sourceClasses: readonly ImpactSourceClass[];
}

export interface GrainImpactProfile {
  grain: SupportedRatingGrain;
  marketShape: GrainMarketShape;
  marketStructure: string;
  vikingTopics: readonly VikingTopic[];
  seasonalWindows: readonly string[];
  impactFactors: readonly GrainImpactFactor[];
  marketResponses: readonly GrainMarketResponseRule[];
  relationships: readonly GrainImpactRelationship[];
  parkedGaps: readonly string[];
}

function factor(input: GrainImpactFactor): GrainImpactFactor {
  return input;
}

function relationship(input: GrainImpactRelationship): GrainImpactRelationship {
  return input;
}

function marketResponse(input: GrainMarketResponseRule): GrainMarketResponseRule {
  return input;
}

const COMMON_CANADA_FLOW_SOURCES = ["cgc_observations", "cgc_imports"] as const;
const COMMON_CANADA_LOGISTICS_SOURCES = ["grain_monitor_snapshots", "producer_car_allocations"] as const;
const COMMON_US_BASELINE_SOURCES = ["usda_crop_progress", "usda_export_sales", "usda_wasde_mapped"] as const;
const COMMON_PRICE_SOURCES = ["grain_prices", "fx_rates", "grain_price_intraday"] as const;
const COMMON_GLOBAL_BALANCE_SOURCES = ["usda_wasde_raw"] as const;

export const GRAIN_IMPACT_PROFILES = {
  Canola: {
    grain: "Canola",
    marketShape: "canada_first",
    marketStructure:
      "Canada-first oilseed with strong crush, export, vegetable-oil, soy-complex, China, and policy sensitivity.",
    vikingTopics: ["basis_pricing", "storage_carry", "logistics_exports", "market_structure", "grain_specifics", "risk_management"],
    seasonalWindows: ["Apr-May seeding", "Jun-Jul crop condition", "Aug-Sep harvest quality", "Feb-Jul old-crop carry"],
    impactFactors: [
      factor({
        id: "canola-supply-baseline",
        label: "Canadian supply, seeded area, yield, and crop condition",
        domain: "supply",
        scope: "canada",
        sourceClass: "official_thesis_input",
        sourceIds: ["supply_disposition", "canada_crop_progress"],
        bullSignal: "Lower supply or crop stress tightens old-crop and new-crop coverage.",
        bearSignal: "Larger supply, good condition, or acreage expansion caps rallies.",
        boundary: "Crop progress is a proxy for weather until direct weather is admitted.",
      }),
      factor({
        id: "canola-saskatchewan-oilseed-development",
        label: "Saskatchewan oilseed crop-development timing",
        domain: "weather",
        scope: "canada",
        sourceClass: "official_thesis_input",
        sourceIds: ["canada_crop_progress"],
        bullSignal: "Behind-normal oilseed development warns that heat, moisture, or late-crop timing could lift yield and harvest-quality risk.",
        bearSignal: "Normal or ahead oilseed development lowers timing risk only if crop-specific condition rows later confirm it.",
        boundary: "Saskatchewan Oilseeds rows are official group-level timing proxies, not crop-specific Canola condition facts; mapper confidence is capped as proxy evidence.",
      }),
      factor({
        id: "canola-prairie-cropland-moisture",
        label: "Prairie cropland and surface-soil moisture proxy",
        domain: "weather",
        scope: "canada",
        sourceClass: "official_thesis_input",
        sourceIds: ["canada_crop_progress"],
        bullSignal: "Low adequate/surplus moisture in official AB/SK reports raises near-term crop-stress risk for Prairie canola.",
        bearSignal: "High adequate/surplus moisture lowers immediate moisture-stress risk, but does not prove yield.",
        boundary: "Cropland and All Crops moisture rows are broad provincial proxy evidence, not crop-specific Canola condition, quality, or yield facts; mapper confidence is capped as proxy evidence.",
      }),
      factor({
        id: "canola-crush-export-demand",
        label: "Crush, process deliveries, terminal exports, and direct export flows",
        domain: "demand",
        scope: "canada",
        sourceClass: "official_thesis_input",
        sourceIds: COMMON_CANADA_FLOW_SOURCES,
        bullSignal: "Active crush/export demand clears deliveries and supports basis.",
        bearSignal: "Weak disappearance lets deliveries build commercial pressure.",
        boundary: "CGC movement proves physical flow, not buyer motive.",
      }),
      factor({
        id: "canola-oilseed-complex",
        label: "Soybeans, soybean oil, soybean meal, palm oil, and global vegetable oils",
        domain: "price",
        scope: "cross_border",
        sourceClass: "price_context",
        sourceIds: ["grain_prices", "cftc_cot_positions"],
        bullSignal: "Soy oil/meal strength confirms oilseed demand and canola follow-through.",
        bearSignal: "Weak veg-oil complex or soybean pressure drags on canola.",
        boundary: "Palm oil and detailed crush-margin collectors are parked.",
      }),
      factor({
        id: "canola-global-policy-veg-oil-watch",
        label: "China policy, palm oil, and global vegetable-oil trade",
        domain: "demand",
        scope: "world",
        sourceClass: "watch_only",
        sourceIds: COMMON_GLOBAL_BALANCE_SOURCES,
        bullSignal: "Import access, tight veg-oil balances, or policy relief can extend Canadian canola demand.",
        bearSignal: "Trade restrictions, palm/soy oil weakness, or policy risk can cap crush/export optimism.",
        boundary: "Raw WASDE/PSD can anchor broad oilseed balance context; country policy, palm oil, and customs detail are not direct admitted score sources.",
      }),
      factor({
        id: "canola-logistics",
        label: "Port, rail, and producer-car execution",
        domain: "logistics",
        scope: "canada",
        sourceClass: "official_thesis_input",
        sourceIds: COMMON_CANADA_LOGISTICS_SOURCES,
        bullSignal: "Logistics clear while demand remains active.",
        bearSignal: "Corridor friction blocks demand and widens local pressure.",
        boundary: "Grain Monitor lag must be visible.",
      }),
    ],
    marketResponses: [
      marketResponse({
        id: "canola-flow-price-confirmation",
        label: "Flow plus soy-complex confirmation",
        when: "Canadian supply stress or tight carry meets active crush/export flow and soy-complex price confirmation.",
        marketResponse:
          "Bull pressure is more credible because physical disappearance and cross-market oilseed value are agreeing.",
        confidenceImpact:
          "Confidence rises only when official flow is fresh; stale prices or watch-only policy risk should cap conviction.",
        vikingTopics: ["basis_pricing", "logistics_exports", "market_structure", "grain_specifics"],
        sourceClasses: ["official_thesis_input", "price_context", "watch_only"],
      }),
      marketResponse({
        id: "canola-policy-veg-oil-veto",
        label: "Policy or veg-oil veto",
        when: "CGC flow is supportive but China policy, palm/soy oil, or global veg-oil tone is adverse.",
        marketResponse:
          "The board should read the local data as supportive but lower-confidence until price and policy evidence agree.",
        confidenceImpact:
          "Do not let watch-only policy or palm-oil context flip the score; use it to explain divergence and inspection priority.",
        vikingTopics: ["market_structure", "risk_management"],
        sourceClasses: ["official_thesis_input", "price_context", "watch_only"],
      }),
    ],
    relationships: [
      relationship({
        target: "Soybeans",
        kind: "substitute",
        sourceClass: "price_context",
        note: "Soybeans and soy products are the main public cross-market context for canola.",
      }),
      relationship({
        target: "China policy",
        kind: "policy_anchor",
        sourceClass: "watch_only",
        note: "Policy can move canola, but public thesis needs official or desk-corroborated evidence.",
      }),
    ],
    parkedGaps: ["local basis", "explicit crush margins", "palm oil collector", "quality-grade scoring"],
  },
  Wheat: {
    grain: "Wheat",
    marketShape: "global_benchmark",
    marketStructure:
      "Global benchmark grain where Canada/US data matters but Black Sea, EU, Australia, quality class, and feed substitution can dominate.",
    vikingTopics: ["basis_pricing", "storage_carry", "logistics_exports", "market_structure", "grain_specifics", "risk_management"],
    seasonalWindows: ["Mar-Jun wheat trend window", "Apr-May seeding", "Jun-Jul crop condition", "Aug-Sep harvest quality"],
    impactFactors: [
      factor({
        id: "wheat-ca-us-supply",
        label: "Canada and US crop condition, acreage, WASDE supply, and stocks",
        domain: "supply",
        scope: "cross_border",
        sourceClass: "official_thesis_input",
        sourceIds: ["canada_crop_progress", "usda_crop_progress", "usda_wasde_mapped", "usda_quarterly_stocks"],
        bullSignal: "Crop or quality damage tightens available milling/feed supply.",
        bearSignal: "Large crops and comfortable stocks weaken scarcity premium.",
        boundary: "Do not use generic Wheat as a Spring/Winter Wheat proxy.",
      }),
      factor({
        id: "wheat-canada-supply-baseline",
        label: "Canada Wheat supply-disposition baseline",
        domain: "supply",
        scope: "canada",
        sourceClass: "official_thesis_input",
        sourceIds: ["supply_disposition"],
        bullSignal: "Tighter production, carryout, or total supply increases Canadian wheat scarcity pressure.",
        bearSignal: "Comfortable production, carryout, or total supply caps Canadian wheat scarcity pressure.",
        boundary: "Slower supply-disposition context should anchor the read, not override fresher weekly movement.",
      }),
      factor({
        id: "wheat-saskatchewan-spring-cereal-development",
        label: "Saskatchewan spring-cereal crop-development timing",
        domain: "weather",
        scope: "canada",
        sourceClass: "official_thesis_input",
        sourceIds: ["canada_crop_progress"],
        bullSignal: "Behind-normal spring-cereal development can flag Prairie timing and quality risk before direct wheat-class evidence lands.",
        bearSignal: "Normal or ahead spring-cereal development is comfort only when class-safe wheat evidence also supports it.",
        boundary: "Spring Cereals rows are official group-level timing proxies for the public Wheat lane only; they do not unlock Spring/Winter Wheat proxy scoring.",
      }),
      factor({
        id: "wheat-prairie-cropland-moisture",
        label: "Prairie cropland and surface-soil moisture proxy",
        domain: "weather",
        scope: "canada",
        sourceClass: "official_thesis_input",
        sourceIds: ["canada_crop_progress"],
        bullSignal: "Low adequate/surplus moisture in official AB/SK reports can lift Prairie wheat crop-stress and quality-risk inspection priority.",
        bearSignal: "High adequate/surplus moisture lowers immediate moisture-stress risk, while global wheat origin pressure can still cap price response.",
        boundary: "Cropland and All Crops moisture rows are broad provincial proxy evidence, not crop-specific or class-specific Wheat condition, quality, or yield facts; mapper confidence is capped as proxy evidence.",
      }),
      factor({
        id: "wheat-export-demand",
        label: "CGC exports, USDA export sales, and global tender pressure",
        domain: "demand",
        scope: "world",
        sourceClass: "official_thesis_input",
        sourceIds: ["cgc_observations", "usda_export_sales", "usda_wasde_mapped"],
        bullSignal: "Export pull and stock draw imply physical demand is active.",
        bearSignal: "Weak sales or cheaper global origins cap bids.",
        boundary: "Tender-level Black Sea/EU/Australia collection is parked.",
      }),
      factor({
        id: "wheat-logistics",
        label: "Canadian port, rail, terminal, and producer-car execution",
        domain: "logistics",
        scope: "canada",
        sourceClass: "official_thesis_input",
        sourceIds: COMMON_CANADA_LOGISTICS_SOURCES,
        bullSignal: "Clear logistics help export pull reach the farm gate instead of backing up in the system.",
        bearSignal: "Port, rail, terminal, or producer-car friction can mute supportive demand evidence.",
        boundary: "Canada logistics are admitted with visible lag; US logistics remains parked for Wheat V1.",
      }),
      factor({
        id: "wheat-global-origin-competition",
        label: "Black Sea, EU, Australia, and other export-origin competition",
        domain: "supply",
        scope: "world",
        sourceClass: "watch_only",
        sourceIds: COMMON_GLOBAL_BALANCE_SOURCES,
        bullSignal: "Competitor crop or logistics disruption can lift Canada/US wheat demand and quality premiums.",
        bearSignal: "Cheap or abundant competing origins can cap local bull signals even when Canada/US data is supportive.",
        boundary: "Raw WASDE/PSD can frame world wheat balance; origin-specific tender, freight, and policy feeds are not admitted.",
      }),
      factor({
        id: "wheat-x-pulse-watch",
        label: "X Pulse watch leads and social-source evidence",
        domain: "demand",
        scope: "world",
        sourceClass: "watch_only",
        sourceIds: ["x_scout_runs", "x_market_signals"],
        bullSignal: "Trusted-handle chatter can identify Wheat demand, policy, logistics, or basis claims worth inspecting.",
        bearSignal: "Trusted-handle chatter can identify Wheat risk claims worth inspecting before the next desk review.",
        boundary: "X Pulse is watch-only: it cannot author, rank, or move Wheat thesis facts without official-source or desk corroboration.",
      }),
      factor({
        id: "wheat-feed-substitution",
        label: "Wheat/corn feed substitution and quality spread",
        domain: "price",
        scope: "cross_border",
        sourceClass: "price_context",
        sourceIds: COMMON_PRICE_SOURCES,
        bullSignal: "Quality premium or feed substitution supports wheat relative value.",
        bearSignal: "Cheap corn or weak wheat spreads pull feed demand away.",
        boundary: "Quality-grade source feed is parked.",
      }),
      factor({
        id: "wheat-positioning",
        label: "CFTC wheat positioning and fund crowding",
        domain: "positioning",
        scope: "cross_border",
        sourceClass: "official_thesis_input",
        sourceIds: ["cftc_cot_positions"],
        bullSignal: "Managed-money short covering or net-long support can confirm source-backed Wheat strength.",
        bearSignal: "Fund selling or crowded longs can challenge a source-backed bull read.",
        boundary: "Positioning confirms or challenges source facts; it does not replace supply and demand evidence.",
      }),
    ],
    marketResponses: [
      marketResponse({
        id: "wheat-local-bull-global-cap",
        label: "Local bull signal capped by global origins",
        when: "Canada/US wheat data is supportive but Black Sea, EU, or Australia origin context is cheap or abundant.",
        marketResponse:
          "The thesis can stay locally constructive while broad futures conviction is capped by competing export origins.",
        confidenceImpact:
          "Keep competitor-origin pressure watch-only unless an admitted global-origin source proves the pressure.",
        vikingTopics: ["market_structure", "logistics_exports", "basis_pricing"],
        sourceClasses: ["official_thesis_input", "price_context", "watch_only"],
      }),
      marketResponse({
        id: "wheat-quality-price-confirmation",
        label: "Quality scarcity plus price confirmation",
        when: "Crop stress or quality risk aligns with export pull and wheat/corn or wheat-class price strength.",
        marketResponse:
          "Bull pressure is stronger because supply quality, demand pull, and relative value are pointing the same way.",
        confidenceImpact:
          "Confidence stays lower while Spring/Winter class mapping and grade-quality feeds are parked.",
        vikingTopics: ["grain_specifics", "basis_pricing", "risk_management"],
        sourceClasses: ["official_thesis_input", "price_context", "parked"],
      }),
    ],
    relationships: [
      relationship({
        target: "Corn",
        kind: "substitute",
        sourceClass: "price_context",
        note: "Feed wheat competes with corn when spreads narrow.",
      }),
      relationship({
        target: "Black Sea/EU/Australia",
        kind: "competitor_origin",
        sourceClass: "watch_only",
        note: "Global origins can cap wheat even when local data is supportive.",
      }),
    ],
    parkedGaps: ["Spring Wheat mapping", "Winter Wheat mapping", "global origin collector", "protein/falling-number feed", "local basis"],
  },
  Durum: {
    grain: "Durum",
    marketShape: "specialty",
    marketStructure:
      "Canada-first specialty wheat where quality and Mediterranean/North Africa import demand can swing value.",
    vikingTopics: ["basis_pricing", "storage_carry", "logistics_exports", "market_structure", "grain_specifics", "risk_management"],
    seasonalWindows: ["Apr-May seeding", "Jul-Aug quality risk", "Aug-Sep harvest quality", "fall export program"],
    impactFactors: [
      factor({
        id: "durum-quality-supply",
        label: "Prairie durum acres, yield, harvest weather, and quality risk",
        domain: "supply",
        scope: "canada",
        sourceClass: "official_thesis_input",
        sourceIds: ["supply_disposition", "canada_crop_progress"],
        bullSignal: "Quality or production risk tightens exportable durum supply.",
        bearSignal: "Good quality and ample production weaken premium risk.",
        boundary: "Direct grade-quality scoring is parked.",
      }),
      factor({
        id: "durum-saskatchewan-spring-cereal-development",
        label: "Saskatchewan spring-cereal development as durum timing context",
        domain: "weather",
        scope: "canada",
        sourceClass: "official_thesis_input",
        sourceIds: ["canada_crop_progress"],
        bullSignal: "Behind-normal spring-cereal development can warn that durum quality and harvest timing deserve closer review.",
        bearSignal: "Normal or ahead spring-cereal development reduces timing concern only when direct durum rows confirm it.",
        boundary: "Spring Cereals rows are official group-level timing proxies, not crop-specific Durum condition or quality facts; mapper confidence is capped as proxy evidence.",
      }),
      factor({
        id: "durum-prairie-cropland-moisture",
        label: "Prairie cropland and surface-soil moisture proxy",
        domain: "weather",
        scope: "canada",
        sourceClass: "official_thesis_input",
        sourceIds: ["canada_crop_progress"],
        bullSignal: "Low adequate/surplus moisture can lift durum production and harvest-quality inspection priority in the Prairie core.",
        bearSignal: "High adequate/surplus moisture lowers immediate moisture-stress risk, but durum quality still needs direct grade evidence.",
        boundary: "Cropland and All Crops moisture rows are broad provincial proxy evidence, not crop-specific Durum condition, quality, or yield facts; mapper confidence is capped as proxy evidence.",
      }),
      factor({
        id: "durum-export-flow",
        label: "CGC export movement and commercial stocks",
        domain: "demand",
        scope: "canada",
        sourceClass: "official_thesis_input",
        sourceIds: COMMON_CANADA_FLOW_SOURCES,
        bullSignal: "Exports pull against limited supply.",
        bearSignal: "Slow exports and rising stocks show thin demand.",
        boundary: "CGC does not identify final tender/buyer economics.",
      }),
      factor({
        id: "durum-import-tender-watch",
        label: "Mediterranean and North Africa import demand",
        domain: "demand",
        scope: "world",
        sourceClass: "watch_only",
        sourceIds: COMMON_GLOBAL_BALANCE_SOURCES,
        bullSignal: "Tenders pull from Canada when alternatives are weak.",
        bearSignal: "Buyers shift to cheaper origins or delay coverage.",
        boundary: "Raw WASDE/PSD can frame wheat balance; durum-specific tender/import economics are not admitted.",
      }),
    ],
    marketResponses: [
      marketResponse({
        id: "durum-quality-export-confirmation",
        label: "Quality risk plus export pull",
        when: "Prairie quality or production risk appears while CGC export flow is active.",
        marketResponse:
          "Durum can stay bullish even without a clean futures equivalent because exportable quality supply is the scarce asset.",
        confidenceImpact:
          "Confidence is bounded until direct grade-quality and cash-premium sources are admitted.",
        vikingTopics: ["grain_specifics", "logistics_exports", "basis_pricing"],
        sourceClasses: ["official_thesis_input", "watch_only", "parked"],
      }),
      marketResponse({
        id: "durum-tender-demand-watch",
        label: "Tender demand watch lane",
        when: "Mediterranean or North Africa demand context conflicts with Canadian flow.",
        marketResponse:
          "Treat tender context as an inspection lead; Canadian flow remains the scored fact until tender data is admitted.",
        confidenceImpact:
          "Watch-only tender context can lower confidence, but it cannot reverse the deterministic score.",
        vikingTopics: ["market_structure", "risk_management"],
        sourceClasses: ["official_thesis_input", "watch_only"],
      }),
    ],
    relationships: [
      relationship({
        target: "North Africa and Mediterranean buyers",
        kind: "demand_anchor",
        sourceClass: "watch_only",
        note: "Important for durum but not yet source-contracted.",
      }),
      relationship({
        target: "Wheat",
        kind: "quality_anchor",
        sourceClass: "price_context",
        note: "Wheat futures are weak context only, not a direct durum hedge.",
      }),
    ],
    parkedGaps: ["durum tender collector", "direct cash premium source", "grade-quality feed", "direct futures equivalent"],
  },
  Barley: {
    grain: "Barley",
    marketShape: "specialty",
    marketStructure:
      "Feed and malt split where Western Canadian feedlot demand, malt specs, corn substitution, and export programs can disagree.",
    vikingTopics: ["basis_pricing", "storage_carry", "logistics_exports", "market_structure", "grain_specifics", "risk_management"],
    seasonalWindows: ["Apr-May seeding", "Aug-Sep malt quality", "fall feed movement", "winter feed demand"],
    impactFactors: [
      factor({
        id: "barley-supply-quality",
        label: "Canadian/US barley acres, condition, harvest, and malt quality risk",
        domain: "supply",
        scope: "cross_border",
        sourceClass: "official_thesis_input",
        sourceIds: ["canada_crop_progress", ...COMMON_US_BASELINE_SOURCES],
        bullSignal: "Tight feed supply or poor malt selectability supports bids.",
        bearSignal: "Large feed supply or good condition reduces scarcity.",
        boundary: "Malt acceptance and premium data are parked.",
      }),
      factor({
        id: "barley-saskatchewan-spring-cereal-development",
        label: "Saskatchewan spring-cereal development as barley timing context",
        domain: "weather",
        scope: "canada",
        sourceClass: "official_thesis_input",
        sourceIds: ["canada_crop_progress"],
        bullSignal: "Behind-normal spring-cereal development can raise feed and malt quality timing risk.",
        bearSignal: "Normal or ahead spring-cereal development is only comfort until direct barley condition or quality rows support it.",
        boundary: "Spring Cereals rows are official group-level timing proxies, not crop-specific Barley condition or malt-quality facts; mapper confidence is capped as proxy evidence.",
      }),
      factor({
        id: "barley-prairie-cropland-moisture",
        label: "Prairie cropland and surface-soil moisture proxy",
        domain: "weather",
        scope: "canada",
        sourceClass: "official_thesis_input",
        sourceIds: ["canada_crop_progress"],
        bullSignal: "Low adequate/surplus moisture can lift feed-supply and malt-quality inspection priority.",
        bearSignal: "High adequate/surplus moisture lowers immediate moisture-stress risk, but malt selectability still needs direct evidence.",
        boundary: "Cropland and All Crops moisture rows are broad provincial proxy evidence, not crop-specific Barley condition, malt quality, or yield facts; mapper confidence is capped as proxy evidence.",
      }),
      factor({
        id: "barley-feed-export-demand",
        label: "Feed, malt, export, and domestic/process movement",
        domain: "demand",
        scope: "canada",
        sourceClass: "official_thesis_input",
        sourceIds: COMMON_CANADA_FLOW_SOURCES,
        bullSignal: "Feed/export pull absorbs producer deliveries.",
        bearSignal: "Weak demand lets harvest or delivery pressure build.",
        boundary: "Feedlot demand is inferred only when admitted sources support it.",
      }),
      factor({
        id: "barley-corn-substitution",
        label: "Corn equivalent and feed substitution",
        domain: "price",
        scope: "cross_border",
        sourceClass: "price_context",
        sourceIds: COMMON_PRICE_SOURCES,
        bullSignal: "Barley gains feed value when corn is expensive or unavailable locally.",
        bearSignal: "Cheap corn caps feed barley bids.",
        boundary: "Local feed barley basis is parked.",
      }),
      factor({
        id: "barley-global-feed-malt-competition",
        label: "Global feed-grain and malt-barley origin competition",
        domain: "demand",
        scope: "world",
        sourceClass: "watch_only",
        sourceIds: COMMON_GLOBAL_BALANCE_SOURCES,
        bullSignal: "Weak competing feed or malt supply can pull more demand toward Canadian barley.",
        bearSignal: "Cheap global feed grains or better malt origins can cap Canadian barley demand.",
        boundary: "Raw WASDE/PSD can frame feed-grain balance; malt acceptance, origin pricing, and tender data are not admitted.",
      }),
    ],
    marketResponses: [
      marketResponse({
        id: "barley-feed-corn-cap",
        label: "Feed barley capped by corn",
        when: "Canadian barley flow is supportive but corn is cheap or easier to source.",
        marketResponse:
          "Barley demand can be locally firm while price upside is capped by feed substitution.",
        confidenceImpact:
          "Use corn as price context; do not infer feedlot demand without admitted local or official support.",
        vikingTopics: ["basis_pricing", "market_structure", "grain_specifics"],
        sourceClasses: ["official_thesis_input", "price_context", "parked"],
      }),
      marketResponse({
        id: "barley-malt-quality-split",
        label: "Feed versus malt split",
        when: "Feed demand, export flow, and malt-quality risk point in different directions.",
        marketResponse:
          "The board should lower broad conviction and explain whether the signal is feed-barley, malt-barley, or blended.",
        confidenceImpact:
          "Malt quality remains parked; it can flag risk but cannot score until a source is admitted.",
        vikingTopics: ["grain_specifics", "risk_management"],
        sourceClasses: ["official_thesis_input", "watch_only", "parked"],
      }),
    ],
    relationships: [
      relationship({
        target: "Corn",
        kind: "substitute",
        sourceClass: "price_context",
        note: "Corn is the main feed substitute and price ceiling.",
      }),
      relationship({
        target: "Malt specifications",
        kind: "quality_anchor",
        sourceClass: "parked",
        note: "Malt selectability changes value but needs an admitted source.",
      }),
    ],
    parkedGaps: ["local feed barley bids", "malt premium data", "feedlot demand proxy", "direct COT mapping"],
  },
  Oats: {
    grain: "Oats",
    marketShape: "thin_market",
    marketStructure:
      "Thin milling/food market where quality and small supply changes can matter more than broad feed-grain trends.",
    vikingTopics: ["basis_pricing", "storage_carry", "logistics_exports", "market_structure", "grain_specifics", "risk_management"],
    seasonalWindows: ["Apr-May seeding", "Jul-Aug yield and test weight risk", "Aug-Sep harvest quality", "winter milling demand"],
    impactFactors: [
      factor({
        id: "oats-supply-quality",
        label: "Canadian/US acreage, condition, yield, stocks, and milling quality",
        domain: "supply",
        scope: "cross_border",
        sourceClass: "official_thesis_input",
        sourceIds: ["canada_crop_progress", ...COMMON_US_BASELINE_SOURCES],
        bullSignal: "Crop or quality stress tightens milling supply.",
        bearSignal: "Adequate supply and good condition reduce premium risk.",
        boundary: "Milling quality source data is parked.",
      }),
      factor({
        id: "oats-saskatchewan-spring-cereal-development",
        label: "Saskatchewan spring-cereal development as oats timing context",
        domain: "weather",
        scope: "canada",
        sourceClass: "official_thesis_input",
        sourceIds: ["canada_crop_progress"],
        bullSignal: "Behind-normal spring-cereal development can flag yield, test-weight, and harvest-timing risk for oats.",
        bearSignal: "Normal or ahead spring-cereal development is only comfort until direct oats condition or quality rows support it.",
        boundary: "Spring Cereals rows are official group-level timing proxies, not crop-specific Oats condition or milling-quality facts; mapper confidence is capped as proxy evidence.",
      }),
      factor({
        id: "oats-prairie-cropland-moisture",
        label: "Prairie cropland and surface-soil moisture proxy",
        domain: "weather",
        scope: "canada",
        sourceClass: "official_thesis_input",
        sourceIds: ["canada_crop_progress"],
        bullSignal: "Low adequate/surplus moisture can lift yield, test-weight, and milling-quality inspection priority in a thin oats market.",
        bearSignal: "High adequate/surplus moisture lowers immediate moisture-stress risk, but milling quality still needs direct source evidence.",
        boundary: "Cropland and All Crops moisture rows are broad provincial proxy evidence, not crop-specific Oats condition, milling quality, or yield facts; mapper confidence is capped as proxy evidence.",
      }),
      factor({
        id: "oats-milling-demand",
        label: "Milling demand, export sales, and domestic use",
        domain: "demand",
        scope: "cross_border",
        sourceClass: "official_thesis_input",
        sourceIds: ["cgc_observations", "usda_export_sales", "usda_wasde_mapped"],
        bullSignal: "Milling/export pull against tight stocks supports price.",
        bearSignal: "Weak demand or adequate stocks lowers thin-market urgency.",
        boundary: "Miller bid data is parked.",
      }),
      factor({
        id: "oats-thin-liquidity",
        label: "Thin futures liquidity and COT confidence cap",
        domain: "positioning",
        scope: "us",
        sourceClass: "official_thesis_input",
        sourceIds: ["cftc_cot_positions", "grain_prices"],
        bullSignal: "COT and futures can confirm direction when physical data agrees.",
        bearSignal: "Futures movement unsupported by physical data should reduce confidence.",
        boundary: "Thin liquidity should cap confidence.",
      }),
      factor({
        id: "oats-cross-border-milling-import-watch",
        label: "Cross-border milling demand and import competition",
        domain: "demand",
        scope: "cross_border",
        sourceClass: "watch_only",
        sourceIds: COMMON_GLOBAL_BALANCE_SOURCES,
        bullSignal: "Milling demand against small North American supply can tighten oats quickly.",
        bearSignal: "Adequate imports or weak milling demand can soften thin-market urgency.",
        boundary: "Miller bids, import execution, and quality specs are not admitted direct score sources.",
      }),
    ],
    marketResponses: [
      marketResponse({
        id: "oats-thin-market-confirmation",
        label: "Thin-market physical confirmation",
        when: "Tight stocks or active milling/export pull appears with supportive price or COT evidence.",
        marketResponse:
          "Small physical changes can justify a larger oats response than broad feed-grain logic would suggest.",
        confidenceImpact:
          "Thin liquidity should cap confidence unless physical data and price evidence agree.",
        vikingTopics: ["market_structure", "basis_pricing", "risk_management"],
        sourceClasses: ["official_thesis_input", "price_context"],
      }),
      marketResponse({
        id: "oats-quality-import-watch",
        label: "Milling quality and import watch",
        when: "Physical oats data is supportive but milling quality, import, or buyer context is unknown.",
        marketResponse:
          "Keep the thesis cautious: supply can look tight while miller quality fit or imports soften the market response.",
        confidenceImpact:
          "Quality and import context stay watch-only/parked until source contracts exist.",
        vikingTopics: ["grain_specifics", "risk_management"],
        sourceClasses: ["official_thesis_input", "watch_only", "parked"],
      }),
    ],
    relationships: [
      relationship({
        target: "Milling quality",
        kind: "quality_anchor",
        sourceClass: "parked",
        note: "Test weight and groat content need an admitted source before scoring.",
      }),
    ],
    parkedGaps: ["milling bids", "test weight and groat quality", "local basis", "liquidity confidence cap UI"],
  },
  Corn: {
    grain: "Corn",
    marketShape: "us_led",
    marketStructure:
      "US-led feed, ethanol, export, and global benchmark crop. Canadian corn is local context; US supply/demand sets most direction.",
    vikingTopics: ["basis_pricing", "storage_carry", "logistics_exports", "market_structure", "grain_specifics", "risk_management"],
    seasonalWindows: ["Mar acreage intentions", "Apr-May planting", "Jun-Aug weather trend", "Sep-Nov harvest", "monthly WASDE"],
    impactFactors: [
      factor({
        id: "corn-us-supply",
        label: "US planting, condition, harvest, WASDE production, and stocks",
        domain: "supply",
        scope: "us",
        sourceClass: "official_thesis_input",
        sourceIds: COMMON_US_BASELINE_SOURCES,
        bullSignal: "US crop stress or stocks cuts tighten global feed supply.",
        bearSignal: "Large US crop and comfortable stocks pressure price.",
        boundary: "US crop progress seasonality must gate weather weight.",
      }),
      factor({
        id: "corn-demand",
        label: "Export sales, WASDE feed/residual, and ethanol use",
        domain: "demand",
        scope: "us",
        sourceClass: "official_thesis_input",
        sourceIds: ["usda_export_sales", "usda_wasde_mapped"],
        bullSignal: "Exports, ethanol, or feed demand run ahead of baseline.",
        bearSignal: "Weak sales or use revisions lower demand pressure.",
        boundary: "Ethanol margins are parked.",
      }),
      factor({
        id: "corn-south-america-competition",
        label: "Brazil and Argentina crop/export competition",
        domain: "supply",
        scope: "world",
        sourceClass: "watch_only",
        sourceIds: COMMON_GLOBAL_BALANCE_SOURCES,
        bullSignal: "South American crop or export disruption can shift demand back toward US corn.",
        bearSignal: "Large or cheap Brazil/Argentina supply can cap US-led bull pressure.",
        boundary: "Raw WASDE/PSD can frame global corn balance; country export pace, freight, and safrinha detail need source admission.",
      }),
      factor({
        id: "corn-price-positioning",
        label: "CBOT corn, CAD/USD, and CFTC positioning",
        domain: "positioning",
        scope: "us",
        sourceClass: "official_thesis_input",
        sourceIds: ["grain_prices", "cftc_cot_positions"],
        bullSignal: "Short-covering or price confirmation supports source-backed bull reads.",
        bearSignal: "Fund selling or price failure challenges supportive fundamentals.",
        boundary: "Price confirms or challenges; it does not replace source facts.",
      }),
    ],
    marketResponses: [
      marketResponse({
        id: "corn-us-led-confirmation",
        label: "US-led confirmation stack",
        when: "US crop stress or stocks cuts align with export/feed/ethanol demand and price or COT confirmation.",
        marketResponse:
          "Corn can become a high-conviction bull read because the US balance sheet sets global feed-grain direction.",
        confidenceImpact:
          "Confidence drops when price or positioning rejects the fundamental signal.",
        vikingTopics: ["market_structure", "basis_pricing", "risk_management"],
        sourceClasses: ["official_thesis_input", "price_context"],
      }),
      marketResponse({
        id: "corn-south-america-offset",
        label: "South America offset",
        when: "US fundamentals are supportive but Brazil/Argentina supply or exports are heavy.",
        marketResponse:
          "Treat the US read as constructive but globally capped until admitted South America evidence agrees.",
        confidenceImpact:
          "South America remains watch-only; it explains why the market may not reward a US bull setup.",
        vikingTopics: ["market_structure", "logistics_exports"],
        sourceClasses: ["official_thesis_input", "watch_only"],
      }),
    ],
    relationships: [
      relationship({
        target: "Wheat",
        kind: "substitute",
        sourceClass: "price_context",
        note: "Corn caps feed wheat and barley value when cheap.",
      }),
      relationship({
        target: "South America",
        kind: "competitor_origin",
        sourceClass: "watch_only",
        note: "Brazil/Argentina supply can pressure global feed grain flows.",
      }),
    ],
    parkedGaps: ["ethanol margins", "South America collector", "US river logistics", "quality feed"],
  },
  Soybeans: {
    grain: "Soybeans",
    marketShape: "us_led",
    marketStructure:
      "US-led oilseed with direct China demand, crush, soy oil/meal, Brazil/Argentina, and canola cross-market impact.",
    vikingTopics: ["basis_pricing", "storage_carry", "logistics_exports", "market_structure", "grain_specifics", "risk_management"],
    seasonalWindows: ["Mar acreage intentions", "Apr-May planting", "Jun-Aug weather trend", "Sep-Nov harvest", "South America Feb-Apr"],
    impactFactors: [
      factor({
        id: "soybean-us-supply",
        label: "US planting, condition, harvest, WASDE production, and stocks",
        domain: "supply",
        scope: "us",
        sourceClass: "official_thesis_input",
        sourceIds: COMMON_US_BASELINE_SOURCES,
        bullSignal: "US crop stress or stocks cuts tighten oilseed supply.",
        bearSignal: "Large crop or higher stocks pressure soy complex.",
        boundary: "South America detail is not a direct admitted source yet.",
      }),
      factor({
        id: "soybean-demand",
        label: "Export sales, China demand, crush, soybean oil, and meal",
        domain: "demand",
        scope: "world",
        sourceClass: "official_thesis_input",
        sourceIds: ["usda_export_sales", "usda_wasde_mapped"],
        bullSignal: "Export/crush demand pulls ahead of baseline.",
        bearSignal: "Weak China bookings or lower crush/oil demand weigh on prices.",
        boundary: "Detailed China customs and crush margins are parked.",
      }),
      factor({
        id: "soybean-south-america-china-watch",
        label: "Brazil/Argentina supply and China demand-policy pressure",
        domain: "supply",
        scope: "world",
        sourceClass: "watch_only",
        sourceIds: COMMON_GLOBAL_BALANCE_SOURCES,
        bullSignal: "South American crop risk or stronger China buying can lift US soybeans and canola cross-market tone.",
        bearSignal: "Large Brazil/Argentina supply or weaker China demand can pressure the soy complex.",
        boundary: "Raw WASDE/PSD can frame global soybean balance; China customs, export lineup, and South America field/tender detail are not admitted.",
      }),
      factor({
        id: "soybean-canola-cross-market",
        label: "Soybean oil and meal impact on canola",
        domain: "price",
        scope: "cross_border",
        sourceClass: "price_context",
        sourceIds: ["grain_prices", "cftc_cot_positions"],
        bullSignal: "Soy oil/meal strength supports canola cross-market tone.",
        bearSignal: "Weak soy products pull oilseed complex lower.",
        boundary: "Use as relationship context unless source-backed soybean facts are also present.",
      }),
    ],
    marketResponses: [
      marketResponse({
        id: "soybean-china-crush-confirmation",
        label: "China/crush/oilseed confirmation",
        when: "US soybean demand, crush/oil signals, and soy-product price context agree.",
        marketResponse:
          "Soybeans can reinforce both US oilseed direction and Canadian canola cross-market tone.",
        confidenceImpact:
          "Confidence rises with fresh official demand and price context; China customs remains parked.",
        vikingTopics: ["market_structure", "grain_specifics", "basis_pricing"],
        sourceClasses: ["official_thesis_input", "price_context", "parked"],
      }),
      marketResponse({
        id: "soybean-south-america-pressure",
        label: "South America pressure check",
        when: "US soybean data is supportive but Brazil/Argentina supply or China policy context is adverse.",
        marketResponse:
          "The model should expect futures hesitation and weaker canola follow-through until global oilseed pressure clears.",
        confidenceImpact:
          "Watch-only South America and China context lowers conviction, but it does not reverse scored US facts.",
        vikingTopics: ["market_structure", "risk_management"],
        sourceClasses: ["official_thesis_input", "price_context", "watch_only"],
      }),
    ],
    relationships: [
      relationship({
        target: "Canola",
        kind: "substitute",
        sourceClass: "price_context",
        note: "Soybean oil and meal are the strongest public cross-market context for canola.",
      }),
      relationship({
        target: "Brazil and Argentina",
        kind: "competitor_origin",
        sourceClass: "watch_only",
        note: "South American crop/export pressure is critical but not yet source-contracted beyond WASDE context.",
      }),
    ],
    parkedGaps: ["Brazil/Argentina collector", "crush margins", "China customs or tender flow", "palm oil context"],
  },
} as const satisfies Record<SupportedRatingGrain, GrainImpactProfile>;

export const GRAIN_IMPACT_PROFILE_LIST: readonly GrainImpactProfile[] = Object.values(GRAIN_IMPACT_PROFILES);

export function isImpactSourceClass(value: string): value is ImpactSourceClass {
  return (IMPACT_SOURCE_CLASSES as readonly string[]).includes(value);
}

export function getGrainImpactProfile(grain: string): GrainImpactProfile | null {
  const profileKey = grain === "Amber Durum" ? "Durum" : grain;
  return (GRAIN_IMPACT_PROFILES as Record<string, GrainImpactProfile>)[profileKey] ?? null;
}

export function getImpactFactorsBySourceClass(
  profile: GrainImpactProfile,
  sourceClass: ImpactSourceClass,
): GrainImpactFactor[] {
  return profile.impactFactors.filter((factorItem) => factorItem.sourceClass === sourceClass);
}

export function getOfficialImpactFactorCount(grain: string): number {
  const profile = getGrainImpactProfile(grain);
  if (!profile) return 0;
  return getImpactFactorsBySourceClass(profile, "official_thesis_input").length;
}
