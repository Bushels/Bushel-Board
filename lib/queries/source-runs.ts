import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SourceRunStatus = "started" | "success" | "partial" | "failed" | "skipped" | "dry_run";

export interface SourceRunSummary {
  sourceName: string;
  collectorName: string;
  status: SourceRunStatus | string;
  sourcePeriodEnd: string | null;
  latestSourceLabel: string | null;
  finishedAt: string | null;
  rowsInserted: number;
  rowsUpdated: number;
  rowsSkipped: number;
  errorMessage: string | null;
}

async function getClient(client?: SupabaseClient): Promise<SupabaseClient> {
  return client ?? (await createClient());
}

function textValue(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  const number = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export function normalizeSourceRunRow(row: Record<string, unknown>): SourceRunSummary {
  return {
    sourceName: textValue(row, "source_name") ?? "unknown",
    collectorName: textValue(row, "collector_name") ?? "unknown",
    status: textValue(row, "status") ?? "unknown",
    sourcePeriodEnd: textValue(row, "source_period_end"),
    latestSourceLabel: textValue(row, "latest_source_label"),
    finishedAt: textValue(row, "finished_at"),
    rowsInserted: numberValue(row, "rows_inserted"),
    rowsUpdated: numberValue(row, "rows_updated"),
    rowsSkipped: numberValue(row, "rows_skipped"),
    errorMessage: textValue(row, "error_message"),
  };
}

export async function getLatestSourceRunSummaries(
  sourceNames: string[],
  client?: SupabaseClient,
): Promise<SourceRunSummary[]> {
  const names = [...new Set(sourceNames.filter((name) => name.trim()))].sort();
  if (names.length === 0) return [];

  const supabase = await getClient(client);
  const { data, error } = await supabase
    .from("source_runs")
    .select(
      "source_name,collector_name,status,source_period_end,latest_source_label,finished_at,rows_inserted,rows_updated,rows_skipped,error_message",
    )
    .in("source_name", names)
    .order("finished_at", { ascending: false, nullsFirst: false })
    .limit(Math.max(50, names.length * 5));

  if (error || !Array.isArray(data)) {
    if (error) console.error("getLatestSourceRunSummaries error:", error.message);
    return [];
  }

  const latest = new Map<string, SourceRunSummary>();
  for (const row of data) {
    const summary = normalizeSourceRunRow(row as Record<string, unknown>);
    if (!latest.has(summary.sourceName)) latest.set(summary.sourceName, summary);
  }

  return [...latest.values()];
}
