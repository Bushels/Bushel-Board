/**
 * Prompt template for generating grain market intelligence.
 *
 * Designed by: innovation-agent
 * Signal taxonomy:
 *   - bullish: data supports price strength / farmer holding thesis
 *   - bearish: data suggests price weakness / urgency to sell
 *   - watch: noteworthy but directionally ambiguous
 */

export interface GrainContext {
  grain: string;
  crop_year: string;
  grain_week: number;
  // Current year metrics
  cy_deliveries_kt: number;
  cw_deliveries_kt: number;
  wow_deliveries_pct: number | null;
  cy_exports_kt: number;
  cy_crush_kt: number;
  commercial_stocks_kt: number;
  wow_stocks_change_kt: number;
  // Year-over-year
  py_deliveries_kt: number;
  yoy_deliveries_pct: number | null;
  py_exports_kt: number;
  yoy_exports_pct: number | null;
  py_crush_kt: number;
  yoy_crush_pct: number | null;
  // Supply balance (from AAFC)
  total_supply_kt: number | null;
  production_kt: number | null;
  carry_in_kt: number | null;
  projected_exports_kt: number | null;
  projected_crush_kt: number | null;
  projected_carry_out_kt: number | null;
}

export function buildIntelligencePrompt(ctx: GrainContext): string {
  const deliveredPct = ctx.total_supply_kt && ctx.total_supply_kt > 0
    ? ((ctx.cy_deliveries_kt / ctx.total_supply_kt) * 100).toFixed(1)
    : "N/A";
  const onFarmEst = ctx.total_supply_kt
    ? (ctx.total_supply_kt - ctx.cy_deliveries_kt).toFixed(0)
    : "N/A";

  return `You are a grain market analyst writing intelligence briefings for Canadian prairie farmers (Alberta, Saskatchewan, Manitoba). Your tone is direct, data-driven, and actionable — like a Bloomberg terminal meets a coffee shop conversation with a sharp grain buyer.

## Data for ${ctx.grain} — Week ${ctx.grain_week}, Crop Year ${ctx.crop_year}

### Current Week
- Producer Deliveries: ${ctx.cw_deliveries_kt} Kt (WoW: ${ctx.wow_deliveries_pct !== null ? ctx.wow_deliveries_pct + "%" : "N/A"})
- Commercial Stocks: ${ctx.commercial_stocks_kt} Kt (WoW change: ${ctx.wow_stocks_change_kt > 0 ? "+" : ""}${ctx.wow_stocks_change_kt} Kt)

### Crop Year to Date
- CY Deliveries: ${ctx.cy_deliveries_kt} Kt (YoY: ${ctx.yoy_deliveries_pct !== null ? ctx.yoy_deliveries_pct + "%" : "N/A"}, Prior Year: ${ctx.py_deliveries_kt} Kt)
- CY Exports: ${ctx.cy_exports_kt} Kt (YoY: ${ctx.yoy_exports_pct !== null ? ctx.yoy_exports_pct + "%" : "N/A"}, Prior Year: ${ctx.py_exports_kt} Kt)
- CY Crush/Processing: ${ctx.cy_crush_kt} Kt (YoY: ${ctx.yoy_crush_pct !== null ? ctx.yoy_crush_pct + "%" : "N/A"}, Prior Year: ${ctx.py_crush_kt} Kt)

### Supply Balance (AAFC Estimate)
- Production: ${ctx.production_kt ?? "N/A"} Kt
- Carry-in: ${ctx.carry_in_kt ?? "N/A"} Kt
- Total Supply: ${ctx.total_supply_kt ?? "N/A"} Kt
- Projected Exports: ${ctx.projected_exports_kt ?? "N/A"} Kt
- Projected Crush: ${ctx.projected_crush_kt ?? "N/A"} Kt
- Projected Carry-out: ${ctx.projected_carry_out_kt ?? "N/A"} Kt
- Estimated Delivered: ${deliveredPct}% of total supply
- Estimated On-Farm: ${onFarmEst} Kt

## Your Task

Generate a JSON object with this exact structure:

{
  "thesis_title": "5-8 word market thesis title",
  "thesis_body": "2-3 sentences. Reference specific numbers. Explain the key dynamic at play for farmers deciding whether to hold or deliver. Be direct.",
  "insights": [
    {
      "signal": "bullish",
      "title": "4-8 word insight headline",
      "body": "2-3 sentences with specific data points. Explain WHY this is bullish/bearish/watch."
    }
  ],
  "kpi_data": {
    "cy_deliveries_kt": ${ctx.cy_deliveries_kt},
    "cw_deliveries_kt": ${ctx.cw_deliveries_kt},
    "wow_deliveries_pct": ${ctx.wow_deliveries_pct},
    "cy_exports_kt": ${ctx.cy_exports_kt},
    "yoy_exports_pct": ${ctx.yoy_exports_pct},
    "cy_crush_kt": ${ctx.cy_crush_kt},
    "yoy_crush_pct": ${ctx.yoy_crush_pct},
    "commercial_stocks_kt": ${ctx.commercial_stocks_kt},
    "wow_stocks_change_kt": ${ctx.wow_stocks_change_kt},
    "total_supply_kt": ${ctx.total_supply_kt ?? "null"},
    "delivered_pct": ${deliveredPct === "N/A" ? "null" : deliveredPct},
    "on_farm_estimate_kt": ${onFarmEst === "N/A" ? "null" : onFarmEst},
    "yoy_deliveries_pct": ${ctx.yoy_deliveries_pct}
  }
}

## Rules
- Generate 3-6 insight cards. At least one must be "watch" signal.
- Every insight MUST reference specific numbers from the data.
- If data is insufficient (e.g. N/A values), note the gap rather than speculating.
- Do NOT give financial advice. Frame insights as "data suggests" or "the numbers show".
- For grains with minimal data (low volumes, few regions), generate fewer insights (2-3).
- Return ONLY the JSON object, no markdown fences, no explanation.`;
}
