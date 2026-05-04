import type { SupabaseClient } from "@supabase/supabase-js";

export type SourceRunInput = {
  source_name: string;
  source_lane:
    | "canada"
    | "us"
    | "cross_border"
    | "farmer_local"
    | "international"
    | "analysis"
    | "system";
  collector_name: string;
  status: "started" | "success" | "partial" | "failed" | "skipped" | "dry_run";
  source_period_start?: string | null;
  source_period_end?: string | null;
  latest_source_label?: string | null;
  rows_inserted?: number;
  rows_updated?: number;
  rows_skipped?: number;
  error_message?: string | null;
  source_url?: string | null;
  started_at?: string | null;
  metadata?: Record<string, unknown>;
};

export async function writeSourceRun(
  supabase: SupabaseClient,
  input: SourceRunInput,
): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("source_runs")
    .insert({
      source_name: input.source_name,
      source_lane: input.source_lane,
      collector_name: input.collector_name,
      status: input.status,
      source_period_start: input.source_period_start ?? null,
      source_period_end: input.source_period_end ?? null,
      latest_source_label: input.latest_source_label ?? null,
      rows_inserted: input.rows_inserted ?? 0,
      rows_updated: input.rows_updated ?? 0,
      rows_skipped: input.rows_skipped ?? 0,
      error_message: input.error_message?.slice(0, 2000) ?? null,
      source_url: input.source_url ?? null,
      started_at: input.started_at ?? now,
      finished_at: now,
      metadata: input.metadata ?? {},
    })
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id ?? null };
}
