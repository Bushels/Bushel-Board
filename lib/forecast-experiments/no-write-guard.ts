const FORBIDDEN_WRITE_TOKENS = [
  "insert into market_analysis",
  "update market_analysis",
  "insert into thesis_packet_cache",
  "update thesis_packet_cache",
  "insert into grain_intelligence",
  "update grain_intelligence",
  "insert into forecast_outcomes",
  "update forecast_outcomes",
  "sidecar_table_write",
  "production_dashboard_write",
  "supabase.from(\"market_analysis\")",
  "supabase.from('market_analysis')",
] as const;

const LOCAL_OUTPUT_FILE_ALLOWLIST = [
  "source-records.json",
  "snapshot.json",
  "prompt-pack.json",
  "run-artifact.json",
  "workflow.json",
] as const;

export function assertNoForbiddenWriteIntents(payload: unknown): void {
  const serialized = JSON.stringify(payload).toLowerCase();
  for (const token of FORBIDDEN_WRITE_TOKENS) {
    if (serialized.includes(token)) {
      throw new Error(`No-write guard blocked forbidden write intent token: ${token}`);
    }
  }
}

export function assertLocalWorkflowOutputFilename(fileName: string): void {
  if (!LOCAL_OUTPUT_FILE_ALLOWLIST.includes(fileName as (typeof LOCAL_OUTPUT_FILE_ALLOWLIST)[number])) {
    throw new Error(`No-write guard blocked output file outside allowlist: ${fileName}`);
  }
}

export const NO_WRITE_GUARD = {
  forbiddenWriteTokens: [...FORBIDDEN_WRITE_TOKENS],
  localOutputFileAllowlist: [...LOCAL_OUTPUT_FILE_ALLOWLIST],
} as const;
