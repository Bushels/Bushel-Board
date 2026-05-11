// components/overview/marketplace-strip.tsx
// Parked Kalshi watch note + real spot price tiles.

import type { SpotPrice } from "@/lib/queries/overview-data";

const INK = "#2a261e";
const WHEAT_100 = "#ebe7dc";
const WHEAT_200 = "#d7cfba";
const WHEAT_700 = "#5d5132";
const INK_MUTED = "#7c6c43";
const PRAIRIE = "#437a22";
const AMBER = "#b8702a";
const CANOLA = "#c17f24";

function KalshiBoardTeaser() {
  return (
    <div
      style={{
        display: "block",
        padding: "24px 28px",
        background: "#fffaf0",
        border: `1px solid ${WHEAT_200}`,
        fontFamily: "var(--font-dm-sans)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12,
          alignItems: "baseline",
        }}
      >
        <span
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            color: CANOLA,
            fontWeight: 700,
            textTransform: "uppercase",
          }}
        >
          Kalshi watch parked
        </span>
        <span style={{ fontSize: 11, color: INK_MUTED }}>Corn - Soybeans - Wheat</span>
      </div>
      <div
        style={{
          fontFamily: "var(--font-fraunces)",
          fontSize: 24,
          lineHeight: 1.3,
          color: INK,
          marginBottom: 10,
        }}
      >
        Waiting for open grain markets
      </div>
      <p style={{ color: WHEAT_700, margin: "0 0 16px", lineHeight: 1.6 }}>
        Kalshi API wiring is proven, but the public grain commodity markets are not
        currently open. This lane is parked until Corn, Soybeans, or Wheat contracts return.
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 13,
          color: INK_MUTED,
          fontWeight: 700,
          flexWrap: "wrap",
        }}
      >
        <span>No mock prices shown</span>
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
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
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
        {isUp ? "Up" : "Down"} {Math.abs(price.changePct).toFixed(2)}%
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
          Kalshi parked - CBOT live
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
        Kalshi commodity insight is parked until public grain markets return. Spot
        futures remain below for quick price context.
      </p>

      <div style={{ marginBottom: 14 }}>
        <KalshiBoardTeaser />
      </div>

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
    </div>
  );
}
