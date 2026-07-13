#!/usr/bin/env npx tsx
/**
 * Desk swarm headless service-role CLI.
 *
 * Replaces the Supabase MCP data plane for the Friday desk swarms so they can
 * run unattended in the scheduled-task runner (where MCP returns -32600). The
 * Claude swarm keeps its Opus reasoning + multi-agent structure; this CLI is the
 * service-role read/write surface the agents invoke via Bash.
 *
 *   npx tsx scripts/desk/desk-cli.ts --side <cad|us> <command> [options]
 *
 * Commands: preflight | resolve | read | knowledge | write | fail | postcheck
 * Conventions: JSON to stdout, diagnostics to stderr, idempotent, --help.
 */

import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "../../lib/supabase/admin";
import {
  assertDeskSide,
  assertFailStatus,
  marketListFor,
  WEEKLY_SCAN_TYPE,
  CAD_ANALYSIS_CONFLICT,
  US_ANALYSIS_CONFLICT,
  DESK_WRITE_APPROVAL_PHRASE,
  type DeskSide,
} from "./contracts";
import { writeEnvelope, type WriteEnvelope } from "./schemas";
import {
  buildMarketAnalysisRow,
  buildCadTrajectoryRow,
  buildUsMarketAnalysisRow,
  buildUsTrajectoryRow,
  buildPipelineRunRow,
  usTrajectoryDeleteBound,
} from "./row-builders";
import {
  evaluateFreshness,
  cropProgressInSeason,
  CAD_SLAS,
  US_SLAS,
  type FreshnessSource,
} from "./freshness";
import { runRpcRead, runTableRead, type TableReadSpec } from "./reads";
import { mostRecentFriday, isoWeekNumber, ageInDays } from "./dates";

loadEnv({ path: ".env.local" });

const HELP = `Desk swarm headless service-role CLI

Usage:
  npx tsx scripts/desk/desk-cli.ts --side <cad|us> <command> [options]

Commands:
  preflight                 Resolve week/market-year + run freshness SLA. On a breach,
                            write a pipeline_runs failure row and exit 1 (fail loud).
  resolve                   Print resolved week/crop-year/market-year/week-ending (no writes).
  read --rpc <name> --args '<json>'      Call an allow-listed DB function; print JSON.
  read --table <name> [--select c,c] [--eq col=val]... [--gte col=val]...
       [--order col.desc] [--limit N]    Allow-listed select-only read; print JSON.
  knowledge --query "<kw>" [--grain G | --market M] [--topics a,b] [--limit N]
                            Viking L2 via get_knowledge_context RPC; print JSON.
  write --input <file|->     Validate the chief's rows; DRY-RUN by default. The envelope
                            must match the CURRENT resolved week/market-year unless
                            --allow-historical is passed (guards published history).
       [--write --approve "<phrase>"]    Persist (gated): upsert analysis + delete/insert
                            trajectory + pipeline_runs completed row.
  fail --reason "<r>" [--status failed|partial] [--details '<json>' | --details -]
                            Write a pipeline_runs failure/partial row (failure logging is
                            never gated — a miss must never be silent). Status is limited
                            to failed|partial; --details - reads JSON from stdin (use for
                            any free text — never interpolate it into inline JSON).
  postcheck                 Run check:desk-freshness + refresh thesis cache.

Options:
  --side cad|us             Required for all commands except postcheck.
  --help                    Show this help.

Write approval (mirrors Track 54 human-approval discipline):
  Real writes require --approve "<phrase>" or DESK_WRITE_APPROVAL env to equal:
  "${DESK_WRITE_APPROVAL_PHRASE}"
`;

// ---------------------------------------------------------------------------
// arg parsing
// ---------------------------------------------------------------------------

interface ParsedArgs {
  command: string | null;
  side: string | undefined;
  flags: Record<string, string | string[] | boolean>;
}

const REPEATABLE = new Set(["eq", "gte"]);
const BOOLEAN_FLAGS = new Set(["write", "help", "allow-historical"]);

function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string | string[] | boolean> = {};
  let command: string | null = null;
  let i = 0;
  while (i < argv.length) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      if (BOOLEAN_FLAGS.has(key)) {
        flags[key] = true;
        i += 1;
        continue;
      }
      const value = argv[i + 1] ?? "";
      if (REPEATABLE.has(key)) {
        const arr = Array.isArray(flags[key]) ? (flags[key] as string[]) : [];
        arr.push(value);
        flags[key] = arr;
      } else {
        flags[key] = value;
      }
      i += 2;
      continue;
    }
    if (command === null) command = token;
    i += 1;
  }
  return { command, side: typeof flags.side === "string" ? flags.side : undefined, flags };
}

function strFlag(p: ParsedArgs, key: string): string | undefined {
  const v = p.flags[key];
  return typeof v === "string" ? v : undefined;
}
function boolFlag(p: ParsedArgs, key: string): boolean {
  return p.flags[key] === true;
}
function listFlag(p: ParsedArgs, key: string): string[] {
  const v = p.flags[key];
  if (Array.isArray(v)) return v;
  if (typeof v === "string") return [v];
  return [];
}

function emit(obj: unknown): void {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}
function diag(msg: string): void {
  process.stderr.write(`${msg}\n`);
}

// ---------------------------------------------------------------------------
// context resolution + freshness (service-role reads)
// ---------------------------------------------------------------------------

interface RunContext {
  crop_year: string;
  grain_week: number; // CAD: CGC week; US: ISO week of week_ending (for pipeline_runs NN)
  market_year?: number;
  week_ending?: string;
}

async function maxValue(
  client: SupabaseClient,
  table: string,
  col: string,
  filters: Array<[string, string]> = [],
): Promise<string | null> {
  let query = client.from(table).select(col);
  for (const [c, v] of filters) query = query.eq(c, v);
  const { data, error } = await query.order(col, { ascending: false }).limit(1);
  if (error) throw new Error(`${table}.${col} read failed: ${error.message}`);
  const row = (data ?? [])[0] as unknown as Record<string, unknown> | undefined;
  return row ? ((row[col] as string | null) ?? null) : null;
}

async function resolveCadContext(client: SupabaseClient): Promise<RunContext> {
  const { data, error } = await client
    .from("cgc_observations")
    .select("crop_year,grain_week")
    .order("crop_year", { ascending: false })
    .order("grain_week", { ascending: false })
    .limit(1);
  if (error) throw new Error(`cgc_observations read failed: ${error.message}`);
  const row = (data ?? [])[0] as { crop_year: string; grain_week: number } | undefined;
  if (!row) throw new Error("cgc_observations returned no rows — cannot resolve CAD week");
  return { crop_year: row.crop_year, grain_week: Number(row.grain_week) };
}

async function resolveUsContext(client: SupabaseClient, now: Date): Promise<RunContext> {
  const { data, error } = await client
    .from("usda_wasde_mapped")
    .select("market_year,report_month")
    .eq("market_name", "Corn")
    .order("report_month", { ascending: false })
    .limit(1);
  if (error) throw new Error(`usda_wasde_mapped read failed: ${error.message}`);
  const row = (data ?? [])[0] as { market_year: number } | undefined;
  if (!row) throw new Error("usda_wasde_mapped returned no rows — cannot resolve US market_year");
  const marketYear = Number(row.market_year);
  const weekEnding = mostRecentFriday(now);
  return {
    crop_year: `${marketYear}-${marketYear + 1}`,
    grain_week: isoWeekNumber(new Date(`${weekEnding}T00:00:00Z`)),
    market_year: marketYear,
    week_ending: weekEnding,
  };
}

async function cadFreshness(client: SupabaseClient, now: Date): Promise<FreshnessSource[]> {
  const cgc = await maxValue(client, "cgc_imports", "imported_at");
  const cot = await maxValue(client, "cftc_cot_positions", "imported_at");
  const price = await maxValue(client, "grain_prices", "price_date");
  return [
    { name: "cgc", ageDays: ageInDays(cgc, now), slaDays: CAD_SLAS.cgc },
    { name: "cot", ageDays: ageInDays(cot, now), slaDays: CAD_SLAS.cot },
    { name: "price", ageDays: ageInDays(price, now), slaDays: CAD_SLAS.price },
  ];
}

async function usFreshness(client: SupabaseClient, now: Date): Promise<FreshnessSource[]> {
  const wasde = await maxValue(client, "usda_wasde_mapped", "report_month");
  const exportSales = await maxValue(client, "usda_export_sales", "week_ending");
  const price = await maxValue(client, "grain_prices", "price_date");
  const cot = await maxValue(client, "cftc_cot_positions", "report_date");
  const cropProg = await maxValue(client, "usda_crop_progress", "week_ending", [["state", "US TOTAL"]]);
  const inSeason = cropProgressInSeason(now.getUTCMonth() + 1);
  return [
    { name: "wasde", ageDays: ageInDays(wasde, now), slaDays: US_SLAS.wasde },
    { name: "export_sales", ageDays: ageInDays(exportSales, now), slaDays: US_SLAS.export_sales },
    { name: "price", ageDays: ageInDays(price, now), slaDays: US_SLAS.price },
    { name: "cot", ageDays: ageInDays(cot, now), slaDays: US_SLAS.cot },
    { name: "crop_progress", ageDays: ageInDays(cropProg, now), slaDays: US_SLAS.crop_progress, skip: !inSeason },
  ];
}

// ---------------------------------------------------------------------------
// pipeline_runs writers (correct schema — no source/metadata; NOT-NULL safe)
// ---------------------------------------------------------------------------

function routineFor(side: DeskSide): string {
  return side === "cad" ? "grain-desk-weekly" : "us-desk-weekly";
}

async function insertPipelineRun(client: SupabaseClient, row: Record<string, unknown>): Promise<void> {
  const { error } = await client
    .from("pipeline_runs")
    .insert({ ...row, completed_at: new Date().toISOString() });
  if (error) throw new Error(`pipeline_runs insert failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------

async function cmdPreflight(side: DeskSide, client: SupabaseClient): Promise<number> {
  const now = new Date();
  const context = side === "cad" ? await resolveCadContext(client) : await resolveUsContext(client, now);
  const sources = side === "cad" ? await cadFreshness(client, now) : await usFreshness(client, now);
  const verdict = evaluateFreshness(sources);

  if (!verdict.ok) {
    const failRow = buildPipelineRunRow({
      cropYear: context.crop_year,
      grainWeek: context.grain_week,
      status: "failed",
      grainsRequested: marketListFor(side),
      grainsFailed: marketListFor(side),
      failureDetails: {
        routine: routineFor(side),
        reason: "stale_upstream_data",
        breached_slas: verdict.breached,
        ages: Object.fromEntries(verdict.checks.map((c) => [c.name, c.ageDays])),
        week_ending: context.week_ending ?? null,
      },
    });
    await insertPipelineRun(client, failRow);
    diag(`PREFLIGHT ABORT (${side}): stale upstream data — breached: ${verdict.breached.join(", ")}`);
    emit({ side, context, freshness: verdict, aborted: true });
    return 1;
  }

  diag(`preflight OK (${side}): context resolved, all freshness SLAs within bounds`);
  emit({ side, context, freshness: verdict, aborted: false });
  return 0;
}

async function cmdResolve(side: DeskSide, client: SupabaseClient): Promise<number> {
  const now = new Date();
  const context = side === "cad" ? await resolveCadContext(client) : await resolveUsContext(client, now);
  emit({ side, context });
  return 0;
}

function parseKv(s: string): [string, string] {
  const i = s.indexOf("=");
  if (i < 0) throw new Error(`expected col=value, got "${s}"`);
  return [s.slice(0, i), s.slice(i + 1)];
}

function parseOrder(s: string | undefined): TableReadSpec["order"] {
  if (!s) return undefined;
  const [column, dir] = s.split(".");
  return { column, ascending: (dir ?? "asc") !== "desc" };
}

async function cmdRead(client: SupabaseClient, p: ParsedArgs): Promise<number> {
  const rpc = strFlag(p, "rpc");
  const table = strFlag(p, "table");
  if (rpc) {
    const argsRaw = strFlag(p, "args");
    const args = argsRaw ? (JSON.parse(argsRaw) as Record<string, unknown>) : {};
    const data = await runRpcRead(client, rpc, args);
    emit({ source: `rpc:${rpc}`, args, data });
    return 0;
  }
  if (table) {
    const limitRaw = strFlag(p, "limit");
    const spec: TableReadSpec = {
      table,
      select: strFlag(p, "select"),
      eq: listFlag(p, "eq").map(parseKv),
      gte: listFlag(p, "gte").map(parseKv),
      order: parseOrder(strFlag(p, "order")),
      limit: limitRaw ? Number(limitRaw) : undefined,
    };
    const data = await runTableRead(client, spec);
    emit({ source: `table:${table}`, spec, data });
    return 0;
  }
  throw new Error("read requires --rpc <name> or --table <name>");
}

async function cmdKnowledge(client: SupabaseClient, p: ParsedArgs): Promise<number> {
  const query = strFlag(p, "query");
  if (!query) throw new Error("knowledge requires --query");
  const grain = strFlag(p, "grain") ?? strFlag(p, "market") ?? null;
  const topics = (strFlag(p, "topics") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const limitRaw = strFlag(p, "limit");
  const limit = limitRaw ? Number(limitRaw) : 3;
  const data = await runRpcRead(client, "get_knowledge_context", {
    p_query: query,
    p_grain: grain,
    p_topics: topics,
    p_limit: limit,
  });
  emit({ source: "rpc:get_knowledge_context", query, grain, topics, limit, data });
  return 0;
}

interface WritePlan {
  analysisTable: string;
  analysisConflict: string;
  analysisRows: Record<string, unknown>[];
  trajectoryTable: string;
  trajectoryRows: Record<string, unknown>[];
  pipelineRow: Record<string, unknown>;
  trajectoryScope: {
    cropYear: string;
    weekCol: string;
    weekVal: string | number;
    nameCol: string;
    names: string[];
    recordedAtFloor?: string;
  };
}

function buildWritePlan(env: WriteEnvelope): WritePlan {
  if (env.side === "cad") {
    const ctx = { cropYear: env.crop_year, grainWeek: env.grain_week };
    const names = env.rows.map((r) => r.grain);
    return {
      analysisTable: "market_analysis",
      analysisConflict: CAD_ANALYSIS_CONFLICT,
      analysisRows: env.rows.map((r) => buildMarketAnalysisRow(r, ctx)),
      trajectoryTable: "score_trajectory",
      trajectoryRows: env.rows.map((r) => buildCadTrajectoryRow(r, ctx) as unknown as Record<string, unknown>),
      pipelineRow: buildPipelineRunRow({
        cropYear: env.crop_year,
        grainWeek: env.grain_week,
        status: "completed",
        grainsRequested: env.grains_requested ?? marketListFor("cad"),
        grainsCompleted: names,
      }),
      trajectoryScope: { cropYear: env.crop_year, weekCol: "grain_week", weekVal: env.grain_week, nameCol: "grain", names },
    };
  }
  const ctx = { cropYear: env.crop_year, marketYear: env.market_year, weekEnding: env.week_ending };
  const names = env.rows.map((r) => r.market_name);
  return {
    analysisTable: "us_market_analysis",
    analysisConflict: US_ANALYSIS_CONFLICT,
    analysisRows: env.rows.map((r) => buildUsMarketAnalysisRow(r, ctx)),
    trajectoryTable: "us_score_trajectory",
    trajectoryRows: env.rows.map((r) => buildUsTrajectoryRow(r, ctx)),
    pipelineRow: buildPipelineRunRow({
      cropYear: env.crop_year,
      grainWeek: isoWeekNumber(new Date(`${env.week_ending}T00:00:00Z`)),
      status: "completed",
      grainsRequested: env.grains_requested ?? marketListFor("us"),
      grainsCompleted: names,
    }),
    trajectoryScope: {
      cropYear: env.crop_year,
      weekCol: "market_year",
      weekVal: env.market_year,
      nameCol: "market_name",
      names,
      recordedAtFloor: usTrajectoryDeleteBound(env.week_ending),
    },
  };
}

function planSummary(plan: WritePlan): Record<string, unknown> {
  return {
    analysis_table: plan.analysisTable,
    analysis_conflict: plan.analysisConflict,
    analysis_rows: plan.analysisRows.length,
    trajectory_table: plan.trajectoryTable,
    trajectory_rows: plan.trajectoryRows.length,
    markets: plan.trajectoryScope.names,
    trajectory_delete_floor: plan.trajectoryScope.recordedAtFloor ?? null,
    pipeline_status: plan.pipelineRow.status,
  };
}

async function performWrites(client: SupabaseClient, plan: WritePlan): Promise<Record<string, unknown>> {
  const nowIso = new Date().toISOString();
  const analysisRows = plan.analysisRows.map((r) => ({ ...r, generated_at: nowIso }));
  const up = await client.from(plan.analysisTable).upsert(analysisRows, { onConflict: plan.analysisConflict });
  if (up.error) throw new Error(`${plan.analysisTable} upsert failed: ${up.error.message}`);

  // Idempotent weekly anchor: clear this run's weekly_debate rows, then insert.
  // US has no week column — recordedAtFloor bounds the delete to this run's week so a
  // re-run cannot wipe prior Fridays' anchors (H-1, 2026-07-02 security audit).
  let delQuery = client
    .from(plan.trajectoryTable)
    .delete()
    .eq("crop_year", plan.trajectoryScope.cropYear)
    .eq(plan.trajectoryScope.weekCol, plan.trajectoryScope.weekVal)
    .eq("scan_type", WEEKLY_SCAN_TYPE)
    .in(plan.trajectoryScope.nameCol, plan.trajectoryScope.names);
  if (plan.trajectoryScope.recordedAtFloor) {
    delQuery = delQuery.gte("recorded_at", plan.trajectoryScope.recordedAtFloor);
  }
  const del = await delQuery;
  if (del.error) throw new Error(`${plan.trajectoryTable} delete failed: ${del.error.message}`);
  const ins = await client.from(plan.trajectoryTable).insert(plan.trajectoryRows);
  if (ins.error) throw new Error(`${plan.trajectoryTable} insert failed: ${ins.error.message}`);

  await insertPipelineRun(client, plan.pipelineRow);
  return {
    analysis_upserted: analysisRows.length,
    trajectory_written: plan.trajectoryRows.length,
    pipeline_logged: true,
  };
}

async function cmdWrite(side: DeskSide, client: SupabaseClient, p: ParsedArgs): Promise<number> {
  const inputPath = strFlag(p, "input");
  const raw =
    !inputPath || inputPath === "-" ? readFileSync(0, "utf-8") : readFileSync(inputPath, "utf-8");
  const env = writeEnvelope.parse(JSON.parse(raw));
  if (env.side !== side) {
    throw new Error(`--side ${side} does not match envelope.side=${env.side}`);
  }

  // Guard published history: the envelope must target the CURRENT resolved context
  // unless --allow-historical is passed (M-2, 2026-07-02 security audit).
  if (!boolFlag(p, "allow-historical")) {
    const ctx =
      env.side === "cad" ? await resolveCadContext(client) : await resolveUsContext(client, new Date());
    const mismatches: string[] = [];
    if (env.crop_year !== ctx.crop_year) {
      mismatches.push(`crop_year ${env.crop_year} != current ${ctx.crop_year}`);
    }
    if (env.side === "cad") {
      if (env.grain_week !== ctx.grain_week) {
        mismatches.push(`grain_week ${env.grain_week} != current ${ctx.grain_week}`);
      }
    } else {
      if (env.market_year !== ctx.market_year) {
        mismatches.push(`market_year ${env.market_year} != current ${ctx.market_year}`);
      }
      if (env.week_ending !== ctx.week_ending) {
        mismatches.push(`week_ending ${env.week_ending} != current ${ctx.week_ending}`);
      }
    }
    if (mismatches.length > 0) {
      throw new Error(
        `write envelope does not match the current resolved context (${mismatches.join("; ")}). ` +
          "Re-run preflight and rebuild the envelope, or pass --allow-historical for a deliberate historical correction.",
      );
    }
  }

  const plan = buildWritePlan(env);

  if (!boolFlag(p, "write")) {
    emit({
      mode: "dry-run",
      side,
      summary: planSummary(plan),
      sample_analysis_row: plan.analysisRows[0],
      sample_trajectory_row: plan.trajectoryRows[0],
      note: "no database writes performed — pass --write with --approve \"<phrase>\" to persist",
    });
    return 0;
  }

  const approval = strFlag(p, "approve") ?? process.env.DESK_WRITE_APPROVAL;
  if (approval !== DESK_WRITE_APPROVAL_PHRASE) {
    diag(
      'WRITE BLOCKED: missing/incorrect approval. Provide --approve "<phrase>" or DESK_WRITE_APPROVAL env (see --help).',
    );
    return 3;
  }

  const result = await performWrites(client, plan);
  diag(`desk write OK (${side}): ${JSON.stringify(result)}`);
  emit({ mode: "write", side, result });
  return 0;
}

async function cmdFail(side: DeskSide, client: SupabaseClient, p: ParsedArgs): Promise<number> {
  const reason = strFlag(p, "reason") ?? "unspecified";
  const status = assertFailStatus(strFlag(p, "status") ?? "failed");
  const detailsFlag = strFlag(p, "details");
  const detailsRaw = detailsFlag === "-" ? readFileSync(0, "utf-8") : detailsFlag;
  const details = detailsRaw ? (JSON.parse(detailsRaw) as Record<string, unknown>) : {};

  const cropYearFlag = strFlag(p, "crop-year");
  const grainWeekFlag = strFlag(p, "grain-week");
  let context: RunContext;
  if (cropYearFlag && grainWeekFlag) {
    context = { crop_year: cropYearFlag, grain_week: Number(grainWeekFlag) };
  } else if (side === "cad") {
    context = await resolveCadContext(client);
  } else {
    context = await resolveUsContext(client, new Date());
  }

  const row = buildPipelineRunRow({
    cropYear: context.crop_year,
    grainWeek: context.grain_week,
    status,
    grainsRequested: marketListFor(side),
    grainsFailed: status === "failed" ? marketListFor(side) : [],
    failureDetails: { routine: routineFor(side), reason, ...details },
  });
  await insertPipelineRun(client, row);
  diag(`desk ${status} logged (${side}): ${reason}`);
  emit({ logged: true, status, reason, context });
  return 0;
}

const WINDOWS_SHIMS = new Set(["npm", "npx", "tsx", "pnpm", "yarn"]);
function needsWindowsShell(command: string): boolean {
  return (
    process.platform === "win32" &&
    (WINDOWS_SHIMS.has(command.toLowerCase()) ||
      command.toLowerCase().endsWith(".cmd") ||
      command.toLowerCase().endsWith(".bat"))
  );
}

function runChild(command: string, args: string[], label: string): Promise<number> {
  return new Promise((resolve) => {
    diag(`[${label}] started: ${[command, ...args].join(" ")}`);
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      shell: needsWindowsShell(command),
    });
    child.on("error", (err) => {
      diag(`[${label}] failed to start: ${err.message}`);
      resolve(127);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function cmdPostcheck(): Promise<number> {
  const steps = [
    { command: "npx", args: ["tsx", "scripts/check-desk-freshness.ts"], label: "check-desk-freshness" },
    {
      command: "npx",
      args: ["tsx", "scripts/refresh-thesis-packet-cache.ts", "--force"],
      label: "refresh-thesis-cache",
    },
  ];
  for (const step of steps) {
    const code = await runChild(step.command, step.args, step.label);
    if (code !== 0) {
      diag(`postcheck step "${step.label}" failed (exit ${code})`);
      return code;
    }
  }
  emit({ postcheck: "ok" });
  return 0;
}

async function main(argv = process.argv.slice(2)): Promise<number> {
  const p = parseArgs(argv);
  if (boolFlag(p, "help") || p.command === null) {
    diag(HELP);
    return p.command === null ? 2 : 0;
  }

  if (p.command === "postcheck") {
    return cmdPostcheck();
  }

  const side = assertDeskSide(p.side);
  const client = createAdminClient();

  switch (p.command) {
    case "preflight":
      return cmdPreflight(side, client);
    case "resolve":
      return cmdResolve(side, client);
    case "read":
      return cmdRead(client, p);
    case "knowledge":
      return cmdKnowledge(client, p);
    case "write":
      return cmdWrite(side, client, p);
    case "fail":
      return cmdFail(side, client, p);
    default:
      diag(`unknown command: ${p.command}`);
      diag(HELP);
      return 2;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    diag(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exit(1);
  });
