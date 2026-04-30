// app/(dashboard)/markets/page.tsx
// Predictive Market tab.
//
// Reads from Kalshi through MarketplaceStrip and spot prices through
// fetchSpotPrices. This page does not write back to market_analysis,
// score_trajectory, or any internal-pipeline shape.

import { MarketplaceStrip } from "@/components/overview/marketplace-strip";
import { fetchSpotPrices } from "@/lib/queries/overview-data";

export const dynamic = "force-dynamic";

const INK = "#2a261e";
const WHEAT_50 = "#f5f3ee";
const INK_MUTED = "#7c6c43";
const PRAIRIE = "#437a22";

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

        <MarketplaceStrip spotPrices={spotPrices} />
      </div>
    </div>
  );
}
