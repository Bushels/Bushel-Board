// components/overview/marketplace/predictive-market-header.tsx
// Section header for the Predictive Market dashboard. Big editorial title
// + collapsible "What is this?" disclosure for first-time visitors.
// Uses the native <details> element so the disclosure works without
// JavaScript (server component, fully accessible).
//
// ── INTEGRATION POINT ───────────────────────────────────────────────────
// Belongs to the Kalshi marketplace surface only — see isolation fence
// in lib/kalshi/types.ts.
// ────────────────────────────────────────────────────────────────────────

const INK = "#2a261e";
const WHEAT_50 = "#f5f3ee";
const WHEAT_100 = "#ebe7dc";
const WHEAT_200 = "#d7cfba";
const WHEAT_700 = "#5d5132";
const INK_MUTED = "#7c6c43";
const PRAIRIE = "#437a22";

interface PredictiveMarketHeaderProps {
  marketCount: number;
  isLive: boolean;
}

export function PredictiveMarketHeader({
  marketCount,
  isLive,
}: PredictiveMarketHeaderProps) {
  return (
    <div style={{ marginBottom: 18 }}>
      {/* Top row: title + status */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 4,
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-fraunces)",
            fontSize: "clamp(28px, 3vw, 44px)",
            fontWeight: 400,
            color: INK,
            margin: 0,
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}
        >
          Predictive{" "}
          <em style={{ fontStyle: "italic", color: PRAIRIE }}>Market</em>
        </h2>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--font-dm-sans)",
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: isLive ? PRAIRIE : INK_MUTED,
            fontWeight: 700,
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: isLive ? PRAIRIE : INK_MUTED,
              animation: isLive
                ? "kalshi-header-pulse 1.6s ease-in-out infinite"
                : undefined,
            }}
          />
          <style>{`
            @keyframes kalshi-header-pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.3; }
            }
          `}</style>
          {isLive ? `Live · Kalshi · ${marketCount} markets` : "Snapshot · reconnecting"}
        </span>
      </div>

      {/* Lede */}
      <p
        style={{
          fontFamily: "var(--font-fraunces)",
          fontSize: "clamp(15px, 1.45vw, 19px)",
          fontWeight: 300,
          color: WHEAT_700,
          maxWidth: 720,
          lineHeight: 1.5,
          margin: "8px 0 0",
        }}
      >
        Where the crowd is putting money. Real prices, real bets, on the
        futures that move your bushel.
      </p>

      {/* Disclosure: how predictive markets work */}
      <details
        style={{
          marginTop: 18,
          fontFamily: "var(--font-dm-sans)",
          borderTop: `1px solid ${WHEAT_200}`,
          paddingTop: 12,
        }}
      >
        <summary
          style={{
            cursor: "pointer",
            listStyle: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: INK_MUTED,
            fontWeight: 700,
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 14,
              height: 14,
              border: `1px solid ${INK_MUTED}`,
              borderRadius: "50%",
              textAlign: "center",
              fontSize: 10,
              lineHeight: "12px",
              fontWeight: 700,
            }}
            aria-hidden
          >
            ?
          </span>
          What is a predictive market?
        </summary>
        <div
          style={{
            marginTop: 14,
            padding: "16px 18px",
            background: WHEAT_50,
            border: `1px solid ${WHEAT_100}`,
            fontSize: 13,
            lineHeight: 1.55,
            color: WHEAT_700,
            maxWidth: 760,
          }}
        >
          <p style={{ margin: "0 0 10px" }}>
            A predictive market is a contract on a future event. People put
            real money on{" "}
            <strong style={{ color: INK, fontWeight: 600 }}>YES</strong> or{" "}
            <strong style={{ color: INK, fontWeight: 600 }}>NO</strong>, and
            the price reflects the crowd's odds. A YES at{" "}
            <span
              style={{
                fontVariantNumeric: "tabular-nums",
                color: INK,
                fontWeight: 600,
              }}
            >
              66¢
            </span>{" "}
            means the market thinks there's about a 66% chance of YES being
            right.
          </p>
          <p style={{ margin: "0 0 10px" }}>
            Below are{" "}
            <span
              style={{
                fontVariantNumeric: "tabular-nums",
                color: INK,
                fontWeight: 600,
              }}
            >
              {marketCount}
            </span>{" "}
            grain-related contracts on Kalshi — the regulated US prediction
            exchange. Use them as a sentiment overlay: when a wheat-above-X
            contract trades up, it means traders are paying for the chance
            that wheat closes higher than X.
          </p>
          <p style={{ margin: 0, fontSize: 12, color: INK_MUTED }}>
            Bushel Board doesn't take a position — we surface what the
            market is doing. Click any market to view, deposit, or trade on
            Kalshi directly.
          </p>
        </div>
      </details>
    </div>
  );
}
