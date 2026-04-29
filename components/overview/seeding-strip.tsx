// components/overview/seeding-strip.tsx
// Mini US choropleth + Canada prairie placeholder.
// Uses simplified rectangle paths from the design handoff (us-paths.jsx).
// Real US per-state planted_pct pulled from usda_crop_progress table.
// Canada shows "Provincial seeding data starts mid-May" placeholder with
// whatever early-season data is available.
// Links to /seeding for the full map.

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_US_MARKET_YEAR } from "@/lib/queries/us-intelligence";

// ─── Simplified US state SVG paths (Albers-ish, 960×540 viewBox) ────────────
// Derived directly from the design handoff us-paths.jsx. Corn-belt focus states
// get seeding data fills; others render as context fills.

const US_STATES: Record<string, string> = {
  // Corn belt focus
  IA: "M540,260 L600,258 L600,300 L540,302 Z",
  IL: "M598,260 L640,260 L644,322 L612,322 L600,300 Z",
  NE: "M460,258 L538,260 L538,302 L460,302 Z",
  MN: "M500,180 L560,178 L562,240 L538,240 L538,260 L500,258 Z",
  IN: "M642,260 L678,260 L680,318 L644,322 Z",
  OH: "M680,254 L728,250 L730,308 L682,310 Z",
  MO: "M538,302 L612,302 L612,322 L600,360 L540,360 Z",
  SD: "M460,210 L538,210 L538,260 L460,258 Z",
  ND: "M460,160 L560,158 L560,210 L460,210 Z",
  KS: "M438,302 L540,302 L540,360 L438,360 Z",
  WI: "M560,178 L618,180 L620,240 L562,240 Z",
  MI: "M620,180 L700,178 L700,250 L680,254 L642,260 L620,240 Z",
  // Context states
  WA: "M158,148 L240,148 L240,202 L158,202 Z",
  OR: "M158,202 L240,202 L240,260 L160,260 Z",
  CA: "M158,260 L260,260 L262,400 L200,400 L180,360 Z",
  ID: "M240,148 L300,148 L304,260 L240,260 Z",
  MT: "M240,148 L460,148 L460,210 L304,210 L304,180 Z",
  WY: "M304,210 L460,210 L460,260 L304,260 Z",
  NV: "M260,260 L340,260 L340,360 L260,360 Z",
  UT: "M304,260 L380,260 L380,340 L340,340 L340,360 L304,360 Z",
  CO: "M380,260 L460,260 L460,340 L380,340 Z",
  AZ: "M340,360 L420,360 L420,440 L340,440 Z",
  NM: "M380,340 L460,340 L460,440 L420,440 L420,400 L380,400 Z",
  TX: "M438,360 L540,360 L540,420 L520,440 L500,470 L460,470 L420,440 L420,400 L438,400 Z",
  OK: "M438,360 L540,360 L540,400 L438,400 Z",
  AR: "M538,360 L600,360 L600,410 L540,410 Z",
  LA: "M540,410 L612,410 L612,460 L540,460 Z",
  MS: "M600,360 L640,360 L640,440 L600,440 Z",
  AL: "M640,360 L680,360 L680,440 L640,440 Z",
  GA: "M680,360 L730,360 L730,440 L680,440 Z",
  FL: "M680,440 L780,440 L780,490 L700,490 L680,470 Z",
  SC: "M730,330 L780,328 L782,378 L730,380 Z",
  NC: "M730,300 L820,298 L822,330 L730,330 Z",
  TN: "M598,322 L730,320 L730,360 L600,360 Z",
  KY: "M598,310 L730,308 L730,322 L600,322 Z",
  VA: "M730,290 L820,288 L822,322 L730,322 Z",
  WV: "M712,278 L760,278 L762,310 L712,310 Z",
  PA: "M712,250 L800,248 L802,278 L712,278 Z",
  NY: "M740,200 L820,198 L820,248 L740,248 Z",
  ME: "M820,170 L860,170 L860,220 L820,220 Z",
};

const US_LABELS: Record<string, [number, number]> = {
  IA: [570, 282],
  IL: [620, 290],
  NE: [500, 282],
  MN: [530, 218],
  IN: [660, 290],
  OH: [704, 282],
  MO: [575, 332],
  SD: [500, 234],
  ND: [510, 184],
  KS: [490, 332],
  WI: [590, 210],
  MI: [660, 215],
};

const FOCUS_STATES = new Set(Object.keys(US_LABELS));

// Prairie colors 5-step ramp
function fillForPct(pct: number | null): string {
  if (pct == null) return "#ebe7dc";
  if (pct >= 60) return "#2c5d18";
  if (pct >= 45) return "#437a22";
  if (pct >= 30) return "#7ba34a";
  if (pct >= 15) return "#c2d68a";
  return "#ebe7dc";
}

interface StateSeedingData {
  stateCode: string;
  plantedPct: number | null;
  weekEnding: string | null;
}

async function fetchUsCornseedingLatest(): Promise<StateSeedingData[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("usda_crop_progress")
      .select("state, planted_pct, week_ending")
      .eq("commodity", "CORN")
      .eq("crop_year", CURRENT_US_MARKET_YEAR)
      .neq("state", "US TOTAL")
      .not("planted_pct", "is", null)
      .order("week_ending", { ascending: false });

    if (error || !data) return [];

    // Dedupe to latest per state
    const seen = new Set<string>();
    const out: StateSeedingData[] = [];
    for (const row of data) {
      const code = row.state.trim().toUpperCase();
      if (seen.has(code)) continue;
      seen.add(code);
      out.push({
        stateCode: code,
        plantedPct: row.planted_pct !== null ? Number(row.planted_pct) : null,
        weekEnding: row.week_ending ? String(row.week_ending) : null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function ChoroplethLegend() {
  const steps: [string, string][] = [
    ["0–15%", "#ebe7dc"],
    ["15–30%", "#c2d68a"],
    ["30–45%", "#7ba34a"],
    ["45–60%", "#437a22"],
    ["60%+", "#2c5d18"],
  ];
  return (
    <div
      style={{
        display: "flex",
        gap: 0,
        marginTop: 10,
        fontFamily: "var(--font-dm-sans)",
        fontSize: 10,
        color: "#7c6c43",
      }}
    >
      {steps.map(([label, col]) => (
        <div
          key={label}
          style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}
        >
          <div style={{ height: 5, background: col }} />
          <div style={{ letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

export async function SeedingStrip() {
  const stateData = await fetchUsCornseedingLatest();
  const byCode = Object.fromEntries(stateData.map((s) => [s.stateCode, s]));

  // Find latest week_ending for label
  const latestWeek =
    stateData.find((s) => s.weekEnding)?.weekEnding ?? null;
  const weekLabel = latestWeek
    ? new Date(latestWeek).toLocaleDateString("en-CA", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Latest available";

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
            color: "#2a261e",
            margin: 0,
            letterSpacing: "-0.015em",
          }}
        >
          Seeding progress
        </h2>
        <span
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#7c6c43",
            fontWeight: 600,
          }}
        >
          USDA NASS · Week ending {weekLabel}
        </span>
      </div>
      <p
        style={{
          fontFamily: "var(--font-fraunces)",
          fontWeight: 300,
          fontSize: "clamp(14px, 1.4vw, 18px)",
          color: "#5d5132",
          margin: "0 0 24px",
          maxWidth: 720,
        }}
      >
        US corn-belt planting pace, state by state. Prairie provinces will follow
        mid-May.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 24,
        }}
        className="sm:grid-cols-[1fr_280px]"
      >
        {/* US choropleth */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #d7cfba",
            padding: "20px 24px",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#7c6c43",
              fontWeight: 600,
              marginBottom: 12,
            }}
          >
            🇺🇸 Corn — % planted
          </div>
          <svg
            viewBox="0 0 880 500"
            style={{ width: "100%", display: "block" }}
            role="img"
            aria-label="US corn seeding progress by state"
          >
            {Object.entries(US_STATES).map(([code, d]) => {
              const isFocus = FOCUS_STATES.has(code);
              const stateInfo = byCode[code];
              const fill = isFocus ? fillForPct(stateInfo?.plantedPct ?? null) : "#f5f3ee";
              const stroke = isFocus ? "#fff" : "#e9e3d4";
              return (
                <path
                  key={code}
                  d={d}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isFocus ? 1.5 : 0.8}
                />
              );
            })}
            {Object.entries(US_LABELS).map(([code, [x, y]]) => {
              const s = byCode[code];
              if (!s) return null;
              const dark = (s.plantedPct ?? 0) >= 45;
              return (
                <g key={code}>
                  <text
                    x={x}
                    y={y - 2}
                    fontSize={10}
                    fontWeight="700"
                    textAnchor="middle"
                    fill={dark ? "#fff" : "#2a261e"}
                    fontFamily="var(--font-dm-sans)"
                  >
                    {code}
                  </text>
                  {s.plantedPct !== null && (
                    <text
                      x={x}
                      y={y + 9}
                      fontSize={9}
                      textAnchor="middle"
                      fill={dark ? "#fff" : "#7c6c43"}
                      fontFamily="var(--font-dm-sans)"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {Math.round(s.plantedPct)}%
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          <ChoroplethLegend />
        </div>

        {/* Canada placeholder */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #d7cfba",
            padding: "20px 24px",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#7c6c43",
              fontWeight: 600,
              marginBottom: 12,
            }}
          >
            🇨🇦 Prairies — % seeded
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              minHeight: 180,
              gap: 12,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-fraunces)",
                fontSize: 15,
                color: "#5d5132",
                lineHeight: 1.5,
                fontWeight: 300,
              }}
            >
              Prairie provinces begin reporting seeding progress from mid-May
              through StatsCan and provincial surveys.
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#7c6c43",
                fontFamily: "var(--font-dm-sans)",
                lineHeight: 1.5,
              }}
            >
              AB · SK · MB coverage will appear here once the planting window
              opens.
            </div>
            <div style={{ marginTop: 8 }}>
              <Link
                href="/seeding"
                style={{
                  display: "inline-block",
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#c17f24",
                  textDecoration: "none",
                  letterSpacing: "0.04em",
                }}
              >
                View full seeding map →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
