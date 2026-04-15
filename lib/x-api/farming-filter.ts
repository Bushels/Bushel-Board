/**
 * Farming-specific content filter for X/Twitter API v2 search results.
 *
 * Pre-filter: builds targeted search queries per grain tier to reduce noise.
 * Post-filter: scores tweet text for farming relevance and rejects off-topic content.
 */

// ---------------------------------------------------------------------------
// Grain tier classification
// ---------------------------------------------------------------------------

const MAJOR_GRAINS = new Set(["Wheat", "Canola", "Barley", "Oats"]);
const MID_GRAINS = new Set(["Flax", "Lentils", "Peas", "Soybeans"]);

export function getGrainTier(grain: string): "major" | "mid" | "minor" {
  if (MAJOR_GRAINS.has(grain)) return "major";
  if (MID_GRAINS.has(grain)) return "mid";
  return "minor";
}

// ---------------------------------------------------------------------------
// Negative keywords — hard reject when present (case-insensitive)
// ---------------------------------------------------------------------------

const NEGATIVE_KEYWORDS = [
  "crypto",
  "bitcoin",
  "nft",
  "defi",
  "token",
  "airdrop",
  "stock",
  "forex",
  "trading bot",
  "brewery",
  "beer",
  "whiskey",
  "recipe",
  "cooking",
  "restaurant",
  "fantasy",
];

// ---------------------------------------------------------------------------
// Farming signal patterns — need >= 2 matches for relevance
// ---------------------------------------------------------------------------

const FARMING_SIGNALS: RegExp[] = [
  /\bbasis\b/i,
  /\bbushel/i,
  /\belevator\b/i,
  /\bbin(?:s)?\b/i,
  /\bsilo\b/i,
  /\bseeding\b/i,
  /\bharvest/i,
  /\bcrop\b/i,
  /\bacre/i,
  /\byield\b/i,
  /\bSaskatchewan\b/i,
  /\bAlberta\b/i,
  /\bManitoba\b/i,
  /\bprairie/i,
  /\bSK\b/,
  /\bAB\b/,
  /\bMB\b/,
  /\bViterra\b/i,
  /\bRichardson\b/i,
  /\bCargill\b/i,
  /\bG3\b/i,
  /\bP&H\b/i,
  /\bBunge\b/i,
  /\bAGT\b/i,
  /\bhaul\b/i,
  /\bdeliver/i,
  /\bspray/i,
  /\bcombine\b/i,
  /\bswath/i,
  /\bplant(?:ed|ing)?\b/i,
  /\bseed(?:ed|ing)?\b/i,
  /\bfertiliz/i,
  /\bfutures\b/i,
  /\bpremium\b/i,
  /\bdiscount\b/i,
  /\bgrade\b/i,
  /\bprotein\b/i,
  /\bmoisture\b/i,
  /\bfrost\b/i,
  /\bdrought\b/i,
  /\brain\b/i,
  /\bhail\b/i,
  /\bCGC\b/,
  /\bCWB\b/,
  /\bCBOT\b/,
  /\bICE\b/,
  /\bAAFC\b/,
];

// ---------------------------------------------------------------------------
// Post-filter: is this tweet farming-relevant?
// ---------------------------------------------------------------------------

/**
 * Returns true if the tweet text is relevant to prairie grain farming.
 *
 * Logic:
 * 1. Hard reject if any NEGATIVE_KEYWORD is found (exception: "stock" is OK
 *    when "livestock" is also present).
 * 2. Count FARMING_SIGNAL regex matches — need >= 2 to pass.
 */
export function isFarmingRelevant(text: string): boolean {
  const lower = text.toLowerCase();

  // --- Hard reject on negative keywords ---
  for (const keyword of NEGATIVE_KEYWORDS) {
    if (lower.includes(keyword)) {
      // Exception: "stock" is acceptable when "livestock" is present
      if (keyword === "stock" && lower.includes("livestock")) {
        continue;
      }
      return false;
    }
  }

  // --- Require >= 2 farming signals ---
  let signalCount = 0;
  for (const pattern of FARMING_SIGNALS) {
    if (pattern.test(text)) {
      signalCount++;
      if (signalCount >= 2) return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Pre-filter: build X API search query per grain tier
// ---------------------------------------------------------------------------

const EXCLUSIONS = "-is:retweet lang:en -crypto -bitcoin -NFT -defi -recipe -brewery";

/**
 * Builds an X API v2 search query string tailored to the grain's tier.
 *
 * - Major: broad — grain name + prairie/elevator/basis context keywords
 * - Mid: medium — grain price / acres / crop terms
 * - Minor: narrow — grain name anchored to prairie geography
 */
export function buildFarmingQuery(
  grain: string,
  tier: "major" | "mid" | "minor"
): string {
  const g = grain.toLowerCase();

  switch (tier) {
    case "major":
      return `("${g}" OR "${g} price" OR "${g} basis") (Saskatchewan OR Alberta OR Manitoba OR prairie OR elevator OR bushels OR harvest OR basis) ${EXCLUSIONS}`;

    case "mid":
      return `("${g} price" OR "${g} acres" OR "${g} crop") ${EXCLUSIONS}`;

    case "minor":
      return `"${g}" (prairie OR Saskatchewan OR elevator) ${EXCLUSIONS}`;
  }
}
