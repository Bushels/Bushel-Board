/**
 * Server-only query for the GEE crop-stress map.
 *
 * `gee_crop_stress` has public-read RLS, so the standard SSR client reads it
 * directly — no service-role, no RPC. Latest-week resolution uses the two-query
 * shape (latest week_ending, then all rows for that exact week) rather than
 * fetching "recent N rows" and reducing — there is no FK to join, and the dataset
 * is ~8 rows/week. Freshness is derived from the rows (week_ending + computed_at).
 *
 * Types live in `./gee-crop-stress-utils` (client-safe). Import types FROM there.
 */
import { createClient } from "@/lib/supabase/server";
import {
  buildCropStressTakeaway,
  num,
  type CropStressMapData,
  type CropStressRow,
} from "./gee-crop-stress-utils";

const EMPTY: CropStressMapData = {
  latestWeek: null,
  rows: [],
  beltSummaries: [],
  sourceDatasets: [],
  computedAt: null,
  takeaway: buildCropStressTakeaway([]),
};

export async function getLatestCropStress(): Promise<CropStressMapData> {
  const supabase = await createClient();

  // (a) latest available week_ending
  const { data: weekRow } = await supabase
    .from("gee_crop_stress")
    .select("week_ending")
    .order("week_ending", { ascending: false })
    .limit(1)
    .maybeSingle();

  const latestWeek =
    weekRow && typeof weekRow.week_ending === "string" ? weekRow.week_ending : null;
  if (!latestWeek) return EMPTY;

  // (b) all rows for that exact week
  const { data: rowsRaw } = await supabase
    .from("gee_crop_stress")
    .select(
      "crop_belt,region_code,region_name,week_ending,ndvi_z,sm_z,stress_index,reading,source_datasets,computed_at",
    )
    .eq("week_ending", latestWeek);

  const rows: CropStressRow[] = (rowsRaw ?? []).map((r) => ({
    cropBelt: String(r.crop_belt),
    regionCode: String(r.region_code),
    regionName: String(r.region_name),
    weekEnding: String(r.week_ending),
    ndviZ: num(r.ndvi_z),
    smZ: num(r.sm_z),
    stressIndex: num(r.stress_index),
    reading: r.reading == null ? null : String(r.reading),
  }));

  const beltSummaries = rows.filter((r) => r.regionCode === "BELT");

  const firstWithDatasets = (rowsRaw ?? []).find((r) => Array.isArray(r.source_datasets));
  const sourceDatasets = Array.isArray(firstWithDatasets?.source_datasets)
    ? (firstWithDatasets!.source_datasets as string[])
    : [];

  const computedAt =
    (rowsRaw ?? [])
      .map((r) => (typeof r.computed_at === "string" ? r.computed_at : null))
      .filter((v): v is string => Boolean(v))
      .sort()
      .at(-1) ?? null;

  return {
    latestWeek,
    rows,
    beltSummaries,
    sourceDatasets,
    computedAt,
    takeaway: buildCropStressTakeaway(beltSummaries),
  };
}
