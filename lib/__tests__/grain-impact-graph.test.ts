import { describe, expect, it } from "vitest";

import {
  buildGrainImpactGraph,
  buildGrainImpactGraphs,
  buildGrainRelationshipRankRows,
  buildGrainRelationshipOverview,
  scoreRoleForSourceClass,
  scopeRelevanceWeight,
  sourceAuthorityWeight,
  EXTERNAL_SCOPE_RANK_MULTIPLIER,
  PUBLIC_SCOPE_RANK_MULTIPLIER,
} from "@/lib/thesis/grain-impact-graph";
import { SUPPORTED_RATING_GRAINS } from "@/lib/thesis/rating-model";

describe("grain impact graph", () => {
  it("builds a render-ready graph for every supported public V1 grain", () => {
    const graphs = buildGrainImpactGraphs(SUPPORTED_RATING_GRAINS);

    expect(graphs).toHaveLength(SUPPORTED_RATING_GRAINS.length);

    for (const graph of graphs) {
      expect(graph.nodes.some((node) => node.kind === "grain" && node.label === graph.grain)).toBe(true);
      expect(graph.coverage.nodeCount).toBe(graph.nodes.length);
      expect(graph.coverage.edgeCount).toBe(graph.edges.length);
      expect(graph.coverage.factorCount).toBeGreaterThan(0);
      expect(graph.coverage.sourceCount).toBeGreaterThan(0);
      expect(graph.coverage.strongestFactorIds.length).toBeGreaterThan(0);
    }
  });

  it("connects source lanes to factors, factors to domains, and domains to the grain", () => {
    const graph = buildGrainImpactGraph("Canola");

    expect(graph).not.toBeNull();
    expect(graph?.edges.map((edge) => edge.kind)).toEqual(
      expect.arrayContaining(["source_to_factor", "factor_to_domain", "domain_to_grain"]),
    );
    expect(graph?.nodes.some((node) => node.kind === "source" && node.label === "cgc observations")).toBe(true);
    expect(graph?.nodes.some((node) => node.kind === "domain" && node.label === "Demand")).toBe(true);
  });

  it("keeps official source inputs visually stronger than watch-only and parked gaps", () => {
    const graph = buildGrainImpactGraph("Wheat");
    expect(graph).not.toBeNull();

    const officialFactors = graph!.nodes.filter(
      (node) => node.kind === "factor" && node.scoreRole === "score_input",
    );
    const watchOnlyFactors = graph!.nodes.filter(
      (node) => node.kind === "factor" && node.scoreRole === "watch_only",
    );
    const parkedGapNodes = graph!.nodes.filter((node) => node.kind === "parked_gap");

    expect(officialFactors.length).toBeGreaterThan(0);
    expect(watchOnlyFactors.length).toBeGreaterThan(0);
    expect(parkedGapNodes.length).toBeGreaterThan(0);
    expect(Math.max(...officialFactors.map((node) => node.rank))).toBeGreaterThan(
      Math.max(...watchOnlyFactors.map((node) => node.rank)),
    );
    expect(Math.max(...watchOnlyFactors.map((node) => node.rank))).toBeGreaterThan(
      Math.max(...parkedGapNodes.map((node) => node.rank)),
    );
  });

  it("keeps cross-grain relationships visible without promoting them to source truth", () => {
    const graph = buildGrainImpactGraph("Soybeans");
    expect(graph).not.toBeNull();

    const canolaRelationship = graph!.nodes.find(
      (node) => node.kind === "relationship" && node.label === "Canola",
    );
    const relationshipEdge = graph!.edges.find(
      (edge) => edge.kind === "relationship_to_grain" && edge.from === canolaRelationship?.id,
    );

    expect(canolaRelationship).toMatchObject({
      scoreRole: "bounded_context",
      sourceClass: "price_context",
    });
    expect(relationshipEdge).toMatchObject({
      scoreRole: "bounded_context",
      sourceClass: "price_context",
    });
  });

  it("returns null for parked or unsupported grain lanes", () => {
    expect(buildGrainImpactGraph("Spring Wheat")).toBeNull();
    expect(buildGrainImpactGraph("Peas")).toBeNull();
  });

  it("builds a cross-grain overview from the same impact profiles", () => {
    const overview = buildGrainRelationshipOverview(SUPPORTED_RATING_GRAINS);

    expect(overview.coverage.grainCount).toBe(SUPPORTED_RATING_GRAINS.length);
    expect(overview.coverage.relationshipCount).toBeGreaterThan(0);
    expect(overview.coverage.crossGrainRelationshipCount).toBeGreaterThan(0);
    expect(overview.coverage.externalAnchorRelationshipCount).toBeGreaterThan(0);
    expect(overview.coverage.strongestHubIds.length).toBeGreaterThan(0);
    expect(overview.nodes.some((node) => node.kind === "external_anchor" && node.label === "China policy")).toBe(true);
  });

  it("shows two-way oilseed context without promoting it beyond price context", () => {
    const overview = buildGrainRelationshipOverview(SUPPORTED_RATING_GRAINS);
    const canolaToSoybeans = overview.edges.find(
      (edge) => edge.fromLabel === "Canola" && edge.toLabel === "Soybeans",
    );
    const soybeansToCanola = overview.edges.find(
      (edge) => edge.fromLabel === "Soybeans" && edge.toLabel === "Canola",
    );

    expect(canolaToSoybeans).toMatchObject({
      kind: "substitute",
      scoreRole: "bounded_context",
      targetInPublicScope: true,
    });
    expect(soybeansToCanola).toMatchObject({
      kind: "substitute",
      scoreRole: "bounded_context",
      targetInPublicScope: true,
    });
  });

  it("ranks public grain relationships above watch-only external anchors", () => {
    const overview = buildGrainRelationshipOverview(SUPPORTED_RATING_GRAINS);
    const wheatToCorn = overview.edges.find((edge) => edge.fromLabel === "Wheat" && edge.toLabel === "Corn");
    const canolaToPolicy = overview.edges.find(
      (edge) => edge.fromLabel === "Canola" && edge.toLabel === "China policy",
    );

    expect(wheatToCorn).toMatchObject({
      scoreRole: "bounded_context",
      targetInPublicScope: true,
    });
    expect(canolaToPolicy).toMatchObject({
      scoreRole: "watch_only",
      targetInPublicScope: false,
    });
    expect(wheatToCorn!.rank).toBeGreaterThan(canolaToPolicy!.rank);
  });

  it("builds grain-to-grain influence rank rows with current board reads", () => {
    const overview = buildGrainRelationshipOverview(SUPPORTED_RATING_GRAINS);
    const rows = buildGrainRelationshipRankRows({
      overview,
      boardReads: [
        {
          grain: "Canola",
          statusLabel: "Canada-only read",
          score: 24,
          confidence: 82,
          canadaScore: 24,
          canadaConfidence: 82,
          usScore: null,
          usConfidence: null,
          scoreSource: "weekly_packet",
        },
      ],
    });

    expect(rows).toHaveLength(SUPPORTED_RATING_GRAINS.length);
    expect(rows.map((row) => row.netRank)).toEqual([...rows.map((row) => row.netRank)].sort((left, right) => right - left));

    const canola = rows.find((row) => row.grain === "Canola");
    expect(canola).toMatchObject({
      currentReadScore: 24,
      currentReadConfidence: 82,
    });
    expect(canola!.outboundRank).toBeGreaterThan(0);
    expect(canola!.inboundRank).toBeGreaterThan(0);
    expect(canola!.strongestOutbound).toEqual(expect.objectContaining({ grain: expect.any(String), rank: expect.any(Number) }));
  });

  it("keeps external watch anchors visible but separate from public grain relationship rank", () => {
    const overview = buildGrainRelationshipOverview(SUPPORTED_RATING_GRAINS);
    const rows = buildGrainRelationshipRankRows({ overview });
    const canola = rows.find((row) => row.grain === "Canola");

    expect(canola).toBeDefined();
    expect(canola!.externalWatchCount).toBeGreaterThan(0);
    expect(canola!.strongestOutbound?.scoreRole).not.toBe("parked_gap");
  });
});

describe("grain impact graph ranking math", () => {
  it("maps every source class to its allowed score role", () => {
    expect(scoreRoleForSourceClass("official_thesis_input")).toBe("score_input");
    expect(scoreRoleForSourceClass("price_context")).toBe("bounded_context");
    expect(scoreRoleForSourceClass("watch_only")).toBe("watch_only");
    expect(scoreRoleForSourceClass("parked")).toBe("parked_gap");
  });

  it("keeps source authority ordered official > price context > watch only > parked", () => {
    expect(sourceAuthorityWeight("official_thesis_input")).toBe(1);
    expect(sourceAuthorityWeight("price_context")).toBe(0.7);
    expect(sourceAuthorityWeight("watch_only")).toBe(0.35);
    expect(sourceAuthorityWeight("parked")).toBe(0.12);
  });

  it("weights scope relevance for every market shape and scope branch", () => {
    expect(scopeRelevanceWeight("canada_first", "canada")).toBe(1);
    expect(scopeRelevanceWeight("canada_first", "cross_border")).toBe(0.85);
    expect(scopeRelevanceWeight("canada_first", "world")).toBe(0.65);
    expect(scopeRelevanceWeight("canada_first", "us")).toBe(0.45);
    expect(scopeRelevanceWeight("canada_first", "local")).toBe(0.45);

    expect(scopeRelevanceWeight("us_led", "us")).toBe(1);
    expect(scopeRelevanceWeight("us_led", "world")).toBe(0.85);
    expect(scopeRelevanceWeight("us_led", "cross_border")).toBe(0.85);
    expect(scopeRelevanceWeight("us_led", "canada")).toBe(0.45);
    expect(scopeRelevanceWeight("us_led", "local")).toBe(0.35);

    expect(scopeRelevanceWeight("global_benchmark", "world")).toBe(1);
    expect(scopeRelevanceWeight("global_benchmark", "cross_border")).toBe(1);
    expect(scopeRelevanceWeight("global_benchmark", "canada")).toBe(0.82);
    expect(scopeRelevanceWeight("global_benchmark", "us")).toBe(0.82);
    expect(scopeRelevanceWeight("global_benchmark", "local")).toBe(0.5);

    expect(scopeRelevanceWeight("specialty", "canada")).toBe(1);
    expect(scopeRelevanceWeight("specialty", "world")).toBe(0.7);
    expect(scopeRelevanceWeight("specialty", "cross_border")).toBe(0.6);
    expect(scopeRelevanceWeight("specialty", "us")).toBe(0.35);
    expect(scopeRelevanceWeight("specialty", "local")).toBe(0.35);

    expect(scopeRelevanceWeight("thin_market", "cross_border")).toBe(0.85);
    expect(scopeRelevanceWeight("thin_market", "canada")).toBe(0.85);
    expect(scopeRelevanceWeight("thin_market", "us")).toBe(0.85);
    expect(scopeRelevanceWeight("thin_market", "world")).toBe(0.65);
    expect(scopeRelevanceWeight("thin_market", "local")).toBe(0.35);
  });

  it("computes every overview relationship rank as authority times scope multiplier", () => {
    const overview = buildGrainRelationshipOverview(SUPPORTED_RATING_GRAINS);

    expect(overview.edges.length).toBeGreaterThan(0);
    for (const edge of overview.edges) {
      const multiplier = edge.targetInPublicScope
        ? PUBLIC_SCOPE_RANK_MULTIPLIER
        : EXTERNAL_SCOPE_RANK_MULTIPLIER;
      expect(edge.rank).toBe(Math.round(sourceAuthorityWeight(edge.sourceClass) * multiplier));
    }
  });

  it("pins the rendered rank proof formula for the Canola to Soybeans price-context link", () => {
    const overview = buildGrainRelationshipOverview(SUPPORTED_RATING_GRAINS);
    const canolaToSoybeans = overview.edges.find(
      (edge) => edge.fromLabel === "Canola" && edge.toLabel === "Soybeans",
    );

    expect(canolaToSoybeans).toBeDefined();
    expect(canolaToSoybeans!.sourceClass).toBe("price_context");
    expect(canolaToSoybeans!.targetInPublicScope).toBe(true);
    expect(canolaToSoybeans!.rank).toBe(Math.round(0.7 * PUBLIC_SCOPE_RANK_MULTIPLIER));
    expect(canolaToSoybeans!.rank).toBe(63);
  });

  it("computes every factor node rank from authority and market-shape scope relevance", () => {
    const graphs = buildGrainImpactGraphs(SUPPORTED_RATING_GRAINS);

    expect(graphs.length).toBeGreaterThan(0);
    for (const graph of graphs) {
      const factorNodes = graph.nodes.filter((node) => node.kind === "factor");
      expect(factorNodes.length).toBeGreaterThan(0);
      for (const node of factorNodes) {
        expect(node.sourceClass).toBeDefined();
        expect(node.scope).toBeDefined();
        expect(node.rank).toBe(
          Math.round(
            100 * sourceAuthorityWeight(node.sourceClass!) * scopeRelevanceWeight(graph.marketShape, node.scope!),
          ),
        );
      }
    }
  });
});
