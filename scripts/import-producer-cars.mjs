#!/usr/bin/env node
/**
 * Manual trigger: Import Producer Car Allocations from CGC CSV
 *
 * Usage: node scripts/import-producer-cars.mjs
 *
 * Fetches the CGC Producer Car CSV, parses it, and upserts into
 * the producer_car_allocations table via Supabase service role.
 */

import { createClient } from "@supabase/supabase-js";

// -- Config --
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  console.error("Run: source .env.local && node scripts/import-producer-cars.mjs");
  process.exit(1);
}

// -- Grain mappings --
const GRAIN_NAME_MAP = { Oat: "Oats", Lentil: "Lentils" };
const SKIP_GRAINS = new Set(["Buckwheat"]);
const PROVINCE_MAP = {
  Manitoba: "mb",
  Saskatchewan: "sk",
  "Alberta/B.C.": "ab_bc",
};

function getCurrentCropYear() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 8) return `${year}-${year + 1}`;
  return `${year - 1}-${year}`;
}

function normalizeGrain(csvGrain) {
  if (SKIP_GRAINS.has(csvGrain)) return null;
  return GRAIN_NAME_MAP[csvGrain] || csvGrain;
}

function classifyDestination(destination, country) {
  if (country === "United States") return "united_states";
  const dl = destination.toLowerCase();
  if (dl.includes("pacific")) return "pacific";
  if (dl.includes("thunder bay")) return "thunder_bay";
  if (dl.includes("bay") && dl.includes("lake")) return "bay_lakes";
  if (dl.includes("process")) return "process_elevators";
  if (country === "Canada Licensed") return "canada_licensed";
  if (country === "Canada Unlicensed") return "canada_unlicensed";
  return "unknown";
}

async function main() {
  const cropYear = getCurrentCropYear();
  console.log(`Fetching CGC Producer Car CSV for ${cropYear}...`);

  const url = `https://www.grainscanada.gc.ca/en/grain-research/statistics/producer-car/${cropYear}/pca-hwp-en.csv`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText} from ${url}`);
  }
  const csvText = await resp.text();
  const lines = csvText.trim().split("\n");
  console.log(`Fetched ${lines.length - 1} CSV data rows`);

  // Parse CSV rows
  const csvRows = lines.slice(1).map((line) => {
    const p = line.split(",");
    return {
      cropYear: (p[0] || "").trim(),
      shipWeek: parseInt((p[1] || "0").trim(), 10),
      weekEndingDate: (p[2] || "").trim(),
      workSheet: (p[3] || "").trim(),
      province: (p[4] || "").trim(),
      grain: (p[5] || "").trim(),
      destination: (p[6] || "").trim(),
      country: (p[7] || "").trim(),
      carsAllocated: parseInt((p[8] || "0").trim(), 10),
    };
  });

  // Aggregate by grain+week
  const weekMap = new Map();

  for (const row of csvRows) {
    const grain = normalizeGrain(row.grain);
    if (!grain) continue;

    const key = `${grain}|${row.shipWeek}`;
    if (!weekMap.has(key)) {
      weekMap.set(key, {
        grain,
        week: row.shipWeek,
        summaryTotal: 0,
        provinces: {},
        destinations: {
          pacific: 0, thunder_bay: 0, bay_lakes: 0,
          process_elevators: 0, canada_licensed: 0,
          canada_unlicensed: 0, united_states: 0, unknown: 0,
        },
      });
    }

    const wd = weekMap.get(key);
    switch (row.workSheet) {
      case "Summary":
        wd.summaryTotal = row.carsAllocated;
        break;
      case "Province": {
        const prov = PROVINCE_MAP[row.province];
        if (prov) wd.provinces[prov] = (wd.provinces[prov] || 0) + row.carsAllocated;
        break;
      }
      case "Destination": {
        const bucket = classifyDestination(row.destination, row.country);
        wd.destinations[bucket] += row.carsAllocated;
        break;
      }
    }
  }

  // Build DB rows with cumulative CY totals
  const grains = [...new Set([...weekMap.values()].map((d) => d.grain))];
  const result = [];

  for (const grain of grains) {
    const grainWeeks = [...weekMap.values()]
      .filter((d) => d.grain === grain)
      .sort((a, b) => a.week - b.week);

    let cyMb = 0, cySk = 0, cyAbBc = 0, cyTotal = 0;

    for (const wd of grainWeeks) {
      const weekMb = wd.provinces["mb"] || 0;
      const weekSk = wd.provinces["sk"] || 0;
      const weekAbBc = wd.provinces["ab_bc"] || 0;

      cyMb += weekMb;
      cySk += weekSk;
      cyAbBc += weekAbBc;
      cyTotal += wd.summaryTotal;

      result.push({
        crop_year: cropYear,
        grain_week: wd.week,
        grain,
        week_cars: wd.summaryTotal,
        cy_cars_manitoba: cyMb,
        cy_cars_saskatchewan: cySk,
        cy_cars_alberta_bc: cyAbBc,
        cy_cars_total: cyTotal,
        dest_canada_licensed: wd.destinations.canada_licensed,
        dest_canada_unlicensed: wd.destinations.canada_unlicensed,
        dest_united_states: wd.destinations.united_states,
        dest_unknown: wd.destinations.unknown,
        dest_pacific: wd.destinations.pacific,
        dest_process_elevators: wd.destinations.process_elevators,
        dest_thunder_bay: wd.destinations.thunder_bay,
        dest_bay_lakes: wd.destinations.bay_lakes,
        source_notes: "CGC Producer Car Allocation CSV",
      });
    }
  }

  console.log(`Parsed ${result.length} rows for ${grains.length} grains`);
  console.log(`Grains: ${grains.join(", ")}`);

  // Upsert to Supabase
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const BATCH_SIZE = 50;
  let upserted = 0;
  const errors = [];

  for (let i = 0; i < result.length; i += BATCH_SIZE) {
    const batch = result.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("producer_car_allocations")
      .upsert(batch, { onConflict: "crop_year,grain_week,grain" });

    if (error) {
      errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
      console.error(`Batch error:`, error.message);
    } else {
      upserted += batch.length;
    }
  }

  console.log(`\nResults:`);
  console.log(`  Rows parsed: ${result.length}`);
  console.log(`  Rows upserted: ${upserted}`);
  console.log(`  Errors: ${errors.length}`);
  if (errors.length > 0) {
    console.error(`  Error details:`, errors);
  }

  // Quick verification
  const { data: verify, error: verifyErr } = await supabase
    .from("producer_car_allocations")
    .select("grain, grain_week, cy_cars_total, week_cars")
    .eq("crop_year", cropYear)
    .order("grain_week", { ascending: false })
    .order("grain")
    .limit(20);

  if (verifyErr) {
    console.error("Verification query failed:", verifyErr.message);
  } else {
    console.log(`\nLatest rows (top 20):`);
    console.table(verify);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
