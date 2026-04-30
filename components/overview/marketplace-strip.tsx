// components/overview/marketplace-strip.tsx
// Equal-weight Predictive Market dashboard for /markets and /overview.
//
// Server component. Fetches all featured Kalshi markets through the isolated
// Kalshi client. The full /markets view renders every contract as the same
// size widget so volume, probability, and movement do not imply editorial
// precedence through layout.

import Link from "next/link";

import { fetchKalshiMarkets } from "@/lib/kalshi/client";
import type { KalshiCrop, KalshiMarket } from "@/lib/kalshi/types";
import type { SpotPrice } from "@/lib/queries/overview-data";

import { PredictiveMarketHeader } from "./marketplace/predictive-market-header";
import { MarketWidgetGrid } from "./marketplace/market-widget-grid";

const INK = "#2a261e";
const WHEAT_50 = "#f5f3ee";
const WHEAT_100 = "#ebe7dc";
const WHEAT_200 = "#d7cfba";
const WHEAT_700 = "#5d5132";
const INK_MUTED = "#7c6c43";
const PRAIRIE = "#437a22";
const AMBER = "#b8702a";

interface FallbackMarket {
  ticker: string;
  eventTicker: string;
  title: string;
  crop: KalshiCrop;
  cadence: "monthly" | "weekly" | "wildcard";
  yesProbability: number;
  yesBid: number;
  yesAsk: number;
  lastPrice: number;
  volume: number;
  openInterest: number;
  closeLabel: string;
}

// Captured 2026-04-29. Used only when Kalshi is unreachable.
const FALLBACK_MARKETS: FallbackMarket[] = [
  {
    ticker: "KXFERT-26-1200",
    eventTicker: "KXFERT-26",
    title: "Will fertilizer reach $1200/ton this year?",
    crop: "FERT",
    cadence: "wildcard",
    yesProbability: 0.51,
    yesBid: 0.48,
    yesAsk: 0.51,
    lastPrice: 0.51,
    volume: 9925.66,
    openInterest: 3157.21,
    closeLabel: "Jan 1",
  },
  {
    ticker: "KXSOYBEANMON-26APR3017-T1166.99",
    eventTicker: "KXSOYBEANMON-26APR3017",
    title: "Will May soy close above $11.66/bu Apr 30?",
    crop: "SOY",
    cadence: "monthly",
    yesProbability: 0.89,
    yesBid: 0.88,
    yesAsk: 0.91,
    lastPrice: 0.89,
    volume: 3812.59,
    openInterest: 2354.69,
    closeLabel: "Apr 30",
  },
  {
    ticker: "KXCORNMON-26APR3017-T455.99",
    eventTicker: "KXCORNMON-26APR3017",
    title: "Will May corn close above $4.55/bu Apr 30?",
    crop: "CORN",
    cadence: "monthly",
    yesProbability: 0.66,
    yesBid: 0.65,
    yesAsk: 0.67,
    lastPrice: 0.66,
    volume: 3013.54,
    openInterest: 1940.74,
    closeLabel: "Apr 30",
  },
  {
    ticker: "KXWHEATMON-26APR3017-T589.99",
    eventTicker: "KXWHEATMON-26APR3017",
    title: "Will May wheat close above $5.89/bu Apr 30?",
    crop: "WHEAT",
    cadence: "monthly",
    yesProbability: 0.91,
    yesBid: 0.9,
    yesAsk: 0.93,
    lastPrice: 0.91,
    volume: 2550.71,
    openInterest: 1465.41,
    closeLabel: "Apr 30",
  },
  {
    ticker: "KXCORNW-26MAY0114-T471.99",
    eventTicker: "KXCORNW-26MAY0114",
    title: "Will May corn close above $4.71/bu May 1?",
    crop: "CORN",
    cadence: "weekly",
    yesProbability: 0.52,
    yesBid: 0.5,
    yesAsk: 0.54,
    lastPrice: 0.52,
    volume: 1002,
    openInterest: 726,
    closeLabel: "May 1",
  },
  {
    ticker: "KXWHEATW-26MAY0114-T633.49",
    eventTicker: "KXWHEATW-26MAY0114",
    title: "Will May wheat close above $6.33/bu May 1?",
    crop: "WHEAT",
    cadence: "weekly",
    yesProbability: 0.88,
    yesBid: 0.86,
    yesAsk: 0.9,
    lastPrice: 0.88,
    volume: 594,
    openInterest: 375,
    closeLabel: "May 1",
  },
  {
    ticker: "KXSOYBEANW-26MAY0114-T1101.99",
    eventTicker: "KXSOYBEANW-26MAY0114",
    title: "Will May soy close above $11.02/bu May 1?",
    crop: "SOY",
    cadence: "weekly",
    yesProbability: 0.96,
    yesBid: 0.95,
    yesAsk: 0.97,
    lastPrice: 0.96,
    volume: 495,
    openInterest: 226,
    closeLabel: "May 1",
  },
];

function fallbackToMarket(f: FallbackMarket): KalshiMarket {
  return {
    ticker: f.ticker,
    eventTicker: f.eventTicker,
    seriesTicker: f.ticker.split("-")[0],
    title: f.title,
    subtitle: null,
    crop: f.crop,
    cadence: f.cadence,
    status: "snapshot",
    yesBid: f.yesBid,
    yesAsk: f.yesAsk,
    lastPrice: f.lastPrice,
    previousLastPrice: null,
    previousYesBid: null,
    yesProbability: f.yesProbability,
    volume: f.volume,
    openInterest: f.openInterest,
    closeTime: null,
    closeLabel: f.closeLabel,
  };
}

function SpotTile({ price, isLast }: { price: SpotPrice; isLast: boolean }) {
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
  /**
   * "full" renders the complete /markets dashboard. "teaser" renders the
   * smaller /overview entry point and links to the full tab.
   */
  variant?: "full" | "teaser";
}

function SectionDivider() {
  return (
    <div
      style={{
        height: 1,
        background: `linear-gradient(90deg, transparent 0%, ${WHEAT_200} 20%, ${WHEAT_200} 80%, transparent 100%)`,
        margin: "32px 0",
      }}
    />
  );
}

export async function MarketplaceStrip({
  spotPrices,
  variant = "full",
}: MarketplaceStripProps) {
  const isTeaser = variant === "teaser";
  const visibleSpot = spotPrices.slice(0, 3);

  const liveMarkets = await fetchKalshiMarkets();
  const usingFallback = liveMarkets.length === 0;
  const markets: KalshiMarket[] = usingFallback
    ? FALLBACK_MARKETS.map(fallbackToMarket)
    : liveMarkets;

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
      <PredictiveMarketHeader
        marketCount={markets.length}
        isLive={!usingFallback}
      />

      <div style={{ marginTop: 22 }}>
        <MarketWidgetGrid markets={markets} variant={variant} />
      </div>

      {isTeaser && (
        <div
          style={{
            marginTop: 14,
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            padding: "16px 20px",
            background: WHEAT_50,
            border: `1px solid ${WHEAT_100}`,
            fontFamily: "var(--font-dm-sans)",
          }}
        >
          <span
            style={{
              fontSize: 13,
              color: WHEAT_700,
              fontWeight: 500,
              lineHeight: 1.45,
            }}
          >
            {markets.length > 3
              ? `${markets.length - 3} more equal-weight Kalshi widgets, plus this week's editorial brief.`
              : "This week's editorial brief and the full Kalshi board."}
          </span>
          <Link
            href="/markets"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              background: PRAIRIE,
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              textDecoration: "none",
              borderRadius: 999,
              whiteSpace: "nowrap",
            }}
          >
            View full Predictive Market <span aria-hidden="true">-&gt;</span>
          </Link>
        </div>
      )}

      {!isTeaser && <SectionDivider />}

      {!isTeaser && visibleSpot.length > 0 && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 12,
              fontFamily: "var(--font-dm-sans)",
            }}
          >
            <span
              style={{
                fontSize: 11,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: INK_MUTED,
                fontWeight: 700,
              }}
            >
              CBOT Futures <span style={{ color: INK }}>Ground truth</span>
            </span>
            <span
              style={{
                fontSize: 10,
                letterSpacing: "0.18em",
                color: PRAIRIE,
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              Live
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
              border: `1px solid ${WHEAT_200}`,
              background: "#fff",
            }}
          >
            {visibleSpot.map((p, i) => (
              <SpotTile
                key={p.grain}
                price={p}
                isLast={i === visibleSpot.length - 1}
              />
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 18,
          fontSize: 10,
          color: "#af9f76",
          fontFamily: "var(--font-dm-sans)",
          letterSpacing: "0.04em",
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <span>
          {usingFallback
            ? "Live data unavailable - showing recent snapshot."
            : `As of ${asOf} - Markets refresh every 5min`}
        </span>
        <span>
          via{" "}
          <a
            href="https://kalshi.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "inherit",
              textDecoration: "underline",
              textDecorationStyle: "dotted",
            }}
          >
            kalshi.com
          </a>{" "}
          - public API
        </span>
      </div>
    </div>
  );
}
