// components/overview/grain-stance-row.tsx
// One row in the grain stance grid — grain name, score bar, score number, WoW delta.

import Link from "next/link";
import type { GrainStanceData } from "@/components/dashboard/market-stance-chart";

const PRAIRIE = "#437a22";
const AMBER = "#b8702a";
const INK = "#2a261e";
const WHEAT_100 = "#ebe7dc";
const WHEAT_200 = "#d7cfba";
const INK_MUTED = "#7c6c43";

interface GrainStanceRowProps {
  row: GrainStanceData;
  isFirst: boolean;
}

function StanceBar({
  score,
  prior,
}: {
  score: number;
  prior: number | null;
}) {
  const abs = Math.abs(score);
  const isBull = score > 0;
  const priorPos = prior !== null ? 50 + prior / 2 : null;
  return (
    <div
      style={{
        position: "relative",
        height: 8,
        background: WHEAT_100,
        borderRadius: 2,
        overflow: "hidden",
      }}
      role="img"
      aria-label={`Stance score ${score}`}
    >
      {/* center divider */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          bottom: 0,
          width: 1,
          background: WHEAT_200,
          transform: "translateX(-50%)",
          zIndex: 1,
        }}
      />
      {isBull ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            bottom: 0,
            width: `${abs / 2}%`,
            background: PRAIRIE,
          }}
        />
      ) : score < 0 ? (
        <div
          style={{
            position: "absolute",
            right: "50%",
            top: 0,
            bottom: 0,
            width: `${abs / 2}%`,
            background: AMBER,
          }}
        />
      ) : null}
      {priorPos !== null && prior !== score && (
        <div
          style={{
            position: "absolute",
            left: `${priorPos}%`,
            top: -2,
            bottom: -2,
            width: 2,
            background: INK,
            borderRadius: 1,
            zIndex: 2,
            opacity: 0.45,
          }}
          title={`Prior: ${prior}`}
        />
      )}
    </div>
  );
}

function ConfidenceDot({ level }: { level: string }) {
  const color =
    level === "high" ? PRAIRIE : level === "medium" ? "#c17f24" : AMBER;
  return (
    <span
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
      }}
      title={`${level} confidence`}
    />
  );
}

export function GrainStanceRow({ row, isFirst }: GrainStanceRowProps) {
  const isBull = row.score > 0;
  const isBear = row.score < 0;
  const scoreColor = isBull ? PRAIRIE : isBear ? AMBER : INK_MUTED;
  const delta =
    row.priorScore !== null ? row.score - row.priorScore : null;
  const deltaColor =
    delta === null ? INK_MUTED : delta > 0 ? PRAIRIE : delta < 0 ? AMBER : INK_MUTED;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.4fr 60px 2fr 70px 48px",
        alignItems: "center",
        gap: 12,
        padding: "13px 0",
        borderTop: isFirst ? "none" : `1px solid ${WHEAT_100}`,
        fontFamily: "var(--font-dm-sans)",
      }}
    >
      {/* Grain name + confidence */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Link
          href={row.detailHref}
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: INK,
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {row.grain}
          <ConfidenceDot level={row.confidence} />
        </Link>
        {row.cashPrice && (
          <div
            style={{
              fontSize: 11,
              color: INK_MUTED,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {row.cashPrice}
          </div>
        )}
      </div>

      {/* Score number */}
      <div
        style={{
          fontFamily: "var(--font-fraunces)",
          fontSize: 22,
          fontWeight: 500,
          color: scoreColor,
          fontVariantNumeric: "tabular-nums",
          textAlign: "right",
          lineHeight: 1,
        }}
      >
        {row.score > 0 ? "+" : ""}
        {row.score}
      </div>

      {/* Bar */}
      <StanceBar score={row.score} prior={row.priorScore} />

      {/* Price change */}
      {row.priceChange ? (
        <div
          style={{
            textAlign: "right",
            fontSize: 11,
            color: row.priceChange.startsWith("+") ? PRAIRIE : AMBER,
            fontVariantNumeric: "tabular-nums",
            fontWeight: 600,
          }}
        >
          {row.priceChange}
        </div>
      ) : (
        <div />
      )}

      {/* WoW delta */}
      <div
        style={{
          textAlign: "right",
          fontSize: 11,
          fontWeight: 600,
          color: deltaColor,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {delta !== null
          ? `${delta > 0 ? "↑" : delta < 0 ? "↓" : "·"}${Math.abs(delta)}`
          : "—"}
      </div>
    </div>
  );
}
