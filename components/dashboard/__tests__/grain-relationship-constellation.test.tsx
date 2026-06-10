import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  buildGrainRelationshipConstellationLayout,
  GrainRelationshipConstellation,
} from "@/components/dashboard/grain-relationship-constellation";
import {
  buildGrainRelationshipOverview,
  type GrainImpactGraphBoardRead,
} from "@/lib/thesis/grain-impact-graph";
import { SUPPORTED_RATING_GRAINS } from "@/lib/thesis/rating-model";

const boardReads: GrainImpactGraphBoardRead[] = [
  {
    grain: "Canola",
    statusLabel: "Canada-only read",
    score: 40,
    confidence: 75,
    canadaScore: 40,
    canadaConfidence: 75,
    usScore: null,
    usConfidence: null,
    scoreSource: "weekly_packet",
  },
  {
    grain: "Soybeans",
    statusLabel: "US-only read",
    score: -30,
    confidence: 50,
    canadaScore: null,
    canadaConfidence: null,
    usScore: -30,
    usConfidence: 50,
    scoreSource: "weekly_packet",
  },
];

describe("GrainRelationshipConstellation", () => {
  it("builds a 3D layout from the same relationship overview and confidence-scaled reads", () => {
    const layout = buildGrainRelationshipConstellationLayout({
      overview: buildGrainRelationshipOverview(SUPPORTED_RATING_GRAINS),
      boardReads,
    });

    const canola = layout.nodes.find((node) => node.label === "Canola");
    const soybeans = layout.nodes.find((node) => node.label === "Soybeans");
    const chinaPolicy = layout.nodes.find((node) => node.label === "China policy");

    expect(layout.nodes.length).toBeGreaterThan(SUPPORTED_RATING_GRAINS.length);
    expect(layout.edges.length).toBeGreaterThan(0);
    expect(layout.strongestEdge).toEqual(expect.objectContaining({ rank: expect.any(Number) }));
    expect(canola).toMatchObject({
      readScore: 40,
      readConfidence: 75,
      readLabel: "+40 / 75%",
    });
    expect(canola!.y).toBeGreaterThan(0);
    expect(soybeans!.y).toBeLessThan(0);
    expect(chinaPolicy).toMatchObject({
      kind: "external_anchor",
      readLabel: "External watch anchor",
    });
  });

  it("pins the confidence-weighted vertical position formula", () => {
    const layout = buildGrainRelationshipConstellationLayout({
      overview: buildGrainRelationshipOverview(SUPPORTED_RATING_GRAINS),
      boardReads,
    });
    const READ_VERTICAL_RANGE = 2.15;

    const canola = layout.nodes.find((node) => node.label === "Canola");
    const soybeans = layout.nodes.find((node) => node.label === "Soybeans");
    const wheat = layout.nodes.find((node) => node.label === "Wheat");

    // y = (score x confidence/100) / 100 x READ_VERTICAL_RANGE
    expect(canola!.y).toBeCloseTo(((40 * 0.75) / 100) * READ_VERTICAL_RANGE, 10);
    expect(soybeans!.y).toBeCloseTo(((-30 * 0.5) / 100) * READ_VERTICAL_RANGE, 10);
    // A grain with no board read sits at neutral height.
    expect(wheat!.y).toBe(0);
  });

  it("renders the audit-only Three.js surface and fallback copy", () => {
    render(
      <GrainRelationshipConstellation
        overview={buildGrainRelationshipOverview(SUPPORTED_RATING_GRAINS)}
        boardReads={boardReads}
      />,
    );

    expect(screen.getByText("3D Relationship Constellation")).toBeInTheDocument();
    expect(screen.getByText("Three.js audit layer")).toBeInTheDocument();
    expect(screen.getByTestId("grain-relationship-3d-canvas")).toBeInTheDocument();
    expect(screen.getByText("higher = more bullish")).toBeInTheDocument();
    expect(screen.getByText("size = relationship weight")).toBeInTheDocument();
    expect(screen.getByText("Selected 3D node")).toBeInTheDocument();
    expect(screen.getByTestId("grain-relationship-3d-selected-label")).toBeInTheDocument();
  });
});
