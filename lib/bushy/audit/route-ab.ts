// WS6 Task 6.2 — Bushy chat harness
// Variant routing helper. Thin wrapper over the `assign_chat_engine_variant`
// RPC (WS1 Task 1.11). The RPC:
//   - Reads the single active chat_engine_config row
//   - Fast-paths to 'control' when variant_model_id is null
//   - Otherwise deterministic-hashes (user_id, experiment_id) into a bucket
//   - INSERTS into chat_engine_routing with ON CONFLICT DO NOTHING for
//     sticky assignment across turns
//
// Requires a service-role Supabase client — the RPC's GRANT is scoped to
// service_role only (see migration 20260418110900).

import type { SupabaseClient } from "@supabase/supabase-js";

export interface VariantAssignment {
  experimentId: string;
  modelId: string;
  variant: "control" | "variant";
}

export async function assignVariant(
  supabase: SupabaseClient,
  userId: string,
): Promise<VariantAssignment> {
  const { data, error } = await supabase
    .rpc("assign_chat_engine_variant", { p_user_id: userId })
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      `Variant assignment failed: ${error?.message ?? "no config row returned"}`,
    );
  }

  const row = data as {
    experiment_id: string;
    model_id: string;
    variant: "control" | "variant";
  };

  return {
    experimentId: row.experiment_id,
    modelId: row.model_id,
    variant: row.variant,
  };
}
