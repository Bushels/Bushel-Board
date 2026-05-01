/**
 * One-off query: latest USDA crop progress per market for the infographic.
 * Run: npx tsx scripts/query-latest-crop-progress.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(url, key);

async function main() {
  const { data: latest } = await supabase
    .from("usda_crop_progress")
    .select("week_ending")
    .eq("state", "US TOTAL")
    .order("week_ending", { ascending: false })
    .limit(1)
    .single();

  const latestWeek = latest?.week_ending;
  process.stderr.write(`Latest week_ending: ${latestWeek}\n`);

  const { data, error } = await supabase
    .from("usda_crop_progress")
    .select(
      "market_name, cgc_grain, state, week_ending, planted_pct, emerged_pct, planted_pct_vs_avg, good_excellent_pct, ge_pct_yoy_change, condition_index, nass_load_time, harvested_pct"
    )
    .eq("state", "US TOTAL")
    .eq("week_ending", latestWeek)
    .order("market_name");

  if (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exit(1);
  }

  console.log(JSON.stringify({ latestWeek, rows: data }, null, 2));
}

main().catch((e) => {
  process.stderr.write(`Fatal: ${e}\n`);
  process.exit(1);
});
