import { readFileSync } from "node:fs";
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
    expect(prompt).toContain("DATA FIRST");
    expect(prompt).toContain("KEEP X PULSE QUARANTINED");
    expect(prompt).toContain("REASON THROUGH DATA");
    expect(prompt).toContain("CONCLUDE WITH CONVICTION");
  });

  it("keeps raw X search and advice language out of the analyst contract", () => {
    const prompt = buildAnalystSystemPrompt();
    expect(prompt).not.toContain("x_search");
    expect(prompt).not.toContain("What would you recommend?");
    expect(prompt).not.toContain("actionable final_assessment");
    expect(prompt).toContain("accepted X Pulse evidence");
    expect(prompt).toContain("watch-only lead");
    expect(prompt).toContain("final_assessment as a source-backed read");
  });

  it("includes the Bushel Board agent team framing", () => {
    const prompt = buildAnalystSystemPrompt("Canola");
    expect(prompt).toContain("Bushel Board Agent Team");
    expect(prompt).toContain("predictive grain market");
    expect(prompt).toContain("Crush & Oilseed Agent");
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
    expect(prompt).toContain("4 approved web searches");
    expect(prompt).toContain("4 accepted X Pulse signals");
    expect(prompt).toContain("only if they are already supplied in the data brief");
  });

  it("includes the weekly farmer-summary framing in the task section", () => {
    const prompt = buildAnalystUserPrompt(mockInput);
    expect(prompt).toContain("weekly farmer summary");
    expect(prompt).toContain("what is helping the farmer");
    expect(prompt).toContain("what is hurting the farmer");
    expect(prompt).toContain("why the final read follows from that balance");
    expect(prompt).not.toContain("why the recommendation follows");
  });

});

describe("Supabase shared analyst prompt", () => {
  it("keeps the Edge-function copy aligned with the Track 54 X boundary", () => {
    const source = readFileSync("supabase/functions/_shared/analyst-prompt.ts", "utf8");

    expect(source).not.toContain("x_search");
    expect(source).not.toContain("What would you recommend?");
    expect(source).toContain("KEEP X PULSE QUARANTINED");
    expect(source).toContain("accepted X Pulse evidence");
    expect(source).toContain("final_assessment as a source-backed read");
  });
});
