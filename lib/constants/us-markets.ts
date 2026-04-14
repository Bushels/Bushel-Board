export interface UsMarketDef {
  name: string;
  slug: string;
  futuresGrain: string;
  exportCommodity: string | null;
  cotCommodity: string | null;
  cropProgressMarkets: string[];
  includeInOverview: boolean;
}

export const US_MARKETS = [
  {
    name: "Corn",
    slug: "corn",
    futuresGrain: "Corn",
    exportCommodity: "CORN",
    cotCommodity: "CORN",
    cropProgressMarkets: ["Corn"],
    includeInOverview: true,
  },
  {
    name: "Soybeans",
    slug: "soybeans",
    futuresGrain: "Soybeans",
    exportCommodity: "SOYBEANS",
    cotCommodity: "SOYBEANS",
    cropProgressMarkets: ["Soybeans"],
    includeInOverview: true,
  },
  {
    name: "Wheat",
    slug: "wheat",
    futuresGrain: "Wheat",
    exportCommodity: "ALL WHEAT",
    cotCommodity: "WHEAT",
    cropProgressMarkets: ["Winter Wheat", "Spring Wheat"],
    includeInOverview: true,
  },
  {
    name: "Oats",
    slug: "oats",
    futuresGrain: "Oats",
    exportCommodity: "OATS",
    cotCommodity: "OATS",
    cropProgressMarkets: ["Oats"],
    includeInOverview: true,
  },
  {
    name: "Barley",
    slug: "barley",
    futuresGrain: "Barley",
    exportCommodity: "BARLEY",
    cotCommodity: null,
    cropProgressMarkets: [],
    includeInOverview: true,
  },
] as const satisfies readonly UsMarketDef[];

export type UsMarketName = (typeof US_MARKETS)[number]["name"];

export const US_MARKET_NAMES = US_MARKETS.map((market) => market.name);
export const US_OVERVIEW_MARKETS = US_MARKETS.filter((market) => market.includeInOverview);

export function getUsMarketByName(name: string) {
  return US_MARKETS.find((market) => market.name === name) ?? null;
}

export function getUsMarketBySlug(slug: string) {
  return US_MARKETS.find((market) => market.slug === slug.toLowerCase()) ?? null;
}

export function isUsMarketName(name: string): name is UsMarketName {
  return US_MARKETS.some((market) => market.name === name);
}

export function toUsMarketSlug(name: string): string {
  return getUsMarketByName(name)?.slug ?? name.toLowerCase().replace(/\s+/g, "-");
}

export function formatRecommendationLabel(recommendation: string | null | undefined): string {
  if (!recommendation) return "WATCH";
  return recommendation.replace(/_/g, " ");
}