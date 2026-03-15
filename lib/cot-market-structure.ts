export type CotRiskLevel = "high" | "medium" | "low";
export type CotMappingType = "primary" | "secondary";

export interface CotRawRow {
  report_date: string;
  commodity: string;
  exchange: string;
  mapping_type: CotMappingType;
  open_interest: number;
  change_open_interest: number | null;
  managed_money_long: number;
  managed_money_short: number;
  change_managed_money_long: number | null;
  change_managed_money_short: number | null;
  prod_merc_long: number;
  prod_merc_short: number;
  change_prod_merc_long: number | null;
  change_prod_merc_short: number | null;
  grain_week: number;
}

export interface CotRelatedContract {
  commodity: string;
  label: string;
  exchange: string;
  managed_money_net: number;
  managed_money_net_pct: number;
  commercial_net: number;
  commercial_net_pct: number;
  wow_net_change: number;
  funds_bias: "bullish" | "bearish" | "neutral";
}

export interface CotPosition {
  report_date: string;
  commodity: string;
  exchange: string;
  mapping_type: CotMappingType;
  open_interest: number;
  change_open_interest: number;
  managed_money_long: number;
  managed_money_short: number;
  managed_money_net: number;
  managed_money_net_pct: number;
  change_managed_money_long: number;
  change_managed_money_short: number;
  wow_net_change: number;
  commercial_long: number;
  commercial_short: number;
  commercial_net: number;
  commercial_net_pct: number;
  change_prod_merc_long: number;
  change_prod_merc_short: number;
  spec_commercial_divergence: boolean;
  grain_week: number;
  crowding_score: number;
  crowding_label: string;
  crowding_context: string;
  change_driver: string;
  commercial_label: string;
  reversal_risk: CotRiskLevel;
  reversal_reason: string;
  open_interest_trend: "rising" | "falling" | "flat";
  related_contracts: CotRelatedContract[];
}

export interface CotPositioningResult {
  positions: CotPosition[];
  latest: CotPosition | null;
  hasDivergence: boolean;
  weeksTracked: number;
  coverageStart: string | null;
  coverageLabel: string;
  primaryProxyLabel: string | null;
  lagLabel: string;
  relatedContracts: CotRelatedContract[];
}

const COMMODITY_LABELS: Record<string, string> = {
  "WHEAT-HRSpring": "Minneapolis spring wheat",
  "WHEAT-HRW": "HRW wheat",
  "WHEAT-SRW": "SRW wheat",
  CANOLA: "ICE canola",
  SOYBEANS: "Soybeans",
  "SOYBEAN OIL": "Soy oil",
  "SOYBEAN MEAL": "Soy meal",
  CORN: "Corn",
  OATS: "Oats",
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatContracts(value: number): string {
  return Math.abs(Math.round(value)).toLocaleString("en-CA");
}

function signedContracts(value: number): string {
  return `${formatContracts(value)} ${value >= 0 ? "long" : "short"}`;
}

function formatPct(value: number): string {
  return `${value > 0 ? "+" : ""}${round1(value)}%`;
}

function getCommodityLabel(commodity: string): string {
  return COMMODITY_LABELS[commodity] ?? commodity;
}

function getPrimaryProxyLabel(grain: string, latest: CotPosition | null): string | null {
  if (!latest) return null;
  if (grain === "Wheat") {
    return "Prairie proxy: Minneapolis spring wheat is used as the main wheat contract.";
  }
  if (grain === "Canola") {
    return "Primary proxy: ICE canola is the main futures market for prairie canola pricing.";
  }
  return `Primary proxy: ${getCommodityLabel(latest.commodity)} (${latest.exchange}).`;
}

function getOpenInterestTrend(
  openInterest: number,
  changeOpenInterest: number
): "rising" | "falling" | "flat" {
  if (!openInterest) return "flat";
  const pctChange = Math.abs(changeOpenInterest / openInterest) * 100;
  if (pctChange < 1) return "flat";
  return changeOpenInterest > 0 ? "rising" : "falling";
}

function getChangeDriver(netChange: number, longChange: number, shortChange: number): string {
  if (netChange === 0) return "little change";

  if (netChange > 0) {
    const freshBuying = longChange > 0;
    const shortsCovering = shortChange < 0;
    if (freshBuying && shortsCovering) return "fresh buying + shorts covering";
    if (freshBuying) return "fresh buying";
    if (shortsCovering) return "shorts covering";
    return "bullish repositioning";
  }

  const newSelling = shortChange > 0;
  const longsExiting = longChange < 0;
  if (newSelling && longsExiting) return "new selling + longs exiting";
  if (newSelling) return "new selling";
  if (longsExiting) return "longs exiting";
  return "bearish repositioning";
}

function getCommercialLabel(commercialNet: number): string {
  if (commercialNet < 0) return "commercials hedged";
  if (commercialNet > 0) return "commercials net long";
  return "commercials balanced";
}

function getCrowdingLabel(
  managedMoneyNet: number,
  managedMoneyNetPct: number,
  crowdingScore: number,
  weeksTracked: number
): { label: string; context: string } {
  const recentWindow = `recent ${weeksTracked}-week range`;

  if (Math.abs(managedMoneyNetPct) < 3) {
    return { label: "balanced", context: "Funds are close to flat positioning." };
  }

  if (managedMoneyNet > 0 && crowdingScore >= 80) {
    return {
      label: "crowded long",
      context: `Funds sit near the top of the ${recentWindow}.`,
    };
  }

  if (managedMoneyNet < 0 && crowdingScore <= 20) {
    return {
      label: "crowded short",
      context: `Funds sit near the bottom of the ${recentWindow}.`,
    };
  }

  return {
    label: managedMoneyNet > 0 ? "leaning long" : "leaning short",
    context: `Positioning is directional but not stretched versus the ${recentWindow}.`,
  };
}

function getReversalRisk(
  position: CotPosition,
  weeksTracked: number
): { level: CotRiskLevel; reason: string } {
  let score = 0;

  if (position.spec_commercial_divergence) score += 2;
  if (
    position.crowding_label === "crowded long" ||
    position.crowding_label === "crowded short"
  ) {
    score += 1;
  }
  if (
    Math.abs(position.wow_net_change) >=
    Math.max(5000, Math.round(position.open_interest * 0.015))
  ) {
    score += 1;
  }

  const historyNote = weeksTracked < 8
    ? ` Bushel Board only has ${weeksTracked} tracked weeks loaded so far.`
    : "";

  if (score >= 4) {
    return {
      level: "high",
      reason:
        "Funds are stretched and commercials are on the other side, so exits can get sharp if momentum turns." +
        historyNote,
    };
  }

  if (score >= 2) {
    return {
      level: "medium",
      reason:
        "There is enough positioning tension here to treat rallies and selloffs as timing-sensitive." +
        historyNote,
    };
  }

  return {
    level: "low",
    reason:
      "Positioning is active, but it is not flashing an obvious crowding or squeeze setup right now." +
      historyNote,
  };
}

function buildRelatedContract(row: CotRawRow): CotRelatedContract {
  const managedMoneyNet = row.managed_money_long - row.managed_money_short;
  const commercialNet = row.prod_merc_long - row.prod_merc_short;
  const wowNetChange =
    (row.change_managed_money_long ?? 0) - (row.change_managed_money_short ?? 0);

  return {
    commodity: row.commodity,
    label: getCommodityLabel(row.commodity),
    exchange: row.exchange,
    managed_money_net: managedMoneyNet,
    managed_money_net_pct: row.open_interest
      ? round1((managedMoneyNet / row.open_interest) * 100)
      : 0,
    commercial_net: commercialNet,
    commercial_net_pct: row.open_interest
      ? round1((commercialNet / row.open_interest) * 100)
      : 0,
    wow_net_change: wowNetChange,
    funds_bias:
      managedMoneyNet > 0 ? "bullish" : managedMoneyNet < 0 ? "bearish" : "neutral",
  };
}

function buildPrimaryPosition(group: CotRawRow[]): CotPosition | null {
  const primary =
    group.find((row) => row.mapping_type === "primary") ??
    [...group].sort((a, b) => b.open_interest - a.open_interest)[0] ??
    null;

  if (!primary) return null;

  const managedMoneyNet = primary.managed_money_long - primary.managed_money_short;
  const commercialNet = primary.prod_merc_long - primary.prod_merc_short;
  const wowNetChange =
    (primary.change_managed_money_long ?? 0) -
    (primary.change_managed_money_short ?? 0);
  const changeOpenInterest = primary.change_open_interest ?? 0;

  return {
    report_date: primary.report_date,
    commodity: primary.commodity,
    exchange: primary.exchange,
    mapping_type: primary.mapping_type,
    open_interest: primary.open_interest,
    change_open_interest: changeOpenInterest,
    managed_money_long: primary.managed_money_long,
    managed_money_short: primary.managed_money_short,
    managed_money_net: managedMoneyNet,
    managed_money_net_pct: primary.open_interest
      ? round1((managedMoneyNet / primary.open_interest) * 100)
      : 0,
    change_managed_money_long: primary.change_managed_money_long ?? 0,
    change_managed_money_short: primary.change_managed_money_short ?? 0,
    wow_net_change: wowNetChange,
    commercial_long: primary.prod_merc_long,
    commercial_short: primary.prod_merc_short,
    commercial_net: commercialNet,
    commercial_net_pct: primary.open_interest
      ? round1((commercialNet / primary.open_interest) * 100)
      : 0,
    change_prod_merc_long: primary.change_prod_merc_long ?? 0,
    change_prod_merc_short: primary.change_prod_merc_short ?? 0,
    spec_commercial_divergence:
      managedMoneyNet !== 0 &&
      commercialNet !== 0 &&
      Math.sign(managedMoneyNet) !== Math.sign(commercialNet),
    grain_week: primary.grain_week,
    crowding_score: 50,
    crowding_label: "balanced",
    crowding_context: "Funds are close to flat positioning.",
    change_driver: getChangeDriver(
      wowNetChange,
      primary.change_managed_money_long ?? 0,
      primary.change_managed_money_short ?? 0
    ),
    commercial_label: getCommercialLabel(commercialNet),
    reversal_risk: "low",
    reversal_reason:
      "Positioning is active, but it is not flashing an obvious crowding or squeeze setup right now.",
    open_interest_trend: getOpenInterestTrend(primary.open_interest, changeOpenInterest),
    related_contracts: group
      .filter((row) => row !== primary)
      .map(buildRelatedContract)
      .sort((a, b) => Math.abs(b.managed_money_net_pct) - Math.abs(a.managed_money_net_pct)),
  };
}

export function buildCotPositioningResult(
  rows: CotRawRow[],
  grain: string,
  weeksBack = 8
): CotPositioningResult {
  if (!rows.length) {
    return {
      positions: [],
      latest: null,
      hasDivergence: false,
      weeksTracked: 0,
      coverageStart: null,
      coverageLabel: "No tracked history yet.",
      primaryProxyLabel: null,
      lagLabel: "Tuesday positions released Friday.",
      relatedContracts: [],
    };
  }

  const grouped = new Map<string, CotRawRow[]>();

  [...rows]
    .sort((a, b) => {
      if (a.report_date === b.report_date) {
        if (a.mapping_type === b.mapping_type) {
          return b.open_interest - a.open_interest;
        }
        return a.mapping_type === "primary" ? -1 : 1;
      }
      return b.report_date.localeCompare(a.report_date);
    })
    .forEach((row) => {
      const existing = grouped.get(row.report_date) ?? [];
      existing.push(row);
      grouped.set(row.report_date, existing);
    });

  const positions = Array.from(grouped.values())
    .map(buildPrimaryPosition)
    .filter((position): position is CotPosition => Boolean(position))
    .slice(0, weeksBack);

  if (!positions.length) {
    return {
      positions: [],
      latest: null,
      hasDivergence: false,
      weeksTracked: 0,
      coverageStart: null,
      coverageLabel: "No tracked history yet.",
      primaryProxyLabel: null,
      lagLabel: "Tuesday positions released Friday.",
      relatedContracts: [],
    };
  }

  const mmValues = positions.map((position) => position.managed_money_net);
  const minNet = Math.min(...mmValues);
  const maxNet = Math.max(...mmValues);
  const range = maxNet - minNet;
  const weeksTracked = positions.length;

  const enrichedPositions = positions.map((position) => {
    const crowdingScore =
      range === 0 ? 50 : Math.round(((position.managed_money_net - minNet) / range) * 100);
    const crowding = getCrowdingLabel(
      position.managed_money_net,
      position.managed_money_net_pct,
      crowdingScore,
      weeksTracked
    );
    const withCrowding: CotPosition = {
      ...position,
      crowding_score: crowdingScore,
      crowding_label: crowding.label,
      crowding_context: crowding.context,
    };
    const reversal = getReversalRisk(withCrowding, weeksTracked);
    return {
      ...withCrowding,
      reversal_risk: reversal.level,
      reversal_reason: reversal.reason,
    };
  });

  const latest = enrichedPositions[0] ?? null;
  const coverageStart = enrichedPositions[enrichedPositions.length - 1]?.report_date ?? null;

  return {
    positions: enrichedPositions,
    latest,
    hasDivergence: latest?.spec_commercial_divergence ?? false,
    weeksTracked,
    coverageStart,
    coverageLabel:
      enrichedPositions.length > 1
        ? `Recent range: ${enrichedPositions.length} weeks tracked.`
        : "Latest week only.",
    primaryProxyLabel: getPrimaryProxyLabel(grain, latest),
    lagLabel: "Tuesday positions released Friday.",
    relatedContracts: latest?.related_contracts ?? [],
  };
}

export function formatCotPromptContext(cot: CotPositioningResult | null): string {
  if (!cot?.latest) {
    return "No CFTC futures positioning data available for this grain.";
  }

  const latest = cot.latest;
  const fundsSide = latest.managed_money_net >= 0 ? "net long" : "net short";
  const commercialsSide = latest.commercial_net >= 0 ? "net long" : "net short";
  const weeklyTone =
    latest.wow_net_change > 0
      ? "more bullish"
      : latest.wow_net_change < 0
        ? "more bearish"
        : "unchanged";
  const oiTone =
    latest.open_interest_trend === "rising"
      ? "open interest rose"
      : latest.open_interest_trend === "falling"
        ? "open interest fell"
        : "open interest was flat";

  const lines = [
    cot.primaryProxyLabel ?? `Primary proxy: ${getCommodityLabel(latest.commodity)} (${latest.exchange}).`,
    `- Tracking window: ${cot.coverageLabel}${cot.coverageStart ? ` Window starts ${cot.coverageStart}.` : ""} Treat crowding labels as recent-range context, not multi-year extremes.`,
    `- Funds (Managed Money): ${fundsSide} ${signedContracts(latest.managed_money_net)} (${formatPct(latest.managed_money_net_pct)} of open interest), ${latest.crowding_label}. ${latest.crowding_context}`,
    `- This week: funds got ${formatContracts(latest.wow_net_change)} contracts ${weeklyTone}, driven by ${latest.change_driver}; ${oiTone} by ${formatContracts(latest.change_open_interest)} contracts.`,
    `- Commercials: ${commercialsSide} ${signedContracts(latest.commercial_net)} (${formatPct(latest.commercial_net_pct)} of open interest) - ${latest.commercial_label}.`,
    `- Divergence: ${latest.spec_commercial_divergence ? "YES - specs and commercials are on opposite sides. This is the strongest watch signal in the COT data." : "No major divergence in the primary contract."}`,
    `- Reversal risk: ${latest.reversal_risk.toUpperCase()} - ${latest.reversal_reason}`,
  ];

  if (cot.relatedContracts.length > 0) {
    lines.push(
      `- Related futures: ${cot.relatedContracts
        .slice(0, 3)
        .map(
          (contract) =>
            `${contract.label} ${contract.managed_money_net >= 0 ? "funds long" : "funds short"} ${formatContracts(contract.managed_money_net)} (${formatPct(contract.managed_money_net_pct)} OI)`
        )
        .join("; ")}.`
    );
  }

  lines.push(
    `- Lag note: ${cot.lagLabel} Use COT for timing, crowding, and reversal risk - not as a same-day directional tape.`
  );

  return lines.join("\n");
}
