/**
 * CGC crop year runs Aug 1 → Jul 31.
 * Returns the current crop year in long format: "2025-2026"
 * (matches the CGC CSV source data and cgc_observations table convention).
 */
export function getCurrentCropYear(now = new Date()): string {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  // Aug (7) through Dec (11) → current year start; Jan-Jul → previous year start
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

/**
 * Display label: "2025-2026" → "2025-26 Season" or "2025-26 Crop Year"
 * Converts to short display format for UI readability.
 */
export function cropYearLabel(
  cropYear?: string,
  suffix: "Season" | "Crop Year" = "Crop Year"
): string {
  const cy = cropYear ?? getCurrentCropYear();
  return `${toShortFormat(cy)} ${suffix}`;
}

/**
 * Convert long format "2025-2026" → short display format "2025-26".
 * Accepts both formats gracefully (short passes through unchanged).
 */
export function toShortFormat(cropYear: string): string {
  const parts = cropYear.split("-");
  if (parts.length !== 2) return cropYear;
  // If already short (e.g. "2025-26"), return as-is
  if (parts[1].length <= 2) return cropYear;
  // Long → short: "2025-2026" → "2025-26"
  return `${parts[0]}-${parts[1].slice(-2)}`;
}

/**
 * Parse crop year start date: "2025-2026" or "2025-26" → Date(2025, 7, 1) (Aug 1 2025)
 */
export function cropYearStartDate(cropYear?: string): Date {
  const cy = cropYear ?? getCurrentCropYear();
  const startYear = parseInt(cy.split("-")[0]);
  return new Date(startYear, 7, 1);
}

/**
 * Calculate the current CGC grain week (1-52).
 * Week 1 starts Aug 1 of the crop year start.
 */
export function getCurrentGrainWeek(now = new Date()): number {
  const start = cropYearStartDate(getCurrentCropYear(now));
  const diffMs = now.getTime() - start.getTime();
  const week = Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, Math.min(52, week));
}

/** The current crop year, evaluated once at module load. */
export const CURRENT_CROP_YEAR = getCurrentCropYear();
