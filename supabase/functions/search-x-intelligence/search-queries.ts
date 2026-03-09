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
  "Wheat": ["#wheat", "#CWRS", "#westcdnag"],
  "Canola": ["#Canola", "#westcdnag", "#CanolaCouncil"],
  "Amber Durum": ["#durum", "#durumwheat", "#pasta"],
  "Barley": ["#barley", "#maltbarley", "#feedbarley"],
  "Oats": ["#oats", "#oatmarket"],
  "Peas": ["#peas", "#pulses", "#CDNpulses"],
  "Lentils": ["#lentils", "#pulses", "#CDNlentils"],
  "Flaxseed": ["#flax", "#flaxseed"],
  "Soybeans": ["#soybeans", "#CDNsoy"],
  "Mustard Seed": ["#mustard", "#mustardmarket"],
  "Corn": ["#corn", "#CDNcorn"],
  "Rye": ["#rye", "#ryemarket"],
  "Chick Peas": ["#chickpeas", "#desi", "#kabuli"],
  "Sunflower": ["#sunflower", "#sunflowermarket"],
  "Canaryseed": ["#canaryseed"],
  "Beans": ["#drybeans", "#CDNbeans"],
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

// --- Query Builder ---

const GEO_SCOPE = "Canada prairies western Canadian";

/**
 * Builds 3-5 search queries for a given grain and date.
 *
 * Strategy:
 *   1. Primary query: grain name + top hashtag + geographic scope
 *   2. Seasonal query: grain name + two seasonal topics + geographic scope
 *   3. Hashtag combo: all grain hashtags joined (broad social sweep)
 *   4. (If 3+ hashtags) Niche hashtag query: secondary hashtags + seasonal topic
 *   5. (If 3+ seasonal topics available, always) Market-focused: grain + "price" or "export" + seasonal topic
 *
 * Returns between 3 and 5 queries depending on the grain's hashtag count.
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
