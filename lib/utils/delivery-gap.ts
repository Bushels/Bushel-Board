import type { CumulativeWeekRow } from "@/lib/queries/observations";

export interface DeliveryGapPoint {
  week: number;
  current: number;
  prior: number | null;
  gap: number; // positive = behind pace (bullish), negative = ahead (bearish)
}

/**
 * Compute the YoY delivery gap between current and prior crop year.
 * Gap = prior - current. Positive means farmers are behind last year's pace.
 */
export function computeDeliveryGap(
  currentYear: CumulativeWeekRow[],
  priorYear: CumulativeWeekRow[]
): DeliveryGapPoint[] {
  if (currentYear.length === 0) return [];

  const priorByWeek = new Map<number, number>();
  for (const row of priorYear) {
    priorByWeek.set(row.grain_week, row.producer_deliveries_kt);
  }

  return currentYear.map((row) => {
    const priorVal = priorByWeek.get(row.grain_week) ?? null;
    return {
      week: row.grain_week,
      current: row.producer_deliveries_kt,
      prior: priorVal,
      gap: priorVal !== null ? priorVal - row.producer_deliveries_kt : 0,
    };
  });
}
