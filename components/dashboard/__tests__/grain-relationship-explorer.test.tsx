import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GrainRelationshipExplorer } from "@/components/dashboard/grain-relationship-explorer";
import {
  buildGrainRelationshipOverview,
  type GrainImpactGraphBoardRead,
} from "@/lib/thesis/grain-impact-graph";
import { SUPPORTED_RATING_GRAINS } from "@/lib/thesis/rating-model";

const boardReads: GrainImpactGraphBoardRead[] = [
  {
    grain: "Corn",
    statusLabel: "Country split",
    score: 0,
    confidence: 30,
    canadaScore: null,
    canadaConfidence: null,
    usScore: 0,
    usConfidence: 30,
    scoreSource: "weekly_packet",
  },
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
];

describe("GrainRelationshipExplorer", () => {
  it("switches the selected influence lens when a grain button is clicked", () => {
    render(
      <GrainRelationshipExplorer
        overview={buildGrainRelationshipOverview(SUPPORTED_RATING_GRAINS)}
        boardReads={boardReads}
      />,
    );

    expect(screen.getByText("Corn relationship lens")).toBeInTheDocument();
    expect(screen.getByText("current board read 0 / 30%")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Influence board/i })).toBeInTheDocument();
    expect(screen.getByText("Current read vs relationship rank")).toBeInTheDocument();
    expect(screen.getByText("Who talks to whom")).toBeInTheDocument();
    expect(screen.getByText("Selected grain summary")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Select Canola to Soybeans relationship/i })).toBeInTheDocument();
    expect(screen.getAllByText("Corn to Wheat").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /Canola\+24/i }));

    expect(screen.getByText("Canola relationship lens")).toBeInTheDocument();
    expect(screen.getByText("current board read +24 / 82%")).toBeInTheDocument();
    expect(screen.getByText("Why these grains are talking")).toBeInTheDocument();
    expect(document.body.textContent).toContain("authority 0.70 x public scope 90 = rank 63");
    expect(screen.getAllByText("Canola to Soybeans").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Soybeans to Canola").length).toBeGreaterThan(0);
  });

  it("switches the selected grain from the influence board", () => {
    render(
      <GrainRelationshipExplorer
        overview={buildGrainRelationshipOverview(SUPPORTED_RATING_GRAINS)}
        boardReads={boardReads}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Select Canola on influence board/i }));

    expect(screen.getByText("Canola relationship lens")).toBeInTheDocument();
    expect(screen.getAllByText("Canola to Soybeans").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Canola +24 / 82%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Soybeans Current read pending").length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain("Canola to Soybeans (rank 63)");
    expect(document.body.textContent).toContain("Soybeans to Canola (rank 63)");
    expect(document.body.textContent).toContain("Canola to China policy (rank 25)");
    expect(screen.getByRole("button", { name: /Canola\+24/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("switches the selected grain from the conversation matrix", () => {
    render(
      <GrainRelationshipExplorer
        overview={buildGrainRelationshipOverview(SUPPORTED_RATING_GRAINS)}
        boardReads={boardReads}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Select Canola to Soybeans relationship/i }));

    expect(screen.getByText("Canola relationship lens")).toBeInTheDocument();
    expect(screen.getByText("current board read +24 / 82%")).toBeInTheDocument();
    expect(document.body.textContent).toContain("Canola to Soybeans");
    expect(document.body.textContent).toContain("authority 0.70 x public scope 90 = rank 63");
  });

  it("renders nothing when the overview has no grain nodes", () => {
    const { container } = render(
      <GrainRelationshipExplorer overview={buildGrainRelationshipOverview([])} boardReads={[]} />,
    );

    expect(container.firstChild).toBeNull();
  });
});
