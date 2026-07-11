/**
 * Desk swarm headless runner — date helpers (pure).
 *
 * The US desk has no CGC `grain_week`; it labels runs by the Friday-of-run ISO
 * date and derives an ISO week number to satisfy pipeline_runs.grain_week (NOT NULL).
 */

/** ISO date (yyyy-mm-dd, UTC) of the most recent Friday, including `now` if it is a Friday. */
export function mostRecentFriday(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysSinceFriday = (d.getUTCDay() - 5 + 7) % 7; // Friday = 5
  d.setUTCDate(d.getUTCDate() - daysSinceFriday);
  return d.toISOString().slice(0, 10);
}

/** Standard ISO-8601 week number (1–53) for a date. */
export function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Sunday -> 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // shift to the Thursday of this ISO week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Whole-day age between two instants (UTC date floor), or null if `ts` is null/invalid. */
export function ageInDays(ts: string | null | undefined, now: Date): number | null {
  if (!ts) return null;
  const then = new Date(ts);
  if (Number.isNaN(then.getTime())) return null;
  const a = Date.UTC(then.getUTCFullYear(), then.getUTCMonth(), then.getUTCDate());
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((b - a) / 86400000);
}
