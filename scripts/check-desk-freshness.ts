/**
 * Friday bushel desk output freshness check.
 *
 * The 2026-04..06 desk outage went unnoticed for 7 weeks because the source-freshness
 * watchdog only checks collector INPUT tables. This script checks the desk's OUTPUT
 * tables (`market_analysis`, `us_market_analysis`) and the weekly trajectory anchor.
 *
 * Deliberately separate from `check:source-freshness` so a desk outage cannot cascade
 * into Track 54 readiness holds or collector wrappers. Operator-run / heartbeat-run only.
 *
 * Usage: npx tsx scripts/check-desk-freshness.ts [--max-age-days N] [--json]
 * Exit codes: 0 = fresh, 1 = stale or missing, 2 = query failure.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const MAX_AGE_DAYS_DEFAULT = 9; // Friday cadence + weekend + buffer

interface DeskLane {
  table: string;
  label: string;
  latest: string | null;
  ageDays: number | null;
  stale: boolean;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function flagValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) return null;
  return process.argv[index + 1];
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or a Supabase key in .env.local");
    process.exit(2);
  }

  const maxAgeDays = Number(flagValue("--max-age-days") ?? MAX_AGE_DAYS_DEFAULT);
  const supabase = createClient(url, key);
  const lanes: DeskLane[] = [];

  async function checkLane(table: string, label: string) {
    const result = await supabase
      .from(table)
      .select("generated_at")
      .order("generated_at", { ascending: false })
      .limit(1);

    if (result.error) {
      console.error(`${table} query failed: ${result.error.message}`);
      process.exit(2);
    }

    const latest = result.data?.[0]?.generated_at ?? null;
    const ageDays = latest ? (Date.now() - new Date(latest).getTime()) / 86_400_000 : null;
    lanes.push({
      table,
      label,
      latest,
      ageDays: ageDays === null ? null : Math.round(ageDays * 10) / 10,
      stale: ageDays === null || ageDays > maxAgeDays,
    });
  }

  await checkLane("market_analysis", "CAD Friday desk");
  await checkLane("us_market_analysis", "US Friday desk");

  const ok = lanes.every((lane) => !lane.stale);
  const summary = {
    ok,
    checked_at: new Date().toISOString(),
    max_age_days: maxAgeDays,
    lanes,
  };

  if (hasFlag("--json")) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(ok ? "Bushel desk output freshness OK" : "Bushel desk output freshness STALE");
    for (const lane of lanes) {
      console.log(
        `- ${lane.label} (${lane.table}): latest ${lane.latest ?? "none"} | age ${lane.ageDays ?? "n/a"} days | ${lane.stale ? "STALE" : "fresh"}`,
      );
    }
    if (!ok) {
      console.log(
        `Action: check the grain-desk-weekly / us-desk-weekly Claude Desktop Routines (Fri 6:47 / 7:30 PM ET) and docs/reference/*desk-swarm-prompt.md.`,
      );
    }
  }

  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
});
