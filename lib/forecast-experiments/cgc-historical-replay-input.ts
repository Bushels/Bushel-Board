import type {
  CanolaHistoricalReplayPackageInput,
  HistoricalReplayOutcomeLabel,
} from "./historical-replay";
import type { ApprovedForecastSourceRow } from "./source-records";
import type { ThesisReviewEvidenceRecord } from "./thesis-review";

export interface CgcHistoricalReplayRow {
  crop_year: string;
  grain_week: number;
  week_ending_date: string;
  worksheet: string;
  metric: string;
  period: string;
  grain: string;
  grade: string;
  region: string;
  ktonnes: number;
}

export interface CanolaCgcHistoricalReplayInputOptions {
  replay_set_name: string;
  crop_year: string;
  weeks: number[];
  source_file: string;
  created_at: string;
  review_window_days?: 7 | 28;
  publication_lag_days: number;
  publication_time: string;
  source_cutoff_time: string;
  timezone_offset: string;
  point_in_time_certified?: boolean;
}

interface CanolaWeekMetrics {
  crop_year: string;
  grain_week: number;
  week_ending_date: string;
  primary_deliveries_current_week_ktonnes: number;
  primary_shipments_current_week_ktonnes: number;
  terminal_exports_current_week_ktonnes: number;
  summary_stocks_current_week_ktonnes: number;
}

interface MetricDelta {
  current: number;
  next: number;
  delta: number;
  delta_pct: number | null;
}

interface MovementDeltas {
  primary_deliveries_current_week_ktonnes: MetricDelta;
  primary_shipments_current_week_ktonnes: MetricDelta;
  terminal_exports_current_week_ktonnes: MetricDelta;
  summary_stocks_current_week_ktonnes: MetricDelta;
}

const DEFAULT_REVIEW_WINDOW_DAYS = 7;
export function parseCgcHistoricalReplayCsv(
  csvText: string,
): CgcHistoricalReplayRow[] {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    return [];
  }

  const header = rows[0].map((column) =>
    column.trim().toLowerCase().replace(/\s+/g, "_"),
  );
  const index = (name: string): number => {
    const found = header.indexOf(name);
    if (found === -1) {
      throw new Error(`Missing required CSV column: ${name}`);
    }
    return found;
  };
  const iCropYear = index("crop_year");
  const iGrainWeek = index("grain_week");
  const iDate = index("week_ending_date");
  const iWorksheet = index("worksheet");
  const iMetric = index("metric");
  const iPeriod = index("period");
  const iGrain = index("grain");
  const iGrade = index("grade");
  const iRegion = index("region");
  const iKtonnes = index("ktonnes");

  return rows.slice(1).flatMap((columns) => {
    if (columns.length < header.length) {
      return [];
    }

    const cropYear = readText(columns[iCropYear]);
    const grainWeek = Number.parseInt(readText(columns[iGrainWeek]), 10);
    const weekEndingDate = normalizeCgcDate(readText(columns[iDate]));
    const ktonnes = parseKtonnes(readText(columns[iKtonnes]));

    if (!cropYear || !Number.isInteger(grainWeek) || !weekEndingDate) {
      return [];
    }

    return [
      {
        crop_year: cropYear,
        grain_week: grainWeek,
        week_ending_date: weekEndingDate,
        worksheet: readText(columns[iWorksheet]),
        metric: readText(columns[iMetric]),
        period: readText(columns[iPeriod]),
        grain: readText(columns[iGrain]),
        grade: readText(columns[iGrade]),
        region: readText(columns[iRegion]),
        ktonnes,
      },
    ];
  });
}

export function buildCanolaCgcHistoricalReplayInput(
  csvText: string,
  options: CanolaCgcHistoricalReplayInputOptions,
): CanolaHistoricalReplayPackageInput {
  const rows = parseCgcHistoricalReplayCsv(csvText).filter(
    (row) => row.crop_year === options.crop_year && row.grain === "Canola",
  );
  const metricsByWeek = new Map<number, CanolaWeekMetrics>();

  for (const week of uniqueSortedWeeks(options.weeks)) {
    const current = buildWeekMetrics(rows, options.crop_year, week);
    const next = buildWeekMetrics(rows, options.crop_year, week + 1);
    if (!current) {
      throw new Error(`No Canola CGC rows found for week ${week}.`);
    }
    if (!next) {
      throw new Error(`No next-week Canola CGC rows found for week ${week + 1}.`);
    }
    metricsByWeek.set(week, current);
    metricsByWeek.set(week + 1, next);
  }

  const reviewWindowDays = options.review_window_days ?? DEFAULT_REVIEW_WINDOW_DAYS;

  return {
    replay_set_name: options.replay_set_name,
    review_window_days: reviewWindowDays,
    created_at: options.created_at,
    weeks: uniqueSortedWeeks(options.weeks).map((week) => {
      const current = requireWeek(metricsByWeek, week);
      const next = requireWeek(metricsByWeek, week + 1);
      const sourceCutoffAt = buildCutoffAt(current.week_ending_date, options);
      const reviewCutoffAt = addDaysToTimestamp(sourceCutoffAt, reviewWindowDays);
      const evidence = buildMovementEvidence(current, next, options, reviewCutoffAt);
      const label = buildOutcomeLabel(evidence);

      return {
        period_id: `${options.crop_year}-week-${week}`,
        crop_year: options.crop_year,
        grain_week: week,
        as_of_date: sourceCutoffAt.slice(0, 10),
        source_cutoff_at: sourceCutoffAt,
        snapshot_mode: options.point_in_time_certified
          ? "strict_artifact_mode"
          : "current_table_replay_mode",
        source_rows: buildSourceRows(current, options, sourceCutoffAt),
        review_as_of_date: reviewCutoffAt.slice(0, 10),
        review_cutoff_at: reviewCutoffAt,
        labeler: {
          kind: "deterministic_rule",
          name: "cgc_weekly_movement_v1",
        },
        outcome_label: label,
        next_week_evidence: [evidence],
      };
    }),
  };
}

function buildWeekMetrics(
  rows: CgcHistoricalReplayRow[],
  cropYear: string,
  week: number,
): CanolaWeekMetrics | null {
  const weekRows = rows.filter(
    (row) => row.crop_year === cropYear && row.grain_week === week,
  );

  if (weekRows.length === 0) {
    return null;
  }

  const weekEndingDate = weekRows[0]?.week_ending_date;
  if (!weekEndingDate) {
    return null;
  }

  return {
    crop_year: cropYear,
    grain_week: week,
    week_ending_date: weekEndingDate,
    primary_deliveries_current_week_ktonnes: sumRows(weekRows, {
      worksheet: "Primary",
      metric: "Deliveries",
      period: "Current Week",
    }),
    primary_shipments_current_week_ktonnes: sumRows(weekRows, {
      worksheet: "Primary",
      metric: "Shipments",
      period: "Current Week",
    }),
    terminal_exports_current_week_ktonnes: sumRows(weekRows, {
      worksheet: "Terminal Exports",
      metric: "Exports",
      period: "Current Week",
    }),
    summary_stocks_current_week_ktonnes: sumRows(weekRows, {
      worksheet: "Summary",
      metric: "Stocks",
      period: "Current Week",
    }),
  };
}

function buildSourceRows(
  metrics: CanolaWeekMetrics,
  options: CanolaCgcHistoricalReplayInputOptions,
  sourceCutoffAt: string,
): ApprovedForecastSourceRow[] {
  const publishedAt = publicationTimestamp(metrics.week_ending_date, options);
  const availableAt = addMinutesToTimestamp(publishedAt, 10);
  const importedAt = addMinutesToTimestamp(publishedAt, 15);
  const common = {
    source_key: "cgc_weekly",
    record_type: "fact" as const,
    observed_period: `${metrics.crop_year} week ${metrics.grain_week} ending ${metrics.week_ending_date}`,
    published_at: publishedAt,
    available_at: availableAt,
    imported_at: importedAt,
  };

  return [
    metricSourceRow(common, metrics, options, sourceCutoffAt, {
      metric_key: "primary_deliveries_current_week_ktonnes",
      worksheet: "Primary",
      metric: "Deliveries",
      period: "Current Week",
      value: metrics.primary_deliveries_current_week_ktonnes,
    }),
    metricSourceRow(common, metrics, options, sourceCutoffAt, {
      metric_key: "primary_shipments_current_week_ktonnes",
      worksheet: "Primary",
      metric: "Shipments",
      period: "Current Week",
      value: metrics.primary_shipments_current_week_ktonnes,
    }),
    metricSourceRow(common, metrics, options, sourceCutoffAt, {
      metric_key: "terminal_exports_current_week_ktonnes",
      worksheet: "Terminal Exports",
      metric: "Exports",
      period: "Current Week",
      value: metrics.terminal_exports_current_week_ktonnes,
    }),
    metricSourceRow(common, metrics, options, sourceCutoffAt, {
      metric_key: "summary_stocks_current_week_ktonnes",
      worksheet: "Summary",
      metric: "Stocks",
      period: "Current Week",
      value: metrics.summary_stocks_current_week_ktonnes,
    }),
  ];
}

function metricSourceRow(
  common: Omit<ApprovedForecastSourceRow, "payload">,
  metrics: CanolaWeekMetrics,
  options: CanolaCgcHistoricalReplayInputOptions,
  sourceCutoffAt: string,
  metric: {
    metric_key: string;
    worksheet: string;
    metric: string;
    period: string;
    value: number;
  },
): ApprovedForecastSourceRow {
  return {
    ...common,
    payload: {
      source_file: options.source_file,
      source_family: "CGC Weekly Grain Statistics",
      availability_basis:
        "estimated_publication_from_week_ending_plus_lag; annual CSV may include revisions unless point_in_time_certified is true",
      source_cutoff_at: sourceCutoffAt,
      point_in_time_certified: options.point_in_time_certified === true,
      crop_year: metrics.crop_year,
      grain_week: metrics.grain_week,
      week_ending_date: metrics.week_ending_date,
      grain: "Canola",
      unit: "Ktonnes",
      ...metric,
    },
  };
}

function buildMovementEvidence(
  current: CanolaWeekMetrics,
  next: CanolaWeekMetrics,
  options: CanolaCgcHistoricalReplayInputOptions,
  reviewCutoffAt: string,
): ThesisReviewEvidenceRecord {
  const nextPublishedAt = publicationTimestamp(next.week_ending_date, options);
  const nextAvailableAt = addMinutesToTimestamp(nextPublishedAt, 10);
  const deltas = buildMovementDeltas(current, next);
  const directionalEffect = classifyDirectionalOutcome(deltas);

  return {
    evidence_key: `cgc-week-${next.grain_week}-movement`,
    source_key: "cgc_weekly",
    evidence_type: "official_data",
    observed_period: `${next.crop_year} week ${next.grain_week} ending ${next.week_ending_date}`,
    published_at: nextPublishedAt,
    available_at: nextAvailableAt <= reviewCutoffAt ? nextAvailableAt : reviewCutoffAt,
    summary: buildEvidenceSummary(next, deltas, directionalEffect),
    directional_effect: directionalEffect,
    materiality: "high",
    payload: {
      source_file: options.source_file,
      source_family: "CGC Weekly Grain Statistics",
      availability_basis:
        "estimated_publication_from_week_ending_plus_lag; annual CSV may include revisions unless point_in_time_certified is true",
      point_in_time_certified: options.point_in_time_certified === true,
      crop_year: next.crop_year,
      grain_week: next.grain_week,
      week_ending_date: next.week_ending_date,
      grain: "Canola",
      deltas,
    },
  };
}

function buildOutcomeLabel(
  evidence: ThesisReviewEvidenceRecord,
): HistoricalReplayOutcomeLabel {
  const directionalOutcome = evidence.directional_effect;
  const clearDirection =
    directionalOutcome === "bullish" || directionalOutcome === "bearish";

  return {
    label_task: "directional_outcome_label",
    directional_outcome: directionalOutcome,
    thesis_verdict: "inconclusive",
    outcome_summary: clearDirection
      ? `Deterministic CGC movement label was ${directionalOutcome} for ${evidence.observed_period}.`
      : `Deterministic CGC movement label was mixed for ${evidence.observed_period}.`,
    supporting_evidence_keys: [evidence.evidence_key],
    contradicting_evidence_keys: [],
    missed_signals: [],
    adjustments_for_next_week: clearDirection
      ? ["Review CGC movement label before exporting this historical example for training."]
      : ["Do not train from mixed CGC movement without additional reviewed context."],
  };
}

function buildMovementDeltas(
  current: CanolaWeekMetrics,
  next: CanolaWeekMetrics,
): MovementDeltas {
  return {
    primary_deliveries_current_week_ktonnes: metricDelta(
      current.primary_deliveries_current_week_ktonnes,
      next.primary_deliveries_current_week_ktonnes,
    ),
    primary_shipments_current_week_ktonnes: metricDelta(
      current.primary_shipments_current_week_ktonnes,
      next.primary_shipments_current_week_ktonnes,
    ),
    terminal_exports_current_week_ktonnes: metricDelta(
      current.terminal_exports_current_week_ktonnes,
      next.terminal_exports_current_week_ktonnes,
    ),
    summary_stocks_current_week_ktonnes: metricDelta(
      current.summary_stocks_current_week_ktonnes,
      next.summary_stocks_current_week_ktonnes,
    ),
  };
}

function classifyDirectionalOutcome(
  deltas: MovementDeltas,
): "bullish" | "bearish" | "mixed" {
  let score = 0;

  score += directionalScore(
    deltas.primary_deliveries_current_week_ktonnes.delta_pct,
  );
  score += directionalScore(
    deltas.primary_shipments_current_week_ktonnes.delta_pct,
  );
  score += directionalScore(
    deltas.terminal_exports_current_week_ktonnes.delta_pct,
  );
  score -= directionalScore(deltas.summary_stocks_current_week_ktonnes.delta_pct);

  if (score >= 2) return "bullish";
  if (score <= -2) return "bearish";
  return "mixed";
}

function directionalScore(deltaPct: number | null): number {
  if (deltaPct === null) {
    return 0;
  }
  if (deltaPct >= 10) {
    return 1;
  }
  if (deltaPct <= -10) {
    return -1;
  }
  return 0;
}

function buildEvidenceSummary(
  next: CanolaWeekMetrics,
  deltas: MovementDeltas,
  direction: "bullish" | "bearish" | "mixed",
): string {
  return [
    `CGC Week ${next.grain_week} Canola movement label was ${direction}.`,
    `Deliveries ${formatDelta(deltas.primary_deliveries_current_week_ktonnes)},`,
    `shipments ${formatDelta(deltas.primary_shipments_current_week_ktonnes)},`,
    `terminal exports ${formatDelta(deltas.terminal_exports_current_week_ktonnes)},`,
    `stocks ${formatDelta(deltas.summary_stocks_current_week_ktonnes)}.`,
  ].join(" ");
}

function formatDelta(delta: MetricDelta): string {
  const pct = delta.delta_pct === null ? "n/a" : `${delta.delta_pct.toFixed(1)}%`;
  return `${delta.current.toFixed(1)} -> ${delta.next.toFixed(1)} Kt (${pct})`;
}

function metricDelta(current: number, next: number): MetricDelta {
  const delta = roundToOne(next - current);
  return {
    current: roundToOne(current),
    next: roundToOne(next),
    delta,
    delta_pct: current === 0 ? null : roundToOne((delta / current) * 100),
  };
}

function sumRows(
  rows: CgcHistoricalReplayRow[],
  filter: { worksheet: string; metric: string; period: string },
): number {
  return roundToOne(
    rows
      .filter(
        (row) =>
          row.worksheet === filter.worksheet &&
          row.metric === filter.metric &&
          row.period === filter.period,
      )
      .reduce((total, row) => total + row.ktonnes, 0),
  );
}

function publicationTimestamp(
  weekEndingDate: string,
  options: CanolaCgcHistoricalReplayInputOptions,
): string {
  const publicationLagDays =
    options.publication_lag_days;
  const time = options.publication_time;
  const offset = options.timezone_offset;
  return `${addDaysToDate(weekEndingDate, publicationLagDays)}T${time}${offset}`;
}

function buildCutoffAt(
  weekEndingDate: string,
  options: CanolaCgcHistoricalReplayInputOptions,
): string {
  const publicationLagDays =
    options.publication_lag_days;
  const time = options.source_cutoff_time;
  const offset = options.timezone_offset;
  return `${addDaysToDate(weekEndingDate, publicationLagDays)}T${time}${offset}`;
}

function addDaysToTimestamp(timestamp: string, days: number): string {
  const date = new Date(Date.parse(timestamp));
  date.setUTCDate(date.getUTCDate() + days);
  return toOffsetTimestamp(date, timestamp.slice(-6));
}

function addMinutesToTimestamp(timestamp: string, minutes: number): string {
  const date = new Date(Date.parse(timestamp));
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return toOffsetTimestamp(date, timestamp.slice(-6));
}

function toOffsetTimestamp(date: Date, offset: string): string {
  const sign = offset.startsWith("-") ? -1 : 1;
  const [hours, minutes] = offset.slice(1).split(":").map((value) => Number(value));
  const offsetMinutes = sign * ((hours ?? 0) * 60 + (minutes ?? 0));
  const localMs = date.getTime() + offsetMinutes * 60_000;
  const local = new Date(localMs);
  return `${local.toISOString().slice(0, 19)}${offset}`;
}

function addDaysToDate(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function normalizeCgcDate(value: string): string {
  const parts = value.split("/");
  if (parts.length !== 3) {
    return value;
  }
  const [day, month, year] = parts;
  return `${year}-${(month ?? "").padStart(2, "0")}-${(day ?? "").padStart(2, "0")}`;
}

function parseKtonnes(value: string): number {
  const normalized = value.replace(/,/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const next = csvText[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) {
    rows.push(row);
  }

  return rows;
}

function readText(value: string | undefined): string {
  return value?.trim() ?? "";
}

function requireWeek(
  metricsByWeek: Map<number, CanolaWeekMetrics>,
  week: number,
): CanolaWeekMetrics {
  const metrics = metricsByWeek.get(week);
  if (!metrics) {
    throw new Error(`Missing week metrics for week ${week}.`);
  }
  return metrics;
}

function uniqueSortedWeeks(weeks: number[]): number[] {
  const sorted = [...new Set(weeks)].sort((left, right) => left - right);
  if (sorted.length === 0) {
    throw new Error("At least one week is required.");
  }
  return sorted;
}

function roundToOne(value: number): number {
  return Number(value.toFixed(1));
}
