export interface DeskThesisStaleness {
  isStale: boolean;
  ageWeeks: number;
  thesisWeek: number | null;
}

/**
 * Assess whether a Friday desk thesis row is stale relative to the display data week.
 *
 * A 1-week lag is the normal publish rhythm (the desk writes Friday evening for the
 * data week that closed Thursday). From 2 weeks behind, the thesis must be presented
 * as history, not the current week's read, and its stance must not drive haul/hold
 * recommendations.
 */
export function assessDeskThesisStaleness(
  thesisWeek: number | null | undefined,
  displayWeek: number | null | undefined,
): DeskThesisStaleness {
  if (
    thesisWeek == null ||
    displayWeek == null ||
    !Number.isFinite(thesisWeek) ||
    !Number.isFinite(displayWeek)
  ) {
    return { isStale: false, ageWeeks: 0, thesisWeek: null };
  }

  const ageWeeks = Math.max(0, Math.round(displayWeek - thesisWeek));
  return { isStale: ageWeeks >= 2, ageWeeks, thesisWeek };
}
