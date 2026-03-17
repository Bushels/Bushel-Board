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
