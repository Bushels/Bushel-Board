#!/usr/bin/env npx tsx
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { deriveAffectedDecisionsFromClassifiers } from "@/lib/x-api/x-signal-validation";
import { sanitizePublicAdviceCopy } from "@/lib/public-copy-guardrails";

type JsonRecord = Record<string, unknown>;

export interface FridayXSignalCorroboration {
  same_claim_count: number;
  independent_sources: string[];
  official_source_match: boolean;
}

export interface FridayXSignalBundleSignal {
  id: string;
  grain: string;
  primary_impact_grain: string;
  affected_grains: string[];
  affected_regions: string[];
  affected_decisions: string[];
  sentiment: string;
  category: string;
  relevance_score: number;
  confidence_score: number;
  source_cred_tier: string;
  scout_run_id: string | null;
  search_mode: string | null;
  post_author: string | null;
  post_url: string | null;
  post_date: string | null;
  post_summary: string;
  allowed_claims: string[];
  blocked_claims: string[];
  needs_official_verification: boolean;
  corroboration: FridayXSignalCorroboration;
  seasonal_phase: string | null;
  staleness_class: string | null;
  price_context: JsonRecord | null;
}

export interface FridayXSignalBundle {
  schema_version: "friday_x_signal_bundle_v1";
  built_at: string;
  crop_year: string;
  grain_week: number;
  mode: "friday_deep" | "daily_pulse" | "manual_test";
  run: JsonRecord | null;
  signals: FridayXSignalBundleSignal[];
  counts: {
    accepted: number;
    rejected_from_latest_run: number | null;
    excluded_missing_evidence: number;
    legacy_missing_corroboration: number;
  };
  guardrails: {
    grok_is_scout_only: true;
    no_grok_llm_in_desk_loop: true;
    x_posts_are_untrusted_evidence: true;
    official_sources_and_prices_outrank_x: true;
  };
}

const args = process.argv.slice(2);
const IS_CLI = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

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
    // Env may already be supplied.
  }
}

function createAdminClient(): SupabaseClient {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function optionValue(name: string): string | null {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1]!.startsWith("--")) {
    return args[index + 1]!;
  }
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const envValue = process.env[`npm_config_${name.replace(/^--/, "").replace(/-/g, "_")}`];
  return envValue && envValue !== "true" ? envValue : null;
}

function positionalArgs(): string[] {
  return args.filter((arg) => !arg.startsWith("--"));
}

export function resolveLatestCgcWeekFromRows(
  rows: JsonRecord[],
): { cropYear: string; grainWeek: number } | null {
  const candidates = rows
    .map((row) => ({
      cropYear: typeof row.crop_year === "string" ? row.crop_year : "",
      grainWeek: Number(row.grain_week),
    }))
    .filter((row) => /^\d{4}-\d{4}$/.test(row.cropYear) && Number.isFinite(row.grainWeek));

  candidates.sort((a, b) => {
    const cropYearDelta = b.cropYear.localeCompare(a.cropYear);
    if (cropYearDelta !== 0) return cropYearDelta;
    return b.grainWeek - a.grainWeek;
  });

  return candidates[0] ?? null;
}

function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function sanitizeFridayXCopy(value: string, fallback = "Accepted X Pulse signal"): string {
  const sanitized = sanitizePublicAdviceCopy(value).replace(/\s+/g, " ").trim();
  return sanitized || fallback;
}

function sanitizeFridayXClaims(values: string[]): string[] {
  const sanitized = values.map((value) => sanitizeFridayXCopy(value, "watch evidence")).filter(Boolean);
  return sanitized.filter((value, index) => sanitized.indexOf(value) === index);
}

function asNumber(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function asCorroboration(value: unknown): FridayXSignalCorroboration {
  const record = asRecord(value);
  return {
    same_claim_count: asNumber(record.same_claim_count),
    independent_sources: asStringArray(record.independent_sources),
    official_source_match: record.official_source_match === true,
  };
}

function hasCorroborationSeal(value: unknown): boolean {
  if (value == null) return true;
  const record = asRecord(value);
  return (
    Number.isFinite(Number(record.same_claim_count)) &&
    Array.isArray(record.independent_sources) &&
    typeof record.official_source_match === "boolean"
  );
}

function hasExplicitCorroboration(value: unknown): boolean {
  return value != null && hasCorroborationSeal(value);
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function latestPriceByGrain(priceRows: JsonRecord[]): Map<string, JsonRecord> {
  const map = new Map<string, JsonRecord>();
  for (const row of priceRows) {
    const grain = String(row.grain ?? "");
    if (!grain || map.has(grain)) continue;
    map.set(grain, {
      grain,
      contract: row.contract ?? null,
      exchange: row.exchange ?? null,
      price_date: row.price_date ?? null,
      settlement_price: row.settlement_price ?? null,
      change_pct: row.change_pct ?? null,
      currency: row.currency ?? null,
      unit: row.unit ?? null,
      source: row.source ?? null,
    });
  }
  return map;
}

function isAcceptedCurrentWeekSignal(row: JsonRecord, cropYear: string, grainWeek: number): boolean {
  const metadata = asRecord(row.signal_metadata);
  return (
    row.crop_year === cropYear &&
    Number(row.grain_week) === grainWeek &&
    Boolean(row.scout_run_id || metadata.schema_version === "x_signal_metadata_v1")
  );
}

function hasFridayDeskEvidenceSeal(row: JsonRecord): boolean {
  const metadata = asRecord(row.signal_metadata);
  const sourceTier = stringField(row.source_cred_tier) || stringField(metadata.source_tier);

  return (
    stringField(row.post_url).length > 0 &&
    stringField(row.post_date).length > 0 &&
    sourceTier.length > 0 &&
    Array.isArray(row.affected_regions) &&
    asStringArray(row.affected_regions).length > 0 &&
    Array.isArray(metadata.allowed_claims) &&
    Array.isArray(metadata.blocked_claims) &&
    typeof metadata.needs_official_verification === "boolean" &&
    hasCorroborationSeal(metadata.corroboration)
  );
}

export function latestScoutRunForMode(
  rows: JsonRecord[],
  mode: FridayXSignalBundle["mode"],
): JsonRecord | null {
  return rows.find((row) => row.mode === mode) ?? null;
}

function runForBundleMode(
  run: JsonRecord | null | undefined,
  mode: FridayXSignalBundle["mode"],
): JsonRecord | null {
  if (!run) return null;
  return typeof run.mode === "string" && run.mode !== mode ? null : run;
}

export function buildFridayXSignalBundleFromRows(params: {
  cropYear: string;
  grainWeek: number;
  mode?: FridayXSignalBundle["mode"];
  run?: JsonRecord | null;
  signalRows: JsonRecord[];
  priceRows: JsonRecord[];
  builtAt?: string;
}): FridayXSignalBundle {
  const mode = params.mode ?? "friday_deep";
  const run = runForBundleMode(params.run, mode);
  const priceMap = latestPriceByGrain(params.priceRows);
  const currentWeekSignalRows = params.signalRows
    .filter((row) => isAcceptedCurrentWeekSignal(row, params.cropYear, params.grainWeek));
  const deskReadySignalRows = currentWeekSignalRows.filter(hasFridayDeskEvidenceSeal);
  const signals = deskReadySignalRows
    .sort((a, b) => {
      const scoreDelta = Number(b.relevance_score ?? 0) - Number(a.relevance_score ?? 0);
      if (scoreDelta !== 0) return scoreDelta;
      return String(b.post_date ?? "").localeCompare(String(a.post_date ?? ""));
    })
    .slice(0, 30)
    .map((row) => {
      const metadata = asRecord(row.signal_metadata);
      const primaryImpactGrain = String(row.primary_impact_grain ?? row.grain);
      const seasonalPhase =
        typeof row.seasonal_phase === "string"
          ? row.seasonal_phase
          : typeof metadata.seasonal_phase === "string"
            ? metadata.seasonal_phase
            : null;
      const storedAffectedDecisions = asStringArray(row.affected_decisions);
      const metadataAffectedDecisions = asStringArray(metadata.affected_decisions);
      const affectedGrains = asStringArray(row.affected_grains);
      return {
        id: String(row.id),
        grain: String(row.grain),
        primary_impact_grain: primaryImpactGrain,
        affected_grains: affectedGrains.length ? affectedGrains : [primaryImpactGrain],
        affected_regions: asStringArray(row.affected_regions),
        affected_decisions: storedAffectedDecisions.length
          ? storedAffectedDecisions
          : metadataAffectedDecisions.length
            ? metadataAffectedDecisions
            : deriveAffectedDecisionsFromClassifiers(
                String(row.category ?? "other"),
                String(row.sentiment ?? "neutral"),
                seasonalPhase ?? undefined,
              ),
        sentiment: String(row.sentiment),
        category: String(row.category),
        relevance_score: Number(row.relevance_score ?? 0),
        confidence_score: Number(row.confidence_score ?? 0),
        source_cred_tier: String(row.source_cred_tier ?? metadata.source_tier ?? "unlisted"),
        scout_run_id: typeof row.scout_run_id === "string" ? row.scout_run_id : null,
        search_mode: typeof row.search_mode === "string" ? row.search_mode : null,
        post_author: typeof row.post_author === "string" ? row.post_author : null,
        post_url: typeof row.post_url === "string" ? row.post_url : null,
        post_date: typeof row.post_date === "string" ? row.post_date : null,
        post_summary: sanitizeFridayXCopy(String(row.post_summary ?? "")),
        allowed_claims: sanitizeFridayXClaims(asStringArray(metadata.allowed_claims)),
        blocked_claims: sanitizeFridayXClaims(asStringArray(metadata.blocked_claims)),
        needs_official_verification: metadata.needs_official_verification === true,
        corroboration: asCorroboration(metadata.corroboration),
        seasonal_phase: seasonalPhase,
        staleness_class: typeof metadata.staleness_class === "string" ? metadata.staleness_class : null,
        price_context: priceMap.get(primaryImpactGrain) ?? priceMap.get(String(row.grain)) ?? null,
      } satisfies FridayXSignalBundleSignal;
    });

  return {
    schema_version: "friday_x_signal_bundle_v1",
    built_at: params.builtAt ?? new Date().toISOString(),
    crop_year: params.cropYear,
    grain_week: params.grainWeek,
    mode,
    run,
    signals,
    counts: {
      accepted: signals.length,
      rejected_from_latest_run:
        run && run.rejected_signal_count != null ? Number(run.rejected_signal_count) : null,
      excluded_missing_evidence: currentWeekSignalRows.length - deskReadySignalRows.length,
      legacy_missing_corroboration: deskReadySignalRows.filter((row) => {
        const metadata = asRecord(row.signal_metadata);
        return !hasExplicitCorroboration(metadata.corroboration);
      }).length,
    },
    guardrails: {
      grok_is_scout_only: true,
      no_grok_llm_in_desk_loop: true,
      x_posts_are_untrusted_evidence: true,
      official_sources_and_prices_outrank_x: true,
    },
  };
}

async function safeSelect(
  supabase: SupabaseClient,
  table: string,
  select: string,
  order: { column: string; ascending?: boolean },
  limit: number,
): Promise<JsonRecord[]> {
  const { data, error } = await supabase
    .from(table)
    .select(select)
    .order(order.column, { ascending: order.ascending ?? false })
    .limit(limit);
  if (error) {
    console.error(`${table} query skipped: ${error.message}`);
    return [];
  }
  return (data ?? []) as unknown as JsonRecord[];
}

async function getCurrentWeek(
  supabase: SupabaseClient,
): Promise<{ cropYear: string; grainWeek: number }> {
  const cropYearArg = optionValue("--crop-year");
  const grainWeekArg = optionValue("--grain-week");
  const positionals = positionalArgs();
  const positionalCropYear = positionals.find((arg) => /^\d{4}-\d{4}$/.test(arg)) ?? null;
  const positionalGrainWeek = positionals.find((arg) => /^\d+$/.test(arg)) ?? null;
  const cropYear = cropYearArg ?? positionalCropYear;
  const grainWeek = grainWeekArg ?? positionalGrainWeek;
  if (cropYear && grainWeek) {
    return { cropYear, grainWeek: Number(grainWeek) };
  }

  let query = supabase
    .from("cgc_observations")
    .select("crop_year,grain_week");

  if (cropYear) {
    query = query.eq("crop_year", cropYear);
  }

  const { data, error } = await query
    .order("crop_year", { ascending: false })
    .order("grain_week", { ascending: false })
    .limit(200);
  const resolved = resolveLatestCgcWeekFromRows((data ?? []) as unknown as JsonRecord[]);
  if (error || !resolved) {
    throw new Error(`Unable to resolve current CGC week: ${error?.message ?? "no rows"}`);
  }
  return {
    cropYear: cropYear ?? resolved.cropYear,
    grainWeek: grainWeek ? Number(grainWeek) : resolved.grainWeek,
  };
}

export async function buildFridayXSignalBundle(
  supabase = createAdminClient(),
): Promise<FridayXSignalBundle> {
  const { cropYear, grainWeek } = await getCurrentWeek(supabase);
  const mode = (optionValue("--mode") ?? "friday_deep") as FridayXSignalBundle["mode"];
  const [signalRows, priceRows, scoutRuns] = await Promise.all([
    safeSelect(supabase, "x_market_signals", "*", { column: "created_at" }, 200),
    safeSelect(supabase, "grain_prices", "*", { column: "price_date" }, 80),
    safeSelect(supabase, "x_scout_runs", "*", { column: "run_started_at" }, 20),
  ]);

  return buildFridayXSignalBundleFromRows({
    cropYear,
    grainWeek,
    mode,
    run: latestScoutRunForMode(scoutRuns, mode),
    signalRows,
    priceRows,
  });
}

if (IS_CLI) {
  if (args.includes("--help") || args.includes("-h")) {
    console.error(`
Friday X Signal Bundle

Usage:
  npm run friday-x-signal-bundle
  npm run friday-x-signal-bundle -- --crop-year 2025-2026 --grain-week 42

Options:
  --crop-year YYYY-YYYY                 Optional CGC crop year override.
  --grain-week <number>                 Optional CGC grain week override.
  --mode friday_deep|daily_pulse|manual_test
`);
    process.exit(0);
  }

  buildFridayXSignalBundle()
    .then((bundle) => {
      console.log(JSON.stringify(bundle, null, 2));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
