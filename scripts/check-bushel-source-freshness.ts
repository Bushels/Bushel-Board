#!/usr/bin/env npx tsx
/**
 * Bushel Board source freshness watchdog.
 *
 * Read-only. Intended for Hermes no_agent cron use:
 * - emits nothing when the mechanical source spine looks healthy
 * - prints a concise alert and exits non-zero when a freshness/cache/run-status gate fails
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const args = new Set(process.argv.slice(2));

function hasFlag(flag: string): boolean {
  const npmConfigKey = `npm_config_${flag.replace(/^--/, "").replace(/-/g, "_")}`;
  return args.has(flag) || process.env[npmConfigKey] === "true";
}

const SUMMARY = hasFlag("--summary") || hasFlag("--json");
const JSON_OUTPUT = hasFlag("--json");
const STRICT_FRESHNESS = hasFlag("--strict-freshness");
const ROUTINE_DUE = hasFlag("--routine-due");

const OPTIONAL_LOCAL_SOURCES = new Set([
  "crop_plan_deliveries",
  "crop_plans",
  "posted_prices",
  "weather_cache",
]);

const RETIRED_OR_ANALYSIS_SOURCES = new Set([
  "market_analysis",
  "us_market_analysis",
  "x_market_signals",
]);

const MECHANICAL_FRESHNESS_SOURCES = new Set([
  "cgc_observations",
  "cgc_imports",
  "producer_car_allocations",
  "grain_monitor_snapshots",
  "cftc_cot_positions",
  "usda_crop_progress",
  "usda_export_sales",
  "usda_wasde_mapped",
  "usda_wasde_raw",
  "usda_quarterly_stocks",
  "crop_acreage_estimates",
  "canada_crop_progress",
  "thesis_packet_cache",
  "thesis-packet-cache",
]);

// Public V1 is hard-gated to source-backed rows only: 7 Canada packets + 5 US packets.
const EXPECTED_V1_CANADA_CACHE_ITEMS = 7;
const EXPECTED_V1_US_CACHE_ITEMS = 5;
const EXPECTED_CACHE_ITEM_COUNT = EXPECTED_V1_CANADA_CACHE_ITEMS + EXPECTED_V1_US_CACHE_ITEMS;
const CACHE_LAG_GRACE_MINUTES = 10;
const WATCHDOG_TIME_ZONE = "America/Edmonton";

const CORE_SOURCE_NAMES = [
  "usda_crop_progress",
  "canada_crop_progress",
  "grain_monitor_snapshots",
  "usda_export_sales",
  "cgc_observations",
  "producer_car_allocations",
  "cftc_cot_positions",
  "usda_wasde_raw",
  "thesis-packet-cache",
] as const;

type CoreSourceName = (typeof CORE_SOURCE_NAMES)[number];

type DueCheck = {
  sourceName: CoreSourceName;
  label: string;
  weekday: number; // 1=Mon ... 5=Fri in America/Edmonton.
  localHour: number;
  localMinute: number;
  graceMinutes: number;
};

const ROUTINE_DUE_CHECKS: DueCheck[] = [
  { sourceName: "usda_crop_progress", label: "USDA Crop Progress Monday collector", weekday: 1, localHour: 16, localMinute: 32, graceMinutes: 25 },
  { sourceName: "canada_crop_progress", label: "Manitoba crop-progress Tuesday collector", weekday: 2, localHour: 12, localMinute: 45, graceMinutes: 25 },
  { sourceName: "canada_crop_progress", label: "Manitoba crop-progress Wednesday retry", weekday: 3, localHour: 10, localMinute: 30, graceMinutes: 25 },
  { sourceName: "grain_monitor_snapshots", label: "Grain Monitor Wednesday collector", weekday: 3, localHour: 14, localMinute: 17, graceMinutes: 30 },
  { sourceName: "usda_export_sales", label: "USDA Export Sales Thursday collector", weekday: 4, localHour: 9, localMinute: 3, graceMinutes: 30 },
  { sourceName: "canada_crop_progress", label: "MB+SK crop-progress Thursday collector", weekday: 4, localHour: 11, localMinute: 15, graceMinutes: 30 },
  { sourceName: "cgc_observations", label: "CGC weekly Thursday collector", weekday: 4, localHour: 13, localMinute: 35, graceMinutes: 30 },
  { sourceName: "producer_car_allocations", label: "Producer Cars Thursday collector", weekday: 4, localHour: 16, localMinute: 0, graceMinutes: 30 },
  { sourceName: "canada_crop_progress", label: "All-Prairie crop-progress Friday collector", weekday: 5, localHour: 13, localMinute: 45, graceMinutes: 30 },
  { sourceName: "cftc_cot_positions", label: "CFTC COT Friday collector", weekday: 5, localHour: 14, localMinute: 0, graceMinutes: 35 },
  { sourceName: "canada_crop_progress", label: "All-Prairie crop-progress Friday retry", weekday: 5, localHour: 15, localMinute: 30, graceMinutes: 30 },
];

const V1_FRESHNESS_CHECKS = [
  { grain: "Corn", lane: null },
  { grain: "Soybeans", lane: null },
  { grain: "Wheat", lane: null },
  { grain: "Amber Durum", lane: "canada" },
  { grain: "Canola", lane: "canada" },
  { grain: "Barley", lane: null },
  { grain: "Oats", lane: null },
] as const;

type SourceRun = {
  source_name: string;
  collector_name: string;
  status: string;
  source_period_end: string | null;
  latest_source_label: string | null;
  finished_at: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
};

type FreshnessRow = {
  source_name?: string;
  sourceName?: string;
  source_lane?: string | null;
  sourceLane?: string | null;
  freshness_status?: string;
  freshnessStatus?: string;
  latest_period?: string | null;
  latestPeriod?: string | null;
  latest_period_end?: string | null;
  latestPeriodEnd?: string | null;
  rows_available?: number | null;
  rowsAvailable?: number | null;
  last_success_at?: string | null;
  lastSuccessAt?: string | null;
  last_run_status?: string | null;
  lastRunStatus?: string | null;
  action_hint?: string | null;
  actionHint?: string | null;
};

type Alert = {
  severity: "blocker" | "watch";
  code: string;
  message: string;
};

function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, "utf-8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const index = line.indexOf("=");
      const key = line.slice(0, index).trim();
      let value = line.slice(index + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] ||= value;
    }
  } catch {
    // Env may already be supplied by the runner.
  }
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function minutesBetween(a: Date, b: Date): number {
  return Math.round(Math.abs(a.getTime() - b.getTime()) / 60000);
}

type LocalParts = {
  dateKey: string;
  weekday: number;
  minutesAfterMidnight: number;
};

function localParts(date: Date): LocalParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: WATCHDOG_TIME_ZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: weekdayMap[get("weekday")] ?? 0,
    minutesAfterMidnight: hour * 60 + minute,
  };
}

function sourceName(row: FreshnessRow): string {
  return row.source_name ?? row.sourceName ?? "unknown";
}

function freshnessStatus(row: FreshnessRow): string {
  return row.freshness_status ?? row.freshnessStatus ?? "unknown";
}

function actionHint(row: FreshnessRow): string | null {
  return row.action_hint ?? row.actionHint ?? null;
}

function isCoreFreshnessRow(row: FreshnessRow): boolean {
  const name = sourceName(row);
  if (OPTIONAL_LOCAL_SOURCES.has(name)) return false;
  if (RETIRED_OR_ANALYSIS_SOURCES.has(name)) return false;
  return MECHANICAL_FRESHNESS_SOURCES.has(name);
}

function isStrong(row: FreshnessRow): boolean {
  return freshnessStatus(row).toLowerCase() === "strong";
}

function latestBySource(rows: SourceRun[]): Map<string, SourceRun> {
  const latest = new Map<string, SourceRun>();
  for (const row of rows) {
    const existing = latest.get(row.source_name);
    const rowTime = toDate(row.finished_at)?.getTime() ?? 0;
    const existingTime = toDate(existing?.finished_at)?.getTime() ?? 0;
    if (!existing || rowTime > existingTime) latest.set(row.source_name, row);
  }
  return latest;
}

function prairiePackageRank(status: string | null): number {
  if (status === "complete_mb_sk_ab") return 4;
  if (status === "complete_with_missing_province") return 3;
  if (status === "partial_mb_sk") return 2;
  if (status === "partial_mb_only") return 1;
  if (status?.startsWith("partial_")) return 0;
  return -1;
}

function prairieWeekStatus(row: SourceRun | undefined): string | null {
  const metadata = asRecord(row?.metadata);
  const status = metadata?.prairie_week_status;
  return typeof status === "string" ? status : null;
}

function selectCanadaCropProgressPackageRun(rows: SourceRun[]): SourceRun | undefined {
  return rows
    .filter((row) => row.source_name === "canada_crop_progress")
    .sort((a, b) => {
      const periodDelta =
        (toDate(b.source_period_end)?.getTime() ?? Number.NEGATIVE_INFINITY) -
        (toDate(a.source_period_end)?.getTime() ?? Number.NEGATIVE_INFINITY);
      if (periodDelta !== 0) return periodDelta;

      const rankDelta = prairiePackageRank(prairieWeekStatus(b)) - prairiePackageRank(prairieWeekStatus(a));
      if (rankDelta !== 0) return rankDelta;

      return (
        (toDate(b.finished_at)?.getTime() ?? Number.NEGATIVE_INFINITY) -
        (toDate(a.finished_at)?.getTime() ?? Number.NEGATIVE_INFINITY)
      );
    })[0];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function main() {
  loadEnvFile(resolve(__dirname, "../.env.local"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  const { data: sourceRunsData, error: sourceRunsError } = await supabase
    .from("source_runs")
    .select(
      "source_name,collector_name,status,source_period_end,latest_source_label,finished_at,error_message,metadata",
    )
    .in("source_name", [...CORE_SOURCE_NAMES])
    .gte("finished_at", since)
    .order("finished_at", { ascending: false });

  if (sourceRunsError) throw new Error(`source_runs query failed: ${sourceRunsError.message}`);

  const sourceRuns = (sourceRunsData ?? []) as SourceRun[];
  const latest = latestBySource(sourceRuns);
  const alerts: Alert[] = [];

  for (const expected of CORE_SOURCE_NAMES) {
    const row = latest.get(expected);
    if (!row) {
      alerts.push({
        severity: expected === "thesis-packet-cache" ? "blocker" : "watch",
        code: "missing_source_run",
        message: `No source_runs row found in the last 45 days for ${expected}.`,
      });
      continue;
    }
    if (!["success", "skipped"].includes(row.status)) {
      alerts.push({
        severity: row.status === "failed" ? "blocker" : "watch",
        code: "latest_run_not_success",
        message: `${expected} latest run is ${row.status} at ${row.finished_at}${row.error_message ? `: ${row.error_message}` : ""}`,
      });
    }
  }

  const now = new Date();
  const nowLocal = localParts(now);
  if (ROUTINE_DUE) {
    for (const check of ROUTINE_DUE_CHECKS) {
      if (nowLocal.weekday !== check.weekday) continue;
      const dueMinutes = check.localHour * 60 + check.localMinute + check.graceMinutes;
      if (nowLocal.minutesAfterMidnight < dueMinutes) continue;
      const row = latest.get(check.sourceName);
      const finishedDateKey = row?.finished_at ? localParts(new Date(row.finished_at)).dateKey : null;
      if (!row || finishedDateKey !== nowLocal.dateKey) {
        alerts.push({
          severity: "blocker",
          code: "expected_routine_run_missing",
          message: `${check.label} should have finished today by ${String(check.localHour).padStart(2, "0")}:${String(check.localMinute).padStart(2, "0")} MT + ${check.graceMinutes}m, but latest ${check.sourceName} run is ${row?.finished_at ?? "missing"}.`,
        });
      }
    }
  }

  const latestCoreSuccess = [...latest.values()]
    .filter((row) => row.source_name !== "thesis-packet-cache" && row.status === "success")
    .map((row) => toDate(row.finished_at))
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  const latestCache = latest.get("thesis-packet-cache");
  const cacheFinishedAt = toDate(latestCache?.finished_at);
  const cacheMetadata = asRecord(latestCache?.metadata);
  const cacheAfter = asRecord(cacheMetadata?.after);
  const cacheItemCount = typeof cacheAfter?.cacheItemCount === "number" ? cacheAfter.cacheItemCount : null;

  if (latestCache && cacheItemCount !== EXPECTED_CACHE_ITEM_COUNT) {
    alerts.push({
      severity: "blocker",
      code: "cache_item_count",
      message: `thesis-packet-cache has ${cacheItemCount ?? "unknown"} items; expected ${EXPECTED_CACHE_ITEM_COUNT}.`,
    });
  }

  if (latestCoreSuccess && cacheFinishedAt && cacheFinishedAt.getTime() + CACHE_LAG_GRACE_MINUTES * 60000 < latestCoreSuccess.getTime()) {
    alerts.push({
      severity: "blocker",
      code: "cache_lagging_source_runs",
      message: `thesis-packet-cache finished ${minutesBetween(cacheFinishedAt, latestCoreSuccess)} minutes before the latest successful core source run.`,
    });
  }

  const canadaRun = selectCanadaCropProgressPackageRun(sourceRuns);
  const canadaPrairieWeekStatus = prairieWeekStatus(canadaRun);
  const dayUtc = now.getUTCDay();
  const hourUtc = now.getUTCHours();
  // Friday 4 PM MT is Friday 22:00 UTC during DST. After that point, a partial Prairie week needs attention.
  if (dayUtc === 5 && hourUtc >= 22 && canadaPrairieWeekStatus?.startsWith("partial_")) {
    alerts.push({
      severity: "watch",
      code: "partial_prairie_week_after_friday_checkpoint",
      message: `Canada crop progress still reports ${canadaPrairieWeekStatus} after the Friday checkpoint; confirm Alberta source or run the manual missing-AB fallback only with official stale proof.`,
    });
  }

  const freshnessSummaries: Array<{ grain: string; lane: string | null; coreWatchRows: FreshnessRow[] }> = [];
  for (const check of V1_FRESHNESS_CHECKS) {
    const { data, error } = await supabase.rpc("get_thesis_data_freshness", {
      p_grain: check.grain,
      p_lane: check.lane,
    });
    if (error) {
      alerts.push({
        severity: "blocker",
        code: "freshness_rpc_failed",
        message: `get_thesis_data_freshness failed for ${check.grain}${check.lane ? `/${check.lane}` : ""}: ${error.message}`,
      });
      continue;
    }

    const rows = Array.isArray(data) ? (data as FreshnessRow[]) : [];
    const coreWatchRows = rows.filter((row) => isCoreFreshnessRow(row) && !isStrong(row));
    const alertableRows = coreWatchRows.filter((row) => {
      const status = freshnessStatus(row).toLowerCase();
      return status === "empty" || STRICT_FRESHNESS;
    });
    freshnessSummaries.push({ grain: check.grain, lane: check.lane, coreWatchRows });

    for (const row of alertableRows) {
      alerts.push({
        severity: freshnessStatus(row).toLowerCase() === "empty" ? "blocker" : "watch",
        code: "core_freshness_not_strong",
        message: `${check.grain}${check.lane ? `/${check.lane}` : ""}: ${sourceName(row)} is ${freshnessStatus(row)}${actionHint(row) ? ` — ${actionHint(row)}` : ""}`,
      });
    }
  }

  const summary = {
    ok: alerts.length === 0,
    checked_at: now.toISOString(),
    expected_cache_item_count: EXPECTED_CACHE_ITEM_COUNT,
    latest_source_runs: Object.fromEntries(
      [...CORE_SOURCE_NAMES].map((name) => {
        const row = latest.get(name);
        return [
          name,
          row
            ? {
                status: row.status,
                collector_name: row.collector_name,
                source_period_end: row.source_period_end,
                latest_source_label: row.latest_source_label,
                finished_at: row.finished_at,
              }
            : null,
        ];
      }),
    ),
    cache: {
      item_count: cacheItemCount,
      finished_at: latestCache?.finished_at ?? null,
      source_run_watermark:
        typeof cacheAfter?.sourceRunWatermark === "string" ? cacheAfter.sourceRunWatermark : null,
    },
    canada_crop_progress: {
      prairie_week_status: canadaPrairieWeekStatus,
      finished_at: canadaRun?.finished_at ?? null,
      source_period_end: canadaRun?.source_period_end ?? null,
      latest_source_label: canadaRun?.latest_source_label ?? null,
    },
    freshness_watch_count: freshnessSummaries.reduce((sum, row) => sum + row.coreWatchRows.length, 0),
    alerts,
  };

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(summary, null, 2));
  } else if (!summary.ok || SUMMARY) {
    if (summary.ok) {
      console.log("Bushel Board source freshness watchdog OK");
      console.log(`checked_at=${summary.checked_at}`);
      console.log(`cache_items=${summary.cache.item_count}`);
      console.log(`cache_finished_at=${summary.cache.finished_at}`);
      console.log(`prairie_week_status=${summary.canada_crop_progress.prairie_week_status ?? "unknown"}`);
    } else {
      console.log("Bushel Board source freshness watchdog ALERT");
      console.log(`checked_at=${summary.checked_at}`);
      for (const alert of alerts) {
        console.log(`- [${alert.severity}] ${alert.code}: ${alert.message}`);
      }
    }
  }

  if (!summary.ok) {
    process.exit(alerts.some((alert) => alert.severity === "blocker") ? 2 : 1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
});
