/**
 * Friday Grain Desk Weekly Run Audit
 * Verifies the 2026-04-24 Friday swarm produced expected writes.
 *
 * Usage: npx tsx scripts/audit-grain-desk-weekly.ts [--since YYYY-MM-DD]
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) throw new Error(".env.local missing");
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^"|"$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !KEY) throw new Error("Supabase env missing");

const sinceArg = process.argv.find((a) => a.startsWith("--since="))?.split("=")[1];
const SINCE = sinceArg ?? "2026-04-23";

async function pg(path: string): Promise<any[]> {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: "count=exact" },
  });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

const CANONICAL_16 = [
  "Amber Durum", "Barley", "Beans", "Canaryseed", "Canola", "Chick Peas",
  "Corn", "Flaxseed", "Lentils", "Mustard Seed", "Oats", "Peas", "Rye",
  "Soybeans", "Sunflower", "Wheat",
];

async function main() {
  const report: any = { since: SINCE, generated_at: new Date().toISOString() };

  // 1. market_analysis writes since SINCE
  const ma = await pg(
    `market_analysis?generated_at=gte.${SINCE}&select=grain,grain_week,crop_year,model_used,data_confidence,generated_at&order=generated_at.desc`
  );
  report.market_analysis = {
    total_rows: ma.length,
    by_model: countBy(ma, "model_used"),
    by_grain_week: countBy(ma, (r) => `${r.crop_year}-w${r.grain_week}`),
    grains_covered: uniq(ma.map((r) => r.grain)).sort(),
    missing_canonical_16: CANONICAL_16.filter((g) => !ma.some((r) => r.grain === g)),
    latest_row: ma[0] ?? null,
    earliest_row: ma[ma.length - 1] ?? null,
  };

  // 2. score_trajectory writes since SINCE - weekly_debate
  const st = await pg(
    `score_trajectory?recorded_at=gte.${SINCE}&select=grain,grain_week,crop_year,scan_type,model_source,stance_score,recommendation,data_freshness,recorded_at&order=recorded_at.desc`
  );
  report.score_trajectory = {
    total_rows: st.length,
    by_scan_type: countBy(st, "scan_type"),
    by_model_source: countBy(st, "model_source"),
    weekly_debate_rows: st.filter((r) => r.scan_type === "weekly_debate").length,
    weekly_debate_grains: uniq(st.filter((r) => r.scan_type === "weekly_debate").map((r) => r.grain)).sort(),
    weekly_debate_missing: CANONICAL_16.filter(
      (g) => !st.some((r) => r.scan_type === "weekly_debate" && r.grain === g)
    ),
    latest_row: st[0] ?? null,
  };

  // 3. desk_performance_reviews (Saturday meta-review)
  try {
    const rev = await pg(
      `desk_performance_reviews?created_at=gte.${SINCE}&select=*&order=created_at.desc&limit=10`
    );
    report.desk_performance_reviews = {
      total: rev.length,
      latest: rev[0] ?? null,
      summary: rev.map((r: any) => ({
        created_at: r.created_at,
        review_for_week: r.review_for_week ?? r.review_for ?? r.grain_week,
        keys: Object.keys(r),
      })),
    };
  } catch (e: any) {
    report.desk_performance_reviews = { error: e.message };
  }

  // 4. pipeline_runs since SINCE
  try {
    const runs = await pg(
      `pipeline_runs?started_at=gte.${SINCE}&select=*&order=started_at.desc&limit=20`
    );
    report.pipeline_runs = {
      total: runs.length,
      summary: runs.map((r: any) => ({
        started_at: r.started_at,
        finished_at: r.finished_at,
        status: r.status,
        triggered_by: r.triggered_by,
        run_type: r.run_type ?? r.type,
        grains: r.grains_processed ?? r.grain_count,
        error: r.error_message,
      })),
    };
  } catch (e: any) {
    report.pipeline_runs = { error: e.message };
  }

  // 5. CGC data freshness — what week SHOULD the swarm have anchored to?
  const cgc = await pg(
    `cgc_observations?crop_year=eq.2025-2026&select=grain_week&order=grain_week.desc&limit=1`
  );
  report.cgc_latest_week = cgc[0]?.grain_week ?? null;

  // 6. Any other writes from related tables?
  try {
    const us = await pg(
      `us_market_analysis?generated_at=gte.${SINCE}&select=market,marketing_year,generated_at,model_used&order=generated_at.desc`
    );
    report.us_market_analysis = {
      total: us.length,
      grains: uniq(us.map((r: any) => r.market)).sort(),
      models: countBy(us, "model_used"),
      latest: us[0] ?? null,
    };
  } catch (e: any) {
    report.us_market_analysis = { error: e.message };
  }

  console.log(JSON.stringify(report, null, 2));
}

function countBy<T>(arr: T[], key: keyof T | ((x: T) => string)): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of arr) {
    const k = typeof key === "function" ? key(x) : String((x as any)[key] ?? "null");
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
function uniq<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }

main().catch((e) => { console.error(e); process.exit(1); });
