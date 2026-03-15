"use client";

import type { GrainPrice } from "@/lib/queries/grain-prices";

interface PriceSparklineProps {
  prices: GrainPrice[];
}

const WIDTH = 80;
const HEIGHT = 24;
const PAD = 2;

function formatPrice(price: number, currency: string): string {
  if (currency === "CAD") {
    return `$${price.toFixed(1)}/t`;
  }
  // USD cents/bushel
  return `${price.toFixed(1)}\u00A2/bu`;
}

function formatChange(amount: number, pct: number): string {
  const sign = amount >= 0 ? "+" : "";
  return `${sign}${amount.toFixed(1)} (${sign}${pct.toFixed(1)}%)`;
}

export function PriceSparkline({ prices }: PriceSparklineProps) {
  if (prices.length === 0) return null;

  const latest = prices[0];
  const isPositive = latest.change_amount >= 0;
  const lineColor = isPositive ? "#437a22" : "#d91c1c";

  // Reverse so oldest is first for the chart
  const chartData = [...prices].reverse();
  const values = chartData.map((p) => p.settlement_price);

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1; // avoid division by zero

  const innerW = WIDTH - PAD * 2;
  const innerH = HEIGHT - PAD * 2;

  const points = values
    .map((v, i) => {
      const x = PAD + (i / Math.max(values.length - 1, 1)) * innerW;
      const y = PAD + innerH - ((v - min) / range) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <span className="inline-flex items-center gap-1.5">
      <svg
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="shrink-0"
        aria-hidden="true"
      >
        <polyline
          points={points}
          fill="none"
          stroke={lineColor}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-xs font-medium text-foreground whitespace-nowrap">
        {formatPrice(latest.settlement_price, latest.currency)}
      </span>
      <span
        className="text-xs whitespace-nowrap"
        style={{ color: lineColor }}
      >
        {formatChange(latest.change_amount, latest.change_pct)}
      </span>
    </span>
  );
}
