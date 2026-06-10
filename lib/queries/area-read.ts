import { createClient } from "@/lib/supabase/server";
import { getCurrentCropYear } from "@/lib/utils/crop-year";
import {
  buildProvincialFlow,
  type AreaBid,
  type ProvincialFlowObservation,
  type ProvincialGrainFlow,
} from "@/lib/queries/area-read-utils";

export type { AreaBid, ProvincialGrainFlow } from "@/lib/queries/area-read-utils";

const AREA_GRAINS = ["Canola", "Wheat", "Amber Durum", "Barley", "Oats", "Corn", "Soybeans"] as const;

function priorCropYear(cropYear: string): string {
  const [start, end] = cropYear.split("-").map(Number);
  return `${start - 1}-${end - 1}`;
}

export interface ProvincialFlowRead {
  province: string;
  grainWeek: number | null;
  cropYear: string;
  flows: ProvincialGrainFlow[];
}

/**
 * Province-level CGC Primary elevator deliveries for the public V1 grains:
 * current week, season cumulative, and the same-week season comparison.
 * Pre-aggregated grade='' rows only (per the CGC aggregate-row guardrail).
 */
export async function getProvincialFlow(provinceName: string): Promise<ProvincialFlowRead | null> {
  const supabase = await createClient();
  const cropYear = getCurrentCropYear();
  const prior = priorCropYear(cropYear);

  const latestWeek = await supabase
    .from("cgc_observations")
    .select("grain_week")
    .eq("crop_year", cropYear)
    .order("grain_week", { ascending: false })
    .limit(1);

  const grainWeek = latestWeek.data?.[0]?.grain_week ?? null;
  if (latestWeek.error || grainWeek === null) return null;

  const rows = await supabase
    .from("cgc_observations")
    .select("grain, crop_year, grain_week, period, ktonnes")
    .eq("worksheet", "Primary")
    .eq("metric", "Deliveries")
    .eq("grade", "")
    .eq("region", provinceName)
    .eq("grain_week", grainWeek)
    .in("crop_year", [cropYear, prior])
    .in("period", ["Current Week", "Crop Year"])
    .in("grain", [...AREA_GRAINS]);

  if (rows.error) return null;

  return {
    province: provinceName,
    grainWeek,
    cropYear,
    flows: buildProvincialFlow((rows.data ?? []) as ProvincialFlowObservation[], cropYear, prior),
  };
}

interface AreaPriceRow {
  facility_name: string | null;
  business_type: string;
  grain: string;
  price_per_tonne: number | string | null;
  basis: number | string | null;
  delivery_period: string | null;
  posted_at: string | null;
}

/** Unexpired operator bids posted for the farmer's FSA, freshest first. */
export async function getAreaBids(fsa: string): Promise<AreaBid[]> {
  const supabase = await createClient();
  const result = await supabase.rpc("get_area_prices", { p_fsa_code: fsa });
  if (result.error) return [];

  return ((result.data ?? []) as AreaPriceRow[]).map((row) => ({
    facilityName: row.facility_name,
    businessType: row.business_type,
    grain: row.grain,
    pricePerTonne: row.price_per_tonne === null ? null : Number(row.price_per_tonne),
    basis: row.basis === null ? null : Number(row.basis),
    deliveryPeriod: row.delivery_period,
    postedAt: row.posted_at,
  }));
}
