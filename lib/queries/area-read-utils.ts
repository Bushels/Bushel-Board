/** Client-safe types + pure builders for the "Your area" read. Server queries live in area-read.ts. */

export interface ProvincialFlowObservation {
  grain: string;
  crop_year: string;
  grain_week: number;
  period: string;
  ktonnes: number | string;
}

export interface ProvincialGrainFlow {
  grain: string;
  weekKt: number | null;
  seasonKt: number | null;
  priorSeasonKt: number | null;
  seasonYoyPct: number | null;
}

export interface AreaBid {
  facilityName: string | null;
  businessType: string;
  grain: string;
  pricePerTonne: number | null;
  basis: number | null;
  deliveryPeriod: string | null;
  postedAt: string | null;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Fold raw provincial CGC observations (Primary deliveries, grade='', one province)
 * into per-grain weekly + season totals with a season-over-season comparison at the
 * same grain week. Grains with no current-season rows are dropped.
 */
export function buildProvincialFlow(
  rows: readonly ProvincialFlowObservation[],
  currentCropYear: string,
  priorCropYear: string,
): ProvincialGrainFlow[] {
  const byGrain = new Map<string, ProvincialGrainFlow>();

  for (const row of rows) {
    const ktonnes = toNumber(row.ktonnes);
    if (ktonnes === null) continue;

    const entry = byGrain.get(row.grain) ?? {
      grain: row.grain,
      weekKt: null,
      seasonKt: null,
      priorSeasonKt: null,
      seasonYoyPct: null,
    };

    if (row.crop_year === currentCropYear && row.period === "Current Week") entry.weekKt = ktonnes;
    if (row.crop_year === currentCropYear && row.period === "Crop Year") entry.seasonKt = ktonnes;
    if (row.crop_year === priorCropYear && row.period === "Crop Year") entry.priorSeasonKt = ktonnes;

    byGrain.set(row.grain, entry);
  }

  const flows: ProvincialGrainFlow[] = [];
  for (const entry of byGrain.values()) {
    if (entry.seasonKt === null && entry.weekKt === null) continue;
    if (entry.seasonKt !== null && entry.priorSeasonKt !== null && entry.priorSeasonKt > 0) {
      entry.seasonYoyPct = Math.round(((entry.seasonKt - entry.priorSeasonKt) / entry.priorSeasonKt) * 100);
    }
    flows.push(entry);
  }

  return flows.sort((left, right) => (right.seasonKt ?? 0) - (left.seasonKt ?? 0));
}

export function describeSeasonPace(flow: ProvincialGrainFlow): string {
  if (flow.seasonYoyPct === null) return "no season comparison yet";
  if (flow.seasonYoyPct > 2) return `${flow.seasonYoyPct}% ahead of last season`;
  if (flow.seasonYoyPct < -2) return `${Math.abs(flow.seasonYoyPct)}% behind last season`;
  return "on pace with last season";
}
