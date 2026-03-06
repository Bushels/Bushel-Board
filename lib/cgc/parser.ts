/**
 * CGC CSV Parser
 *
 * Parses Canadian Grain Commission weekly grain statistics CSV files
 * into typed rows suitable for Supabase insertion.
 *
 * CSV columns: Crop Year, Grain Week, Week Ending Date, worksheet,
 *              metric, period, grain, grade, Region, Ktonnes
 *
 * Date format in CSV is DD/MM/YYYY — converted to ISO YYYY-MM-DD for Postgres.
 */

export interface CgcRow {
  crop_year: string;
  grain_week: number;
  week_ending_date: string; // ISO date YYYY-MM-DD
  worksheet: string;
  metric: string;
  period: string;
  grain: string;
  grade: string;
  region: string;
  ktonnes: number;
}

/**
 * Parse a CGC CSV string into typed rows.
 * Handles the DD/MM/YYYY date format used by grainscanada.gc.ca.
 * Skips malformed lines (< 10 columns) and empty lines.
 * Handles both quoted (2024-2025) and unquoted (2025-2026) CSV formats.
 */
export function parseCgcCsv(csvText: string): CgcRow[] {
  const strip = (s: string) => s.trim().replace(/^"|"$/g, "");

  const lines = csvText.trim().split("\n");
  // Skip header row (line 0)
  const rows: CgcRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // NOTE: Simple comma split — CGC data does not contain commas inside fields.
    // If CGC changes their format to include intra-field commas, this needs
    // a proper RFC 4180 parser. See also the Edge Function copy.
    const parts = line.split(",");
    if (parts.length < 10) continue;

    const cropYear = strip(parts[0]);
    const grainWeek = strip(parts[1]);
    const dateStr = strip(parts[2]);
    const worksheet = strip(parts[3]);
    const metric = strip(parts[4]);
    const period = strip(parts[5]);
    const grain = strip(parts[6]);
    const grade = strip(parts[7] || "");
    const region = strip(parts[8]);
    const ktonnes = strip(parts[9]);

    // Convert DD/MM/YYYY to YYYY-MM-DD
    const dateParts = dateStr.split("/");
    const isoDate =
      dateParts.length === 3
        ? `${dateParts[2]}-${dateParts[1].padStart(2, "0")}-${dateParts[0].padStart(2, "0")}`
        : dateStr;

    rows.push({
      crop_year: cropYear,
      grain_week: parseInt(grainWeek, 10),
      week_ending_date: isoDate,
      worksheet: worksheet,
      metric: metric,
      period: period,
      grain: grain,
      grade: grade,
      region: region,
      ktonnes: parseFloat(ktonnes) || 0,
    });
  }

  return rows;
}

/**
 * Get the current CGC crop year string (e.g. "2025-2026").
 * Crop year starts August 1.
 */
export function getCurrentCropYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed: 7 = August
  if (month >= 7) {
    return `${year}-${year + 1}`;
  }
  return `${year - 1}-${year}`;
}

/**
 * Estimate the current grain week number.
 * Week 1 ends on the first Wednesday after August 1.
 * This is an approximation — actual week boundaries are set by CGC.
 */
export function getCurrentGrainWeek(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const cropYearStart =
    month >= 7 ? new Date(year, 7, 1) : new Date(year - 1, 7, 1);
  const diffMs = now.getTime() - cropYearStart.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, diffWeeks + 1);
}
