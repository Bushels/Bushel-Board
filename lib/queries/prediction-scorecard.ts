import { createClient } from "@/lib/supabase/server";

export interface PredictionScorecardSummary {
  grain: string;
  scanType: string | null;
  totalCalls: number;
  resolvedCalls: number;
  unresolvedCalls: number;
  correctDirection: number;
  wrongDirection: number;
  helpfulActions: number;
  directionHitRatePct: number;
  actionHitRatePct: number;
}

export interface PredictionScorecardSummaryOptions {
  evalWindowDays?: 7 | 14 | 28;
  scanType?: string;
  includeUnresolved?: boolean;
}

export async function getPredictionScorecardSummary(
  options: PredictionScorecardSummaryOptions = {},
): Promise<PredictionScorecardSummary[]> {
  const {
    evalWindowDays = 14,
    scanType,
    includeUnresolved = false,
  } = options;

  const supabase = await createClient();
  let query = supabase
    .from("prediction_scorecard")
    .select("grain,scan_type,direction_result,action_result")
    .eq("eval_window_days", evalWindowDays);

  if (scanType) {
    query = query.eq("scan_type", scanType);
  }

  if (!includeUnresolved) {
    query = query.neq("direction_result", "unresolved");
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load prediction_scorecard summary: ${error.message}`);
  }

  const summary = new Map<string, PredictionScorecardSummary>();

  for (const row of data ?? []) {
    const grain = String(row.grain);
    const rowScanType = row.scan_type ? String(row.scan_type) : null;
    const key = `${grain}|${rowScanType ?? "all"}`;
    const entry = summary.get(key) ?? {
      grain,
      scanType: rowScanType,
      totalCalls: 0,
      resolvedCalls: 0,
      unresolvedCalls: 0,
      correctDirection: 0,
      wrongDirection: 0,
      helpfulActions: 0,
      directionHitRatePct: 0,
      actionHitRatePct: 0,
    };

    entry.totalCalls += 1;
    if (row.direction_result === "unresolved") {
      entry.unresolvedCalls += 1;
      summary.set(key, entry);
      continue;
    }

    entry.resolvedCalls += 1;
    if (row.direction_result === "correct") entry.correctDirection += 1;
    if (row.direction_result === "wrong") entry.wrongDirection += 1;
    if (row.action_result === "helpful") entry.helpfulActions += 1;
    summary.set(key, entry);
  }

  for (const entry of summary.values()) {
    entry.directionHitRatePct = entry.resolvedCalls > 0
      ? Number(((entry.correctDirection / entry.resolvedCalls) * 100).toFixed(1))
      : 0;
    entry.actionHitRatePct = entry.resolvedCalls > 0
      ? Number(((entry.helpfulActions / entry.resolvedCalls) * 100).toFixed(1))
      : 0;
  }

  return [...summary.values()].sort((a, b) => {
    if (b.directionHitRatePct !== a.directionHitRatePct) {
      return b.directionHitRatePct - a.directionHitRatePct;
    }
    return b.resolvedCalls - a.resolvedCalls;
  });
}
