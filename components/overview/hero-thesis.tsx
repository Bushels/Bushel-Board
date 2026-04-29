// components/overview/hero-thesis.tsx
// Hero AI Thesis card — Direction A editorial layout with Direction B's
// big Fraunces stance score and trajectory chart.
// Server component (TrajectoryChart is the only interactive bit; it's imported
// as a client sub-component).

import type { GrainStanceData } from "@/components/dashboard/market-stance-chart";
import type { TrajectoryPoint } from "@/lib/queries/overview-data";
import { TrajectoryChart } from "@/components/overview/trajectory-chart";

const PRAIRIE = "#437a22";
const AMBER = "#b8702a";
const INK = "#2a261e";
const WHEAT_50 = "#f5f3ee";
const WHEAT_100 = "#ebe7dc";
const WHEAT_200 = "#d7cfba";
const WHEAT_700 = "#5d5132";
const INK_MUTED = "#7c6c43";
const CANOLA = "#c17f24";

interface HeroThesisProps {
  grain: GrainStanceData;
  trajectory: TrajectoryPoint[];
  grainWeek: number;
  updatedDate?: string;
}

function ConfidenceDot({ level }: { level: string }) {
  const color =
    level === "high" ? PRAIRIE : level === "medium" ? CANOLA : AMBER;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: color,
          display: "inline-block",
        }}
      />
      <span
        style={{
          fontSize: 11,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color,
          fontFamily: "var(--font-dm-sans)",
          fontWeight: 600,
        }}
      >
        {level} confidence
      </span>
    </span>
  );
}

function SignalBar({ score, prior }: { score: number; prior: number | null }) {
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
      ) : (
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
      )}
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
            opacity: 0.55,
          }}
          title={`Prior stance: ${prior}`}
        />
      )}
    </div>
  );
}

export function HeroThesis({
  grain,
  trajectory,
  grainWeek,
  updatedDate,
}: HeroThesisProps) {
  const isBull = grain.score > 0;
  const stanceColor = isBull ? PRAIRIE : grain.score < 0 ? AMBER : INK_MUTED;
  const delta =
    grain.priorScore !== null ? grain.score - grain.priorScore : null;
  const stanceWord = isBull ? "bullish" : grain.score < 0 ? "bearish" : "neutral";

  const dateLabel = updatedDate
    ? new Date(updatedDate).toLocaleDateString("en-CA", {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : `Week ${grainWeek}`;

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${WHEAT_200}`,
        padding: "40px 44px",
      }}
      className="w-full"
    >
      {/* Pre-title row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 8,
          flexWrap: "wrap",
          gap: 8,
          fontFamily: "var(--font-dm-sans)",
        }}
      >
        <span
          style={{
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: INK_MUTED,
            fontWeight: 600,
          }}
        >
          The week&apos;s strongest move · {dateLabel}
        </span>
        <ConfidenceDot level={grain.confidence} />
      </div>

      {/* Hero headline + score */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 32,
          alignItems: "end",
          marginBottom: 24,
        }}
        className="grid-cols-1 sm:grid-cols-[1fr_auto]"
      >
        <h1
          style={{
            fontFamily: "var(--font-fraunces)",
            fontWeight: 400,
            fontSize: "clamp(40px, 5.5vw, 84px)",
            letterSpacing: "-0.025em",
            lineHeight: 0.95,
            color: INK,
            margin: 0,
          }}
        >
          {grain.grain} firms{" "}
          <em style={{ color: stanceColor, fontStyle: "italic" }}>
            {stanceWord}
          </em>
          .
        </h1>
        <div
          style={{
            textAlign: "right",
            fontFamily: "var(--font-dm-sans)",
            minWidth: 80,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: INK_MUTED,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            Stance
          </div>
          <div
            style={{
              fontFamily: "var(--font-fraunces)",
              fontSize: "clamp(40px, 4vw, 56px)",
              color: stanceColor,
              fontWeight: 500,
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {grain.score > 0 ? "+" : ""}
            {grain.score}
          </div>
          {delta !== null && (
            <div
              style={{
                fontSize: 11,
                color: delta >= 0 ? PRAIRIE : AMBER,
                fontWeight: 600,
                marginTop: 4,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)} this week
            </div>
          )}
        </div>
      </div>

      {/* Stance bar */}
      <div style={{ marginBottom: 24 }}>
        <SignalBar score={grain.score} prior={grain.priorScore} />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 4,
            fontFamily: "var(--font-dm-sans)",
            fontSize: 10,
            color: INK_MUTED,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          <span style={{ color: AMBER }}>Bearish ←</span>
          <span>0</span>
          <span style={{ color: PRAIRIE }}>→ Bullish</span>
        </div>
      </div>

      {/* Thesis summary */}
      {grain.thesisSummary && (
        <p
          style={{
            fontFamily: "var(--font-fraunces)",
            fontWeight: 300,
            fontSize: "clamp(16px, 1.6vw, 22px)",
            lineHeight: 1.5,
            color: WHEAT_700,
            maxWidth: 760,
            margin: "0 0 36px",
          }}
        >
          {grain.thesisSummary}
        </p>
      )}

      {/* Bull / Bear columns */}
      {(grain.bullPoints.length > 0 || grain.bearPoints.length > 0) && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 40,
            paddingTop: 28,
            borderTop: `1px solid ${WHEAT_200}`,
          }}
          className="grid-cols-1 sm:grid-cols-2"
        >
          {/* Bull */}
          {grain.bullPoints.length > 0 && (
            <div>
              <div
                style={{
                  marginBottom: 16,
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: 11,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: PRAIRIE,
                  fontWeight: 700,
                }}
              >
                Bull case · {grain.bullPoints.length}
              </div>
              {grain.bullPoints.map((p, i) => (
                <div
                  key={i}
                  style={{
                    paddingTop: i === 0 ? 0 : 14,
                    paddingBottom: 14,
                    borderTop: i === 0 ? "none" : `1px solid ${WHEAT_100}`,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: 14,
                      fontWeight: 500,
                      color: INK,
                      marginBottom: 4,
                      lineHeight: 1.4,
                    }}
                  >
                    {p.fact}
                  </div>
                  {p.reasoning && (
                    <div
                      style={{
                        fontFamily: "var(--font-dm-sans)",
                        fontSize: 12.5,
                        color: INK_MUTED,
                        lineHeight: 1.5,
                      }}
                    >
                      {p.reasoning}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Bear */}
          {grain.bearPoints.length > 0 && (
            <div>
              <div
                style={{
                  marginBottom: 16,
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: 11,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: AMBER,
                  fontWeight: 700,
                }}
              >
                Bear case · {grain.bearPoints.length}
              </div>
              {grain.bearPoints.map((p, i) => (
                <div
                  key={i}
                  style={{
                    paddingTop: i === 0 ? 0 : 14,
                    paddingBottom: 14,
                    borderTop: i === 0 ? "none" : `1px solid ${WHEAT_100}`,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: 14,
                      fontWeight: 500,
                      color: INK,
                      marginBottom: 4,
                      lineHeight: 1.4,
                    }}
                  >
                    {p.fact}
                  </div>
                  {p.reasoning && (
                    <div
                      style={{
                        fontFamily: "var(--font-dm-sans)",
                        fontSize: 12.5,
                        color: INK_MUTED,
                        lineHeight: 1.5,
                      }}
                    >
                      {p.reasoning}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Trajectory section */}
      {trajectory.length > 1 && (
        <div
          style={{
            marginTop: 32,
            paddingTop: 20,
            borderTop: `1px solid ${WHEAT_200}`,
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 16,
          }}
          className="sm:grid-cols-[1fr_320px] sm:items-center"
        >
          <div style={{ fontFamily: "var(--font-dm-sans)" }}>
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
              This week&apos;s trajectory
            </div>
            <div style={{ fontSize: 13, color: WHEAT_700 }}>
              Stance resets every Friday. Drifts Mon–Thu as data arrives.
            </div>
            <div
              style={{
                display: "flex",
                gap: 16,
                marginTop: 10,
                fontSize: 11,
                color: INK_MUTED,
                fontFamily: "var(--font-dm-sans)",
              }}
            >
              <span>
                <span
                  style={{
                    display: "inline-block",
                    width: 20,
                    height: 2,
                    background: PRAIRIE,
                    marginRight: 4,
                    verticalAlign: "middle",
                  }}
                />
                Canada
              </span>
            </div>
          </div>
          <div style={{ minWidth: 0 }}>
            <TrajectoryChart caPoints={trajectory} w={320} h={80} />
          </div>
        </div>
      )}
    </div>
  );
}
