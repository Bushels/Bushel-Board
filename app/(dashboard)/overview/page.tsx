// app/(dashboard)/overview/page.tsx
// Hybrid editorial+terminal redesign for /overview.
// Visual direction: Direction A wheat/canola palette + Fraunces typography +
// generous whitespace, combined with Direction B's chart density + trajectory
// graphs + tabular-nums stance scores.
// Data: all real from Supabase — no mocks except the Kalshi cards.

import { SectionHeader } from "@/components/dashboard/section-header";
import { SectionBoundary } from "@/components/dashboard/section-boundary";
import { SectionStateCard } from "@/components/dashboard/section-state-card";
import { SpotPriceRail } from "@/components/overview/spot-price-rail";
import { HeroThesis } from "@/components/overview/hero-thesis";
import { GrainStanceGrid } from "@/components/overview/grain-stance-grid";
import { SeedingStrip } from "@/components/overview/seeding-strip";
import { MarketplaceStrip } from "@/components/overview/marketplace-strip";
import { fetchOverviewData } from "@/lib/queries/overview-data";

export const dynamic = "force-dynamic";

const SECTION_DIVIDER = (
  <div
    style={{
      height: 1,
      background:
        "linear-gradient(90deg, transparent 0%, #d7cfba 20%, #d7cfba 80%, transparent 100%)",
      margin: "0",
    }}
  />
);

export default async function OverviewPage() {
  const data = await fetchOverviewData();
  const {
    grainWeek,
    caStances,
    usStances,
    spotPrices,
    heroGrain,
    heroTrajectory,
  } = data;

  const hasAny = caStances.length > 0 || usStances.length > 0;

  return (
    <div
      style={{
        background: "#f5f3ee",
        minHeight: "100vh",
      }}
    >
      {/* Spot price rail — thin ticker just below nav */}
      {spotPrices.length > 0 && <SpotPriceRail prices={spotPrices} />}

      <div
        className="mx-auto max-w-7xl px-4"
        style={{ paddingTop: 40, paddingBottom: 80 }}
      >
        {/* ── Section 1: Hero AI Thesis ─────────────────────────────────── */}
        <section style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 24, fontFamily: "var(--font-dm-sans)" }}>
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "#7c6c43",
                fontWeight: 600,
              }}
            >
              This week&apos;s stance
            </div>
            <h2
              style={{
                fontFamily: "var(--font-fraunces)",
                fontSize: "clamp(22px, 2vw, 28px)",
                fontWeight: 400,
                color: "#2a261e",
                margin: "4px 0 0",
                letterSpacing: "-0.01em",
              }}
            >
              Where each market is heading this week, in plain terms.
            </h2>
          </div>

          <SectionBoundary
            title="Market thesis unavailable"
            message="The hero thesis is temporarily unavailable. New analysis releases Friday evenings."
          >
          {heroGrain ? (
            <HeroThesis
              grain={heroGrain}
              trajectory={heroTrajectory}
              grainWeek={grainWeek}
            />
          ) : (
            <div
              style={{
                background: "#fff",
                border: "1px solid #d7cfba",
                padding: "40px 44px",
              }}
            >
              <SectionStateCard
                title="No market thesis available yet"
                message="Analysis releases every Friday evening. Check back after the desk chief runs."
              />
            </div>
          )}
          </SectionBoundary>
        </section>

        {SECTION_DIVIDER}

        {/* ── Section 2: Full Grain Stance Grid ─────────────────────────── */}
        <section style={{ marginTop: 64, marginBottom: 64 }}>
          <SectionHeader
            title="All markets"
            subtitle="Every grain, every market — Canada and US side by side."
          />
          <SectionBoundary
            title="Stance grid unavailable"
            message="The Canadian and US stance grid is temporarily unavailable. Try refreshing in a minute."
          >
          <div style={{ marginTop: 32 }}>
            {hasAny ? (
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #d7cfba",
                  padding: "32px 36px",
                }}
              >
                <GrainStanceGrid
                  caRows={caStances}
                  usRows={usStances}
                  grainWeek={grainWeek}
                />
              </div>
            ) : (
              <SectionStateCard
                title="Market data temporarily unavailable"
                message="Canadian and US stance data are unavailable right now. Check back shortly."
              />
            )}
          </div>
          </SectionBoundary>
        </section>

        {SECTION_DIVIDER}

        {/* ── Section 3: Seeding Progress ───────────────────────────────── */}
        <section style={{ marginTop: 64, marginBottom: 64 }}>
          <SectionBoundary
            title="Seeding progress unavailable"
            message="The seeding progress strip is temporarily unavailable. Visit /seeding for the full map."
          >
            <SeedingStrip />
          </SectionBoundary>
        </section>

        {SECTION_DIVIDER}

        {/* ── Section 4: Marketplace ────────────────────────────────────── */}
        <section style={{ marginTop: 64, marginBottom: 64 }}>
          <SectionBoundary
            title="Marketplace unavailable"
            message="Spot prices and marketplace listings are temporarily unavailable. Try refreshing in a minute."
          >
            <MarketplaceStrip spotPrices={spotPrices} />
          </SectionBoundary>
        </section>

        {/* Footer note */}
        <div
          style={{
            marginTop: 48,
            paddingTop: 24,
            borderTop: "1px solid #d7cfba",
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
            fontFamily: "var(--font-dm-sans)",
            fontSize: 11,
            color: "#af9f76",
            letterSpacing: "0.04em",
          }}
        >
          <span>
            Bushel Board · Predictive Marketplace for prairie &amp; corn-belt
            grain
          </span>
          <span>
            Stance resets every Friday · {caStances.length + usStances.length}{" "}
            markets tracked · Week {grainWeek}
          </span>
        </div>
      </div>
    </div>
  );
}
