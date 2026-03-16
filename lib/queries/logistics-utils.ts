// ---------------------------------------------------------------------------
// Types and pure utility functions for logistics — safe for client components.
// Server-side Supabase queries live in logistics.ts.
// ---------------------------------------------------------------------------

export interface WeeklyTerminalFlow {
  grain_week: number;
  week_ending_date: string | null;
  terminal_receipts_kt: number;
  exports_kt: number;
  net_flow_kt: number;
}

export interface LogisticsSnapshot {
  grain_monitor: {
    grain_week: number;
    report_date: string;
    vessels_vancouver: number;
    vessel_avg_one_year_vancouver: number;
    vessels_prince_rupert: number;
    out_of_car_time_pct: number;
    total_unloads_cars: number;
    var_to_four_week_avg_pct: number;
    ytd_shipments_total_kt: number;
    ytd_shipments_yoy_pct: number;
    country_stocks_kt: number;
    country_capacity_pct: number;
    terminal_stocks_kt: number;
    terminal_capacity_pct: number;
    country_deliveries_kt: number;
    country_deliveries_yoy_pct: number;
    weather_notes: string;
    provincial_stocks: { mb_kt: number; sk_kt: number; ab_kt: number };
    port_stocks: {
      vancouver_kt: number;
      prince_rupert_kt: number;
      thunder_bay_kt: number;
    };
  } | null;
  producer_cars: Array<{
    grain: string;
    grain_week: number;
    cy_cars_total: number;
    week_cars: number;
    by_province: { mb: number; sk: number; ab_bc: number };
  }>;
}

export interface HeadlineInput {
  vessels_vancouver: number;
  vessel_avg_one_year_vancouver: number;
  out_of_car_time_pct: number;
  ytd_shipments_yoy_pct: number;
  grain_week: number;
}

export interface LogisticsHeadline {
  headline: string;
  subtext: string;
}

export type PillSentiment = "positive" | "negative" | "neutral";

// ---------------------------------------------------------------------------
// Pure functions (no Supabase dependency)
// ---------------------------------------------------------------------------

/**
 * Generate a prioritized headline from logistics metrics.
 *
 * Priority order:
 *  1. Vessel congestion  — vessels > avg + 5
 *  2. Rail bottleneck    — OCT > 20%
 *  3. Export pace         — YoY shipments > 5%
 *  4. Fallback            — generic week label
 */
export function generateLogisticsHeadline(
  monitor: HeadlineInput
): LogisticsHeadline {
  const {
    vessels_vancouver,
    vessel_avg_one_year_vancouver,
    out_of_car_time_pct,
    ytd_shipments_yoy_pct,
    grain_week,
  } = monitor;

  // Priority 1: Vessel congestion
  if (vessels_vancouver > vessel_avg_one_year_vancouver + 5) {
    return {
      headline: `${vessels_vancouver} Ships Waiting. Grain Isn't Moving.`,
      subtext: `Vancouver vessel queue is ${vessels_vancouver - vessel_avg_one_year_vancouver} above the 1-year average of ${vessel_avg_one_year_vancouver}.`,
    };
  }

  // Priority 2: Rail bottleneck
  if (out_of_car_time_pct > 20) {
    return {
      headline: `Rail Bottleneck — ${out_of_car_time_pct}% Out-of-Car Time`,
      subtext:
        "Cars are spending more time waiting than moving. Expect delivery delays.",
    };
  }

  // Priority 3: Strong export pace
  if (ytd_shipments_yoy_pct > 5) {
    return {
      headline: `Export Pace Accelerating — Up ${ytd_shipments_yoy_pct}% YoY`,
      subtext:
        "Year-to-date shipments are running well ahead of last year's pace.",
    };
  }

  // Fallback
  return {
    headline: `Terminal Flow Update — Week ${grain_week}`,
    subtext: "No significant logistics signals this week.",
  };
}

/**
 * Sentiment pill for vessel queue relative to 1-year average.
 */
export function vesselSentiment(
  vessels: number,
  avg: number
): PillSentiment {
  if (vessels <= avg) return "positive";
  if (vessels <= avg + 5) return "neutral";
  return "negative";
}

/**
 * Sentiment pill for Out-of-Car Time percentage.
 */
export function octSentiment(pct: number): PillSentiment {
  if (pct < 10) return "positive";
  if (pct <= 20) return "neutral";
  return "negative";
}

/**
 * Sentiment pill for year-over-year shipment change.
 */
export function shipmentYoySentiment(pct: number): PillSentiment {
  if (pct > 3) return "positive";
  if (pct >= -3) return "neutral";
  return "negative";
}
