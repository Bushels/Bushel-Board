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
        starting_grain_kt: 1.5,
        remaining_kt: 1.0,
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
  decisionSupportText: null,
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
      unit: "CAD/tonne",
      price_date: "2026-03-14",
    },
  ],
  xSignals: [],
};

describe("buildAdvisorSystemPrompt", () => {
  it("includes farmer grain data with inventory and crop year timeframe", () => {
    const prompt = buildAdvisorSystemPrompt(mockContext);
    expect(prompt).toContain("Canola");
    expect(prompt).toContain("1.0 Kt still in bins (of 1.5 Kt starting)");
    expect(prompt).toContain("500 tonnes delivered (crop year to date)");
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
    expect(prompt).toContain("FLOW COHERENCE");
  });

  it("formats small quantities in tonnes not Kt", () => {
    const prompt = buildAdvisorSystemPrompt(mockContext);
    // 0.2 Kt = 200 tonnes, 0.5 Kt = 500 tonnes — both under 1 Kt
    expect(prompt).toContain("200 tonnes contracted");
    expect(prompt).toContain("500 tonnes delivered");
    // Should NOT show "0.2 Kt" or "0.5 Kt"
    expect(prompt).not.toContain("0.2 Kt");
    expect(prompt).not.toContain("0.5 Kt");
  });

  it("falls back to acres when no starting inventory", () => {
    const noInventoryCtx: ChatContext = {
      ...mockContext,
      farmer: {
        ...mockContext.farmer,
        grains: [
          {
            ...mockContext.farmer.grains[0],
            starting_grain_kt: null,
            remaining_kt: null,
          },
        ],
      },
    };
    const prompt = buildAdvisorSystemPrompt(noInventoryCtx);
    expect(prompt).toContain("500 acres seeded");
    expect(prompt).toContain("no starting inventory entered");
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
    expect(prompt).toContain("No stored price data available");
  });

  it("handles missing knowledge gracefully", () => {
    const noKnowledgeCtx: ChatContext = {
      ...mockContext,
      knowledgeText: null,
    };
    const prompt = buildAdvisorSystemPrompt(noKnowledgeCtx);
    expect(prompt).toContain("No specific book knowledge retrieved");
  });

  it("includes decision guardrails when provided", () => {
    const prompt = buildAdvisorSystemPrompt({
      ...mockContext,
      decisionSupportText:
        "Storage decision guardrail: Storage Decision Algorithm is in play, but the message still does not include your current elevator basis.",
    });

    expect(prompt).toContain("Decision Guardrails");
    expect(prompt).toContain("Storage decision guardrail");
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

  it("uses positive framing for disclaimer avoidance", () => {
    const prompt = buildAdvisorSystemPrompt(mockContext);
    expect(prompt).toContain("Assume the farmer has already accepted all disclaimers");
    expect(prompt).toContain("never mention being an AI");
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

  it("enforces concise response format", () => {
    const prompt = buildAdvisorSystemPrompt(mockContext);
    expect(prompt).toContain("3-4 short paragraphs MAXIMUM");
    expect(prompt).toContain("No numbered lists");
    expect(prompt).toContain("no bullet points");
  });

  it("prevents specific percentage recommendations", () => {
    const prompt = buildAdvisorSystemPrompt(mockContext);
    expect(prompt).toContain("DIRECTION ONLY");
    expect(prompt).toContain("NEVER recommend specific percentages");
  });

  it("guards against hallucinated data gaps", () => {
    const prompt = buildAdvisorSystemPrompt(mockContext);
    expect(prompt).toContain("Only flag a gap if the data is truly missing");
    expect(prompt).toContain("Check all sections before claiming data is unavailable");
  });

  it("instructs a storage follow-up when critical storage inputs are missing", () => {
    const prompt = buildAdvisorSystemPrompt(mockContext);
    expect(prompt).toContain("STORAGE FOLLOW-UP RULE");
    expect(prompt).toContain("current basis, nearby carry/spread, and storage cost");
    expect(prompt).toContain("do NOT bluff a firm yes/no answer");
  });

  it("tells the advisor not to ask for more numbers once the core storage inputs are present", () => {
    const prompt = buildAdvisorSystemPrompt(mockContext);
    expect(prompt).toContain("If those three inputs are already present");
    expect(prompt).toContain("do NOT ask for another number");
  });

  it("treats decision guardrails as an override when core storage inputs are already present", () => {
    const prompt = buildAdvisorSystemPrompt(mockContext);
    expect(prompt).toContain("DECISION GUARDRAILS OVERRIDE");
    expect(prompt).toContain("end without a question");
  });

  it("bans analyst jargon terms from real failures", () => {
    const prompt = buildAdvisorSystemPrompt(mockContext);
    expect(prompt).toContain("fundamental value");
    expect(prompt).toContain("speculative buying");
    // These should be in the "Never use" ban list
  });

  it("labels delivery data as crop year to date in voice rules", () => {
    const prompt = buildAdvisorSystemPrompt(mockContext);
    expect(prompt).toContain("CROP YEAR TO DATE");
    expect(prompt).toContain('never say "this week" when referencing delivered totals');
  });

  it("limits follow-ups to one short question at the end", () => {
    const prompt = buildAdvisorSystemPrompt(mockContext);
    expect(prompt).toContain("ask only ONE short question");
    expect(prompt).toContain("put it at the end");
  });
});
