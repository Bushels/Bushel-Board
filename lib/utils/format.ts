/**
 * Format kilotonne value: 1234.5 -> "1,234.5 kt"
 */
export function fmtKt(value: number, decimals = 1): string {
  return `${value.toLocaleString("en-CA", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} kt`;
}

/**
 * Format percentage with sign: 12.5 -> "+12.5%", -3.2 -> "-3.2%"
 */
export function fmtPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * Format CGC date string: "2026-02-22" -> "Feb 22"
 */
export function fmtWeekDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}
