/**
 * CGC crop year runs Aug 1 → Jul 31.
 * Returns the current crop year in short format: "2025-26"
 */
export function getCurrentCropYear(now = new Date()): string {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  // Aug (7) through Dec (11) → current year start; Jan-Jul → previous year start
  const startYear = month >= 7 ? year : year - 1;
  const endYear = (startYear + 1) % 100; // last 2 digits
  return `${startYear}-${endYear.toString().padStart(2, "0")}`;
}

/**
 * Display label: "2025-26" → "2025-26 Season" or "2025-26 Crop Year"
 */
export function cropYearLabel(
  cropYear?: string,
  suffix: "Season" | "Crop Year" = "Crop Year"
): string {
  return `${cropYear ?? getCurrentCropYear()} ${suffix}`;
}

/**
 * Parse crop year start date: "2025-26" → Date(2025, 7, 1) (Aug 1 2025)
 */
export function cropYearStartDate(cropYear?: string): Date {
  const cy = cropYear ?? getCurrentCropYear();
  const startYear = parseInt(cy.split("-")[0]);
  return new Date(startYear, 7, 1);
}

/** The current crop year, evaluated once at module load. */
export const CURRENT_CROP_YEAR = getCurrentCropYear();
