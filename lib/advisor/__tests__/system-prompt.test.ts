import { describe, it, expect } from "vitest";
import { buildAdvisorSystemPrompt } from "../system-prompt";
import type { ChatContext } from "../types";

const mockContext: ChatContext = {
  farmer: {
    userId: "test-user",
    cropYear: "2025-2026",
    grainWeek: 30,
    role: "farmer",
    grains: [
      {
        grain: "Canola",
        acres: 500,
        delivered_kt: 0.5,
        contracted_kt: 0.2,
        uncontracted_kt: 0.8,
        percentile: 72,
        platform_holding_pct: 68,
        platform_hauling_pct: 20,
        platform_neutral_pct: 12,
        platform_vote_count: 15,
        intelligence_stance: "bullish",
        recommendation: "hold",
        thesis_title: "Coiled spring thesis",
        thesis_body: "Deliveries are slow, stocks drawing",
        bull_case: "China tariff relief + port congestion",
        bear_case: "Record production + South American exports",
      },
    ],
  },
  knowledgeText: "### Basis Signal Matrix\nNarrowing basis = bullish",
  logisticsSnapshot: { vessels_vancouver: 26 },
  cotSummary: "Managed Money: net short 52,858 contracts",
  priceContext: [
    {
      grain: "Canola",
      latest_price: 672.5,
      price_change_pct: -1.2,
      contract: "Jul 2026",
      exchange: "ICE",
      currency: "CAD",
      price_date: "2026-03-14",
    },
  ],
};

describe("buildAdvisorSystemPrompt", () => {
  it("includes farmer grain data", () => {
    const prompt = buildAdvisorSystemPrompt(mockContext);
    expect(prompt).toContain("Canola");
    expect(prompt).toContain("500 acres");
    expect(prompt).toContain("72th percentile");
  });

  it("includes knowledge text", () => {
    const prompt = buildAdvisorSystemPrompt(mockContext);
    expect(prompt).toContain("Basis Signal Matrix");
  });

  it("includes sentiment data as aggregate", () => {
    const prompt = buildAdvisorSystemPrompt(mockContext);
    expect(prompt).toContain("68% holding");
    expect(prompt).toContain("20% hauling");
    // Sentiment should be framed as platform data, not what farmers "think"
    expect(prompt).toContain("Platform sentiment");
  });

  it("includes COT summary", () => {
    const prompt = buildAdvisorSystemPrompt(mockContext);
    expect(prompt).toContain("net short 52,858");
  });

  it("includes commodity knowledge frameworks", () => {
    const prompt = buildAdvisorSystemPrompt(mockContext);
    expect(prompt).toContain("Storage Decision Algorithm");
    expect(prompt).toContain("Flow Coherence Rule");
  });

  it("shows contracted status correctly", () => {
    const prompt = buildAdvisorSystemPrompt(mockContext);
    expect(prompt).toContain("0.2 Kt contracted");
  });

  it("shows no-contract status correctly", () => {
    const noContractCtx: ChatContext = {
      ...mockContext,
      farmer: {
        ...mockContext.farmer,
        grains: [
          { ...mockContext.farmer.grains[0], contracted_kt: 0 },
        ],
      },
    };
    const prompt = buildAdvisorSystemPrompt(noContractCtx);
    expect(prompt).toContain("nothing contracted");
  });

  it("includes price data when available", () => {
    const prompt = buildAdvisorSystemPrompt(mockContext);
    expect(prompt).toContain("$672.50");
    expect(prompt).toContain("-1.2%");
    expect(prompt).toContain("ICE");
  });

  it("handles missing price data gracefully", () => {
    const noPriceCtx: ChatContext = {
      ...mockContext,
      priceContext: [],
    };
    const prompt = buildAdvisorSystemPrompt(noPriceCtx);
    expect(prompt).toContain("No recent price data available");
  });

  it("handles missing knowledge gracefully", () => {
    const noKnowledgeCtx: ChatContext = {
      ...mockContext,
      knowledgeText: null,
    };
    const prompt = buildAdvisorSystemPrompt(noKnowledgeCtx);
    expect(prompt).toContain("No specific book knowledge retrieved");
  });

  it("establishes prairie advisor persona", () => {
    const prompt = buildAdvisorSystemPrompt(mockContext);
    expect(prompt).toContain("kitchen table");
    expect(prompt).toContain("grain marketing");
  });

  it("includes voice rules against AI jargon", () => {
    const prompt = buildAdvisorSystemPrompt(mockContext);
    expect(prompt).toContain("still in bins");
    expect(prompt).toContain("haul it");
    expect(prompt).toContain("Never use");
    expect(prompt).toContain("delve");
  });

  it("instructs no disclaimer in responses", () => {
    const prompt = buildAdvisorSystemPrompt(mockContext);
    expect(prompt).toContain("Do NOT include a disclaimer");
    expect(prompt).toContain("handled elsewhere in the UI");
  });

  it("instructs sentiment as aggregate data not thoughts", () => {
    const prompt = buildAdvisorSystemPrompt(mockContext);
    expect(prompt).toContain("aggregate data");
    expect(prompt).not.toContain("what farmers are thinking");
  });

  it("instructs risk ending", () => {
    const prompt = buildAdvisorSystemPrompt(mockContext);
    expect(prompt).toContain("RISK");
    expect(prompt).toContain("main risk");
  });

  it("instructs flow coherence check", () => {
    const prompt = buildAdvisorSystemPrompt(mockContext);
    expect(prompt).toContain("FLOW COHERENCE");
    expect(prompt).toContain("absorbing supply");
  });

  it("includes crop year and grain week", () => {
    const prompt = buildAdvisorSystemPrompt(mockContext);
    expect(prompt).toContain("2025-2026");
    expect(prompt).toContain("Week 30");
  });
});
