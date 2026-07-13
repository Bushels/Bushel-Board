export type WheatUsdaProgressTone = "bull" | "bear" | "balanced";

export type WheatCropClass = "winter" | "spring" | null;

export interface WheatUsdaProgressMetric {
  label: string;
  value: string;
  detail: string;
  tone: WheatUsdaProgressTone;
}

export interface WheatUsdaProgressUpdate {
  weekEnding: string;
  releasedAt: string;
  sourceName: string;
  sourceUrl: string;
  read: string;
  metrics: WheatUsdaProgressMetric[];
}

export type WheatCropProgressRpcRow = {
  week_ending: string | null;
  good_excellent_pct: number | string | null;
  harvested_pct: number | string | null;
  headed_pct: number | string | null;
  planted_pct: number | string | null;
  ge_pct_yoy_change: number | string | null;
  condition_index: number | string | null;
};

export interface WheatCropProgressWeek {
  weekEnding: string;
  goodExcellentPct: number | null;
  harvestedPct: number | null;
  headedPct: number | null;
  plantedPct: number | null;
  geYoyChange: number | null;
  conditionIndex: number | null;
}

export const WHEAT_USDA_PROGRESS_SOURCE_NAME = "USDA Crop Progress";
export const WHEAT_USDA_PROGRESS_SOURCE_URL =
  "https://www.nass.usda.gov/Publications/National_Crop_Progress/";

function numberOrNull(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeWheatCropProgressRows(
  rows: WheatCropProgressRpcRow[],
): WheatCropProgressWeek[] {
  return rows
    .map((row) => {
      if (!row.week_ending) return null;
      return {
        weekEnding: row.week_ending,
        goodExcellentPct: numberOrNull(row.good_excellent_pct),
        harvestedPct: numberOrNull(row.harvested_pct),
        headedPct: numberOrNull(row.headed_pct),
        plantedPct: numberOrNull(row.planted_pct),
        geYoyChange: numberOrNull(row.ge_pct_yoy_change),
        conditionIndex: numberOrNull(row.condition_index),
      };
    })
    .filter((row): row is WheatCropProgressWeek => row !== null)
    .sort((left, right) => right.weekEnding.localeCompare(left.weekEnding));
}

function utcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function addDaysIso(iso: string, days: number): string {
  const date = utcDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function utcMonth(iso: string): number {
  return utcDate(iso).getUTCMonth() + 1;
}

function daysBetween(laterIso: string, earlierIso: string): number {
  return Math.round((utcDate(laterIso).getTime() - utcDate(earlierIso).getTime()) / 86_400_000);
}

// The table stores one consolidated WHEAT row per week: the importer's rank
// picks prefer the winter series for condition/harvested/headed and the spring
// series for planted, then silently fall through to the other class when NASS
// retires a series mid-season. The helpers below recover which class a column
// is currently reporting so tiles never carry a stale "Winter"/"Spring" label.

function seasonRowsAscending(rows: WheatCropProgressWeek[], latestWeekEnding: string): WheatCropProgressWeek[] {
  const latest = utcDate(latestWeekEnding);
  const seasonStartYear = latest.getUTCMonth() + 1 >= 4 ? latest.getUTCFullYear() : latest.getUTCFullYear() - 1;
  const seasonStart = `${seasonStartYear}-04-01`;
  return rows
    .filter((row) => row.weekEnding >= seasonStart && row.weekEnding <= latestWeekEnding)
    .sort((left, right) => left.weekEnding.localeCompare(right.weekEnding));
}

// Cumulative progress series (headed/harvested) never decrease within one crop
// class, so any in-season drop marks the week NASS retired the winter series
// and the consolidated column started reporting the spring crop.
export function cumulativeProgressClass(seasonValuesAscending: Array<number | null>): WheatCropClass {
  let previous: number | null = null;
  let flipped = false;
  for (const value of seasonValuesAscending) {
    if (value === null) continue;
    if (previous !== null && value < previous - 3) flipped = true;
    previous = value;
  }
  if (previous === null) return null;
  return flipped ? "spring" : "winter";
}

// Condition is not cumulative, so the winter->spring hand-off shows up as a
// level shift instead of a drop. Outside the June/July hand-off window the
// calendar alone decides which class NASS is still rating.
export function conditionClass(
  latestWeekEnding: string,
  seasonAscending: Array<{ weekEnding: string; value: number | null }>,
): WheatCropClass {
  const month = utcMonth(latestWeekEnding);
  if (month >= 10 || month <= 5) return "winter";
  if (month >= 8) return "spring";
  let previous: number | null = null;
  for (const point of seasonAscending) {
    if (point.value === null) continue;
    if (utcMonth(point.weekEnding) >= 6 && previous !== null && Math.abs(point.value - previous) >= 12) {
      return "spring";
    }
    previous = point.value;
  }
  return previous === null ? null : "winter";
}

// Spring wheat seeds Apr-Jun and winter wheat seeds Sep-Nov, so the planted
// column never reports both classes in the same half of the year.
export function plantedClass(latestWeekEnding: string): WheatCropClass {
  return utcMonth(latestWeekEnding) >= 8 ? "winter" : "spring";
}

function classLabel(cropClass: WheatCropClass, metricWord: string): string {
  if (cropClass === "winter") return `Winter ${metricWord}`;
  if (cropClass === "spring") return `Spring ${metricWord}`;
  return metricWord.charAt(0).toUpperCase() + metricWord.slice(1);
}

function classCropPhrase(cropClass: WheatCropClass): string {
  if (cropClass === "winter") return "The winter crop";
  if (cropClass === "spring") return "The spring crop";
  return "The wheat crop";
}

function classCropNoun(cropClass: WheatCropClass): string {
  if (cropClass === "winter") return "winter";
  if (cropClass === "spring") return "spring";
  return "wheat";
}

function paceTone(deltaVsLastYear: number | null, threshold: number): WheatUsdaProgressTone {
  if (deltaVsLastYear === null) return "balanced";
  if (deltaVsLastYear >= threshold) return "bear";
  if (deltaVsLastYear <= -threshold) return "bull";
  return "balanced";
}

function conditionTone(yoyDelta: number | null): WheatUsdaProgressTone {
  if (yoyDelta === null) return "balanced";
  if (yoyDelta <= -5) return "bull";
  if (yoyDelta >= 5) return "bear";
  return "balanced";
}

function pctDetail(lastWeek: number | null, lastYear: number | null): string {
  const parts: string[] = [];
  if (lastWeek !== null) parts.push(`${Math.round(lastWeek)}% last week`);
  if (lastYear !== null) parts.push(`${Math.round(lastYear)}% last year`);
  return parts.length ? parts.join("; ") : "No comparison rows imported yet";
}

function findPriorWeek(rows: WheatCropProgressWeek[], latest: WheatCropProgressWeek): WheatCropProgressWeek | null {
  const prior = rows.find((row) => row.weekEnding < latest.weekEnding) ?? null;
  if (!prior) return null;
  return daysBetween(latest.weekEnding, prior.weekEnding) <= 9 ? prior : null;
}

function findPriorYear(rows: WheatCropProgressWeek[], latest: WheatCropProgressWeek): WheatCropProgressWeek | null {
  const target = addDaysIso(latest.weekEnding, -364);
  let best: WheatCropProgressWeek | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const gap = Math.abs(daysBetween(row.weekEnding, target));
    if (gap < bestGap) {
      best = row;
      bestGap = gap;
    }
  }
  return best !== null && bestGap <= 4 ? best : null;
}

export function buildWheatUsdaProgressUpdate(
  rows: WheatCropProgressWeek[],
): WheatUsdaProgressUpdate | null {
  const latest = rows[0] ?? null;
  if (!latest) return null;

  const priorWeek = findPriorWeek(rows, latest);
  const priorYear = findPriorYear(rows, latest);
  const season = seasonRowsAscending(rows, latest.weekEnding);

  const metrics: WheatUsdaProgressMetric[] = [];
  const readSentences: string[] = [];

  if (latest.harvestedPct !== null) {
    const cropClass = cumulativeProgressClass(season.map((row) => row.harvestedPct));
    const lastYear = priorYear?.harvestedPct ?? null;
    const delta = lastYear !== null ? latest.harvestedPct - lastYear : null;
    metrics.push({
      label: classLabel(cropClass, "harvested"),
      value: `${Math.round(latest.harvestedPct)}%`,
      detail: pctDetail(priorWeek?.harvestedPct ?? null, lastYear),
      tone: paceTone(delta, 5),
    });
    const noun = classCropNoun(cropClass);
    if (delta === null) {
      readSentences.push(`${classCropPhrase(cropClass)} is ${Math.round(latest.harvestedPct)}% harvested.`);
    } else if (delta >= 5) {
      readSentences.push(
        `Harvest of the ${noun} crop is moving fast at ${Math.round(latest.harvestedPct)}% complete, ahead of ${Math.round(lastYear as number)}% a year ago.`,
      );
    } else if (delta <= -5) {
      readSentences.push(
        `Harvest of the ${noun} crop is running behind at ${Math.round(latest.harvestedPct)}% complete versus ${Math.round(lastYear as number)}% a year ago.`,
      );
    } else {
      readSentences.push(
        `Harvest of the ${noun} crop is ${Math.round(latest.harvestedPct)}% complete, in line with last year.`,
      );
    }
  }

  if (latest.goodExcellentPct !== null) {
    const cropClass = conditionClass(
      latest.weekEnding,
      season.map((row) => ({ weekEnding: row.weekEnding, value: row.goodExcellentPct })),
    );
    const lastYear =
      priorYear?.goodExcellentPct ??
      (latest.geYoyChange !== null ? latest.goodExcellentPct - latest.geYoyChange : null);
    const yoyDelta = lastYear !== null ? latest.goodExcellentPct - lastYear : latest.geYoyChange;
    metrics.push({
      label: classLabel(cropClass, "good/excellent"),
      value: `${Math.round(latest.goodExcellentPct)}%`,
      detail: pctDetail(priorWeek?.goodExcellentPct ?? null, lastYear),
      tone: conditionTone(yoyDelta),
    });
    if (yoyDelta !== null && yoyDelta <= -10) {
      readSentences.push(
        `${classCropPhrase(cropClass)} condition remains poor at ${Math.round(latest.goodExcellentPct)}% good or excellent, ${Math.abs(Math.round(yoyDelta))} points below last year.`,
      );
    } else if (yoyDelta !== null && yoyDelta >= 10) {
      readSentences.push(
        `${classCropPhrase(cropClass)} is in better shape than last year at ${Math.round(latest.goodExcellentPct)}% good or excellent.`,
      );
    } else {
      readSentences.push(
        `${classCropPhrase(cropClass)} condition holds at ${Math.round(latest.goodExcellentPct)}% good or excellent, close to last year.`,
      );
    }
  }

  if (latest.headedPct !== null) {
    const cropClass = cumulativeProgressClass(season.map((row) => row.headedPct));
    const lastYear = priorYear?.headedPct ?? null;
    const delta = lastYear !== null ? latest.headedPct - lastYear : null;
    metrics.push({
      label: classLabel(cropClass, "headed"),
      value: `${Math.round(latest.headedPct)}%`,
      detail: pctDetail(priorWeek?.headedPct ?? null, lastYear),
      tone: paceTone(delta, 10),
    });
    if (delta !== null && delta >= 10) {
      readSentences.push(
        `${classCropPhrase(cropClass)} is developing quickly at ${Math.round(latest.headedPct)}% headed, ahead of last year.`,
      );
    } else if (delta !== null && delta <= -10) {
      readSentences.push(
        `${classCropPhrase(cropClass)} is ${Math.round(latest.headedPct)}% headed, behind last year's pace.`,
      );
    } else {
      readSentences.push(
        `${classCropPhrase(cropClass)} is ${Math.round(latest.headedPct)}% headed, near last year's pace.`,
      );
    }
  }

  if (latest.plantedPct !== null && metrics.length < 4) {
    const cropClass = plantedClass(latest.weekEnding);
    const lastYear = priorYear?.plantedPct ?? null;
    const delta = lastYear !== null ? latest.plantedPct - lastYear : null;
    metrics.push({
      label: classLabel(cropClass, "planted"),
      value: `${Math.round(latest.plantedPct)}%`,
      detail: pctDetail(priorWeek?.plantedPct ?? null, lastYear),
      tone: paceTone(delta, 10),
    });
    readSentences.push(
      `${classCropPhrase(cropClass)} is ${Math.round(latest.plantedPct)}% planted${
        delta === null ? "" : delta >= 10 ? ", ahead of last year" : delta <= -10 ? ", behind last year" : ", near last year's pace"
      }.`,
    );
  }

  if (latest.conditionIndex !== null && metrics.length < 4) {
    const lastWeek = priorWeek?.conditionIndex ?? null;
    const lastYear = priorYear?.conditionIndex ?? null;
    const delta = lastYear !== null ? latest.conditionIndex - lastYear : null;
    const parts: string[] = [];
    if (lastWeek !== null) parts.push(`${lastWeek.toFixed(2)} last week`);
    if (lastYear !== null) parts.push(`${lastYear.toFixed(2)} last year`);
    metrics.push({
      label: "Condition index (1-5)",
      value: `${latest.conditionIndex.toFixed(2)} / 5`,
      detail: parts.length ? parts.join("; ") : "Weighted very poor (1) to excellent (5)",
      tone: delta === null ? "balanced" : delta >= 0.25 ? "bear" : delta <= -0.25 ? "bull" : "balanced",
    });
  }

  if (!metrics.length) return null;

  return {
    weekEnding: latest.weekEnding,
    releasedAt: addDaysIso(latest.weekEnding, 1),
    sourceName: WHEAT_USDA_PROGRESS_SOURCE_NAME,
    sourceUrl: WHEAT_USDA_PROGRESS_SOURCE_URL,
    read: readSentences.length
      ? readSentences.slice(0, 3).join(" ")
      : "The latest USDA weekly crop progress rows are in for the wheat complex.",
    metrics: metrics.slice(0, 4),
  };
}
