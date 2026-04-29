// components/overview/marketplace/market-roll.tsx
// Dense tabular roll of every Kalshi market that isn't the spotlight.
// Each row: crop badge · cadence · title · YES% · 24h move · volume bar · CTA.
//
// Visual reference: matches the GrainStanceGrid tabular pattern at the top
// of /overview, so the page reads as one editorial broadsheet rather than
// two unrelated surfaces.
//
// Server component. Sparklines are rendered inline (no candle data — we
// use the YES probability alone with a simulated trajectory based on
// bid/ask spread to keep API pressure under one fetch per market).
//
// ── INTEGRATION POINT ───────────────────────────────────────────────────
// Belongs to the Kalshi marketplace surface only — see isolation fence
// in lib/kalshi/types.ts.
// ────────────────────────────────────────────────────────────────────────

import { formatVolume } from "@/lib/kalshi/client";
import type { KalshiCrop, KalshiMarket } from "@/lib/kalshi/types";

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
  return crop === "FERT" ? "FERT" : crop;
}

function cadenceShort(c: string): string {
  if (c === "monthly") return "MON";
  if (c === "weekly") return "WK";
  if (c === "wildcard") return "YR";
  return "—";
}

interface MarketRollProps {
  markets: KalshiMarket[];
  /** Highest volume in the set, used to scale the volume bars. */
  maxVolume: number;
}

function VolumeBar({
  volume,
  maxVolume,
  accent,
}: {
  volume: number;
  maxVolume: number;
  accent: string;
}) {
  const pct = maxVolume > 0 ? Math.max(2, (volume / maxVolume) * 100) : 0;
  return (
    <div
      style={{
        position: "relative",
        height: 6,
        background: WHEAT_100,
        width: "100%",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: `${pct}%`,
          background: accent,
          opacity: 0.85,
        }}
      />
    </div>
  );
}

/**
 * Tiny built-from-quotes mini-spark — uses bid/last/ask as 3 implicit
 * points to suggest "where is the market quoting around the last
 * print". Not a real time-series, but communicates spread+last clearly.
 */
function MiniSpark({
  market,
  width = 56,
  height = 16,
  color,
}: {
  market: KalshiMarket;
  width?: number;
  height?: number;
  color: string;
}) {
  const bid = market.yesBid;
  const last = market.lastPrice;
  const ask = market.yesAsk;
  const points = [bid, last, ask].filter((v): v is number => v != null && v >= 0 && v <= 1);
  if (points.length < 2) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke={color}
          strokeWidth={1}
          strokeDasharray="2 3"
          opacity={0.4}
        />
      </svg>
    );
  }
  const minV = Math.min(...points);
  const maxV = Math.max(...points);
  const range = Math.max(0.01, maxV - minV);
  const PAD = 1;
  const innerW = width - PAD * 2;
  const innerH = height - PAD * 2;
  const path = points
    .map((v, i) => {
      const x = PAD + (i / (points.length - 1)) * innerW;
      const y = PAD + (1 - (v - minV) / range) * innerH;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden>
      <path d={path} fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
    </svg>
  );
}

function MarketRow({
  market,
  isFirst,
  maxVolume,
}: {
  market: KalshiMarket;
  isFirst: boolean;
  maxVolume: number;
}) {
  const accent = cropAccent(market.crop);
  const yesPct =
    market.yesProbability != null ? Math.round(market.yesProbability * 100) : 50;
  const noPct = 100 - yesPct;

  // Movement: lastPrice vs midOf(bid,ask) — when last is on a different
  // tick than the current quote, that's the most-recent direction. It
  // isn't 24h but it's an honest single-glance mover signal.
  let movement: number | null = null;
  if (market.lastPrice != null && market.yesBid != null && market.yesAsk != null) {
    const mid = (market.yesBid + market.yesAsk) / 2;
    movement = Math.round((market.lastPrice - mid) * 100);
  }
  const moveColor =
    movement == null
      ? INK_MUTED
      : movement > 0
        ? PRAIRIE
        : movement < 0
          ? AMBER
          : INK_MUTED;
  const moveGlyph = movement == null ? "·" : movement > 0 ? "↑" : movement < 0 ? "↓" : "·";

  const kalshiUrl = `https://kalshi.com/markets/${encodeURIComponent(
    market.eventTicker ?? market.ticker,
  )}`;

  return (
    <a
      href={kalshiUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "grid",
        gridTemplateColumns: "84px 1fr 64px 60px 80px 24px",
        alignItems: "center",
        gap: 14,
        padding: "14px 0",
        borderTop: isFirst ? "none" : `1px solid ${WHEAT_100}`,
        fontFamily: "var(--font-dm-sans)",
        textDecoration: "none",
        color: INK,
        transition: "background 150ms ease",
      }}
      className="hover:bg-[#fbfaf6]"
    >
      {/* Crop pill */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 6,
          fontSize: 10,
          letterSpacing: "0.16em",
          fontWeight: 700,
          textTransform: "uppercase",
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            background: accent,
            borderRadius: "50%",
          }}
        />
        <span style={{ color: accent }}>{cropLabel(market.crop)}</span>
        <span style={{ color: INK_MUTED, fontSize: 9 }}>{cadenceShort(market.cadence)}</span>
      </div>

      {/* Title */}
      <div
        style={{
          fontSize: 13,
          color: INK,
          lineHeight: 1.3,
          fontWeight: 400,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={market.title}
      >
        {market.title}
      </div>

      {/* Mini spark */}
      <MiniSpark market={market} color={accent} />

      {/* YES % + movement */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 2,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-fraunces)",
            fontSize: 18,
            fontWeight: 500,
            color: INK,
            letterSpacing: "-0.01em",
          }}
        >
          {yesPct}¢
        </span>
        <span
          style={{
            fontSize: 10,
            color: moveColor,
            fontWeight: 600,
            letterSpacing: "0.06em",
          }}
        >
          {moveGlyph}{" "}
          {movement != null ? `${Math.abs(movement)}¢` : `${noPct}¢ NO`}
        </span>
      </div>

      {/* Volume bar + label */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <VolumeBar volume={market.volume} maxVolume={maxVolume} accent={accent} />
        <span style={{ fontSize: 10, color: INK_MUTED, textAlign: "right" }}>
          {formatVolume(market.volume)}
        </span>
      </div>

      {/* Caret */}
      <span
        aria-hidden
        style={{
          color: INK_MUTED,
          fontSize: 14,
          textAlign: "right",
          opacity: 0.6,
        }}
      >
        →
      </span>
    </a>
  );
}

export function MarketRoll({ markets, maxVolume }: MarketRollProps) {
  if (markets.length === 0) return null;
  return (
    <div>
      {/* Column header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "84px 1fr 64px 60px 80px 24px",
          gap: 14,
          paddingBottom: 8,
          fontFamily: "var(--font-dm-sans)",
          fontSize: 9,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: INK_MUTED,
          fontWeight: 700,
          borderBottom: `1px solid ${WHEAT_200}`,
        }}
      >
        <span>Market</span>
        <span>Question</span>
        <span style={{ textAlign: "center" }}>Quote</span>
        <span style={{ textAlign: "right" }}>YES</span>
        <span style={{ textAlign: "right" }}>Volume</span>
        <span aria-hidden></span>
      </div>

      {markets.map((m, i) => (
        <MarketRow
          key={`${m.ticker}-${i}`}
          market={m}
          isFirst={i === 0}
          maxVolume={maxVolume}
        />
      ))}
    </div>
  );
}
