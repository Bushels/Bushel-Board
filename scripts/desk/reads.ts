/**
 * Desk swarm headless runner — service-role read registry.
 *
 * Replaces the scouts' Supabase MCP `execute_sql` reads with a constrained,
 * allow-listed surface on the service-role client:
 *   - RPC reads  → predefined DB functions only (no arbitrary SQL).
 *   - Table reads → PostgREST select-only against an allow-listed set of relations.
 * Neither path can write. This is strictly narrower than the MCP execute_sql it replaces.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** DB functions the desk swarm is allowed to call. Drift = a deliberate edit here. */
export const ALLOWED_RPCS = new Set<string>([
  // CAD scouts
  "get_pipeline_velocity",
  "get_pipeline_velocity_avg",
  "get_historical_average",
  "get_supply_disposition_context",
  "get_weekly_terminal_flow",
  "get_aggregate_terminal_flow",
  "get_processor_self_sufficiency",
  "get_usda_export_context",
  "get_usda_sales_pace",
  "get_sentiment_overview",
  "get_cot_positioning",
  "get_logistics_snapshot",
  "get_usda_wasde_context",
  "get_usda_crop_conditions",
  "get_area_prices",
  // US scouts
  "get_us_export_context",
  // Specialists (Viking L2)
  "get_knowledge_context",
]);

/** Tables/views the desk swarm is allowed to read (select-only). */
export const ALLOWED_RELATIONS = new Set<string>([
  "v_country_producer_deliveries",
  "v_grain_yoy_comparison",
  "v_latest_grain_prices",
  "v_signal_relevance_scores",
  "cgc_observations",
  "cgc_imports",
  "grain_prices",
  "posted_prices",
  "x_market_signals",
  "grain_monitor_snapshots",
  "producer_car_allocations",
  "usda_wasde_mapped",
  "usda_crop_progress",
  "usda_export_sales",
  "cftc_cot_positions",
  "score_trajectory",
  "us_score_trajectory",
  "market_analysis",
  "us_market_analysis",
  "friday_x_signal_bundle_v1",
  // Saturday meta-reviewer reads (write path stays interactive — see HEADLESS GAP in the reviewer defs)
  "pipeline_runs",
  "desk_performance_reviews",
  "us_desk_performance_reviews",
]);

export async function runRpcRead(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  if (!ALLOWED_RPCS.has(name)) {
    throw new Error(
      `RPC "${name}" is not in the desk read allow-list. Add it to ALLOWED_RPCS in scripts/desk/reads.ts if intended.`,
    );
  }
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`rpc ${name} failed: ${error.message}`);
  return data;
}

export interface TableReadSpec {
  table: string;
  select?: string;
  eq?: Array<[string, string]>;
  gte?: Array<[string, string]>;
  order?: { column: string; ascending: boolean };
  limit?: number;
}

export async function runTableRead(client: SupabaseClient, spec: TableReadSpec): Promise<unknown> {
  if (!ALLOWED_RELATIONS.has(spec.table)) {
    throw new Error(
      `Relation "${spec.table}" is not in the desk read allow-list. Add it to ALLOWED_RELATIONS in scripts/desk/reads.ts if intended.`,
    );
  }
  if (spec.select?.includes("(")) {
    throw new Error(
      "embedded/aggregate selects are not allowed (PostgREST embedding can reach non-allow-listed relations); select plain columns only",
    );
  }
  let query = client.from(spec.table).select(spec.select ?? "*");
  for (const [col, val] of spec.eq ?? []) query = query.eq(col, val);
  for (const [col, val] of spec.gte ?? []) query = query.gte(col, val);
  if (spec.order) query = query.order(spec.order.column, { ascending: spec.order.ascending });
  if (spec.limit) query = query.limit(spec.limit);
  const { data, error } = await query;
  if (error) throw new Error(`read ${spec.table} failed: ${error.message}`);
  return data;
}
