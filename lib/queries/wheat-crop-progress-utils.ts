export type WheatUsdaProgressTone = "bull" | "bear" | "balanced";
export type WheatCropClass = "winter" | "spring" | "durum" | "all" | "legacy_mixed";

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
  wheat_class: string | null;
  week_ending: string | null;
  good_excellent_pct: number | string | null;
  harvested_pct: number | string | null;
  headed_pct: number | string | null;
  planted_pct: number | string | null;
  ge_pct_yoy_change: number | string | null;
  condition_index: number | string | null;
};

export interface WheatCropProgressWeek {
  wheatClass: WheatCropClass;
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

const VALID_CLASSES = new Set<WheatCropClass>([
  "winter",
  "spring",
  "durum",
  "all",
  "legacy_mixed",
]);

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
      const rawClass = (row.wheat_class ?? "legacy_mixed").toLowerCase() as WheatCropClass;
      const wheatClass = VALID_CLASSES.has(rawClass) ? rawClass : "legacy_mixed";
      return {
        wheatClass,
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

function daysBetween(laterIso: string, earlierIso: string): number {
  return Math.round((utcDate(laterIso).getTime() - utcDate(earlierIso).getTime()) / 86_400_000);
}

function className(wheatClass: WheatCropClass): string {
  if (wheatClass === "spring") return "Spring";
  if (wheatClass === "winter") return "Winter";
  if (wheatClass === "durum") return "Durum";
  return "Wheat";
}

function classNoun(wheatClass: WheatCropClass): string {
  return className(wheatClass).toLowerCase();
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

function latestPerClass(rows: WheatCropProgressWeek[]): WheatCropProgressWeek[] {
  const latest = new Map<WheatCropClass, WheatCropProgressWeek>();
  for (const row of rows) {
    if (!latest.has(row.wheatClass)) latest.set(row.wheatClass, row);
  }
  const explicit = [...latest.values()].filter((row) =>
    row.wheatClass === "winter" || row.wheatClass === "spring" || row.wheatClass === "durum",
  );
  return explicit.length ? explicit : [...latest.values()].filter((row) => row.wheatClass === "legacy_mixed");
}

function priorWeek(
  rows: WheatCropProgressWeek[],
  latest: WheatCropProgressWeek,
): WheatCropProgressWeek | null {
  const prior = rows.find(
    (row) => row.wheatClass === latest.wheatClass && row.weekEnding < latest.weekEnding,
  ) ?? null;
  return prior && daysBetween(latest.weekEnding, prior.weekEnding) <= 9 ? prior : null;
}

function priorYear(
  rows: WheatCropProgressWeek[],
  latest: WheatCropProgressWeek,
): WheatCropProgressWeek | null {
  const target = addDaysIso(latest.weekEnding, -364);
  const candidates = rows.filter((row) => row.wheatClass === latest.wheatClass);
  let best: WheatCropProgressWeek | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const row of candidates) {
    const gap = Math.abs(daysBetween(row.weekEnding, target));
    if (gap < bestGap) {
      best = row;
      bestGap = gap;
    }
  }
  return best && bestGap <= 4 ? best : null;
}

function pctDetail(lastWeek: number | null, lastYear: number | null): string {
  const parts: string[] = [];
  if (lastWeek !== null) parts.push(`${Math.round(lastWeek)}% last week`);
  if (lastYear !== null) parts.push(`${Math.round(lastYear)}% last year`);
  return parts.length ? parts.join("; ") : "No same-class comparison rows imported yet";
}

type Candidate = { priority: number; weekEnding: string; metric: WheatUsdaProgressMetric; read: string };

export function buildWheatUsdaProgressUpdate(
  rows: WheatCropProgressWeek[],
): WheatUsdaProgressUpdate | null {
  const candidates: Candidate[] = [];

  for (const latest of latestPerClass(rows)) {
    const prior = priorWeek(rows, latest);
    const lastYear = priorYear(rows, latest);
    const crop = classNoun(latest.wheatClass);
    const label = className(latest.wheatClass);

    if (latest.harvestedPct !== null) {
      const yoy = lastYear?.harvestedPct ?? null;
      const delta = yoy === null ? null : latest.harvestedPct - yoy;
      candidates.push({
        priority: 1,
        weekEnding: latest.weekEnding,
        metric: {
          label: `${label} harvested`,
          value: `${Math.round(latest.harvestedPct)}%`,
          detail: pctDetail(prior?.harvestedPct ?? null, yoy),
          tone: paceTone(delta, 5),
        },
        read: `The ${crop} crop is ${Math.round(latest.harvestedPct)}% harvested${delta === null ? "" : delta >= 5 ? ", ahead of last year" : delta <= -5 ? ", behind last year" : ", near last year's pace"}.`,
      });
    }

    if (latest.goodExcellentPct !== null) {
      const yoyValue = lastYear?.goodExcellentPct ??
        (latest.geYoyChange === null ? null : latest.goodExcellentPct - latest.geYoyChange);
      const delta = yoyValue === null ? latest.geYoyChange : latest.goodExcellentPct - yoyValue;
      candidates.push({
        priority: 2,
        weekEnding: latest.weekEnding,
        metric: {
          label: `${label} good/excellent`,
          value: `${Math.round(latest.goodExcellentPct)}%`,
          detail: pctDetail(prior?.goodExcellentPct ?? null, yoyValue),
          tone: conditionTone(delta),
        },
        read: `The ${crop} crop is ${Math.round(latest.goodExcellentPct)}% good or excellent${delta === null ? "" : `, ${Math.abs(Math.round(delta))} points ${delta < 0 ? "below" : "above"} last year`}.`,
      });
    }

    if (latest.headedPct !== null) {
      const yoy = lastYear?.headedPct ?? null;
      const delta = yoy === null ? null : latest.headedPct - yoy;
      candidates.push({
        priority: 3,
        weekEnding: latest.weekEnding,
        metric: {
          label: `${label} headed`,
          value: `${Math.round(latest.headedPct)}%`,
          detail: pctDetail(prior?.headedPct ?? null, yoy),
          tone: paceTone(delta, 10),
        },
        read: `The ${crop} crop is ${Math.round(latest.headedPct)}% headed${delta === null ? "" : delta >= 10 ? ", ahead of last year" : delta <= -10 ? ", behind last year" : ", near last year's pace"}.`,
      });
    }

    if (latest.plantedPct !== null) {
      const yoy = lastYear?.plantedPct ?? null;
      const delta = yoy === null ? null : latest.plantedPct - yoy;
      candidates.push({
        priority: 4,
        weekEnding: latest.weekEnding,
        metric: {
          label: `${label} planted`,
          value: `${Math.round(latest.plantedPct)}%`,
          detail: pctDetail(prior?.plantedPct ?? null, yoy),
          tone: paceTone(delta, 10),
        },
        read: `The ${crop} crop is ${Math.round(latest.plantedPct)}% planted.`,
      });
    }

    if (latest.conditionIndex !== null) {
      candidates.push({
        priority: 5,
        weekEnding: latest.weekEnding,
        metric: {
          label: `${label} condition index (1-5)`,
          value: `${latest.conditionIndex.toFixed(2)} / 5`,
          detail: "Weighted very poor (1) to excellent (5)",
          tone: "balanced",
        },
        read: "",
      });
    }
  }

  if (!candidates.length) return null;
  candidates.sort((left, right) =>
    right.weekEnding.localeCompare(left.weekEnding) || left.priority - right.priority,
  );
  const selected = candidates.slice(0, 4);
  const weekEnding = selected.reduce(
    (latest, item) => item.weekEnding > latest ? item.weekEnding : latest,
    selected[0]!.weekEnding,
  );

  return {
    weekEnding,
    releasedAt: addDaysIso(weekEnding, 1),
    sourceName: WHEAT_USDA_PROGRESS_SOURCE_NAME,
    sourceUrl: WHEAT_USDA_PROGRESS_SOURCE_URL,
    read: selected.map((item) => item.read).filter(Boolean).slice(0, 3).join(" "),
    metrics: selected.map((item) => item.metric),
  };
}
