/**
 * Producer Car CSV Parser
 *
 * Parses the CGC Weekly Producer Car Allocation CSV from:
 * https://www.grainscanada.gc.ca/en/grain-research/statistics/producer-car/{cropYear}/pca-hwp-en.csv
 *
 * CSV columns: CropYr, ShipWeek, Week_ending_date, WorkSheet, Province, Grain, Destination, Country, Cars_Allocated
 * WorkSheet types: Summary, Province, Destination
 */

/** Map CSV grain names to canonical grains table names */
const GRAIN_NAME_MAP: Record<string, string> = {
  Oat: "Oats",
  Lentil: "Lentils",
};

/** Grains to skip (not in our grains table) */
const SKIP_GRAINS = new Set(["Buckwheat"]);

/** Province name normalization */
const PROVINCE_MAP: Record<string, "mb" | "sk" | "ab_bc"> = {
  Manitoba: "mb",
  Saskatchewan: "sk",
  "Alberta/B.C.": "ab_bc",
};

/** Destination aggregation buckets */
type DestBucket =
  | "pacific"
  | "thunder_bay"
  | "bay_lakes"
  | "process_elevators"
  | "st_lawrence"
  | "canada_licensed"
  | "canada_unlicensed"
  | "united_states"
  | "unknown";

interface CsvRow {
  cropYear: string;
  shipWeek: number;
  weekEndingDate: string;
  workSheet: string;
  province: string;
  grain: string;
  destination: string;
  country: string;
  carsAllocated: number;
}

export interface ProducerCarRow {
  crop_year: string;
  grain_week: number;
  grain: string;
  week_cars: number;
  cy_cars_manitoba: number;
  cy_cars_saskatchewan: number;
  cy_cars_alberta_bc: number;
  cy_cars_total: number;
  dest_canada_licensed: number;
  dest_canada_unlicensed: number;
  dest_united_states: number;
  dest_unknown: number;
  dest_pacific: number;
  dest_process_elevators: number;
  dest_thunder_bay: number;
  dest_bay_lakes: number;
  source_notes: string;
}

/** Fetch the cumulative CSV from CGC */
export async function fetchProducerCarCsv(
  cropYear: string
): Promise<string> {
  const url = `https://www.grainscanada.gc.ca/en/grain-research/statistics/producer-car/${cropYear}/pca-hwp-en.csv`;
  console.log(`[producer-car-parser] Fetching ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch Producer Car CSV: ${response.status} ${response.statusText}`
    );
  }

  return response.text();
}

/** Parse CSV text into typed rows */
function parseCsvRows(csvText: string): CsvRow[] {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return [];

  // Skip header row
  return lines.slice(1).map((line) => {
    const parts = line.split(",");
    return {
      cropYear: parts[0]?.trim() ?? "",
      shipWeek: parseInt(parts[1]?.trim() ?? "0", 10),
      weekEndingDate: parts[2]?.trim() ?? "",
      workSheet: parts[3]?.trim() ?? "",
      province: parts[4]?.trim() ?? "",
      grain: parts[5]?.trim() ?? "",
      destination: parts[6]?.trim() ?? "",
      country: parts[7]?.trim() ?? "",
      carsAllocated: parseInt(parts[8]?.trim() ?? "0", 10),
    };
  });
}

/** Normalize grain name to canonical form */
function normalizeGrain(csvGrain: string): string | null {
  if (SKIP_GRAINS.has(csvGrain)) return null;
  return GRAIN_NAME_MAP[csvGrain] ?? csvGrain;
}

/** Classify a destination row into our bucket system */
function classifyDestination(
  destination: string,
  country: string
): DestBucket {
  if (country === "United States") return "united_states";

  const destLower = destination.toLowerCase();
  if (destLower.includes("pacific")) return "pacific";
  if (destLower.includes("thunder bay")) return "thunder_bay";
  if (destLower.includes("bay") && destLower.includes("lake"))
    return "bay_lakes";
  if (destLower.includes("process")) return "process_elevators";
  if (destLower.includes("st. lawrence") || destLower.includes("st lawrence"))
    return "pacific"; // St. Lawrence grouped with eastbound routes

  // Classify by licensed/unlicensed status
  if (country === "Canada Licensed") return "canada_licensed";
  if (country === "Canada Unlicensed") return "canada_unlicensed";

  return "unknown";
}

/** Parse CSV and produce database-ready rows with cumulative CY totals */
export function parseProducerCarCsv(csvText: string): ProducerCarRow[] {
  const csvRows = parseCsvRows(csvText);
  if (csvRows.length === 0) return [];

  const cropYear = csvRows[0].cropYear;

  // Group rows by (grain, week, worksheet)
  type WeekKey = string; // "grain|week"
  interface WeekData {
    grain: string;
    week: number;
    summaryTotal: number;
    provinces: Record<string, number>;
    destinations: Record<DestBucket, number>;
  }

  const weekMap = new Map<WeekKey, WeekData>();

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
          pacific: 0,
          thunder_bay: 0,
          bay_lakes: 0,
          process_elevators: 0,
          st_lawrence: 0,
          canada_licensed: 0,
          canada_unlicensed: 0,
          united_states: 0,
          unknown: 0,
        },
      });
    }

    const weekData = weekMap.get(key)!;

    switch (row.workSheet) {
      case "Summary":
        weekData.summaryTotal = row.carsAllocated;
        break;
      case "Province": {
        const prov = PROVINCE_MAP[row.province];
        if (prov) {
          weekData.provinces[prov] =
            (weekData.provinces[prov] ?? 0) + row.carsAllocated;
        }
        break;
      }
      case "Destination": {
        const bucket = classifyDestination(row.destination, row.country);
        weekData.destinations[bucket] += row.carsAllocated;

        // Also tally licensed/unlicensed separately
        if (
          row.country === "Canada Licensed" &&
          bucket !== "canada_licensed"
        ) {
          weekData.destinations.canada_licensed += row.carsAllocated;
        } else if (
          row.country === "Canada Unlicensed" &&
          bucket !== "canada_unlicensed"
        ) {
          weekData.destinations.canada_unlicensed += row.carsAllocated;
        }
        break;
      }
    }
  }

  // Get all unique grains
  const grains = [...new Set([...weekMap.values()].map((d) => d.grain))];

  // For each grain, sort weeks and compute CY cumulative totals
  const result: ProducerCarRow[] = [];

  for (const grain of grains) {
    const grainWeeks = [...weekMap.values()]
      .filter((d) => d.grain === grain)
      .sort((a, b) => a.week - b.week);

    let cyMb = 0;
    let cySk = 0;
    let cyAbBc = 0;
    let cyTotal = 0;

    for (const wd of grainWeeks) {
      const weekMb = wd.provinces["mb"] ?? 0;
      const weekSk = wd.provinces["sk"] ?? 0;
      const weekAbBc = wd.provinces["ab_bc"] ?? 0;

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
        source_notes: `CGC Producer Car Allocation CSV`,
      });
    }
  }

  console.log(
    `[producer-car-parser] Parsed ${result.length} rows for ${grains.length} grains across ${
      new Set(result.map((r) => r.grain_week)).size
    } weeks`
  );

  return result;
}
