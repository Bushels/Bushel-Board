// components/overview/marketplace/spotlight-card.tsx
// The editorial hero card of the Predictive Market dashboard. Renders
// the highest-volume market large, with a real candlestick sparkline
// and a recent-prints list down the right rail.
//
// Server component — all data is supplied by the parent at render time.
//
// ── INTEGRATION POINT ───────────────────────────────────────────────────
// Belongs to the Kalshi marketplace surface only — see isolation fence
// in lib/kalshi/types.ts.
// ────────────────────────────────────────────────────────────────────────

import { formatVolume } from "@/lib/kalshi/client";
import type { KalshiCandle, KalshiCrop, KalshiMarket, KalshiTrade } from "@/lib/kalshi/types";
import { Sparkline } from "./sparkline";

const INK = "#2a261e";
const WHEAT_50 = "#f5f3ee";
const WHEAT_100 = "#ebe7dc";
const WHEAT_200 = "#d7cfba";
const WHEAT_700 = "#5d5132";
const INK_MUTED = "#7c6c43";
const PRAIRIE = "#437a22";
const AMBER = "#b8702a";
const CANOLA = "#c17f24";
const SOIL = "#6b3f2a";

function cropAccent(crop: KalshiCrop): string {
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

function cadenceLabel(c: string): string {
  if (c === "monthly") return "MONTHLY · BINARY";
  if (c === "weekly") return "WEEKLY · BINARY";
  if (c === "wildcard") return "YEAR-END · STRIKE LADDER";
  return "BINARY";
}

interface SpotlightCardProps {
  market: KalshiMarket;
  candles: KalshiCandle[];
  trades: KalshiTrade[];
}

function formatTradeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Edmonton",
  });
}

export function SpotlightCard({ market, candles, trades }: SpotlightCardProps) {
  const accent = cropAccent(market.crop);
  const yesPct =
    market.yesProbability != null
      ? Math.round(market.yesProbability * 100)
      : 50;

  // Movement vs. start of candle window (24h prior, by default).
  const firstCandlePrice =
    candles.length > 0
      ? candles[0].yesBidClose ?? candles[0].yesAskClose ?? null
      : null;
  const movement =
    firstCandlePrice != null && market.yesProbability != null
      ? Math.round((market.yesProbability - firstCandlePrice) * 100)
      : null;

  const movementColor =
    movement == null
      ? INK_MUTED
      : movement > 0
        ? PRAIRIE
        : movement < 0
          ? AMBER
          : INK_MUTED;
  const movementGlyph =
    movement == null ? "·" : movement > 0 ? "↑" : movement < 0 ? "↓" : "·";

  const kalshiUrl = `https://kalshi.com/markets/${encodeURIComponent(
    market.eventTicker ?? market.ticker,
  )}`;

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${WHEAT_200}`,
        // Subtle inner glow on the accent edge — feels editorial, not techy.
        boxShadow: `inset 4px 0 0 0 ${accent}`,
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 0,
      }}
      className="lg:grid-cols-[1.6fr_1fr]"
    >
      {/* Left: hero content */}
      <div
        style={{
          padding: "32px 36px",
          borderRight: "none",
          fontFamily: "var(--font-dm-sans)",
        }}
        className="lg:border-r"
      >
        {/* Pre-title */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 14,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 10,
              letterSpacing: "0.22em",
              color: INK_MUTED,
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            <span style={{ color: accent }}>The big bet</span> ·{" "}
            {cropLabel(market.crop)} · {cadenceLabel(market.cadence)}
          </span>
          <span
            style={{
              fontSize: 9,
              letterSpacing: "0.18em",
              color: INK_MUTED,
              fontWeight: 600,
              textTransform: "uppercase",
            }}
          >
            via Kalshi
          </span>
        </div>

        {/* Title */}
        <div
          style={{
            fontFamily: "var(--font-fraunces)",
            fontWeight: 400,
            fontSize: "clamp(22px, 2.4vw, 32px)",
            letterSpacing: "-0.015em",
            lineHeight: 1.15,
            color: INK,
            marginBottom: 22,
            maxWidth: 540,
          }}
        >
          {market.title}
        </div>

        {/* Probability + movement + sparkline */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            alignItems: "end",
            gap: 28,
            marginBottom: 24,
          }}
          className="grid-cols-1 sm:grid-cols-[auto_1fr]"
        >
          <div>
            <div
              style={{
                fontFamily: "var(--font-fraunces)",
                fontSize: "clamp(56px, 7vw, 96px)",
                fontWeight: 500,
                lineHeight: 0.9,
                color: accent,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.03em",
              }}
            >
              {yesPct}
              <span
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "0.35em",
                  fontWeight: 600,
                  color: INK_MUTED,
                  marginLeft: 6,
                  letterSpacing: 0,
                }}
              >
                ¢ YES
              </span>
            </div>
            <div
              style={{
                marginTop: 10,
                display: "flex",
                gap: 14,
                alignItems: "center",
                fontSize: 12,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span style={{ color: movementColor }}>
                {movementGlyph}{" "}
                {movement == null
                  ? "no 24h data"
                  : `${Math.abs(movement)} cent${
                      Math.abs(movement) === 1 ? "" : "s"
                    } in 24h`}
              </span>
              <span style={{ color: INK_MUTED, fontWeight: 400 }}>·</span>
              <span style={{ color: INK_MUTED }}>NO {100 - yesPct}¢</span>
            </div>
          </div>

          {/* Sparkline */}
          <div
            style={{
              minHeight: 84,
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              gap: 6,
            }}
          >
            <div style={{ position: "relative", height: 84 }}>
              <Sparkline
                candles={candles}
                width={400}
                height={84}
                color={accent}
                fillColor={accent}
                id={`spotlight-${market.ticker}`}
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 9,
                letterSpacing: "0.18em",
                color: INK_MUTED,
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              <span>24h ago</span>
              <span>now</span>
            </div>
          </div>
        </div>

        {/* Bottom meta strip */}
        <div
          style={{
            display: "flex",
            gap: 24,
            paddingTop: 16,
            borderTop: `1px solid ${WHEAT_100}`,
            fontSize: 12,
            color: INK_MUTED,
            flexWrap: "wrap",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span>
            <span style={{ color: INK, fontWeight: 600 }}>
              {formatVolume(market.volume)}
            </span>{" "}
            volume
          </span>
          <span>
            <span style={{ color: INK, fontWeight: 600 }}>
              {formatVolume(market.openInterest)}
            </span>{" "}
            open interest
          </span>
          <span>
            Closes <span style={{ color: INK, fontWeight: 600 }}>{market.closeLabel}</span>
          </span>
        </div>
      </div>

      {/* Right rail: recent trades + CTA */}
      <div
        style={{
          background: WHEAT_50,
          padding: "32px 28px",
          fontFamily: "var(--font-dm-sans)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          borderTop: `1px solid ${WHEAT_200}`,
        }}
        className="lg:border-t-0"
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            color: INK_MUTED,
            fontWeight: 700,
            textTransform: "uppercase",
          }}
        >
          Recent prints
        </div>

        {trades.length === 0 ? (
          <div
            style={{
              fontSize: 12,
              color: INK_MUTED,
              fontStyle: "italic",
              padding: "8px 0",
            }}
          >
            Awaiting next print…
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {trades.slice(0, 5).map((t, i) => {
              const tradePct = Math.round(t.yesPrice * 100);
              const sideColor = t.takerSide === "yes" ? PRAIRIE : AMBER;
              return (
                <div
                  key={`${t.ticker}-${t.createdTime}-${i}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    alignItems: "baseline",
                    padding: "10px 0",
                    borderTop: i === 0 ? "none" : `1px solid ${WHEAT_200}`,
                    gap: 10,
                    fontSize: 12,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <span style={{ color: INK_MUTED, fontSize: 11 }}>
                    {formatTradeTime(t.createdTime)}
                  </span>
                  <span
                    style={{
                      color: sideColor,
                      fontWeight: 700,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      fontSize: 10,
                    }}
                  >
                    {t.takerSide === "yes" ? "↑ YES" : "↓ NO"}
                  </span>
                  <span style={{ color: INK, fontWeight: 600 }}>{tradePct}¢</span>
                </div>
              );
            })}
          </div>
        )}

        <a
          href={kalshiUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            marginTop: "auto",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            background: INK,
            color: WHEAT_50,
            fontWeight: 600,
            fontSize: 12,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            textDecoration: "none",
            border: `1px solid ${INK}`,
            transition: "all 200ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <span>Place a bet on Kalshi</span>
          <span aria-hidden style={{ fontSize: 14 }}>→</span>
        </a>
      </div>
    </div>
  );
}
