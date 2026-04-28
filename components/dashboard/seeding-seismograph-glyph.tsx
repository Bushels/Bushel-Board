// components/dashboard/seeding-seismograph-glyph.tsx
// Pure SVG microchart: one US state's weekly crop progress as a 64×48 Mapbox glyph.

import type { SeismographRow } from "@/lib/queries/seeding-progress-utils";
import { conditionStrokeColor } from "@/lib/queries/seeding-progress-utils";

// ── Layout constants ─────────────────────────────────────────────────────────
const W = 64;
const H = 48;
const PAD_X = 6;
const PAD_TOP = 14;
const PAD_BOTTOM = 6;
const PLOT_W = W - PAD_X * 2; // 52
const PLOT_H = H - PAD_TOP - PAD_BOTTOM; // 28

// ── Props ────────────────────────────────────────────────────────────────────
interface Props {
  rows: SeismographRow[]; // chronologically ordered for ONE state
  commodity: string;
  currentWeek: string; // ISO date string
}

// ── Helper: build a closed stacked area path ─────────────────────────────────
function buildAreaPath(
  rows: SeismographRow[],
  getValue: (r: SeismographRow) => number | null
): string {
  if (rows.length === 0) return "";

  const maxI = Math.max(rows.length - 1, 1);

  // top edge: left → right following pct values
  const points = rows.map((r, i) => {
    const pct = getValue(r) ?? 0;
    const x = PAD_X + (i / maxI) * PLOT_W;
    const y = PAD_TOP + PLOT_H - (pct / 100) * PLOT_H;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  // bottom edge: right → left along PAD_TOP + PLOT_H baseline (y=42)
  const baseline = PAD_TOP + PLOT_H;
  const bottomRight = `${(PAD_X + PLOT_W).toFixed(2)},${baseline}`;
  const bottomLeft = `${PAD_X.toFixed(2)},${baseline}`;

  return `M${points[0]} L${points.slice(1).join(" L")} L${bottomRight} L${bottomLeft} Z`;
}

// ── Component ────────────────────────────────────────────────────────────────
export function SeismographGlyph({ rows, commodity, currentWeek }: Props) {
  if (rows.length === 0) return null;

  const stateCode = rows[0].state_code;

  // Current-week lookup (fall back to last row)
  const currentIdx = rows.findIndex((r) => r.week_ending === currentWeek);
  const effectiveIdx = currentIdx >= 0 ? currentIdx : rows.length - 1;
  const currentRow = rows[effectiveIdx];

  // YoY for arrow glyph
  const yoy = currentRow.ge_pct_yoy_change ?? 0;
  const showArrowUp = yoy >= 3;
  const showArrowDown = yoy <= -3;
  const arrowColor =
    yoy <= -15 ? "#b8350f" : "#d97706"; // crimson or amber

  // Scan-line x position
  const maxI = Math.max(rows.length - 1, 1);
  const xScan = PAD_X + (effectiveIdx / maxI) * PLOT_W;

  // Condition stroke
  const strokeColor = conditionStrokeColor(currentRow.ge_pct_yoy_change);
  const conditionIndex = currentRow.condition_index ?? 2;
  const strokeW = Math.min(Math.max(conditionIndex, 1), 4);

  // Area paths
  const plantedPath = buildAreaPath(rows, (r) => r.planted_pct);
  const emergedPath = buildAreaPath(rows, (r) => r.emerged_pct);
  const harvestedPath = buildAreaPath(rows, (r) => r.harvested_pct);

  // Quadratic bezier bottom condition stroke
  const condPath = `M${PAD_X} ${H - 4} Q ${W / 2} ${H - 6 + strokeW} ${W - PAD_X} ${H - 4}`;

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-label={`${stateCode} ${commodity} weekly progress`}
      style={{ filter: "drop-shadow(0 3px 6px rgba(26,24,19,.14))" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Card background */}
      <rect
        x={1}
        y={1}
        width={W - 2}
        height={H - 2}
        rx={9}
        fill="#ece8dc"
        stroke="#e0d9c5"
        strokeWidth={1}
      />

      {/* State code label — top-left */}
      <text
        x={6}
        y={10}
        fontFamily="DM Sans, sans-serif"
        fontSize="7.5"
        fontWeight={700}
        fill="#1a1813"
      >
        {stateCode}
      </text>

      {/* Crop label — top-center */}
      <text
        x={22}
        y={10}
        fontFamily="DM Sans, sans-serif"
        fontSize="7.5"
        fontWeight={600}
        fill="#6b6353"
      >
        {commodity}
      </text>

      {/* Condition arrow — top-right */}
      {showArrowUp && (
        <path
          className="arrow-up"
          d="M54 5 59 13 49 13Z"
          fill="#437a22"
        />
      )}
      {showArrowDown && (
        <path
          className="arrow-down"
          d="M54 13 59 5 49 5Z"
          fill={arrowColor}
        />
      )}

      {/* Stacked area waveform */}
      <path d={plantedPath} fill="#c17f24" opacity={0.85} />
      <path d={emergedPath} fill="#e8b96b" opacity={0.85} />
      <path d={harvestedPath} fill="#7ba84e" opacity={0.85} />

      {/* Vertical scan-line at current week */}
      <line
        x1={xScan}
        y1={PAD_TOP}
        x2={xScan}
        y2={PAD_TOP + PLOT_H}
        stroke="#c17f24"
        strokeWidth={1.5}
      />

      {/* Condition stroke — bottom quadratic bezier */}
      <path
        d={condPath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeW}
        strokeLinecap="round"
      />
    </svg>
  );
}
