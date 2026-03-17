/**
 * Dynamic Shipping Calendar for the Senior Analyst pipeline.
 *
 * Computes temporal context: current week, latest data week, data lag,
 * seasonal context, and formatted prompt text for LLM injection.
 */

export interface ShippingCalendar {
  currentCalendarWeek: number;
  latestDataWeek: number;
  dataLag: number;
  cropYear: string;
  seasonalContext: string;
  promptText: string;
}

export function getSeasonalContext(week: number): string {
  if (week <= 8) {
    return "Early harvest season. High visible stocks are carry-in from prior crop year, not new-crop deliveries. Harvest pressure building — basis typically widest in first 30 days.";
  }
  if (week <= 17) {
    return "Peak harvest and early shipping season. Maximum delivery pressure. Basis typically widest. Export commitments ramping up — watch terminal receipts for shipping pace.";
  }
  if (week <= 26) {
    return "Mid-shipping season. Export execution window — export demand should be strong. Storage economics matter. Pre-seeding rally window opens Feb 15 if stocks-to-use < 15%.";
  }
  if (week <= 35) {
    return "Late shipping and seeding prep. Acreage intentions drive new-crop pricing. Old-crop liquidation accelerating. Watch StatsCan seeding intentions report.";
  }
  if (week <= 44) {
    return "Growing season. Weather risk dominates — heat/drought fear peaks during pollination. Thin old-crop trading. New-crop pricing based on yield estimates.";
  }
  return "Pre-harvest season. New-crop pricing active. Yield estimates firming up. Basis contracts for fall delivery being offered. Watch crop tour reports and harvest progress.";
}

export function buildShippingCalendar(
  currentCalendarWeek: number,
  latestDataWeek: number,
  cropYear: string,
): ShippingCalendar {
  if (currentCalendarWeek < 1 || currentCalendarWeek > 52 ||
      latestDataWeek < 1 || latestDataWeek > 52) {
    throw new RangeError(
      `Week values must be 1-52. Got currentCalendarWeek=${currentCalendarWeek}, latestDataWeek=${latestDataWeek}`
    );
  }

  const dataLag = currentCalendarWeek - latestDataWeek;
  const seasonalContext = getSeasonalContext(currentCalendarWeek);

  const promptText = `## Shipping Calendar
- Current calendar week: ${currentCalendarWeek}
- Latest CGC data: Week ${latestDataWeek}
- Data lag: ${dataLag} week${dataLag !== 1 ? "s" : ""}
- Next CGC release: Thursday, ~1pm MST
- Crop year: ${cropYear}
- Season: ${seasonalContext}
- FRAMING: ${dataLag === 0 ? `Your Supabase data is current through Week ${latestDataWeek}. Your web/X research can validate what the data already shows.` : `Your Supabase data is verified through Week ${latestDataWeek}. Your web/X research covers what's happening NOW — you're building the story for Week${dataLag > 1 ? `s ${latestDataWeek + 1}-${currentCalendarWeek}` : ` ${currentCalendarWeek}`} that the next data release will confirm or contradict.`}`;

  return {
    currentCalendarWeek,
    latestDataWeek,
    dataLag,
    cropYear,
    seasonalContext,
    promptText,
  };
}
