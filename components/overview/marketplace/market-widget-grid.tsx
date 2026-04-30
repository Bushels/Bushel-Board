// components/overview/marketplace/market-widget-grid.tsx
// Equal-weight Kalshi market widgets for the Predictive Market surface.
//
// Each widget gets the same footprint. The intent is deliberate: these are
// market signals, not editorial rankings, so volume and movement are shown
// inside the card instead of deciding the layout hierarchy.

import { buildKalshiUrl, formatVolume } from "@/lib/kalshi/client";
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

const CROP_ORDER: Record<KalshiCrop, number> = {
  CORN: 0,
  SOY: 1,
  WHEAT: 2,
  FERT: 3,
  OTHER: 4,
};

const CADENCE_ORDER: Record<KalshiMarket["cadence"], number> = {
  monthly: 0,
  wildcard: 1,
  weekly: 2,
};

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

function cadenceLabel(cadence: KalshiMarket["cadence"]): string {
  if (cadence === "monthly") return "Monthly";
  if (cadence === "weekly") return "Weekly";
  return "Year-end";
}

function yesCents(market: KalshiMarket): number {
  return market.yesProbability != null
    ? Math.round(market.yesProbability * 100)
    : 50;
}

function dayMoveCents(market: KalshiMarket): number | null {
  const prior = market.previousLastPrice ?? market.previousYesBid;
  if (prior == null || market.yesProbability == null) return null;
  return Math.round((market.yesProbability - prior) * 100);
}

function sortMarketsForGrid(markets: KalshiMarket[]): KalshiMarket[] {
  return [...markets].sort((a, b) => {
    const cropDelta = CROP_ORDER[a.crop] - CROP_ORDER[b.crop];
    if (cropDelta !== 0) return cropDelta;
    const cadenceDelta = CADENCE_ORDER[a.cadence] - CADENCE_ORDER[b.cadence];
    if (cadenceDelta !== 0) return cadenceDelta;
    return a.title.localeCompare(b.title);
  });
}

function conciseTitle(title: string): string {
  return title
    .replace("Will the ", "Will ")
    .replace(" close price be above ", " close above ")
    .replace(/\s+USd\/Bu/gi, "/bu")
    .replace(/\s+on\s+([A-Z][a-z]{2})\s+0?(\d{1,2}),\s+20\d{2}\s+at\s+[^?]+\?/i, " $1 $2?")
    .replace(/\s+on\s+([A-Z][a-z]{2})\s+0?(\d{1,2})\?/i, " $1 $2?");
}

function closestExpiry(markets: KalshiMarket[]): KalshiMarket | null {
  const withClose = markets
    .map((market) => ({
      market,
      closeMs: market.closeTime ? new Date(market.closeTime).getTime() : Number.POSITIVE_INFINITY,
    }))
    .filter((entry) => Number.isFinite(entry.closeMs))
    .sort((a, b) => a.closeMs - b.closeMs);
  return withClose[0]?.market ?? null;
}

function strongestMove(markets: KalshiMarket[]): KalshiMarket | null {
  return markets.reduce<KalshiMarket | null>((best, market) => {
    const move = dayMoveCents(market);
    if (move == null) return best;
    if (!best) return market;
    const bestMove = dayMoveCents(best);
    return bestMove == null || Math.abs(move) > Math.abs(bestMove)
      ? market
      : best;
  }, null);
}

function highestVolume(markets: KalshiMarket[]): KalshiMarket | null {
  return markets.reduce<KalshiMarket | null>(
    (best, market) => (!best || market.volume > best.volume ? market : best),
    null,
  );
}

function MiniSpark({
  market,
  accent,
}: {
  market: KalshiMarket;
  accent: string;
}) {
  const prior = market.previousLastPrice ?? market.previousYesBid;
  const current = market.yesProbability;
  const width = 142;
  const height = 42;

  if (prior == null || current == null) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        aria-hidden
        style={{ display: "block" }}
      >
        <line
          x1="4"
          y1={height / 2}
          x2={width - 4}
          y2={height / 2}
          stroke={accent}
          strokeWidth="1.4"
          strokeDasharray="3 5"
          opacity="0.45"
        />
      </svg>
    );
  }

  const minV = Math.min(prior, current);
  const maxV = Math.max(prior, current);
  const range = Math.max(0.02, maxV - minV);
  const pad = 4;
  const yFor = (v: number) => pad + (1 - (v - minV) / range) * (height - pad * 2);
  const x1 = pad;
  const x2 = width - pad;
  const y1 = yFor(prior);
  const y2 = yFor(current);
  const cx1 = width * 0.36;
  const cx2 = width * 0.64;
  const cy1 = y1;
  const cy2 = y2;
  const fillPath = `M ${x1} ${y1} C ${cx1} ${cy1} ${cx2} ${cy2} ${x2} ${y2} L ${x2} ${height - pad} L ${x1} ${height - pad} Z`;
  const linePath = `M ${x1} ${y1} C ${cx1} ${cy1} ${cx2} ${cy2} ${x2} ${y2}`;
  const gradientId = `widget-spark-${market.ticker.replace(/[^a-zA-Z0-9]/g, "-")}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      aria-hidden
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.22" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${gradientId})`} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke={accent}
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx={x2} cy={y2} r="2.2" fill={accent} />
    </svg>
  );
}

function MarketWidget({ market }: { market: KalshiMarket }) {
  const accent = cropAccent(market.crop);
  const yesPct = yesCents(market);
  const noPct = 100 - yesPct;
  const move = dayMoveCents(market);
  const moveColor =
    move == null ? INK_MUTED : move > 0 ? PRAIRIE : move < 0 ? AMBER : INK_MUTED;
  const kalshiUrl = buildKalshiUrl(market.seriesTicker);

  return (
    <a
      href={kalshiUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        minHeight: 286,
        background: "#fff",
        border: `1px solid ${WHEAT_200}`,
        boxShadow: "0 4px 16px rgba(42,38,30,0.05)",
        color: INK,
        display: "flex",
        flexDirection: "column",
        padding: "18px 18px 16px",
        textDecoration: "none",
        fontFamily: "var(--font-dm-sans)",
        transition:
          "transform 160ms cubic-bezier(0.16, 1, 0.3, 1), border-color 160ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 160ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      className="hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(42,38,30,0.08)]"
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            minWidth: 0,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: accent,
              flex: "0 0 auto",
            }}
          />
          <span
            style={{
              color: accent,
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            {cropLabel(market.crop)}
          </span>
          <span
            style={{
              color: INK_MUTED,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            {cadenceLabel(market.cadence)}
          </span>
        </div>
        <span
          style={{
            color: INK_MUTED,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          Kalshi
        </span>
      </div>

      <h3
        style={{
          minHeight: 56,
          margin: 0,
          color: INK,
          fontFamily: "var(--font-fraunces)",
          fontSize: 18,
          fontWeight: 400,
          letterSpacing: "-0.01em",
          lineHeight: 1.22,
        }}
      >
        {conciseTitle(market.title)}
      </h3>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          alignItems: "end",
          gap: 16,
          marginTop: 18,
        }}
      >
        <div>
          <div
            style={{
              color: accent,
              fontFamily: "var(--font-fraunces)",
              fontSize: 42,
              fontWeight: 500,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em",
              lineHeight: 0.95,
            }}
          >
            {yesPct}
            <span
              style={{
                color: INK_MUTED,
                fontFamily: "var(--font-dm-sans)",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: 0,
                marginLeft: 4,
              }}
            >
              c YES
            </span>
          </div>
          <div
            style={{
              color: moveColor,
              fontSize: 11,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              marginTop: 7,
            }}
          >
            {move == null
              ? `NO ${noPct}c`
              : `${move > 0 ? "+" : ""}${move}c in 24h`}
          </div>
        </div>
        <div>
          <MiniSpark market={market} accent={accent} />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              color: INK_MUTED,
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            <span>24h</span>
            <span>Now</span>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 10,
          marginTop: "auto",
          paddingTop: 16,
          borderTop: `1px solid ${WHEAT_100}`,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <WidgetMeta label="Volume" value={formatVolume(market.volume)} />
        <WidgetMeta label="Open int." value={formatVolume(market.openInterest)} />
        <WidgetMeta label="Closes" value={market.closeLabel} />
      </div>

      <div
        style={{
          marginTop: 14,
          color: INK_MUTED,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        <span>Open contract</span>
        <span aria-hidden="true">-&gt;</span>
      </div>
    </a>
  );
}

function WidgetMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          color: INK_MUTED,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.11em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: INK,
          fontSize: 12,
          fontWeight: 700,
          marginTop: 3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function SignalCard({
  label,
  market,
  value,
}: {
  label: string;
  market: KalshiMarket | null;
  value: string;
}) {
  if (!market) return null;
  const accent = cropAccent(market.crop);
  return (
    <a
      href={buildKalshiUrl(market.seriesTicker)}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "block",
        color: INK,
        textDecoration: "none",
        padding: "14px 16px",
        borderRight: `1px solid ${WHEAT_100}`,
        fontFamily: "var(--font-dm-sans)",
        minHeight: 94,
      }}
    >
      <div
        style={{
          color: INK_MUTED,
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: accent,
          fontSize: 18,
          fontWeight: 800,
          fontVariantNumeric: "tabular-nums",
          marginTop: 8,
        }}
      >
        {value}
      </div>
      <div
        style={{
          color: WHEAT_700,
          fontSize: 12,
          lineHeight: 1.3,
          marginTop: 4,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={market.title}
      >
        {cropLabel(market.crop)}: {conciseTitle(market.title)}
      </div>
    </a>
  );
}

function MarketSignals({ markets }: { markets: KalshiMarket[] }) {
  const volume = highestVolume(markets);
  const move = strongestMove(markets);
  const expiry = closestExpiry(markets);
  const moveValue = move ? dayMoveCents(move) : null;

  return (
    <div
      style={{
        marginTop: 18,
        background: "#fff",
        border: `1px solid ${WHEAT_200}`,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))",
        overflow: "hidden",
      }}
    >
      <SignalCard
        label="Highest volume"
        market={volume}
        value={volume ? formatVolume(volume.volume) : "-"}
      />
      <SignalCard
        label="Biggest 24h move"
        market={move}
        value={moveValue == null ? "No prior" : `${moveValue > 0 ? "+" : ""}${moveValue}c`}
      />
      <SignalCard
        label="Closest expiry"
        market={expiry}
        value={expiry?.closeLabel ?? "-"}
      />
      <a
        href="https://kalshi.com/markets"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          minHeight: 94,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "14px 18px",
          color: INK,
          background: WHEAT_50,
          borderTop: `1px solid ${WHEAT_100}`,
          fontFamily: "var(--font-dm-sans)",
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        Open on Kalshi -&gt;
      </a>
    </div>
  );
}

interface MarketWidgetGridProps {
  markets: KalshiMarket[];
  variant?: "full" | "teaser";
}

export function MarketWidgetGrid({
  markets,
  variant = "full",
}: MarketWidgetGridProps) {
  if (markets.length === 0) return null;

  const sorted = sortMarketsForGrid(markets);
  const visible = variant === "teaser" ? sorted.slice(0, 3) : sorted;

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 290px), 1fr))",
          gap: 14,
        }}
      >
        {visible.map((market) => (
          <MarketWidget key={market.ticker} market={market} />
        ))}
      </div>
      {variant === "full" && <MarketSignals markets={sorted} />}
    </div>
  );
}
