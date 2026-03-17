/**
 * Pre-computed analyst ratios for the Senior Analyst Data Brief.
 *
 * These ratios are calculated server-side BEFORE injection into the prompt,
 * so the AI can focus on interpretation rather than arithmetic.
 */

export interface AnalystRatioInput {
  cyExportsKt: number;
  projectedExportsKt: number | null;
  cyCrushKt: number;
  projectedCrushKt: number | null;
  cyDeliveriesKt: number;
  totalSupplyKt: number | null;
  commercialStocksKt: number;
  annualCrushCapacityKt: number | null;
  latestDataWeek: number;
  deliveriesHistAvg: number | null;
  exportsHistAvg: number | null;
  mmNetContracts: number | null;
  mmNetPctOi: number | null;
}

export interface AnalystRatios {
  exportPaceRatio: number | null;
  annualizedExportPace: number | null;
  stocksToUse: number | null;
  deliveriesVs5yrPct: number | null;
  exportsVs5yrPct: number | null;
  deliveredPctOfSupply: number | null;
  crushUtilizationPct: number | null;
  weeksRemaining: number;
  mmDirection: string;
  promptSection: string;
}

function safePct(numerator: number, denominator: number | null): number | null {
  if (denominator == null || denominator === 0) return null;
  return (numerator / denominator) * 100;
}

function fmt(val: number | null, decimals = 1): string {
  if (val == null) return "N/A";
  return val.toFixed(decimals);
}

export function computeAnalystRatios(input: AnalystRatioInput): AnalystRatios {
  const exportPaceRatio = safePct(input.cyExportsKt, input.projectedExportsKt);

  const annualizedExportPace =
    input.latestDataWeek > 0
      ? (input.cyExportsKt / input.latestDataWeek) * 52
      : null;

  const totalDemand =
    input.projectedExportsKt != null && input.projectedCrushKt != null
      ? input.projectedExportsKt + input.projectedCrushKt
      : null;
  const stocksToUse = safePct(input.commercialStocksKt, totalDemand);

  const deliveriesVs5yrPct =
    input.deliveriesHistAvg != null && input.deliveriesHistAvg > 0
      ? ((input.cyDeliveriesKt - input.deliveriesHistAvg) /
          input.deliveriesHistAvg) *
        100
      : null;

  const exportsVs5yrPct =
    input.exportsHistAvg != null && input.exportsHistAvg > 0
      ? ((input.cyExportsKt - input.exportsHistAvg) / input.exportsHistAvg) *
        100
      : null;

  const deliveredPctOfSupply = safePct(
    input.cyDeliveriesKt,
    input.totalSupplyKt
  );

  const annualizedCrush =
    input.latestDataWeek > 0
      ? (input.cyCrushKt / input.latestDataWeek) * 52
      : null;
  const crushUtilizationPct =
    annualizedCrush != null &&
    input.annualCrushCapacityKt != null &&
    input.annualCrushCapacityKt > 0
      ? (annualizedCrush / input.annualCrushCapacityKt) * 100
      : null;

  const weeksRemaining = Math.max(0, 52 - input.latestDataWeek);

  const mmDirection =
    input.mmNetContracts == null
      ? "N/A"
      : input.mmNetContracts > 0
        ? "net-long"
        : input.mmNetContracts < 0
          ? "net-short"
          : "flat";

  const lines = [
    `## Pre-Computed Analyst Ratios`,
    `- Export pace: ${fmt(exportPaceRatio)}% of AAFC target (${input.cyExportsKt.toLocaleString()} of ${input.projectedExportsKt?.toLocaleString() ?? "N/A"} Kt)`,
    `- Annualized export pace: ${annualizedExportPace != null ? Math.round(annualizedExportPace).toLocaleString() : "N/A"} Kt (target: ${input.projectedExportsKt?.toLocaleString() ?? "N/A"} Kt)`,
    `- Stocks-to-use: ${fmt(stocksToUse)}%`,
    `- Delivery pace vs 5yr avg: ${fmt(deliveriesVs5yrPct, 1)}%`,
    `- Export pace vs 5yr avg: ${fmt(exportsVs5yrPct, 1)}%`,
    `- Delivered: ${fmt(deliveredPctOfSupply)}% of total supply`,
    `- Crush utilization: ${fmt(crushUtilizationPct, 0)}% of annual capacity (annualized)`,
    `- Weeks remaining in crop year: ${weeksRemaining}`,
    `- Spec positioning: Managed Money ${mmDirection}${input.mmNetPctOi != null ? `, ${input.mmNetPctOi}% of OI` : ""}`,
  ];

  return {
    exportPaceRatio,
    annualizedExportPace,
    stocksToUse,
    deliveriesVs5yrPct,
    exportsVs5yrPct,
    deliveredPctOfSupply,
    crushUtilizationPct,
    weeksRemaining,
    mmDirection,
    promptSection: lines.join("\n"),
  };
}
