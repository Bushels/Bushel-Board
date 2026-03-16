import { afterEach, describe, expect, it } from "vitest";

import {
  buildTieredKnowledgeQueryPlan,
  inferAdvisorKnowledgeTopics,
  resolveKnowledgeRetrievalMode,
  selectTieredKnowledgeChunks,
  type RetrievedKnowledgeChunk,
} from "../knowledge-retrieval";

function makeChunk(overrides: Partial<RetrievedKnowledgeChunk>): RetrievedKnowledgeChunk {
  return {
    chunkId: overrides.chunkId ?? 1,
    documentId: overrides.documentId ?? 1,
    chunkIndex: overrides.chunkIndex ?? 0,
    title: overrides.title ?? "Test Source",
    sourcePath: overrides.sourcePath ?? "book:test",
    heading: overrides.heading ?? "Heading",
    content: overrides.content ?? "content",
    grainTags: overrides.grainTags ?? [],
    topicTags: overrides.topicTags ?? [],
    regionTags: overrides.regionTags ?? [],
    sourcePriority: overrides.sourcePriority ?? 50,
    metadata: overrides.metadata ?? null,
    rank: overrides.rank ?? 0.4,
    score: overrides.score ?? 0.4,
    matchedQueries: overrides.matchedQueries ?? ["raw-question"],
  };
}

describe("inferAdvisorKnowledgeTopics", () => {
  it("adds specific topic tags from the farmer question", () => {
    const topics = inferAdvisorKnowledgeTopics(
      "Should I use a basis contract or put options if futures rally but basis stays weak?",
    );

    expect(topics).toEqual(
      expect.arrayContaining(["basis", "futures", "options", "contracts", "marketing"]),
    );
  });
});

describe("buildTieredKnowledgeQueryPlan", () => {
  it("adds framework queries for basis/storage questions", () => {
    const plan = buildTieredKnowledgeQueryPlan(
      "I still have canola in bins. Should I store it or haul it if basis improves?",
      "Canola",
    );

    expect(plan.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["raw-question", "grain-context", "basis-storage-frameworks"]),
    );
  });

  it("adds COT query expansion when positioning language is present", () => {
    const plan = buildTieredKnowledgeQueryPlan(
      "Managed money looks very short. Is COT a timing signal or a direction signal?",
      "Canola",
    );

    expect(plan.map((entry) => entry.id)).toContain("cot-positioning");
  });
});

describe("selectTieredKnowledgeChunks", () => {
  it("preserves document diversity while still allowing a second chunk from the strongest source", () => {
    const selected = selectTieredKnowledgeChunks(
      [
        makeChunk({ chunkId: 1, documentId: 10, score: 0.9, chunkIndex: 1, heading: "Basis Signal Matrix" }),
        makeChunk({ chunkId: 2, documentId: 10, score: 0.8, chunkIndex: 2, heading: "Storage Decision Algorithm" }),
        makeChunk({ chunkId: 3, documentId: 11, score: 0.85, chunkIndex: 0, heading: "Option Strategies" }),
        makeChunk({ chunkId: 4, documentId: 12, score: 0.7, chunkIndex: 0, heading: "Seasonal Patterns" }),
      ],
      4,
    );

    expect(selected.map((chunk) => chunk.chunkId)).toEqual([1, 2, 3, 4]);
    expect(new Set(selected.map((chunk) => chunk.documentId))).toHaveLength(3);
  });

  it("caps repeated selections from one source at two chunks", () => {
    const selected = selectTieredKnowledgeChunks(
      [
        makeChunk({ chunkId: 1, documentId: 10, score: 0.95 }),
        makeChunk({ chunkId: 2, documentId: 10, score: 0.85, chunkIndex: 1 }),
        makeChunk({ chunkId: 3, documentId: 10, score: 0.8, chunkIndex: 2 }),
        makeChunk({ chunkId: 4, documentId: 11, score: 0.75 }),
      ],
      4,
    );

    expect(selected.filter((chunk) => chunk.documentId === 10)).toHaveLength(2);
    expect(selected.map((chunk) => chunk.chunkId)).not.toContain(3);
  });
});

describe("resolveKnowledgeRetrievalMode", () => {
  const originalMode = process.env.BUSHEL_ADVISOR_RETRIEVAL_MODE;

  afterEach(() => {
    if (originalMode === undefined) {
      delete process.env.BUSHEL_ADVISOR_RETRIEVAL_MODE;
      return;
    }

    process.env.BUSHEL_ADVISOR_RETRIEVAL_MODE = originalMode;
  });

  it("defaults invalid env values to tiered", () => {
    process.env.BUSHEL_ADVISOR_RETRIEVAL_MODE = "invalid";
    expect(resolveKnowledgeRetrievalMode()).toBe("tiered");
  });

  it("honors explicit overrides", () => {
    process.env.BUSHEL_ADVISOR_RETRIEVAL_MODE = "baseline";
    expect(resolveKnowledgeRetrievalMode("tiered")).toBe("tiered");
  });
});
