/**
 * Desk swarm headless runner — data-freshness SLA evaluator (pure).
 *
 * The CLI computes each source's age (days) from DB timestamps and passes them
 * here. A missing source (ageDays === null) is treated as a breach so an
 * unattended run fails LOUD rather than scoring on absent data.
 */

export interface FreshnessSource {
  name: string;
  /** Age in days, or null when the source returned no rows. */
  ageDays: number | null;
  /** Max allowed age in days. */
  slaDays: number;
  /** When true, this source is excluded from the verdict (e.g. seasonal gate). */
  skip?: boolean;
}

export interface FreshnessCheck {
  name: string;
  ageDays: number | null;
  slaDays: number;
  skipped: boolean;
  breach: boolean;
}

export interface FreshnessVerdict {
  ok: boolean;
  breached: string[];
  checks: FreshnessCheck[];
}

export function evaluateFreshness(sources: FreshnessSource[]): FreshnessVerdict {
  const checks: FreshnessCheck[] = sources.map((s) => {
    const skipped = Boolean(s.skip);
    const breach = !skipped && (s.ageDays === null || s.ageDays > s.slaDays);
    return { name: s.name, ageDays: s.ageDays, slaDays: s.slaDays, skipped, breach };
  });
  const breached = checks.filter((c) => c.breach).map((c) => c.name);
  return { ok: breached.length === 0, breached, checks };
}

/** CAD freshness SLAs (days). Source: grain-desk-swarm-prompt.md Phase 0.3. */
export const CAD_SLAS = { cgc: 8, cot: 8, price: 4 } as const;

/** US freshness SLAs (days). Source: us-desk-swarm-prompt.md Phase 0.3. */
export const US_SLAS = {
  wasde: 35,
  export_sales: 10,
  price: 4,
  cot: 10,
  crop_progress: 10, // seasonal: enforced Apr–Nov, skipped Dec–Mar
} as const;

/** US crop-progress freshness is only enforced in the Apr–Nov growing season. */
export function cropProgressInSeason(month1to12: number): boolean {
  return month1to12 >= 4 && month1to12 <= 11;
}
