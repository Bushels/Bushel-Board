import { describe, it, expect } from "vitest";
import {
  buildReasonerSystemPrompt,
  buildVoiceSystemPrompt,
} from "../system-prompt";
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
};

describe("buildReasonerSystemPrompt", () => {
  it("includes farmer grain data", () => {
    const prompt = buildReasonerSystemPrompt(mockContext);
    expect(prompt).toContain("Canola");
    expect(prompt).toContain("500 acres");
    expect(prompt).toContain("72th percentile");
  });

  it("includes knowledge text", () => {
    const prompt = buildReasonerSystemPrompt(mockContext);
    expect(prompt).toContain("Basis Signal Matrix");
  });

  it("includes sentiment data", () => {
    const prompt = buildReasonerSystemPrompt(mockContext);
    expect(prompt).toContain("68% holding");
    expect(prompt).toContain("20% hauling");
  });

  it("includes COT summary", () => {
    const prompt = buildReasonerSystemPrompt(mockContext);
    expect(prompt).toContain("net short 52,858");
  });

  it("requests JSON output format", () => {
    const prompt = buildReasonerSystemPrompt(mockContext);
    expect(prompt).toContain("Return ONLY the JSON object");
    expect(prompt).toContain("recommendation");
    expect(prompt).toContain("confidence");
  });

  it("includes commodity knowledge frameworks", () => {
    const prompt = buildReasonerSystemPrompt(mockContext);
    expect(prompt).toContain("Storage Decision Algorithm");
    expect(prompt).toContain("Flow Coherence Rule");
  });

  it("shows contracted status correctly", () => {
    const prompt = buildReasonerSystemPrompt(mockContext);
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
    const prompt = buildReasonerSystemPrompt(noContractCtx);
    expect(prompt).toContain("nothing contracted");
  });

  it("handles missing knowledge gracefully", () => {
    const noKnowledgeCtx: ChatContext = {
      ...mockContext,
      knowledgeText: null,
    };
    const prompt = buildReasonerSystemPrompt(noKnowledgeCtx);
    expect(prompt).toContain("No specific book knowledge retrieved");
  });
});

describe("buildVoiceSystemPrompt", () => {
  it("establishes prairie advisor persona", () => {
    const prompt = buildVoiceSystemPrompt();
    expect(prompt).toContain("kitchen table");
    expect(prompt).toContain("neighbor");
  });

  it("includes voice rules against AI jargon", () => {
    const prompt = buildVoiceSystemPrompt();
    expect(prompt).toContain("still in bins");
    expect(prompt).toContain("haul it");
    expect(prompt).toContain("Never use");
    expect(prompt).toContain("delve");
  });

  it("includes disclaimer framing", () => {
    const prompt = buildVoiceSystemPrompt();
    expect(prompt).toContain("not handing out formal financial advice");
    expect(prompt).toContain("final call");
  });

  it("instructs validation of Round 1 analysis", () => {
    const prompt = buildVoiceSystemPrompt();
    expect(prompt).toContain("VALIDATE");
    expect(prompt).toContain("logic check out");
  });

  it("includes sentiment weaving instruction", () => {
    const prompt = buildVoiceSystemPrompt();
    expect(prompt).toContain("SENTIMENT");
    expect(prompt).toContain("farmers on the platform");
  });

  it("instructs risk ending", () => {
    const prompt = buildVoiceSystemPrompt();
    expect(prompt).toContain("RISK");
    expect(prompt).toContain("main risk");
  });
});
