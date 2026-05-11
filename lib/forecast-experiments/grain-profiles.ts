export const FORECAST_GRAIN_NAMES = [
  "Wheat",
  "Amber Durum",
  "Canola",
  "Barley",
  "Oats",
  "Peas",
  "Lentils",
  "Flaxseed",
  "Soybeans",
  "Corn",
  "Rye",
  "Mustard Seed",
  "Canaryseed",
  "Chick Peas",
  "Sunflower",
  "Beans",
] as const;

export const CANOLA_GRAIN = "Canola" as const;

export const FORECAST_EFFORT_TIERS = ["MAJOR", "MID", "MINOR"] as const;
export const COMPRESSION_CLASSES = ["A", "B", "C"] as const;

export type ForecastGrain = (typeof FORECAST_GRAIN_NAMES)[number];
export type ForecastEffortTier = (typeof FORECAST_EFFORT_TIERS)[number];
export type CompressionClass = (typeof COMPRESSION_CLASSES)[number];

export interface ForecastGrainProfile {
  grain: ForecastGrain;
  slug: string;
  effort_tier: ForecastEffortTier;
  compression_class: CompressionClass | null;
  price_benchmark_required: boolean;
  cftc_direct_mapping: boolean;
  notes: string[];
}

export const FORECAST_GRAIN_PROFILES = {
  Wheat: {
    grain: "Wheat",
    slug: "wheat",
    effort_tier: "MAJOR",
    compression_class: null,
    price_benchmark_required: true,
    cftc_direct_mapping: true,
    notes: ["Keep Wheat distinct from Amber Durum."],
  },
  "Amber Durum": {
    grain: "Amber Durum",
    slug: "amber-durum",
    effort_tier: "MID",
    compression_class: "B",
    price_benchmark_required: false,
    cftc_direct_mapping: false,
    notes: ["Specialty durum market; do not collapse into Wheat."],
  },
  Canola: {
    grain: "Canola",
    slug: "canola",
    effort_tier: "MAJOR",
    compression_class: "A",
    price_benchmark_required: true,
    cftc_direct_mapping: true,
    notes: ["Existing Canola harness remains the compatibility path."],
  },
  Barley: {
    grain: "Barley",
    slug: "barley",
    effort_tier: "MAJOR",
    compression_class: null,
    price_benchmark_required: false,
    cftc_direct_mapping: false,
    notes: ["Feed and malt demand can diverge; price benchmark may be local cash."],
  },
  Oats: {
    grain: "Oats",
    slug: "oats",
    effort_tier: "MAJOR",
    compression_class: null,
    price_benchmark_required: true,
    cftc_direct_mapping: true,
    notes: ["US-dependent milling market; producer cars matter."],
  },
  Peas: {
    grain: "Peas",
    slug: "peas",
    effort_tier: "MID",
    compression_class: "B",
    price_benchmark_required: false,
    cftc_direct_mapping: false,
    notes: ["Policy and container flow can dominate futures proxy signals."],
  },
  Lentils: {
    grain: "Lentils",
    slug: "lentils",
    effort_tier: "MID",
    compression_class: "B",
    price_benchmark_required: false,
    cftc_direct_mapping: false,
    notes: ["Specialty pulse market; require clean next-week evidence before training use."],
  },
  Flaxseed: {
    grain: "Flaxseed",
    slug: "flaxseed",
    effort_tier: "MID",
    compression_class: "C",
    price_benchmark_required: false,
    cftc_direct_mapping: false,
    notes: ["Thin market; avoid overconfident price-only theses."],
  },
  Soybeans: {
    grain: "Soybeans",
    slug: "soybeans",
    effort_tier: "MID",
    compression_class: null,
    price_benchmark_required: true,
    cftc_direct_mapping: true,
    notes: ["US futures/COT are direct context, but Canadian CGC flow still gates claims."],
  },
  Corn: {
    grain: "Corn",
    slug: "corn",
    effort_tier: "MAJOR",
    compression_class: null,
    price_benchmark_required: true,
    cftc_direct_mapping: true,
    notes: ["US-farmer acquisition hook; separate US tape from Canadian CGC flow."],
  },
  Rye: {
    grain: "Rye",
    slug: "rye",
    effort_tier: "MINOR",
    compression_class: null,
    price_benchmark_required: false,
    cftc_direct_mapping: false,
    notes: ["Minor thin market; thesis confidence should stay bounded unless evidence is clean."],
  },
  "Mustard Seed": {
    grain: "Mustard Seed",
    slug: "mustard-seed",
    effort_tier: "MINOR",
    compression_class: "C",
    price_benchmark_required: false,
    cftc_direct_mapping: false,
    notes: ["Use exact canonical name; not Mustard."],
  },
  Canaryseed: {
    grain: "Canaryseed",
    slug: "canaryseed",
    effort_tier: "MINOR",
    compression_class: "C",
    price_benchmark_required: false,
    cftc_direct_mapping: false,
    notes: ["Use exact canonical spelling; not Canary Seed."],
  },
  "Chick Peas": {
    grain: "Chick Peas",
    slug: "chick-peas",
    effort_tier: "MINOR",
    compression_class: null,
    price_benchmark_required: false,
    cftc_direct_mapping: false,
    notes: ["Use exact canonical spacing; not Chickpeas."],
  },
  Sunflower: {
    grain: "Sunflower",
    slug: "sunflower",
    effort_tier: "MINOR",
    compression_class: null,
    price_benchmark_required: false,
    cftc_direct_mapping: false,
    notes: ["Use Sunflower, not Sunflower Seed."],
  },
  Beans: {
    grain: "Beans",
    slug: "beans",
    effort_tier: "MINOR",
    compression_class: null,
    price_benchmark_required: false,
    cftc_direct_mapping: false,
    notes: ["Use Beans for the dashboard grain, not Faba Beans."],
  },
} as const satisfies Record<ForecastGrain, ForecastGrainProfile>;

const forecastGrainSet = new Set<string>(FORECAST_GRAIN_NAMES);

export function isForecastGrain(value: unknown): value is ForecastGrain {
  return typeof value === "string" && forecastGrainSet.has(value);
}

export function assertForecastGrain(value: unknown): ForecastGrain {
  if (!isForecastGrain(value)) {
    throw new Error(`Unsupported forecast grain: ${String(value)}.`);
  }

  return value;
}

export function getForecastGrainProfile(
  grain: ForecastGrain,
): ForecastGrainProfile {
  return FORECAST_GRAIN_PROFILES[grain];
}
