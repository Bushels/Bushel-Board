import { describe, expect, it } from "vitest";

import type { KnowledgeRetrievalResult } from "../knowledge-retrieval";

async function loadBuildStorageDecisionSupport() {
  const contextBuilderModule = await import("../context-builder");
  const buildStorageDecisionSupport =
    (contextBuilderModule as { buildStorageDecisionSupport?: unknown }).buildStorageDecisionSupport ??
    (contextBuilderModule as { default?: { buildStorageDecisionSupport?: unknown } }).default?.buildStorageDecisionSupport;

  return buildStorageDecisionSupport as (
    messageText: string,
    knowledgeContext: KnowledgeRetrievalResult | null,
  ) => string | null;
}

function makeKnowledgeResult(headings: string[]): KnowledgeRetrievalResult {
  return {
    mode: "tiered",
    grain: "Canola",
    topicTags: ["marketing", "basis", "storage"],
    queryPlan: [],
    sourcePaths: ["book:introduction-grain-marketing"],
    contextText: null,
    chunks: headings.map((heading, index) => ({
      chunkId: index + 1,
      documentId: 1,
      chunkIndex: index,
      title: "Introduction to Grain Marketing (SK Ministry of Agriculture)",
      sourcePath: "book:introduction-grain-marketing",
      heading,
      content: "content",
      grainTags: ["Canola"],
      topicTags: ["storage"],
      regionTags: [],
      sourcePriority: 100,
      metadata: null,
      rank: 0.5,
      score: 0.5,
      headingPriorityBonus: 0.5,
      matchedQueries: ["basis-storage-frameworks"],
    })),
  };
}

describe("buildStorageDecisionSupport", () => {
  it("asks for missing basis, spread, and storage cost inputs when storage math is incomplete", async () => {
    const buildStorageDecisionSupport = await loadBuildStorageDecisionSupport();
    const support = buildStorageDecisionSupport(
      "Basis is starting to improve on canola I still have in bins. Should I store it or haul it now?",
      makeKnowledgeResult(["Storage Decision Algorithm", "Basis Signal Matrix"]),
    );

    expect(support).toContain("current elevator basis");
    expect(support).toContain("nearby futures spread/carry");
    expect(support).toContain("storage cost");
    expect(support).toContain("ask one short follow-up question");
  });

  it("adds a do-not-ask-again guardrail when the core storage inputs are already present", async () => {
    const buildStorageDecisionSupport = await loadBuildStorageDecisionSupport();
    const support = buildStorageDecisionSupport(
      "Canola basis is -18 and the Jan-Apr spread is +9 cents. My storage cost is 2 cents a month. Should I store it or haul it now?",
      makeKnowledgeResult(["Storage Decision Algorithm"]),
    );

    expect(support).toContain("Core storage inputs are already present");
    expect(support).toContain("Do not ask a follow-up question");
    expect(support).toContain("End without a question");
  });

  it("does nothing when storage framework was not retrieved", async () => {
    const buildStorageDecisionSupport = await loadBuildStorageDecisionSupport();
    const support = buildStorageDecisionSupport(
      "Should I store or haul canola right now?",
      makeKnowledgeResult(["Basis Signal Matrix"]),
    );

    expect(support).toBeNull();
  });
});
