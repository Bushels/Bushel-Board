// app/(dashboard)/markets/page.tsx
// Predictive Market tab — Phase 1 scaffold (Track 52, design doc 2026-04-29).
//
// Renders:
//   1. A placeholder brief region at the top. In Phase 3 this gets
//      replaced with `<EditorialBrief>` once the swarm has written
//      a real brief into `predictive_market_briefs`.
//   2. The existing 7-market Predictive Market dashboard, re-mounted
//      from `<MarketplaceStrip>` unchanged.
//
// Public route — no auth required. Mirrors /overview, /grain/[slug], /us.
//
// ── ISOLATION FENCE ─────────────────────────────────────────────────────
// This page reads from `predictive_market_briefs` (via getLatestPredictiveMarketBrief)
// and from Kalshi (via the existing MarketplaceStrip + fetchSpotPrices).
// It does NOT write back to market_analysis, score_trajectory, or any
// internal-pipeline shape. The brief is editorial commentary on the
// divergence between the Kalshi crowd and our internal grain-desk
// stance — keep that one-way data flow strict.
// ────────────────────────────────────────────────────────────────────────

import { MarketplaceStrip } from "@/components/overview/marketplace-strip";
import { fetchSpotPrices } from "@/lib/queries/overview-data";
import { getLatestPredictiveMarketBrief } from "@/lib/queries/predictive-market";

export const dynamic = "force-dynamic";

const INK = "#2a261e";
const WHEAT_50 = "#f5f3ee";
const WHEAT_100 = "#ebe7dc";
const WHEAT_200 = "#d7cfba";
const WHEAT_700 = "#5d5132";
const INK_MUTED = "#7c6c43";
const PRAIRIE = "#437a22";

function formatBriefDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Edmonton",
  });
}

/**
 * Phase-1 placeholder brief region. Renders one of two states:
 *   1. "Brief generates Friday at 8 PM ET" empty state (no brief yet).
 *   2. A minimal headline + lede preview when a brief exists.
 *
 * Phase 3 will swap this for a richer `<EditorialBrief>` component that
 * surfaces the per-market takes inline with the dashboard below.
 */
async function BriefPlaceholder() {
  const brief = await getLatestPredictiveMarketBrief();

  if (!brief) {
    return (
      <div
        style={{
          background: "#fff",
          border: `1px solid ${WHEAT_200}`,
          padding: "32px 36px",
          marginBottom: 40,
          fontFamily: "var(--font-dm-sans)",
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: INK_MUTED,
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          This week&apos;s brief
        </div>
        <h2
          style={{
            fontFamily: "var(--font-fraunces)",
            fontSize: "clamp(22px, 2vw, 28px)",
            fontWeight: 400,
            color: INK,
            margin: "0 0 12px",
            letterSpacing: "-0.01em",
          }}
        >
          The first brief lands Friday at 8 PM ET.
        </h2>
        <p
          style={{
            fontFamily: "var(--font-fraunces)",
            fontSize: 15,
            fontWeight: 300,
            color: WHEAT_700,
            lineHeight: 1.55,
            maxWidth: 640,
            margin: 0,
          }}
        >
          Each Friday after the close, our desk reads the Kalshi tape
          alongside this week&apos;s grain-desk stance and writes a
          short note on where the crowd is paying for outcomes we
          don&apos;t see — and where they&apos;re backing the same call.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${WHEAT_200}`,
        padding: "32px 36px",
        marginBottom: 40,
        fontFamily: "var(--font-dm-sans)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: INK_MUTED,
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        This week&apos;s brief · {formatBriefDate(brief.week_ending)}
      </div>
      <h2
        style={{
          fontFamily: "var(--font-fraunces)",
          fontSize: "clamp(22px, 2vw, 28px)",
          fontWeight: 400,
          color: INK,
          margin: "0 0 12px",
          letterSpacing: "-0.01em",
        }}
      >
        {brief.headline}
      </h2>
      <p
        style={{
          fontFamily: "var(--font-fraunces)",
          fontSize: 15,
          fontWeight: 300,
          color: WHEAT_700,
          lineHeight: 1.55,
          maxWidth: 720,
          margin: 0,
        }}
      >
        {brief.lede}
      </p>
    </div>
  );
}

export default async function MarketsPage() {
  const spotPrices = await fetchSpotPrices();

  return (
    <div
      style={{
        background: WHEAT_50,
        minHeight: "100vh",
      }}
    >
      <div
        className="mx-auto max-w-7xl px-4"
        style={{ paddingTop: 40, paddingBottom: 80 }}
      >
        {/* Page lede */}
        <div style={{ marginBottom: 32, fontFamily: "var(--font-dm-sans)" }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: INK_MUTED,
              fontWeight: 600,
            }}
          >
            Predictive Market
          </div>
          <h1
            style={{
              fontFamily: "var(--font-fraunces)",
              fontSize: "clamp(28px, 3vw, 44px)",
              fontWeight: 400,
              color: INK,
              margin: "4px 0 0",
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
            }}
          >
            Where the crowd is paying for{" "}
            <em style={{ fontStyle: "italic", color: PRAIRIE }}>your</em>{" "}
            bushel.
          </h1>
        </div>

        {/* Phase-1 brief placeholder; Phase 3 swaps for full editorial. */}
        <BriefPlaceholder />

        {/* Existing 7-market dashboard, re-mounted unchanged. */}
        <MarketplaceStrip spotPrices={spotPrices} />
      </div>
    </div>
  );
}
