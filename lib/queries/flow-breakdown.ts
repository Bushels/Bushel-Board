import { createClient } from "@/lib/supabase/server";
import { sumCountryProducerDeliveries } from "@/lib/cgc/delivery-metrics";

export interface FlowSegment {
  name: string;
  value: number; // Ktonnes
  percentage: number;
  color: string;
}

export interface FlowBreakdownResult {
  segments: FlowSegment[];
  totalFlow: number;
  grainWeek: number;
}

const FLOW_COLORS = {
  Exports: "#2e6b9e",
  Processing: "#437a22",
  "Storage Increase": "#c17f24",
  Other: "#8b7355",
};

/**
 * Calculates "Where Grain Went" this week — breakdown of weekly disappearance.
 * Uses cgc_observations data for the given grain/cropYear/grainWeek.
 *
 * Flow = country producer deliveries for the week:
 * Primary.Deliveries (AB/SK/MB/BC, grade='') + Process.Producer Deliveries
 * (national, grade='') + Producer Cars.Shipments (AB/SK/MB, grade='').
 * Breakdown: Exports, Processing, and residual (Storage change / Other).
 */
export async function getWeeklyFlowBreakdown(
  grain: string,
  cropYear: string,
  grainWeek: number
): Promise<FlowBreakdownResult> {
  try {
    const supabase = await createClient();

    // Fetch all relevant current-week observations in one query
    const { data: obs, error } = await supabase
      .from("cgc_observations")
      .select("worksheet, metric, region, ktonnes, grade")
      .eq("grain", grain)
      .eq("crop_year", cropYear)
      .eq("grain_week", grainWeek)
      .eq("period", "Current Week")
      .in("worksheet", [
        "Primary",
        "Process",
        "Terminal Exports",
        "Primary Shipment Distribution",
        "Producer Cars",
      ])
      .in("metric", [
        "Deliveries",
        "Producer Deliveries",
        "Exports",
        "Shipment Distribution",
        "Shipments",
      ]);

    if (error || !obs || obs.length === 0) {
      return { segments: [], totalFlow: 0, grainWeek };
    }

    // Helper to sum matching observations
    const sumObs = (
      worksheet: string,
      metric: string,
      opts?: { regions?: string[]; gradeFilter?: string }
    ): number =>
      obs
        .filter(
          (o) =>
            o.worksheet === worksheet &&
            o.metric === metric &&
            (opts?.regions
              ? opts.regions.includes(o.region)
              : true) &&
            (opts?.gradeFilter !== undefined
              ? o.grade === opts.gradeFilter
              : true)
        )
        .reduce((sum, o) => sum + Number(o.ktonnes || 0), 0);

    const totalFlow = sumCountryProducerDeliveries(obs);

    // 1. Exports: terminal exports plus direct exports bypassing terminals
    const exports =
      sumObs("Terminal Exports", "Exports") +
      sumObs("Primary Shipment Distribution", "Shipment Distribution", {
        regions: ["Export Destinations"],
        gradeFilter: "",
      });

    // 2. Processing: Process worksheet, Producer Deliveries metric (national total)
    const processing = sumObs("Process", "Producer Deliveries", {
      gradeFilter: "",
    });

    if (totalFlow <= 0) {
      return { segments: [], totalFlow: 0, grainWeek };
    }

    // Storage change = what stayed in the system (residual)
    const storageChange = totalFlow - exports - processing;

    const segments: FlowSegment[] = [];

    if (exports > 0) {
      segments.push({
        name: "Exports",
        value: exports,
        percentage: (exports / totalFlow) * 100,
        color: FLOW_COLORS.Exports,
      });
    }

    if (processing > 0) {
      segments.push({
        name: "Processing",
        value: processing,
        percentage: (processing / totalFlow) * 100,
        color: FLOW_COLORS.Processing,
      });
    }

    if (storageChange > 0) {
      segments.push({
        name: "Storage Increase",
        value: storageChange,
        percentage: (storageChange / totalFlow) * 100,
        color: FLOW_COLORS["Storage Increase"],
      });
    } else if (storageChange < 0) {
      // Negative storage change means more left the system than entered
      // (drawing down stocks) — show as "Other" with 0%
      segments.push({
        name: "Other",
        value: Math.abs(storageChange),
        percentage: (Math.abs(storageChange) / totalFlow) * 100,
        color: FLOW_COLORS.Other,
      });
    }

    return { segments, totalFlow, grainWeek };
  } catch (err) {
    console.error("getWeeklyFlowBreakdown failed:", err);
    return { segments: [], totalFlow: 0, grainWeek };
  }
}
