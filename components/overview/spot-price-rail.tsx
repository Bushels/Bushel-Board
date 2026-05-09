// components/overview/spot-price-rail.tsx
// Thin ticker rail at the top of /overview: CBOT futures prices + WoW change.
// Server component — data passed as props from the orchestrator.

import type { SpotPrice } from "@/lib/queries/overview-data";

interface SpotPriceRailProps {
  prices: SpotPrice[];
}

function formatPrice(price: SpotPrice): string {
  // All CBOT grain prices in our DB are stored in USD/bu (cents converted to dollars)
  return `$${price.settlementPrice.toFixed(2)}`;
}

function formatChangePct(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function formatChangeAmt(amt: number): string {
  const sign = amt >= 0 ? "+" : "";
  return `${sign}${amt.toFixed(4).replace(/\.?0+$/, "")}`;
}

export function SpotPriceRail({ prices }: SpotPriceRailProps) {
  if (!prices.length) return null;

  return (
    <div
      className="w-full overflow-hidden"
      style={{
        background: "#fff",
        borderBottom: "1px solid #d7cfba",
      }}
      role="region"
      aria-label="CBOT futures spot prices"
    >
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex flex-wrap items-center gap-0 sm:gap-0">
          <div
            className="py-2 pr-4 shrink-0"
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#7c6c43",
              fontFamily: "var(--font-dm-sans)",
              fontWeight: 600,
              borderRight: "1px solid #ebe7dc",
            }}
          >
            CBOT Futures
          </div>
          <div className="flex flex-wrap items-center gap-x-0 sm:gap-x-0 overflow-x-auto">
            {prices.map((p, i) => {
              const isUp = p.changeAmount >= 0;
              const changeColor = isUp ? "#437a22" : "#b8702a";
              const isLast = i === prices.length - 1;
              return (
                <div
                  key={p.grain}
                  className="flex items-baseline gap-2 py-2 px-4 shrink-0"
                  style={{
                    borderRight: isLast ? "none" : "1px solid #ebe7dc",
                    fontFamily: "var(--font-dm-sans)",
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "#7c6c43",
                      fontWeight: 600,
                    }}
                  >
                    {p.grain}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-fraunces)",
                      fontSize: 17,
                      fontWeight: 500,
                      color: "#2a261e",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatPrice(p)}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: "#7c6c43",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {p.unit}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: changeColor,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {isUp ? "↑" : "↓"} {formatChangePct(p.changePct)}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: changeColor,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    ({formatChangeAmt(p.changeAmount)})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
