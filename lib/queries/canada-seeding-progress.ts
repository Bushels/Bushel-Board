import { createClient } from "@/lib/supabase/server";

export interface CanadaSeedingRegionalNote {
  region: string;
  note: string;
}

export interface CanadaSeedingProgress {
  province_code: string;
  province_name: string;
  crop_year: number;
  report_date: string;
  report_label: string;
  source_name: string;
  source_url: string;
  seeded_pct: number | null;
  seeded_pct_previous_year: number | null;
  seeded_pct_5yr_avg: number | null;
  seeded_pct_vs_5yr_avg: number | null;
  status: "reported" | "scheduled" | "not_released";
  summary: string;
  regional_notes: CanadaSeedingRegionalNote[];
}

export interface CanadaCropProgressObservation {
  province_code: string;
  province_name: string;
  crop_year: number;
  report_date: string;
  release_date: string | null;
  period_start: string | null;
  period_end: string | null;
  report_label: string;
  source_name: string;
  source_url: string;
  document_url: string | null;
  region_scope: "province" | "crop_region";
  region_code: string;
  region_name: string;
  crop_name: string;
  canonical_grain: string | null;
  metric: string;
  value_pct: number | null;
  previous_year_pct: number | null;
  five_year_avg_pct: number | null;
  value_vs_previous_year_pct: number | null;
  value_vs_five_year_avg_pct: number | null;
  source_excerpt: string | null;
  confidence: "high" | "medium" | "low";
  quality_flags: string[];
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function regionalNotes(v: unknown): CanadaSeedingRegionalNote[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const region = String(record.region ?? "").trim();
      const note = String(record.note ?? "").trim();
      return region && note ? { region, note } : null;
    })
    .filter((item): item is CanadaSeedingRegionalNote => item !== null);
}

function flags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

export async function getCanadaSeedingProgress(
  cropYear: number,
): Promise<CanadaSeedingProgress[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("canada_seeding_progress")
    .select(
      "province_code,province_name,crop_year,report_date,report_label,source_name,source_url,seeded_pct,seeded_pct_previous_year,seeded_pct_5yr_avg,seeded_pct_vs_5yr_avg,status,summary,regional_notes",
    )
    .eq("crop_year", cropYear)
    .order("report_date", { ascending: false })
    .order("province_code", { ascending: true });

  if (error) {
    console.error("getCanadaSeedingProgress error:", error);
    return [];
  }

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    province_code: String(row.province_code),
    province_name: String(row.province_name),
    crop_year: Number(row.crop_year),
    report_date: String(row.report_date),
    report_label: String(row.report_label),
    source_name: String(row.source_name),
    source_url: String(row.source_url),
    seeded_pct: num(row.seeded_pct),
    seeded_pct_previous_year: num(row.seeded_pct_previous_year),
    seeded_pct_5yr_avg: num(row.seeded_pct_5yr_avg),
    seeded_pct_vs_5yr_avg: num(row.seeded_pct_vs_5yr_avg),
    status: String(row.status) as CanadaSeedingProgress["status"],
    summary: String(row.summary),
    regional_notes: regionalNotes(row.regional_notes),
  }));
}

export async function getLatestCanadaCropProgress(
  cropYear: number,
  canonicalGrain?: string,
): Promise<CanadaCropProgressObservation[]> {
  const supabase = await createClient();
  let query = supabase
    .from("v_canada_crop_progress_latest")
    .select(
      [
        "province_code",
        "province_name",
        "crop_year",
        "report_date",
        "release_date",
        "period_start",
        "period_end",
        "report_label",
        "source_name",
        "source_url",
        "document_url",
        "region_scope",
        "region_code",
        "region_name",
        "crop_name",
        "canonical_grain",
        "metric",
        "value_pct",
        "previous_year_pct",
        "five_year_avg_pct",
        "value_vs_previous_year_pct",
        "value_vs_five_year_avg_pct",
        "source_excerpt",
        "confidence",
        "quality_flags",
      ].join(","),
    )
    .eq("crop_year", cropYear)
    .eq("metric", "seeded_pct")
    .eq("region_scope", "province")
    .order("report_date", { ascending: false })
    .order("province_code", { ascending: true });

  if (canonicalGrain) {
    query = query.eq("canonical_grain", canonicalGrain);
  }

  const { data, error } = await query;
  if (error) {
    console.error("getLatestCanadaCropProgress error:", error);
    return [];
  }

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    province_code: String(row.province_code),
    province_name: String(row.province_name),
    crop_year: Number(row.crop_year),
    report_date: String(row.report_date),
    release_date: row.release_date ? String(row.release_date) : null,
    period_start: row.period_start ? String(row.period_start) : null,
    period_end: row.period_end ? String(row.period_end) : null,
    report_label: String(row.report_label),
    source_name: String(row.source_name),
    source_url: String(row.source_url),
    document_url: row.document_url ? String(row.document_url) : null,
    region_scope: String(row.region_scope) as CanadaCropProgressObservation["region_scope"],
    region_code: String(row.region_code),
    region_name: String(row.region_name),
    crop_name: String(row.crop_name),
    canonical_grain: row.canonical_grain ? String(row.canonical_grain) : null,
    metric: String(row.metric),
    value_pct: num(row.value_pct),
    previous_year_pct: num(row.previous_year_pct),
    five_year_avg_pct: num(row.five_year_avg_pct),
    value_vs_previous_year_pct: num(row.value_vs_previous_year_pct),
    value_vs_five_year_avg_pct: num(row.value_vs_five_year_avg_pct),
    source_excerpt: row.source_excerpt ? String(row.source_excerpt) : null,
    confidence: String(row.confidence) as CanadaCropProgressObservation["confidence"],
    quality_flags: flags(row.quality_flags),
  }));
}
