# Pipeline v2 — Senior Analyst Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the dual-LLM prescriptive-rules pipeline with a single-pass Senior Analyst Edge Function (`analyze-grain-market`) that uses web_search + x_search tools, distilled book expertise, and pre-computed ratios.

**Architecture:** New Edge Function `analyze-grain-market` sits alongside existing pipeline during validation. It calls Grok 4.1 Fast Reasoning with native search tools, a dynamic Shipping Calendar, pre-computed analyst ratios, and retrieved knowledge chunks. Writes to both `market_analysis` and `grain_intelligence` tables for backward compatibility.

**Tech Stack:** xAI Responses API, Supabase Edge Functions (Deno), Vitest for unit tests, existing `knowledge-context.ts` retrieval.

---

## Task 1: Shipping Calendar Module

**Files:**
- Create: `supabase/functions/_shared/shipping-calendar.ts`
- Test: `lib/__tests__/shipping-calendar.test.ts`

**Step 1: Write the failing test**

Create `lib/__tests__/shipping-calendar.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  buildShippingCalendar,
  getSeasonalContext,
  type ShippingCalendar,
} from "../shipping-calendar";

describe("getSeasonalContext", () => {
  it("returns harvest context for weeks 1-8", () => {
    const ctx = getSeasonalContext(5);
    expect(ctx).toContain("harvest");
  });

  it("returns peak shipping for weeks 9-17", () => {
    const ctx = getSeasonalContext(12);
    expect(ctx).toContain("shipping");
  });

  it("returns mid-shipping for weeks 18-26", () => {
    const ctx = getSeasonalContext(22);
    expect(ctx).toContain("export");
  });

  it("returns late shipping for weeks 27-35", () => {
    const ctx = getSeasonalContext(30);
    expect(ctx).toContain("seeding");
  });

  it("returns growing season for weeks 36-44", () => {
    const ctx = getSeasonalContext(40);
    expect(ctx).toContain("weather");
  });

  it("returns pre-harvest for weeks 45-52", () => {
    const ctx = getSeasonalContext(48);
    expect(ctx).toContain("new-crop");
  });
});

describe("buildShippingCalendar", () => {
  it("computes data lag correctly", () => {
    const cal = buildShippingCalendar(33, 31, "2025-2026");
    expect(cal.currentCalendarWeek).toBe(33);
    expect(cal.latestDataWeek).toBe(31);
    expect(cal.dataLag).toBe(2);
  });

  it("formats prompt text with all fields", () => {
    const cal = buildShippingCalendar(33, 31, "2025-2026");
    expect(cal.promptText).toContain("Week 33");
    expect(cal.promptText).toContain("Week 31");
    expect(cal.promptText).toContain("2 weeks");
    expect(cal.promptText).toContain("Thursday");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- lib/__tests__/shipping-calendar.test.ts`
Expected: FAIL — module not found

**Step 3: Write the shared implementation**

Create `lib/shipping-calendar.ts` (NOT in supabase/functions — this is the source of truth that both Next.js and Edge Functions use):

```typescript
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
  const dataLag = currentCalendarWeek - latestDataWeek;
  const seasonalContext = getSeasonalContext(currentCalendarWeek);

  const promptText = `## Shipping Calendar
- Current calendar week: ${currentCalendarWeek}
- Latest CGC data: Week ${latestDataWeek}
- Data lag: ${dataLag} week${dataLag !== 1 ? "s" : ""}
- Next CGC release: Thursday, ~1pm MST
- Crop year: ${cropYear}
- Season: ${seasonalContext}
- FRAMING: Your Supabase data is verified through Week ${latestDataWeek}. Your web/X research covers what's happening NOW — you're building the story for Week${dataLag > 1 ? `s ${latestDataWeek + 1}-${currentCalendarWeek}` : ` ${currentCalendarWeek}`} that the next data release will confirm or contradict.`;

  return {
    currentCalendarWeek,
    latestDataWeek,
    dataLag,
    cropYear,
    seasonalContext,
    promptText,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- lib/__tests__/shipping-calendar.test.ts`
Expected: PASS (all 8 tests)

**Step 5: Create Deno-compatible copy for Edge Functions**

Create `supabase/functions/_shared/shipping-calendar.ts` — identical logic but Deno-compatible (no Node imports). Copy the same code since Edge Functions can't import from `lib/`.

**Step 6: Commit**

```bash
git add lib/shipping-calendar.ts lib/__tests__/shipping-calendar.test.ts supabase/functions/_shared/shipping-calendar.ts
git commit -m "feat(pipeline-v2): add dynamic Shipping Calendar module

Computes temporal context for the Senior Analyst: current week, latest
data week, data lag, seasonal context, and formatted prompt injection.
Dual copies: lib/ for Next.js tests, supabase/functions/_shared/ for Deno."
```

---

## Task 2: Pre-Computed Analyst Ratios (Data Brief Builder)

**Files:**
- Create: `supabase/functions/_shared/data-brief.ts`
- Test: `lib/__tests__/data-brief.test.ts`

**Step 1: Write the failing test**

Create `lib/__tests__/data-brief.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { computeAnalystRatios, type AnalystRatios } from "../data-brief";

describe("computeAnalystRatios", () => {
  const baseData = {
    cyExportsKt: 3000,
    projectedExportsKt: 6000,
    cyCrushKt: 2000,
    projectedCrushKt: 4000,
    cyDeliveriesKt: 5000,
    totalSupplyKt: 20000,
    commercialStocksKt: 3000,
    annualCrushCapacityKt: 5000,
    latestDataWeek: 31,
    deliveriesHistAvg: 4500,
    exportsHistAvg: 2800,
    mmNetContracts: -15000,
    mmNetPctOi: -8.5,
  };

  it("computes export pace ratio correctly", () => {
    const ratios = computeAnalystRatios(baseData);
    expect(ratios.exportPaceRatio).toBeCloseTo(50.0, 1);
  });

  it("computes annualized export pace", () => {
    const ratios = computeAnalystRatios(baseData);
    // (3000 / 31) * 52 = 5032.3
    expect(ratios.annualizedExportPace).toBeCloseTo(5032.3, 0);
  });

  it("computes stocks-to-use ratio", () => {
    const ratios = computeAnalystRatios(baseData);
    // 3000 / (6000 + 4000) = 30%
    expect(ratios.stocksToUse).toBeCloseTo(30.0, 1);
  });

  it("computes delivery pace vs 5yr avg", () => {
    const ratios = computeAnalystRatios(baseData);
    // (5000 - 4500) / 4500 * 100 = 11.1%
    expect(ratios.deliveriesVs5yrPct).toBeCloseTo(11.1, 1);
  });

  it("computes crush utilization", () => {
    const ratios = computeAnalystRatios(baseData);
    // (2000 / 31 * 52) / 5000 * 100 = 67.1%
    expect(ratios.crushUtilizationPct).toBeCloseTo(67.1, 0);
  });

  it("returns null for missing data", () => {
    const ratios = computeAnalystRatios({
      ...baseData,
      projectedExportsKt: null,
      projectedCrushKt: null,
    });
    expect(ratios.exportPaceRatio).toBeNull();
    expect(ratios.stocksToUse).toBeNull();
  });

  it("formats prompt section with all ratios", () => {
    const ratios = computeAnalystRatios(baseData);
    expect(ratios.promptSection).toContain("Export pace:");
    expect(ratios.promptSection).toContain("Stocks-to-use:");
    expect(ratios.promptSection).toContain("Crush utilization:");
    expect(ratios.promptSection).toContain("Managed Money");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- lib/__tests__/data-brief.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `lib/data-brief.ts`:

```typescript
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

  const annualizedExportPace = input.latestDataWeek > 0
    ? (input.cyExportsKt / input.latestDataWeek) * 52
    : null;

  const totalDemand =
    input.projectedExportsKt != null && input.projectedCrushKt != null
      ? input.projectedExportsKt + input.projectedCrushKt
      : null;
  const stocksToUse = safePct(input.commercialStocksKt, totalDemand);

  const deliveriesVs5yrPct =
    input.deliveriesHistAvg != null && input.deliveriesHistAvg > 0
      ? ((input.cyDeliveriesKt - input.deliveriesHistAvg) / input.deliveriesHistAvg) * 100
      : null;

  const exportsVs5yrPct =
    input.exportsHistAvg != null && input.exportsHistAvg > 0
      ? ((input.cyExportsKt - input.exportsHistAvg) / input.exportsHistAvg) * 100
      : null;

  const deliveredPctOfSupply = safePct(input.cyDeliveriesKt, input.totalSupplyKt);

  const annualizedCrush = input.latestDataWeek > 0
    ? (input.cyCrushKt / input.latestDataWeek) * 52
    : null;
  const crushUtilizationPct =
    annualizedCrush != null && input.annualCrushCapacityKt != null && input.annualCrushCapacityKt > 0
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
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- lib/__tests__/data-brief.test.ts`
Expected: PASS (all 7 tests)

**Step 5: Create Deno-compatible copy**

Create `supabase/functions/_shared/data-brief.ts` — same logic, Deno-compatible.

**Step 6: Commit**

```bash
git add lib/data-brief.ts lib/__tests__/data-brief.test.ts supabase/functions/_shared/data-brief.ts
git commit -m "feat(pipeline-v2): add pre-computed analyst ratios module

Export pace ratio, stocks-to-use, crush utilization, delivery/export
vs 5yr avg — all computed server-side so the analyst interprets rather
than calculates. Prevents Barley/Flaxseed-style misreads."
```

---

## Task 3: Senior Analyst System Prompt Builder

**Files:**
- Create: `supabase/functions/_shared/analyst-prompt.ts`
- Test: `lib/__tests__/analyst-prompt.test.ts`

**Step 1: Write the failing test**

Create `lib/__tests__/analyst-prompt.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  buildAnalystSystemPrompt,
  buildAnalystUserPrompt,
  GRAIN_RESEARCH_TIERS,
  type AnalystPromptInput,
} from "../analyst-prompt";

describe("GRAIN_RESEARCH_TIERS", () => {
  it("classifies major grains with 4+4 searches", () => {
    expect(GRAIN_RESEARCH_TIERS["Wheat"]).toEqual({ webSearches: 4, xSearches: 4, tier: "major" });
    expect(GRAIN_RESEARCH_TIERS["Canola"]).toEqual({ webSearches: 4, xSearches: 4, tier: "major" });
  });

  it("classifies mid grains with 2+2 searches", () => {
    expect(GRAIN_RESEARCH_TIERS["Flaxseed"]).toEqual({ webSearches: 2, xSearches: 2, tier: "mid" });
  });

  it("classifies minor grains with 1+1 searches", () => {
    expect(GRAIN_RESEARCH_TIERS["Mustard Seed"]).toEqual({ webSearches: 1, xSearches: 1, tier: "minor" });
  });
});

describe("buildAnalystSystemPrompt", () => {
  it("includes identity section", () => {
    const prompt = buildAnalystSystemPrompt();
    expect(prompt).toContain("senior grain market analyst");
  });

  it("includes commodity knowledge", () => {
    const prompt = buildAnalystSystemPrompt();
    expect(prompt).toContain("Basis Signal Matrix");
    expect(prompt).toContain("Storage Decision Algorithm");
  });

  it("includes research protocol", () => {
    const prompt = buildAnalystSystemPrompt();
    expect(prompt).toContain("RESEARCH FIRST");
    expect(prompt).toContain("REASON THROUGH DATA");
    expect(prompt).toContain("CONCLUDE WITH CONVICTION");
  });

  it("does NOT include old prescriptive rules", () => {
    const prompt = buildAnalystSystemPrompt();
    expect(prompt).not.toContain("CGC_DATA_GUARDRAILS");
    expect(prompt).not.toContain("DISTILLED_GRAIN_FRAMEWORK");
    expect(prompt).not.toContain("SIGNAL_RESEARCH_RULES");
  });
});

describe("buildAnalystUserPrompt", () => {
  const mockInput: AnalystPromptInput = {
    grain: "Canola",
    cropYear: "2025-2026",
    shippingCalendarText: "## Shipping Calendar\n- Current calendar week: 33",
    ratiosText: "## Pre-Computed Analyst Ratios\n- Export pace: 50%",
    dataText: "## Market Data\n- Deliveries: 5000 Kt",
    knowledgeText: "## Retrieved Knowledge\n- Canola crush demand...",
    tier: { webSearches: 4, xSearches: 4, tier: "major" as const },
  };

  it("includes all sections in order", () => {
    const prompt = buildAnalystUserPrompt(mockInput);
    const calIdx = prompt.indexOf("Shipping Calendar");
    const ratioIdx = prompt.indexOf("Pre-Computed Analyst Ratios");
    const dataIdx = prompt.indexOf("Market Data");
    const knowledgeIdx = prompt.indexOf("Retrieved Knowledge");

    expect(calIdx).toBeGreaterThan(-1);
    expect(ratioIdx).toBeGreaterThan(calIdx);
    expect(dataIdx).toBeGreaterThan(ratioIdx);
    expect(knowledgeIdx).toBeGreaterThan(dataIdx);
  });

  it("includes research depth guidance for major grains", () => {
    const prompt = buildAnalystUserPrompt(mockInput);
    expect(prompt).toContain("4 web searches");
    expect(prompt).toContain("4 X searches");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- lib/__tests__/analyst-prompt.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `lib/analyst-prompt.ts`:

```typescript
/**
 * Senior Analyst v2 prompt builder.
 *
 * Assembles the system prompt (identity + commodity knowledge + research protocol)
 * and the user prompt (shipping calendar + ratios + data + retrieved knowledge).
 *
 * Key difference from v1: NO prescriptive rules about what data points mean.
 * The commodity knowledge IS the guardrails.
 */

// Import commodity knowledge as a string constant.
// In Edge Functions this is imported from the Deno path.
// For tests we inline a reference.
import { COMMODITY_KNOWLEDGE } from "./commodity-knowledge-text";

export interface GrainResearchTier {
  webSearches: number;
  xSearches: number;
  tier: "major" | "mid" | "minor";
}

export const GRAIN_RESEARCH_TIERS: Record<string, GrainResearchTier> = {
  Wheat: { webSearches: 4, xSearches: 4, tier: "major" },
  Canola: { webSearches: 4, xSearches: 4, tier: "major" },
  "Amber Durum": { webSearches: 4, xSearches: 4, tier: "major" },
  Barley: { webSearches: 4, xSearches: 4, tier: "major" },
  Oats: { webSearches: 4, xSearches: 4, tier: "major" },
  Peas: { webSearches: 4, xSearches: 4, tier: "major" },
  Flaxseed: { webSearches: 2, xSearches: 2, tier: "mid" },
  Soybeans: { webSearches: 2, xSearches: 2, tier: "mid" },
  Corn: { webSearches: 2, xSearches: 2, tier: "mid" },
  Lentils: { webSearches: 2, xSearches: 2, tier: "mid" },
  Rye: { webSearches: 2, xSearches: 2, tier: "mid" },
  "Mustard Seed": { webSearches: 1, xSearches: 1, tier: "minor" },
  "Sunflower Seed": { webSearches: 1, xSearches: 1, tier: "minor" },
  "Canary Seed": { webSearches: 1, xSearches: 1, tier: "minor" },
  Triticale: { webSearches: 1, xSearches: 1, tier: "minor" },
  Chickpeas: { webSearches: 1, xSearches: 1, tier: "minor" },
};

const IDENTITY = `You are a senior grain market analyst specializing in Canadian prairie grains. You think like someone who has spent 20 years advising farmers in Alberta, Saskatchewan, and Manitoba on delivery timing, basis opportunities, and risk management. You speak plainly — no trader jargon, no academic hedging. When a farmer asks "should I haul or hold?", you give a direct answer backed by evidence.

You write for prairie grain farmers, not Wall Street traders. Always optimize for the decisions a farmer can act on this week: deliver now or wait, price a slice or stay patient, watch basis and logistics, identify the catalyst and the risk to the thesis.`;

const DATA_HYGIENE = `## Data Hygiene Notes
- All CGC data is in thousands of metric tonnes (Kt). Do not convert to bushels.
- "Crop Year" values are cumulative year-to-date. "Current Week" values are weekly snapshots.
- Wheat and Amber Durum are distinct grains. Never combine unless analyzing "Total Wheat."
- During the first 4 weeks (Aug-Sep), high visible stocks are carry-in, not new-crop.
- Never sum "Current Week" values to get cumulative — CGC revises past weeks. Use published "Crop Year" figure.`;

const RESEARCH_PROTOCOL = `## Research Protocol

1. RESEARCH FIRST: Before forming any thesis, use your web_search and x_search tools to discover what's happening RIGHT NOW for this grain. Search for: recent price action, trade policy changes, weather events, logistics disruptions, export deals, crush/processing news.

2. REASON THROUGH DATA: Compare what you found online against the verified Supabase data in your Data Brief. If web numbers differ from CGC numbers, note the discrepancy — CGC is the source of truth for historical data; web/X reveals what's happening between data releases.

3. CONCLUDE WITH CONVICTION: Answer the farmer's questions:
   - "Is price going up or down?" → stance_score (-100 to +100)
   - "How sure are you?" → confidence_score (0-100)
   - "What would you recommend?" → actionable final_assessment
   - "How do I look vs everyone else?" → use community delivery stats for peer context

4. CITE EVERYTHING: Every claim must trace to either Supabase data, a web source, or an X post. No unsourced assertions.

## Stance Score Guide
- Strongly bullish: +70 to +100. Holding is clearly favored, multiple confirming signals.
- Bullish: +20 to +69. Leaning positive, some uncertainty.
- Neutral: -19 to +19. Genuinely mixed signals, no clear edge.
- Bearish: -69 to -20. Leaning negative, consider delivering.
- Strongly bearish: -100 to -70. Move grain, multiple confirming bearish signals.

Base your score on the weight of evidence. Do NOT cluster around -40 to -50 by default.`;

export function buildAnalystSystemPrompt(): string {
  return [IDENTITY, COMMODITY_KNOWLEDGE, DATA_HYGIENE, RESEARCH_PROTOCOL].join("\n\n");
}

export interface AnalystPromptInput {
  grain: string;
  cropYear: string;
  shippingCalendarText: string;
  ratiosText: string;
  dataText: string;
  knowledgeText: string | null;
  tier: GrainResearchTier;
}

export function buildAnalystUserPrompt(input: AnalystPromptInput): string {
  const researchGuidance = `## Research Guidance
You are analyzing **${input.grain}** (${input.tier.tier} grain). Use up to ${input.tier.webSearches} web searches and ${input.tier.xSearches} X searches to research current conditions. Focus on Canadian prairie context first, then global factors.`;

  const knowledgeSection = input.knowledgeText
    ? `## Retrieved Grain Marketing Knowledge\n${input.knowledgeText}\n\nUse this as deep context for market structure, hedging, basis, and seasonal interpretation. If it conflicts with this week's data, prefer the data and note the tension.`
    : "No additional retrieved knowledge available. Rely on your commodity market framework and the data brief.";

  const taskSection = `## Task
Produce a structured JSON market analysis for **${input.grain}**, crop year ${input.cropYear}. Research first, then analyze the data, then conclude. Your output will be displayed to prairie grain farmers as their weekly market intelligence.`;

  return [
    input.shippingCalendarText,
    input.ratiosText,
    input.dataText,
    knowledgeSection,
    researchGuidance,
    taskSection,
  ].join("\n\n");
}
```

**Important:** The `COMMODITY_KNOWLEDGE` import needs a client-safe re-export. Create `lib/commodity-knowledge-text.ts`:

```typescript
/**
 * Re-export of COMMODITY_KNOWLEDGE for use in Next.js/Vitest context.
 * The Edge Function version imports from the Deno-compatible path.
 */
export { COMMODITY_KNOWLEDGE } from "../supabase/functions/_shared/commodity-knowledge";
```

Note: This may need path adjustment depending on how the project resolves supabase imports in Vitest. If the import fails, inline the constant or create a shared copy in `lib/`.

**Step 4: Run test to verify it passes**

Run: `npm run test -- lib/__tests__/analyst-prompt.test.ts`
Expected: PASS (all 7 tests)

**Step 5: Create Deno-compatible Edge Function version**

Create `supabase/functions/_shared/analyst-prompt.ts` — same exports but imports from Deno-local `./commodity-knowledge.ts`.

**Step 6: Commit**

```bash
git add lib/analyst-prompt.ts lib/commodity-knowledge-text.ts lib/__tests__/analyst-prompt.test.ts supabase/functions/_shared/analyst-prompt.ts
git commit -m "feat(pipeline-v2): add Senior Analyst prompt builder

Identity + commodity knowledge + research protocol system prompt.
User prompt assembles shipping calendar, ratios, data, and retrieved
knowledge. Grain research tiers: major (4+4), mid (2+2), minor (1+1).
No prescriptive rules — the book knowledge IS the guardrails."
```

---

## Task 4: The Edge Function — `analyze-grain-market`

**Files:**
- Create: `supabase/functions/analyze-grain-market/index.ts`

This is the core implementation. It follows the same structure as `analyze-market-data/index.ts` but with the v2 architecture.

**Step 1: Scaffold the Edge Function**

Create `supabase/functions/analyze-grain-market/index.ts`:

```typescript
/**
 * Supabase Edge Function: analyze-grain-market (Pipeline v2)
 *
 * Single-pass Senior Analyst with web_search + x_search tools.
 * Replaces the dual-LLM chain: analyze-market-data + generate-intelligence.
 *
 * Pipeline v2: search-x-intelligence → analyze-grain-market → generate-farm-summary
 *
 * Request body (optional):
 *   { "crop_year": "2025-2026", "grain_week": 31, "grains": ["Canola"] }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  enqueueInternalFunction,
  requireInternalRequest,
} from "../_shared/internal-auth.ts";
import { COMMODITY_KNOWLEDGE } from "../_shared/commodity-knowledge.ts";
import { fetchKnowledgeContext } from "../_shared/knowledge-context.ts";
import { buildShippingCalendar } from "../_shared/shipping-calendar.ts";
import { computeAnalystRatios } from "../_shared/data-brief.ts";
import {
  MARKET_INTELLIGENCE_VERSIONS,
  KNOWLEDGE_SOURCE_PATHS,
} from "../_shared/market-intelligence-config.ts";

const XAI_API_URL = "https://api.x.ai/v1/responses";
const MODEL = "grok-4-1-fast-reasoning";
const BATCH_SIZE = 1;
const PIPELINE_VERSION = "analyze-grain-market-v1";

// -- Grain research tiers (search depth by importance) --

interface GrainTier {
  webSearches: number;
  xSearches: number;
  tier: "major" | "mid" | "minor";
}

const GRAIN_TIERS: Record<string, GrainTier> = {
  Wheat: { webSearches: 4, xSearches: 4, tier: "major" },
  Canola: { webSearches: 4, xSearches: 4, tier: "major" },
  "Amber Durum": { webSearches: 4, xSearches: 4, tier: "major" },
  Barley: { webSearches: 4, xSearches: 4, tier: "major" },
  Oats: { webSearches: 4, xSearches: 4, tier: "major" },
  Peas: { webSearches: 4, xSearches: 4, tier: "major" },
  Flaxseed: { webSearches: 2, xSearches: 2, tier: "mid" },
  Soybeans: { webSearches: 2, xSearches: 2, tier: "mid" },
  Corn: { webSearches: 2, xSearches: 2, tier: "mid" },
  Lentils: { webSearches: 2, xSearches: 2, tier: "mid" },
  Rye: { webSearches: 2, xSearches: 2, tier: "mid" },
  "Mustard Seed": { webSearches: 1, xSearches: 1, tier: "minor" },
  "Sunflower Seed": { webSearches: 1, xSearches: 1, tier: "minor" },
  "Canary Seed": { webSearches: 1, xSearches: 1, tier: "minor" },
  Triticale: { webSearches: 1, xSearches: 1, tier: "minor" },
  Chickpeas: { webSearches: 1, xSearches: 1, tier: "minor" },
};

// -- System prompt (stable across grains, cacheable) --

const IDENTITY = `You are a senior grain market analyst specializing in Canadian prairie grains. You think like someone who has spent 20 years advising farmers in Alberta, Saskatchewan, and Manitoba on delivery timing, basis opportunities, and risk management. You speak plainly — no trader jargon, no academic hedging. When a farmer asks "should I haul or hold?", you give a direct answer backed by evidence.

You write for prairie grain farmers, not Wall Street traders. Always optimize for the decisions a farmer can act on this week: deliver now or wait, price a slice or stay patient, watch basis and logistics, identify the catalyst and the risk to the thesis.`;

const DATA_HYGIENE = `## Data Hygiene Notes
- All CGC data is in thousands of metric tonnes (Kt). Do not convert to bushels.
- "Crop Year" values are cumulative year-to-date. "Current Week" values are weekly snapshots.
- Wheat and Amber Durum are distinct grains. Never combine unless analyzing "Total Wheat."
- During the first 4 weeks (Aug-Sep), high visible stocks are carry-in, not new-crop.
- Never sum "Current Week" values to get cumulative — CGC revises past weeks. Use published "Crop Year" figure.`;

const RESEARCH_PROTOCOL = `## Research Protocol

1. RESEARCH FIRST: Before forming any thesis, use your web_search and x_search tools to discover what's happening RIGHT NOW for this grain. Search for: recent price action, trade policy changes, weather events, logistics disruptions, export deals, crush/processing news.

2. REASON THROUGH DATA: Compare what you found online against the verified Supabase data in your Data Brief. If web numbers differ from CGC numbers, note the discrepancy — CGC is the source of truth for historical data; web/X reveals what's happening between data releases.

3. CONCLUDE WITH CONVICTION: Answer the farmer's questions:
   - "Is price going up or down?" → stance_score (-100 to +100)
   - "How sure are you?" → confidence_score (0-100)
   - "What would you recommend?" → actionable final_assessment
   - "How do I look vs everyone else?" → use community delivery stats for peer context

4. CITE EVERYTHING: Every claim must trace to either Supabase data, a web source, or an X post. No unsourced assertions.

## Stance Score Guide
- Strongly bullish: +70 to +100. Holding is clearly favored, multiple confirming signals.
- Bullish: +20 to +69. Leaning positive, some uncertainty.
- Neutral: -19 to +19. Genuinely mixed signals, no clear edge.
- Bearish: -69 to -20. Leaning negative, consider delivering.
- Strongly bearish: -100 to -70. Move grain, multiple confirming bearish signals.

Base your score on the weight of evidence. Do NOT default to moderate-bearish.`;

function buildSystemPrompt(): string {
  return [IDENTITY, COMMODITY_KNOWLEDGE, DATA_HYGIENE, RESEARCH_PROTOCOL].join("\n\n");
}

// -- JSON output schema (xAI structured outputs) --

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    initial_thesis: { type: "string" },
    bull_case: { type: "string" },
    bear_case: { type: "string" },
    historical_context: {
      type: "object",
      properties: {
        deliveries_vs_5yr_avg_pct: { type: ["number", "null"] },
        exports_vs_5yr_avg_pct: { type: ["number", "null"] },
        seasonal_observation: { type: "string" },
        notable_patterns: { type: "array", items: { type: "string" } },
      },
      required: ["deliveries_vs_5yr_avg_pct", "exports_vs_5yr_avg_pct", "seasonal_observation", "notable_patterns"],
      additionalProperties: false,
    },
    data_confidence: { type: "string", enum: ["high", "medium", "low"] },
    confidence_score: { type: ["integer", "null"] },
    stance_score: { type: ["integer", "null"] },
    final_assessment: { type: ["string", "null"] },
    key_signals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          signal: { type: "string", enum: ["bullish", "bearish", "watch"] },
          title: { type: "string" },
          body: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          source: { type: "string", enum: ["CGC", "AAFC", "Historical", "Community", "CFTC", "Web", "X"] },
        },
        required: ["signal", "title", "body", "confidence", "source"],
        additionalProperties: false,
      },
    },
    research_sources: {
      type: "array",
      items: {
        type: "object",
        properties: {
          url: { type: "string" },
          title: { type: "string" },
          source_type: { type: "string", enum: ["web", "x_post"] },
          relevance: { type: "string" },
        },
        required: ["url", "title", "source_type", "relevance"],
        additionalProperties: false,
      },
    },
    data_vs_web_discrepancies: {
      type: "array",
      items: {
        type: "object",
        properties: {
          metric: { type: "string" },
          supabase_value: { type: "string" },
          web_value: { type: "string" },
          analyst_note: { type: "string" },
        },
        required: ["metric", "supabase_value", "web_value", "analyst_note"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "initial_thesis", "bull_case", "bear_case", "historical_context",
    "data_confidence", "confidence_score", "stance_score", "final_assessment",
    "key_signals", "research_sources", "data_vs_web_discrepancies",
  ],
  additionalProperties: false,
};

// -- Main handler --

Deno.serve(async (req) => {
  const authError = requireInternalRequest(req);
  if (authError) return authError;

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const xaiKey = Deno.env.get("XAI_API_KEY");
    if (!xaiKey) {
      return new Response(
        JSON.stringify({ error: "XAI_API_KEY not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const cropYear: string = body.crop_year || getCurrentCropYear();
    const requestedWeek: number | undefined = body.grain_week;
    const targetGrains: string[] | undefined = body.grains;

    // Compute the dynamic shipping calendar
    const currentCalendarWeek = getCurrentGrainWeek();

    // Get latest data week from the database
    const { data: latestWeekData } = await supabase
      .from("cgc_observations")
      .select("grain_week")
      .eq("crop_year", cropYear)
      .order("grain_week", { ascending: false })
      .limit(1)
      .single();
    const latestDataWeek = requestedWeek || (latestWeekData?.grain_week as number) || currentCalendarWeek;

    const shippingCalendar = buildShippingCalendar(currentCalendarWeek, latestDataWeek, cropYear);

    console.log(`[v2] Analyzing grains for week ${latestDataWeek}, crop year ${cropYear} (calendar week ${currentCalendarWeek})`);

    // Get grain list
    const { data: grains } = await supabase
      .from("grains")
      .select("name")
      .eq("category", "Canadian")
      .order("display_order");

    const allGrainNames = targetGrains || (grains ?? []).map((g: { name: string }) => g.name);
    const grainNames = allGrainNames.slice(0, BATCH_SIZE);
    const remainingGrains = allGrainNames.slice(BATCH_SIZE);

    // -- Batch data queries (shared across grains in this batch) --
    const [
      { data: yoyData },
      { data: supplyData },
      { data: sentimentData },
      { data: deliveryAnalytics },
      { data: logisticsSnapshot },
    ] = await Promise.all([
      supabase.from("v_grain_yoy_comparison").select("*"),
      supabase.from("v_supply_pipeline").select("*").eq("crop_year", cropYear),
      supabase.rpc("get_sentiment_overview", { p_crop_year: cropYear, p_grain_week: latestDataWeek }),
      supabase.rpc("get_delivery_analytics", { p_crop_year: cropYear, p_grain: null }),
      supabase.rpc("get_logistics_snapshot", { p_crop_year: cropYear, p_grain_week: latestDataWeek }),
    ]);

    // Build lookup maps
    const yoyByGrain = new Map((yoyData ?? []).map((r: Record<string, unknown>) => [r.grain, r]));
    const supplyByGrain = new Map((supplyData ?? []).map((r: Record<string, unknown>) => [r.grain_name, r]));
    const sentimentByGrain = new Map(
      (sentimentData ?? []).map((r: Record<string, unknown>) => [
        r.grain as string,
        { vote_count: Number(r.vote_count), pct_holding: Number(r.pct_holding), pct_hauling: Number(r.pct_hauling), pct_neutral: Number(r.pct_neutral) },
      ]),
    );
    const deliveryByGrain = new Map(
      (deliveryAnalytics ?? []).map((r: Record<string, unknown>) => [r.grain as string, r]),
    );

    // -- Stored X signals (supplementary context from pulse/deep scanning) --
    const { data: storedSignals } = await supabase
      .from("x_market_signals")
      .select("grain, post_text, relevance_score, category, post_date, source, search_mode")
      .eq("crop_year", cropYear)
      .gte("grain_week", latestDataWeek - 1)
      .order("relevance_score", { ascending: false })
      .limit(50);

    const signalsByGrain = new Map<string, Array<Record<string, unknown>>>();
    for (const sig of (storedSignals ?? [])) {
      const grain = sig.grain as string;
      if (!signalsByGrain.has(grain)) signalsByGrain.set(grain, []);
      signalsByGrain.get(grain)!.push(sig);
    }

    const results: { grain: string; status: string; error?: string }[] = [];

    for (const grainName of grainNames) {
      try {
        const yoy = yoyByGrain.get(grainName) as Record<string, unknown> | undefined;
        const supply = supplyByGrain.get(grainName) as Record<string, unknown> | undefined;
        const sentiment = sentimentByGrain.get(grainName);
        const delivery = deliveryByGrain.get(grainName) as Record<string, unknown> | undefined;
        const grainSignals = signalsByGrain.get(grainName) ?? [];
        const tier = GRAIN_TIERS[grainName] ?? { webSearches: 1, xSearches: 1, tier: "minor" as const };

        if (!yoy) {
          results.push({ grain: grainName, status: "skipped", error: "no YoY data" });
          continue;
        }

        // Per-grain queries
        const [deliveriesHist, exportsHist, stocksHist, cotData, selfSufficiencyData, processorCapacity] = await Promise.all([
          supabase.rpc("get_historical_average", { p_grain: grainName, p_metric: "Deliveries", p_worksheet: "Primary", p_grain_week: latestDataWeek, p_years_back: 5 }).then(r => r.data),
          supabase.rpc("get_historical_average", { p_grain: grainName, p_metric: "Exports", p_worksheet: "Summary", p_grain_week: latestDataWeek, p_years_back: 5 }).then(r => r.data),
          supabase.rpc("get_historical_average", { p_grain: grainName, p_metric: "Stocks In Store", p_worksheet: "Summary", p_grain_week: latestDataWeek, p_years_back: 5 }).then(r => r.data),
          supabase.rpc("get_cot_positioning", { p_grain: grainName, p_crop_year: cropYear, p_weeks_back: 4, p_max_grain_week: latestDataWeek }).then(r => r.data),
          supabase.rpc("get_processor_self_sufficiency", { p_grain: grainName, p_crop_year: cropYear }).then(r => r.data),
          supabase.from("processor_capacity").select("annual_capacity_kt").eq("grain", grainName).eq("crop_year", cropYear).maybeSingle().then(r => r.data),
        ]);

        // Retrieve knowledge chunks
        const knowledgeContext = await fetchKnowledgeContext(supabase, {
          grain: grainName,
          task: "analyze",
          extraTerms: ["delivery pace", "commercial stocks", "exports", "farmer sentiment", "western canada"],
          limit: 5,
        });

        // Compute analyst ratios
        const latestCot = Array.isArray(cotData) && cotData.length > 0 ? cotData[0] as Record<string, unknown> : null;
        const ratios = computeAnalystRatios({
          cyExportsKt: Number(yoy.cy_exports_kt ?? 0),
          projectedExportsKt: supply ? Number(supply.projected_exports_kt) : null,
          cyCrushKt: Number(yoy.cy_crush_kt ?? 0),
          projectedCrushKt: supply ? Number(supply.projected_crush_kt) : null,
          cyDeliveriesKt: Number(yoy.cy_deliveries_kt ?? 0),
          totalSupplyKt: supply ? Number(supply.total_supply_kt) : null,
          commercialStocksKt: Number(yoy.commercial_stocks_kt ?? 0),
          annualCrushCapacityKt: processorCapacity ? Number(processorCapacity.annual_capacity_kt) : null,
          latestDataWeek,
          deliveriesHistAvg: deliveriesHist ? Number(deliveriesHist.avg_value) : null,
          exportsHistAvg: exportsHist ? Number(exportsHist.avg_value) : null,
          mmNetContracts: latestCot ? Number(latestCot.managed_money_net ?? 0) : null,
          mmNetPctOi: latestCot ? Number(latestCot.managed_money_net_pct ?? 0) : null,
        });

        // Build data text (reuse v1 data format for now, with ratios prepended)
        const dataText = buildDataSection(grainName, cropYear, latestDataWeek, yoy, supply, sentiment, delivery, deliveriesHist, exportsHist, stocksHist, logisticsSnapshot, cotData, selfSufficiencyData, grainSignals);

        // Assemble prompts
        const systemPrompt = buildSystemPrompt();
        const userPrompt = [
          shippingCalendar.promptText,
          ratios.promptSection,
          dataText,
          knowledgeContext.contextText
            ? `## Retrieved Grain Marketing Knowledge\n${knowledgeContext.contextText}\n\nUse this as deep context for market structure, hedging, basis, and seasonal interpretation. If it conflicts with this week's data, prefer the data and note the tension.`
            : "No additional retrieved knowledge available. Rely on your commodity market framework and the data brief.",
          `## Research Guidance\nYou are analyzing **${grainName}** (${tier.tier} grain). Use up to ${tier.webSearches} web searches and ${tier.xSearches} X searches to research current conditions. Focus on Canadian prairie context first, then global factors.`,
          `## Task\nProduce a structured JSON market analysis for **${grainName}**, crop year ${cropYear}. Research first, then analyze the data, then conclude.`,
        ].join("\n\n");

        // Call xAI with search tools
        const tools: Array<Record<string, unknown>> = [
          { type: "web_search" },
          { type: "x_search" },
        ];

        const response = await fetch(XAI_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${xaiKey}`,
          },
          body: JSON.stringify({
            model: MODEL,
            max_output_tokens: 16384,
            tools,
            input: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            text: {
              format: {
                type: "json_schema",
                name: "market_analysis_v2",
                strict: true,
                schema: OUTPUT_SCHEMA,
              },
            },
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          results.push({ grain: grainName, status: "failed", error: `Grok API ${response.status}: ${errText.slice(0, 200)}` });
          continue;
        }

        const aiResponse = await response.json();
        const usage = aiResponse.usage ?? {};

        // Extract text content
        const messageOutput = (aiResponse.output ?? []).find((o: { type: string }) => o.type === "message");
        const content = messageOutput?.content?.find((c: { type: string }) => c.type === "output_text")?.text ?? "";

        let analysis;
        try {
          analysis = JSON.parse(content);
        } catch {
          results.push({ grain: grainName, status: "failed", error: `JSON parse failed: ${content.slice(0, 100)}` });
          continue;
        }

        // Validate and apply safe defaults
        analysis.initial_thesis = analysis.initial_thesis ?? "";
        analysis.bull_case = analysis.bull_case ?? "";
        analysis.bear_case = analysis.bear_case ?? "";
        analysis.historical_context = analysis.historical_context ?? {};
        analysis.data_confidence = ["high", "medium", "low"].includes(analysis.data_confidence) ? analysis.data_confidence : "medium";
        analysis.key_signals = Array.isArray(analysis.key_signals) ? analysis.key_signals : [];
        analysis.confidence_score = typeof analysis.confidence_score === "number" ? Math.max(0, Math.min(100, Math.round(analysis.confidence_score))) : null;
        analysis.stance_score = typeof analysis.stance_score === "number" ? Math.max(-100, Math.min(100, Math.round(analysis.stance_score))) : null;
        analysis.final_assessment = typeof analysis.final_assessment === "string" ? analysis.final_assessment : null;
        analysis.research_sources = Array.isArray(analysis.research_sources) ? analysis.research_sources : [];
        analysis.data_vs_web_discrepancies = Array.isArray(analysis.data_vs_web_discrepancies) ? analysis.data_vs_web_discrepancies : [];

        // Upsert market_analysis (backward compatible)
        const { error: upsertError } = await supabase
          .from("market_analysis")
          .upsert({
            grain: grainName,
            crop_year: cropYear,
            grain_week: latestDataWeek,
            initial_thesis: analysis.initial_thesis,
            bull_case: analysis.bull_case,
            bear_case: analysis.bear_case,
            historical_context: analysis.historical_context,
            data_confidence: analysis.data_confidence,
            key_signals: analysis.key_signals,
            confidence_score: analysis.confidence_score,
            stance_score: analysis.stance_score,
            final_assessment: analysis.final_assessment,
            model_used: MODEL,
            llm_metadata: {
              request_id: aiResponse.id ?? null,
              input_tokens: usage.input_tokens ?? null,
              output_tokens: usage.output_tokens ?? null,
              prompt_version: PIPELINE_VERSION,
              knowledge_version: MARKET_INTELLIGENCE_VERSIONS.knowledgeBase,
              knowledge_sources: [...new Set([...KNOWLEDGE_SOURCE_PATHS, ...knowledgeContext.sourcePaths])],
              knowledge_query: knowledgeContext.query,
              knowledge_topic_tags: knowledgeContext.topicTags,
              retrieved_chunk_ids: knowledgeContext.chunkIds,
              retrieved_document_ids: knowledgeContext.documentIds,
              research_sources: analysis.research_sources,
              data_vs_web_discrepancies: analysis.data_vs_web_discrepancies,
            },
            generated_at: new Date().toISOString(),
          }, { onConflict: "grain,crop_year,grain_week" });

        if (upsertError) {
          results.push({ grain: grainName, status: "failed", error: upsertError.message });
          continue;
        }

        // Also write to grain_intelligence for backward compat with dashboard
        const intelligenceNarrative = `## ${grainName} — Week ${latestDataWeek} Market Intelligence\n\n${analysis.initial_thesis}\n\n### Bull Case\n${analysis.bull_case}\n\n### Bear Case\n${analysis.bear_case}\n\n### Assessment\n${analysis.final_assessment ?? ""}`;

        await supabase
          .from("grain_intelligence")
          .upsert({
            grain: grainName,
            crop_year: cropYear,
            grain_week: latestDataWeek,
            narrative: intelligenceNarrative,
            model_used: MODEL,
            generated_at: new Date().toISOString(),
          }, { onConflict: "grain,crop_year,grain_week" });

        results.push({ grain: grainName, status: "success" });
        console.log(`[v2] ${grainName}: stance=${analysis.stance_score}, confidence=${analysis.confidence_score}, signals=${analysis.key_signals?.length ?? 0}, sources=${analysis.research_sources?.length ?? 0}`);
      } catch (err) {
        results.push({ grain: grainName, status: "failed", error: String(err).slice(0, 200) });
      }
    }

    const duration = Date.now() - startTime;
    const succeeded = results.filter(r => r.status === "success").length;
    const failed = results.filter(r => r.status === "failed").length;

    // Self-trigger for remaining grains
    if (remainingGrains.length > 0) {
      console.log(`[v2] ${remainingGrains.length} grains remaining — triggering next batch`);
      await enqueueInternalFunction(supabase, "analyze-grain-market", {
        crop_year: cropYear,
        grain_week: latestDataWeek,
        grains: remainingGrains,
      }).catch(err => console.error("Next batch trigger failed:", err));
    } else {
      // Chain to generate-farm-summary
      console.log("[v2] All grains analyzed — triggering generate-farm-summary");
      await enqueueInternalFunction(supabase, "generate-farm-summary", {
        crop_year: cropYear,
        grain_week: latestDataWeek,
      }).catch(err => console.error("generate-farm-summary trigger failed:", err));
    }

    return new Response(
      JSON.stringify({ results, duration_ms: duration, succeeded, failed, remaining: remainingGrains.length, pipeline_version: PIPELINE_VERSION }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[v2] analyze-grain-market error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

// -- Data section builder (reuses v1 format with stored signals appended) --

function buildDataSection(
  grain: string, cropYear: string, grainWeek: number,
  yoy: Record<string, unknown>,
  supply: Record<string, unknown> | undefined,
  sentiment: { vote_count: number; pct_holding: number; pct_hauling: number; pct_neutral: number } | undefined,
  delivery: Record<string, unknown> | undefined,
  deliveriesHist: Record<string, unknown> | null,
  exportsHist: Record<string, unknown> | null,
  stocksHist: Record<string, unknown> | null,
  logisticsSnapshot: Record<string, unknown> | null,
  cotData: unknown,
  selfSufficiency: unknown,
  storedSignals: Array<Record<string, unknown>>,
): string {
  // This reuses the same data formatting as analyze-market-data v1.
  // Key difference: ratios are pre-computed separately (not embedded here).
  const sections: string[] = [];

  sections.push(`## Market Data for ${grain} — CGC Week ${grainWeek}, Crop Year ${cropYear}`);

  sections.push(`### Current Week (CGC Week ${grainWeek})
- Producer Deliveries: ${fmtNum(yoy.cw_deliveries_kt)} Kt (WoW: ${fmtPct(yoy.wow_deliveries_pct)})
- Commercial Stocks: ${fmtNum(yoy.commercial_stocks_kt)} Kt (WoW change: ${fmtChange(yoy.wow_stocks_change_kt)} Kt)`);

  sections.push(`### Crop Year to Date
- CY Deliveries: ${fmtNum(yoy.cy_deliveries_kt)} Kt (YoY: ${fmtPct(yoy.yoy_deliveries_pct)}, Prior Year: ${fmtNum(yoy.py_deliveries_kt)} Kt)
- CY Exports: ${fmtNum(yoy.cy_exports_kt)} Kt (YoY: ${fmtPct(yoy.yoy_exports_pct)}, Prior Year: ${fmtNum(yoy.py_exports_kt)} Kt)
- CY Crush/Processing: ${fmtNum(yoy.cy_crush_kt)} Kt (YoY: ${fmtPct(yoy.yoy_crush_pct)}, Prior Year: ${fmtNum(yoy.py_crush_kt)} Kt)`);

  if (supply) {
    sections.push(`### Supply Balance (AAFC Estimate)
- Production: ${fmtNum(supply.production_kt)} Kt
- Carry-in: ${fmtNum(supply.carry_in_kt)} Kt
- Total Supply: ${fmtNum(supply.total_supply_kt)} Kt
- Projected Exports: ${fmtNum(supply.projected_exports_kt)} Kt
- Projected Crush: ${fmtNum(supply.projected_crush_kt)} Kt
- Projected Carry-out: ${fmtNum(supply.projected_carry_out_kt)} Kt`);
  }

  if (deliveriesHist || exportsHist || stocksHist) {
    sections.push(`### 5-Year Historical Averages (at Week ${grainWeek})
- Deliveries: avg ${fmtNum(deliveriesHist?.avg_value)} Kt, range ${fmtNum(deliveriesHist?.min_value)}-${fmtNum(deliveriesHist?.max_value)} Kt
- Exports: avg ${fmtNum(exportsHist?.avg_value)} Kt, range ${fmtNum(exportsHist?.min_value)}-${fmtNum(exportsHist?.max_value)} Kt
- Stocks: avg ${fmtNum(stocksHist?.avg_value)} Kt, range ${fmtNum(stocksHist?.min_value)}-${fmtNum(stocksHist?.max_value)} Kt`);
  }

  if (sentiment && sentiment.vote_count >= 5) {
    sections.push(`### Farmer Sentiment (Bushel Board poll — Week ${grainWeek + 1})
- ${sentiment.vote_count} farmers voted: ${sentiment.pct_holding}% holding, ${sentiment.pct_hauling}% hauling, ${sentiment.pct_neutral}% neutral`);
  }

  if (delivery) {
    sections.push(`### Community Delivery Stats
- Farmers reporting: ${delivery.farmer_count ?? "N/A"}
- Median delivery: ${fmtNum(delivery.median_delivered_kt)} Kt
- Mean pace: ${fmtNum(delivery.mean_pace_pct)}%
- P25-P75 range: ${fmtNum(delivery.p25_pace_pct)}%-${fmtNum(delivery.p75_pace_pct)}%`);
  }

  // Stored X signals as supplementary context
  if (storedSignals.length > 0) {
    const topSignals = storedSignals.slice(0, 5);
    sections.push(`### Recent X/Web Signals (pre-collected)
${topSignals.map(s => `- [${s.category}] (score: ${s.relevance_score}) ${(s.post_text as string).slice(0, 150)}`).join("\n")}`);
  }

  return sections.join("\n\n");
}

// -- Helpers --

function fmtNum(val: unknown): string {
  if (val == null) return "N/A";
  const n = Number(val);
  return isNaN(n) ? "N/A" : n.toLocaleString("en-CA", { maximumFractionDigits: 1 });
}

function fmtPct(val: unknown): string {
  if (val == null) return "N/A";
  const n = Number(val);
  return isNaN(n) ? "N/A" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function fmtChange(val: unknown): string {
  if (val == null) return "N/A";
  const n = Number(val);
  return isNaN(n) ? "N/A" : `${n > 0 ? "+" : ""}${n.toFixed(1)}`;
}

function getCurrentCropYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

function getCurrentGrainWeek(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const start = month >= 7 ? new Date(year, 7, 1) : new Date(year - 1, 7, 1);
  return Math.max(1, Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);
}
```

**Step 2: Build check**

Run: `npm run build`
Expected: PASS (Edge Function is in supabase/ and doesn't affect Next.js build)

**Step 3: Commit**

```bash
git add supabase/functions/analyze-grain-market/index.ts
git commit -m "feat(pipeline-v2): add analyze-grain-market Edge Function

Single-pass Senior Analyst with web_search + x_search tools.
Replaces dual-LLM chain (analyze-market-data + generate-intelligence).
Pre-computed ratios, dynamic shipping calendar, tiered research depth.
Writes to both market_analysis and grain_intelligence for backward compat."
```

---

## Task 5: Deploy and Benchmark

**Files:**
- Modify: `supabase/config.toml` (if needed for new function)

**Step 1: Deploy the new Edge Function**

Run:
```bash
npx supabase functions deploy analyze-grain-market
```

Expected: Deployment success

**Step 2: Test with a single grain (manual trigger)**

Run:
```bash
curl -X POST "https://ibgsloyjxdopkvwqcqwh.supabase.co/functions/v1/analyze-grain-market" \
  -H "Content-Type: application/json" \
  -H "x-bushel-internal-secret: $BUSHEL_INTERNAL_FUNCTION_SECRET" \
  -d '{"grains": ["Canola"], "crop_year": "2025-2026"}'
```

Expected: `{"results":[{"grain":"Canola","status":"success"}], ...}`

**Step 3: Compare v1 vs v2 output for the same grain**

Query both results:
```sql
-- v2 result
SELECT grain, stance_score, confidence_score, data_confidence,
       llm_metadata->>'prompt_version' as version,
       llm_metadata->>'research_sources' as sources
FROM market_analysis
WHERE grain = 'Canola' AND crop_year = '2025-2026'
ORDER BY generated_at DESC LIMIT 1;
```

**Step 4: Run for Barley and Flaxseed (the misread test cases)**

```bash
curl -X POST "https://ibgsloyjxdopkvwqcqwh.supabase.co/functions/v1/analyze-grain-market" \
  -H "Content-Type: application/json" \
  -H "x-bushel-internal-secret: $BUSHEL_INTERNAL_FUNCTION_SECRET" \
  -d '{"grains": ["Barley"], "crop_year": "2025-2026"}'
```

Then:
```bash
curl -X POST "https://ibgsloyjxdopkvwqcqwh.supabase.co/functions/v1/analyze-grain-market" \
  -H "Content-Type: application/json" \
  -H "x-bushel-internal-secret: $BUSHEL_INTERNAL_FUNCTION_SECRET" \
  -d '{"grains": ["Flaxseed"], "crop_year": "2025-2026"}'
```

**Expected benchmark criteria:**
- Barley: Should score bullish (positive stance_score) given +78% exports, 75% of AAFC target, 9.1% stocks-to-use
- Flaxseed: Should score bearish (negative stance_score) given 17% export pace ratio
- Both should have `research_sources` populated (web/X research actually happened)
- Neither should cluster around -45

**Step 5: Run all 16 grains**

```bash
curl -X POST "https://ibgsloyjxdopkvwqcqwh.supabase.co/functions/v1/analyze-grain-market" \
  -H "Content-Type: application/json" \
  -H "x-bushel-internal-secret: $BUSHEL_INTERNAL_FUNCTION_SECRET" \
  -d '{"crop_year": "2025-2026"}'
```

**Step 6: Audit stance_score distribution**

```sql
SELECT grain, stance_score, confidence_score, data_confidence,
       llm_metadata->>'prompt_version' as version
FROM market_analysis
WHERE crop_year = '2025-2026'
  AND llm_metadata->>'prompt_version' = 'analyze-grain-market-v1'
ORDER BY stance_score;
```

Check: scores should NOT cluster around -40 to -50. There should be genuine spread based on each grain's data.

**Step 7: Commit benchmark results**

```bash
git commit --allow-empty -m "benchmark(pipeline-v2): initial 16-grain benchmark complete

Tested against Barley (+78% exports, expected bullish) and Flaxseed
(17% export pace, expected bearish). Full 16-grain run with stance
score distribution audit."
```

---

## Task 6: Verify Build and Tests

**Step 1: Run all tests**

Run: `npm run test`
Expected: All tests pass

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 3: Commit if any fixes needed**

---

## Task 7: Update Documentation

**Files:**
- Modify: `supabase/functions/_shared/market-intelligence-config.ts` — add v2 version constant
- Modify: `docs/plans/STATUS.md` — add Pipeline v2 track

**Step 1: Add v2 version to config**

In `market-intelligence-config.ts`, add to `MARKET_INTELLIGENCE_VERSIONS`:
```typescript
analyzeGrainMarket: "analyze-grain-market-v1",
```

**Step 2: Update STATUS.md**

Add new track for Pipeline v2 Senior Analyst.

**Step 3: Commit**

```bash
git add supabase/functions/_shared/market-intelligence-config.ts docs/plans/STATUS.md
git commit -m "docs: add Pipeline v2 version tracking and STATUS entry"
```

---

## Summary

| Task | What | Key Files |
|---|---|---|
| 1 | Shipping Calendar module | `lib/shipping-calendar.ts`, `supabase/functions/_shared/shipping-calendar.ts` |
| 2 | Pre-computed analyst ratios | `lib/data-brief.ts`, `supabase/functions/_shared/data-brief.ts` |
| 3 | System prompt builder | `lib/analyst-prompt.ts`, `supabase/functions/_shared/analyst-prompt.ts` |
| 4 | Edge Function (the big one) | `supabase/functions/analyze-grain-market/index.ts` |
| 5 | Deploy + benchmark | Manual testing, Barley/Flaxseed validation |
| 6 | Verify build/tests | `npm run test`, `npm run build` |
| 7 | Documentation | `market-intelligence-config.ts`, `STATUS.md` |
