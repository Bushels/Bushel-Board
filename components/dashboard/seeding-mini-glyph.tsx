// components/dashboard/seeding-mini-glyph.tsx
// Compact 38×28 seismograph glyph for small-multiples cards. Same visual
// language as the full 64×48 SeismographGlyph, just denser — drops the crop
// label (commodity is shown in the card header) and the directional arrow
// (color of condition stroke carries the YoY signal).

import type { SeismographRow } from "@/lib/queries/seeding-progress-utils";
import { conditionStrokeColor } from "@/lib/queries/seeding-progress-utils";

const W = 38;
const H = 28;
const PAD_X = 4;
const PAD_TOP = 10;
const PAD_BOTTOM = 4;
const PLOT_W = W - PAD_X * 2;
const PLOT_H = H - PAD_TOP - PAD_BOTTOM;

interface Props {
  rows: SeismographRow[]; // chronologically ordered for ONE state
  currentWeek: string;
}

function buildAreaPath(
  rows: SeismographRow[],
  getValue: (r: SeismographRow) => number | null,
): string {
  if (rows.length === 0) return "";
  const maxI = Math.max(rows.length - 1, 1);
  const points = rows.map((r, i) => {
    const pct = getValue(r) ?? 0;
    const x = PAD_X + (i / maxI) * PLOT_W;
    const y = PAD_TOP + PLOT_H - (pct / 100) * PLOT_H;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const baseline = PAD_TOP + PLOT_H;
  const bottomRight = `${(PAD_X + PLOT_W).toFixed(2)},${baseline}`;
  const bottomLeft = `${PAD_X.toFixed(2)},${baseline}`;
  return `M${points[0]} L${points.slice(1).join(" L")} L${bottomRight} L${bottomLeft} Z`;
}

export function SeedingMiniGlyph({ rows, currentWeek }: Props) {
  if (rows.length === 0) return null;

  const stateCode = rows[0].state_code;

  const currentIdx = rows.findIndex((r) => r.week_ending === currentWeek);
  const effectiveIdx = currentIdx >= 0 ? currentIdx : rows.length - 1;
  const currentRow = rows[effectiveIdx];

  const yoy = currentRow.ge_pct_yoy_change;
  const stroke = conditionStrokeColor(yoy);

  const maxI = Math.max(rows.length - 1, 1);
  const xScan = PAD_X + (effectiveIdx / maxI) * PLOT_W;

  const plantedPath = buildAreaPath(rows, (r) => r.planted_pct);
  const emergedPath = buildAreaPath(rows, (r) => r.emerged_pct);
  const harvestedPath = buildAreaPath(rows, (r) => r.harvested_pct);

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${stateCode} ${rows[0].state_name}`}
      style={{ filter: "drop-shadow(0 2px 4px rgba(26,24,19,.12))" }}
    >
      <rect
        x={1}
        y={1}
        width={W - 2}
        height={H - 2}
        rx={5}
        fill="#ece8dc"
        stroke="#e0d9c5"
        strokeWidth={1}
      />
      <text
        x={4}
        y={7}
        fontFamily="DM Sans, sans-serif"
        fontSize="6.5"
        fontWeight={700}
        fill="#1a1813"
      >
        {stateCode}
      </text>
      <path d={plantedPath} fill="#c17f24" opacity={0.9} />
      <path d={emergedPath} fill="#e8b96b" opacity={0.85} />
      <path d={harvestedPath} fill="#7ba84e" opacity={0.85} />
      <line
        x1={xScan}
        y1={PAD_TOP}
        x2={xScan}
        y2={PAD_TOP + PLOT_H}
        stroke="#c17f24"
        strokeWidth={1}
      />
      <path
        d={`M${PAD_X} ${H - 3} Q ${W / 2} ${H - 5} ${W - PAD_X} ${H - 3}`}
        fill="none"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </svg>
  );
}
