export async function writeSourceRun(supabase, input) {
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
