// components/overview/grain-stance-grid.tsx
// Full grain stance grid — CA grains + US markets grouped with section headers.

import type { GrainStanceData } from "@/components/dashboard/market-stance-chart";
import { GrainStanceRow } from "@/components/overview/grain-stance-row";

const INK = "#2a261e";
const WHEAT_200 = "#d7cfba";
const INK_MUTED = "#7c6c43";

interface GrainStanceGridProps {
  caRows: GrainStanceData[];
  usRows: GrainStanceData[];
  grainWeek: number;
}

function GridHeader({
  flag,
  label,
  meta,
}: {
  flag: string;
  label: string;
  meta: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 12,
        marginBottom: 16,
        paddingBottom: 10,
        borderBottom: `1px solid ${WHEAT_200}`,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-fraunces)",
          fontSize: 20,
          fontWeight: 500,
          color: INK,
        }}
      >
        {flag} {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-dm-sans)",
          fontSize: 11,
          color: INK_MUTED,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {meta}
      </span>
    </div>
  );
}

function ColumnHeader() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.4fr 60px 2fr 70px 48px",
        alignItems: "center",
        gap: 12,
        paddingBottom: 6,
        fontFamily: "var(--font-dm-sans)",
        fontSize: 9,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: INK_MUTED,
      }}
    >
      <span>Grain</span>
      <span style={{ textAlign: "right" }}>Stance</span>
      <span>Bear ← 0 → Bull</span>
      <span style={{ textAlign: "right" }}>Price</span>
      <span style={{ textAlign: "right" }}>WoW</span>
    </div>
  );
}

export function GrainStanceGrid({
  caRows,
  usRows,
  grainWeek,
}: GrainStanceGridProps) {
  const hasCA = caRows.length > 0;
  const hasUS = usRows.length > 0;

  if (!hasCA && !hasUS) return null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 56,
      }}
      className="sm:grid-cols-2"
    >
      {/* Canada */}
      {hasCA && (
        <div>
          <GridHeader
            flag="🇨🇦"
            label="Canadian grains"
            meta={`CGC · Wk ${grainWeek}`}
          />
          <ColumnHeader />
          <div>
            {caRows.map((row, i) => (
              <GrainStanceRow key={`ca-${row.grain}`} row={row} isFirst={i === 0} />
            ))}
          </div>
        </div>
      )}

      {/* United States */}
      {hasUS && (
        <div>
          <GridHeader
            flag="🇺🇸"
            label="US markets"
            meta="USDA"
          />
          <ColumnHeader />
          <div>
            {usRows.map((row, i) => (
              <GrainStanceRow key={`us-${row.grain}`} row={row} isFirst={i === 0} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
