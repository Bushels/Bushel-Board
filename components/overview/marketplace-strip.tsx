// components/overview/marketplace-strip.tsx
// Kalshi prediction-market cards (live) + spot price tiles (live).
// Kalshi data flows from lib/kalshi/client.ts — fetched per render with a
// 5-minute in-memory cache. Falls back to a static snapshot if the API is
// unreachable, so the page never goes blank.
//
// ── INTEGRATION POINT ───────────────────────────────────────────────────
// This is the single bridge between the isolated Kalshi module
// (lib/kalshi/*) and the Overview page. Keep the bridge thin:
//   • imports only from lib/kalshi/* + lib/queries/overview-data
//   • does not transform Kalshi data into stance/score concepts
//   • does not feed Kalshi data back into market_analysis or any other
//     internal pipeline
// If/when Kalshi gets a richer integration (sponsored markets, deeper
// drill-down, bull/bear cross-references), build it in its own module
// first, then add a second bridge component — don't grow this file.
// ────────────────────────────────────────────────────────────────────────

import { fetchKalshiMarkets, formatVolume } from "@/lib/kalshi/client";
import type {
  KalshiCadence,
  KalshiCrop,
  KalshiMarket,
} from "@/lib/kalshi/types";
import type { SpotPrice } from "@/lib/queries/overview-data";

const INK = "#2a261e";
const WHEAT_50 = "#f5f3ee";
const WHEAT_100 = "#ebe7dc";
const WHEAT_200 = "#d7cfba";
const WHEAT_700 = "#5d5132";
const INK_MUTED = "#7c6c43";
const PRAIRIE = "#437a22";
const AMBER = "#b8702a";
const CANOLA = "#c17f24";
const SOIL = "#6b3f2a"; // distinct earth tone for fertilizer/input cards

interface KalshiCardData {
  crop: KalshiCrop;
  cadence: KalshiCadence;
  title: string;
  yesPct: number;
  noPct: number;
  volume: string;
  expires: string;
  isLive: boolean;
}

// Static snapshot used when Kalshi is unreachable. Captured 2026-04-28 from
// production data; kept short so degraded mode is obviously a snapshot, not
// pretending to be live. Cadence labels match the live grid layout so the
// two rows render even in fallback mode.
const KALSHI_FALLBACK: KalshiCardData[] = [
  // Top row — monthly contracts + fertilizer wildcard
  {
    crop: "CORN",
    cadence: "monthly",
    title: "Will May corn close above $4.55/bu Apr 30?",
    yesPct: 66,
    noPct: 34,
    volume: "$3.0k",
    expires: "Apr 30",
    isLive: false,
  },
  {
    crop: "SOY",
    cadence: "monthly",
    title: "Will May soy close above $11.66/bu Apr 30?",
    yesPct: 91,
    noPct: 9,
    volume: "$3.8k",
    expires: "Apr 30",
    isLive: false,
  },
  {
    crop: "WHEAT",
    cadence: "monthly",
    title: "Will May wheat close above $5.89/bu Apr 30?",
    yesPct: 91,
    noPct: 9,
    volume: "$2.6k",
    expires: "Apr 30",
    isLive: false,
  },
  {
    crop: "FERT",
    cadence: "wildcard",
    title: "Will fertilizer reach $1200/ton this year?",
    yesPct: 51,
    noPct: 49,
    volume: "$9.9k",
    expires: "Jan 1",
    isLive: false,
  },
  // Bottom row — weekly contracts
  {
    crop: "CORN",
    cadence: "weekly",
    title: "Will May corn close above $4.71/bu May 1?",
    yesPct: 52,
    noPct: 48,
    volume: "$1.0k",
    expires: "May 1",
    isLive: false,
  },
  {
    crop: "SOY",
    cadence: "weekly",
    title: "Will May soy close above $11.02/bu May 1?",
    yesPct: 96,
    noPct: 4,
    volume: "$0.5k",
    expires: "May 1",
    isLive: false,
  },
  {
    crop: "WHEAT",
    cadence: "weekly",
    title: "Will May wheat close above $5.18/bu May 1?",
    yesPct: 96,
    noPct: 4,
    volume: "$0.4k",
    expires: "May 1",
    isLive: false,
  },
];

function cropColor(crop: KalshiCrop): string {
  switch (crop) {
    case "CORN":
      return CANOLA;
    case "SOY":
      return PRAIRIE;
    case "WHEAT":
      return AMBER;
    case "FERT":
      return SOIL;
    default:
      return INK_MUTED;
  }
}

function cropLabel(crop: KalshiCrop): string {
  return crop === "FERT" ? "FERTILIZER" : crop;
}

function toCardData(m: KalshiMarket): KalshiCardData {
  // Probability is in [0, 1]; round to nearest percent for display.
  const yes = m.yesProbability;
  const yesPct = yes != null ? Math.max(0, Math.min(100, Math.round(yes * 100))) : 50;
  return {
    crop: m.crop,
    cadence: m.cadence,
    title: m.title,
    yesPct,
    noPct: 100 - yesPct,
    volume: formatVolume(m.volume),
    expires: m.closeLabel,
    isLive: true,
  };
}

function partitionByCadence(cards: KalshiCardData[]): {
  primary: KalshiCardData[];
  weekly: KalshiCardData[];
} {
  // Top row: monthly contracts + the wildcard (fertilizer is a slow-moving
  // input cost, sits naturally with the macro/monthly view).
  // Bottom row: weekly contracts (tactical short-dated bets).
  const primary: KalshiCardData[] = [];
  const weekly: KalshiCardData[] = [];
  for (const c of cards) {
    if (c.cadence === "weekly") weekly.push(c);
    else primary.push(c);
  }
  return { primary, weekly };
}

function KalshiCard({ k }: { k: KalshiCardData }) {
  const accent = cropColor(k.crop);
  return (
    <div
      style={{
        padding: "20px 22px",
        background: "#fff",
        border: `1px solid ${WHEAT_200}`,
        fontFamily: "var(--font-dm-sans)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 10,
          alignItems: "baseline",
        }}
      >
        <span
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            color: accent,
            fontWeight: 700,
            textTransform: "uppercase" as const,
          }}
        >
          {cropLabel(k.crop)}
        </span>
        <span style={{ fontSize: 10, color: INK_MUTED }}>via Kalshi</span>
      </div>
      <div
        style={{
          fontFamily: "var(--font-fraunces)",
          fontSize: 17,
          lineHeight: 1.3,
          color: INK,
          marginBottom: 14,
          minHeight: 44,
        }}
      >
        {k.title}
      </div>
      {/* YES/NO probability bar */}
      <div
        style={{
          display: "flex",
          height: 36,
          marginBottom: 10,
          fontWeight: 600,
          fontSize: 13,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            flex: k.yesPct,
            background: PRAIRIE,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontVariantNumeric: "tabular-nums",
            gap: 4,
          }}
        >
          YES {k.yesPct}¢
        </div>
        <div
          style={{
            flex: k.noPct,
            background: WHEAT_100,
            color: WHEAT_700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontVariantNumeric: "tabular-nums",
            gap: 4,
          }}
        >
          NO {k.noPct}¢
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: INK_MUTED,
          flexWrap: "wrap",
          gap: 4,
        }}
      >
        <span>Vol {k.volume}</span>
        <span>Closes {k.expires}</span>
      </div>
    </div>
  );
}

interface SpotTileProps {
  price: SpotPrice;
  isLast: boolean;
}

function SpotTile({ price, isLast }: SpotTileProps) {
  const isUp = price.changeAmount >= 0;
  const changeColor = isUp ? PRAIRIE : AMBER;
  return (
    <div
      style={{
        padding: "20px 24px",
        borderRight: isLast ? "none" : `1px solid ${WHEAT_100}`,
        fontFamily: "var(--font-dm-sans)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: INK_MUTED,
          fontWeight: 600,
          marginBottom: 6,
        }}
      >
        {price.grain}
      </div>
      <div
        style={{ display: "flex", alignItems: "baseline", gap: 6 }}
      >
        <span
          style={{
            fontFamily: "var(--font-fraunces)",
            fontSize: 32,
            fontWeight: 500,
            color: INK,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          ${price.settlementPrice.toFixed(2)}
        </span>
        <span style={{ fontSize: 11, color: INK_MUTED }}>{price.unit}</span>
      </div>
      <div
        style={{
          fontSize: 12,
          marginTop: 4,
          fontVariantNumeric: "tabular-nums",
          color: changeColor,
          fontWeight: 600,
        }}
      >
        {isUp ? "↑" : "↓"} {Math.abs(price.changePct).toFixed(2)}%
        <span style={{ fontWeight: 400, color: INK_MUTED, marginLeft: 4 }}>
          ({isUp ? "+" : ""}
          {price.changeAmount.toFixed(4).replace(/\.?0+$/, "")})
        </span>
      </div>
    </div>
  );
}

interface MarketplaceStripProps {
  spotPrices: SpotPrice[];
}

function RowSublabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-dm-sans)",
        fontSize: 10,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: INK_MUTED,
        fontWeight: 700,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

export async function MarketplaceStrip({ spotPrices }: MarketplaceStripProps) {
  const visibleSpot = spotPrices.slice(0, 3);

  const liveMarkets = await fetchKalshiMarkets();
  const usingFallback = liveMarkets.length === 0;
  const allCards: KalshiCardData[] = usingFallback
    ? KALSHI_FALLBACK
    : liveMarkets.map(toCardData);

  const { primary, weekly } = partitionByCadence(allCards);

  const headerLabel = usingFallback
    ? "Snapshot · Kalshi reconnecting · CBOT live"
    : "Live · Kalshi + CBOT";

  const asOf = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Edmonton",
    timeZoneName: "short",
  });

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 6,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-fraunces)",
            fontSize: "clamp(24px, 2.5vw, 36px)",
            fontWeight: 400,
            color: INK,
            margin: 0,
            letterSpacing: "-0.015em",
          }}
        >
          Marketplace
        </h2>
        <span
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: INK_MUTED,
            fontWeight: 600,
          }}
        >
          {headerLabel}
        </span>
      </div>
      <p
        style={{
          fontFamily: "var(--font-fraunces)",
          fontWeight: 300,
          fontSize: "clamp(14px, 1.4vw, 18px)",
          color: WHEAT_700,
          margin: "0 0 24px",
          maxWidth: 720,
        }}
      >
        Where the crowd is putting money. Prediction contracts on top, spot
        futures below.
      </p>

      {/* Top row — monthly grain contracts + fertilizer wildcard (4 cards) */}
      {primary.length > 0 && (
        <>
          <RowSublabel>Monthly contracts · Inputs</RowSublabel>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.max(primary.length, 1)}, 1fr)`,
              gap: 14,
              marginBottom: 18,
            }}
            className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
          >
            {primary.map((k, i) => (
              <KalshiCard key={`primary-${k.crop}-${i}`} k={k} />
            ))}
          </div>
        </>
      )}

      {/* Bottom row — weekly grain contracts (3 cards) */}
      {weekly.length > 0 && (
        <>
          <RowSublabel>Weekly contracts</RowSublabel>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.max(weekly.length, 1)}, 1fr)`,
              gap: 14,
              marginBottom: 14,
            }}
            className="grid-cols-1 sm:grid-cols-3"
          >
            {weekly.map((k, i) => (
              <KalshiCard key={`weekly-${k.crop}-${i}`} k={k} />
            ))}
          </div>
        </>
      )}

      {/* Spot price strip */}
      {visibleSpot.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${visibleSpot.length}, 1fr)`,
            border: `1px solid ${WHEAT_200}`,
            background: "#fff",
          }}
          className="grid-cols-1 sm:grid-cols-3"
        >
          {visibleSpot.map((p, i) => (
            <SpotTile key={p.grain} price={p} isLast={i === visibleSpot.length - 1} />
          ))}
        </div>
      )}

      {/* Footnote */}
      <div
        style={{
          marginTop: 10,
          fontSize: 10,
          color: "#af9f76",
          fontFamily: "var(--font-dm-sans)",
          letterSpacing: "0.04em",
        }}
      >
        {usingFallback
          ? "Live data unavailable — showing recent snapshot."
          : `As of ${asOf} · Kalshi public API.`}
      </div>
    </div>
  );
}
