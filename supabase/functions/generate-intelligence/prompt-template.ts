/**
 * Prompt template for generating grain market intelligence.
 *
 * Designed by: innovation-agent
 * Signal taxonomy:
 *   - bullish: data supports price strength / farmer holding thesis
 *   - bearish: data suggests price weakness / urgency to sell
 *   - watch: noteworthy but directionally ambiguous
 *   - social: signal derived from X/Twitter market sentiment
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

  return `You are a grain market analyst writing intelligence briefings for Canadian prairie farmers (Alberta, Saskatchewan, Manitoba). Your tone is direct, data-driven, and actionable — like a Bloomberg terminal meets a coffee shop conversation with a sharp grain buyer.

You have access to real-time X (Twitter) search. Search X for recent posts about ${ctx.grain} market conditions in Canada — look for farmer sentiment, elevator bids, export activity, analyst commentary, and weather impacts. Reference specific posts when they provide meaningful market signal.

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
- Delivered to Date: ${deliveredPct}% of total supply

## Your Task

Generate a JSON object with the intelligence analysis. Include 3-6 insight cards. Use signal types: "bullish", "bearish", "watch", or "social" (for insights driven by X/Twitter market sentiment). Include at least one "watch" signal. If you found relevant X posts, include at least one "social" signal referencing them. The kpi_data must echo the exact numbers from above — do not invent new metrics.

## Rules
- Every insight MUST reference specific numbers from the data or specific X posts.
- If data is insufficient (e.g. N/A values), note the gap rather than speculating.
- Do NOT give financial advice. Frame insights as "data suggests" or "the numbers show".
- For grains with minimal data (low volumes, few regions), generate fewer insights (2-3).
- If no relevant X posts are found, skip "social" signals — do not fabricate social media references.
- Return ONLY the JSON object.`;
}
