/**
 * Search Query Builder for X/Twitter grain intelligence.
 *
 * Generates contextual search queries by combining grain-specific hashtags,
 * seasonal agricultural topics, and geographic scope for the Canadian prairies.
 *
 * Used by the search-x-intelligence Edge Function to build targeted x_search
 * queries that surface relevant farmer sentiment and market commentary.
 */

// --- Types ---

export type Season = "seeding" | "growing" | "harvest" | "marketing";

// --- Grain Hashtags ---

/**
 * Hashtag mappings for all 16 Canadian grains tracked by the CGC.
 * Keys match the grain names in the `grains` table exactly.
 */
export const GRAIN_HASHTAGS: Record<string, string[]> = {
  "Wheat": ["#wheat", "#CWRS", "#westcdnag", "#cdnag"],
  "Canola": ["#Canola", "#westcdnag", "#CanolaCouncil", "#cdnag"],
  "Amber Durum": ["#durum", "#durumwheat", "#CWAD", "#cdnag"],
  "Barley": ["#barley", "#maltbarley", "#feedbarley", "#cdnag"],
  "Oats": ["#oats", "#oatmarket", "#cdnag"],
  "Peas": ["#peas", "#pulses", "#CDNpulses", "#cdnag"],
  "Lentils": ["#lentils", "#pulses", "#CDNlentils", "#cdnag"],
  "Flaxseed": ["#flax", "#flaxseed", "#cdnag"],
  "Soybeans": ["#soybeans", "#CDNsoy", "#cdnag"],
  "Mustard Seed": ["#mustard", "#mustardmarket", "#cdnag"],
  "Corn": ["#corn", "#CDNcorn", "#cdnag"],
  "Rye": ["#rye", "#ryemarket", "#cdnag"],
  "Chick Peas": ["#chickpeas", "#desi", "#kabuli", "#cdnag"],
  "Sunflower": ["#sunflower", "#sunflowermarket", "#cdnag"],
  "Canaryseed": ["#canaryseed", "#cdnag"],
  "Beans": ["#drybeans", "#CDNbeans", "#cdnag"],
};

// --- Season Detection ---

/**
 * Returns the agricultural season for a given date based on prairie growing calendar:
 *   - seeding: March through May
 *   - growing: June through August
 *   - harvest: September through November
 *   - marketing: December through February
 */
export function getSeason(date: Date): Season {
  const month = date.getMonth(); // 0-indexed: 0=Jan, 11=Dec

  if (month >= 2 && month <= 4) return "seeding";   // Mar (2) - May (4)
  if (month >= 5 && month <= 7) return "growing";    // Jun (5) - Aug (7)
  if (month >= 8 && month <= 10) return "harvest";   // Sep (8) - Nov (10)
  return "marketing";                                 // Dec (11), Jan (0), Feb (1)
}

// --- Seasonal Topics ---

/**
 * Five key topics per season that drive prairie grain market conversations.
 * Used to add seasonal context to search queries so results align with
 * what farmers and analysts are actually discussing at that time of year.
 */
export const SEASONAL_TOPICS: Record<Season, string[]> = {
  seeding: [
    "soil moisture",
    "input costs",
    "seed availability",
    "acreage intentions",
    "spring planting",
  ],
  growing: [
    "crop conditions",
    "weather stress",
    "yield estimates",
    "crop tour",
    "rainfall",
  ],
  harvest: [
    "quality reports",
    "combines rolling",
    "elevator congestion",
    "basis levels",
    "grade",
  ],
  marketing: [
    "carry-out projections",
    "export pace",
    "futures spreads",
    "farmer selling",
    "basis",
  ],
};

// --- Grain Tiers ---

/**
 * Major grains: scanned every pulse (3x/day).
 * These are the highest-volume, most-traded prairie grains that farmers
 * check most frequently.
 */
export const MAJOR_GRAINS = [
  "Wheat", "Canola", "Amber Durum", "Barley", "Oats", "Peas",
];

/**
 * Minor grains: scanned 1x/day (morning pulse only).
 * Lower volume or niche crops where intraday X chatter is sparse.
 */
export const MINOR_GRAINS = [
  "Lentils", "Flaxseed", "Soybeans", "Corn", "Rye",
  "Mustard Seed", "Chick Peas", "Sunflower", "Canaryseed", "Beans",
];

export function isMajorGrain(grain: string): boolean {
  return MAJOR_GRAINS.includes(grain);
}

// --- Query Builder ---

// OR grouping ensures X search matches any regional tag, not all of them.
// Prior AND search ("Canada prairies western Canadian") required every word
// to appear in a tweet, returning near-zero results for most grains.
const GEO_SCOPE = "(#westcdnag OR #cdnag OR #skag OR #abag OR #mbag OR #agtwitter OR prairies)";

/**
 * Builds 3-5 search queries for a given grain and date (original weekly mode).
 * Kept for backward compatibility.
 */
export function buildSearchQueries(grain: string, date: Date): string[] {
  const hashtags = GRAIN_HASHTAGS[grain] ?? [`#${grain.toLowerCase().replace(/\s+/g, "")}`];
  const season = getSeason(date);
  const topics = SEASONAL_TOPICS[season];

  const queries: string[] = [];

  // Query 1: Primary — grain name + lead hashtag + geo
  queries.push(`${grain} ${hashtags[0]} ${GEO_SCOPE}`);

  // Query 2: Seasonal — grain name + two seasonal topics + geo
  queries.push(`${grain} ${topics[0]} ${topics[1]} ${GEO_SCOPE}`);

  // Query 3: Hashtag sweep — all hashtags combined for broad social coverage
  queries.push(`${hashtags.join(" ")} ${GEO_SCOPE}`);

  // Query 4: Niche hashtag + seasonal (only if grain has 3+ hashtags)
  if (hashtags.length >= 3) {
    queries.push(`${hashtags[1]} ${hashtags[2]} ${topics[2]} ${GEO_SCOPE}`);
  }

  // Query 5: Market-focused — grain + price/export keyword + seasonal topic
  queries.push(`${grain} price export ${topics[3]} ${GEO_SCOPE}`);

  return queries;
}

/**
 * Pulse mode: 2 queries per grain — fast, lightweight, X-only.
 * Runs 3x/day. Focuses on the two most productive query patterns.
 */
export function buildPulseQueries(grain: string, date: Date): string[] {
  const hashtags = GRAIN_HASHTAGS[grain] ?? [`#${grain.toLowerCase().replace(/\s+/g, "")}`];
  const season = getSeason(date);
  const topics = SEASONAL_TOPICS[season];

  return [
    // Primary: grain name + lead hashtag + geo (highest signal-to-noise)
    `${grain} ${hashtags[0]} ${GEO_SCOPE}`,
    // Market-focused: grain + price/export + seasonal topic
    `${grain} price export ${topics[0]} ${GEO_SCOPE}`,
  ];
}

/**
 * Deep mode: 6-8 queries per grain — thorough, X + web search.
 * Runs after Thursday CGC data drop. Includes government, analyst,
 * and international demand queries for comprehensive thesis building.
 */
export function buildDeepQueries(grain: string, date: Date): string[] {
  // Start with all standard queries (3-5)
  const queries = buildSearchQueries(grain, date);
  const season = getSeason(date);
  const topics = SEASONAL_TOPICS[season];

  // Query 6: Government/policy — AAFC, CGC announcements
  queries.push(`${grain} "Agriculture Canada" OR "AAFC" OR "CGC" ${topics[4]} ${GEO_SCOPE}`);

  // Query 7: Analyst/news — market analysis, price forecasts
  queries.push(`${grain} "market analysis" OR "price forecast" Canada`);

  // Query 8: International demand (major grains only — these have active export markets)
  if (isMajorGrain(grain)) {
    queries.push(`${grain} export "China" OR "India" OR "EU" OR "Japan" Canada`);
  }

  return queries;
}
