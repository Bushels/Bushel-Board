// components/overview/marketplace-strip.tsx
// Kalshi predictive market cards (mocked) + spot price tiles.
// Kalshi cards are explicitly mocked — API wiring is deferred.
// Spot prices are real from grain_prices table.

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

// TODO: Kalshi API wiring deferred. These are representative mock contracts
// matching the Kalshi corn/soy product line as of 2026-04.
// When the API is wired: replace with real fetchKalshiContracts() call
// and remove this stub array.
interface KalshiContract {
  crop: "CORN" | "SOY";
  title: string;
  yesPct: number;
  noPct: number;
  volume: string;
  move: string;
  expires: string;
}

const KALSHI_MOCK: KalshiContract[] = [
  {
    crop: "CORN",
    title: "Will Dec corn close above $4.75 this week?",
    yesPct: 64,
    noPct: 36,
    volume: "$284k",
    move: "+8",
    expires: "Fri, May 2",
  },
  {
    crop: "CORN",
    title: "USDA May WASDE: corn ending stocks below 2.0 bn bu?",
    yesPct: 41,
    noPct: 59,
    volume: "$612k",
    move: "-3",
    expires: "May 9",
  },
  {
    crop: "SOY",
    title: "Will May soybeans close above $10.50 this week?",
    yesPct: 28,
    noPct: 72,
    volume: "$198k",
    move: "-12",
    expires: "Fri, May 2",
  },
  {
    crop: "SOY",
    title: "Soybean planting >55% by May 12?",
    yesPct: 71,
    noPct: 29,
    volume: "$94k",
    move: "+5",
    expires: "May 12",
  },
];

function KalshiCard({ k }: { k: KalshiContract }) {
  const cropColor = k.crop === "CORN" ? CANOLA : PRAIRIE;
  const isUp = k.move.startsWith("+");
  const moveColor = isUp ? PRAIRIE : AMBER;
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
            color: cropColor,
            fontWeight: 700,
            textTransform: "uppercase" as const,
          }}
        >
          {k.crop}
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
        <span style={{ color: moveColor, fontWeight: 600 }}>
          {isUp ? "↑" : "↓"} {k.move.replace(/^[+-]/, "")} this week
        </span>
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

export function MarketplaceStrip({ spotPrices }: MarketplaceStripProps) {
  const visibleSpot = spotPrices.slice(0, 3);

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
          Live · Kalshi + CBOT
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

      {/* Kalshi cards — 2×2 grid on desktop, 1 col on mobile */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 14,
          marginBottom: 14,
        }}
        className="grid-cols-1 sm:grid-cols-2"
      >
        {KALSHI_MOCK.map((k, i) => (
          <KalshiCard key={i} k={k} />
        ))}
      </div>

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

      {/* Kalshi mock disclaimer */}
      <div
        style={{
          marginTop: 10,
          fontSize: 10,
          color: "#af9f76",
          fontFamily: "var(--font-dm-sans)",
          letterSpacing: "0.04em",
        }}
      >
        Predictive market data is illustrative. Kalshi API integration deferred
        — live wiring coming soon.
      </div>
    </div>
  );
}
